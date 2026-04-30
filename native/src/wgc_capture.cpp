#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "wgc_capture.h"
#include "../helper/shared_frame.h"
#include "native_log.h"
#include <cstring>
#include <tlhelp32.h>
#include <dwmapi.h>
#pragma comment(lib, "dwmapi.lib")

template<class T> static void SafeRelease(T*& p) { if (p) { p->Release(); p = nullptr; } }

// ─── De-elevation helper ──────────────────────────────────────────────────────

static DWORD GetShellProcessId() {
    HWND shellWnd = GetShellWindow();
    if (shellWnd) {
        DWORD pid = 0;
        GetWindowThreadProcessId(shellWnd, &pid);
        if (pid) return pid;
    }
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return 0;
    PROCESSENTRY32W pe = { sizeof(pe) };
    DWORD found = 0;
    for (BOOL ok = Process32FirstW(snap, &pe); ok; ok = Process32NextW(snap, &pe)) {
        if (_wcsicmp(pe.szExeFile, L"explorer.exe") == 0) { found = pe.th32ProcessID; break; }
    }
    CloseHandle(snap);
    return found;
}

static bool LaunchAsShellUser(const wchar_t* exePath, const wchar_t* cmdLine,
                               PROCESS_INFORMATION& pi) {
    DWORD shellPid = GetShellProcessId();
    if (!shellPid) {
        NativeLog("LaunchAsShellUser: could not find shell process");
        return false;
    }

    HANDLE hShellProc = OpenProcess(PROCESS_QUERY_INFORMATION, FALSE, shellPid);
    if (!hShellProc) {
        NativeLog("LaunchAsShellUser: OpenProcess(shell) failed %u", GetLastError());
        return false;
    }
    HANDLE hShellToken = nullptr;
    bool ok = !!OpenProcessToken(hShellProc, TOKEN_DUPLICATE, &hShellToken);
    CloseHandle(hShellProc);
    if (!ok) {
        NativeLog("LaunchAsShellUser: OpenProcessToken failed %u", GetLastError());
        return false;
    }

    HANDLE hToken = nullptr;
    ok = !!DuplicateTokenEx(hShellToken, TOKEN_ALL_ACCESS, nullptr,
                            SecurityImpersonation, TokenPrimary, &hToken);
    CloseHandle(hShellToken);
    if (!ok) {
        NativeLog("LaunchAsShellUser: DuplicateTokenEx failed %u", GetLastError());
        return false;
    }

    STARTUPINFOW si = { sizeof(si) };
    si.dwFlags    = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    ok = !!CreateProcessWithTokenW(hToken, 0, exePath, const_cast<LPWSTR>(cmdLine),
                                   CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi);
    CloseHandle(hToken);
    if (!ok) NativeLog("LaunchAsShellUser: CreateProcessWithTokenW failed %u", GetLastError());
    return ok;
}

// ─── Helper exe path ──────────────────────────────────────────────────────────

static bool GetHelperPath(wchar_t* out, DWORD outLen) {
    HMODULE hMod = nullptr;
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                       GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                       (LPCWSTR)(void*)GetHelperPath, &hMod);
    if (!GetModuleFileNameW(hMod, out, outLen)) return false;
    wchar_t* last = wcsrchr(out, L'\\');
    if (!last) return false;
    wcscpy_s(last + 1, outLen - (last - out + 1), L"tw_capture_helper.exe");
    return true;
}

// ─── Client inset helpers ─────────────────────────────────────────────────────

void WGCCapture::RefreshClientInsets() {
    // Use DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS) to get the actual
    // DWM-rendered window bounds. GetWindowRect omits invisible DWM border pixels
    // that WGC includes in its captured frames, causing a 1-2px crop at the edges.
    RECT dwmRect = {}, clientRect = {};
    if (FAILED(DwmGetWindowAttribute(m_gameHwnd, DWMWA_EXTENDED_FRAME_BOUNDS,
                                     &dwmRect, sizeof(dwmRect)))) {
        GetWindowRect(m_gameHwnd, &dwmRect);  // fallback
    }
    GetClientRect(m_gameHwnd, &clientRect);
    POINT clientOrigin = {0, 0};
    ClientToScreen(m_gameHwnd, &clientOrigin);

    m_ncLeft  = clientOrigin.x - dwmRect.left;
    m_ncTop   = clientOrigin.y - dwmRect.top;
    m_clientW = clientRect.right  - clientRect.left;
    m_clientH = clientRect.bottom - clientRect.top;
}

// ─── Shared texture management ────────────────────────────────────────────────

bool WGCCapture::OpenSharedTex(LONG epoch) {
    ReleaseSharedTex();

    DWORD helperPid = GetProcessId(m_hProcess);
    wchar_t texName[64];
    swprintf_s(texName, L"TW_CaptureTex_%lu_%ld", (unsigned long)helperPid, (long)epoch);

    HRESULT hr = m_device1->OpenSharedResourceByName(
        texName, DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE,
        __uuidof(ID3D11Texture2D), (void**)&m_sharedTex);
    if (FAILED(hr)) {
        NativeLog("WGCCapture: OpenSharedResourceByName(%ls) failed 0x%08X", texName, (unsigned)hr);
        return false;
    }

    hr = m_sharedTex->QueryInterface(__uuidof(IDXGIKeyedMutex), (void**)&m_keyedMutex);
    if (FAILED(hr)) {
        NativeLog("WGCCapture: QueryInterface(IDXGIKeyedMutex) failed 0x%08X", (unsigned)hr);
        SafeRelease(m_sharedTex);
        return false;
    }

    NativeLog("WGCCapture: opened shared tex epoch=%ld name=%ls", (long)epoch, texName);
    return true;
}

void WGCCapture::ReleaseSharedTex() {
    SafeRelease(m_keyedMutex);
    SafeRelease(m_sharedTex);
}

// ─── Initialize ───────────────────────────────────────────────────────────────

bool WGCCapture::Initialize(HWND gameHwnd, HWND /*scalingHwnd*/, ID3D11Device* device) {
    m_gameHwnd = gameHwnd;
    device->GetImmediateContext(&m_context);
    NativeLog("WGCCapture::Initialize gameHwnd=0x%p", gameHwnd);

    // Need ID3D11Device1 for OpenSharedResourceByName
    HRESULT hr = device->QueryInterface(__uuidof(ID3D11Device1), (void**)&m_device1);
    if (FAILED(hr)) {
        NativeLog("WGCCapture: QueryInterface(ID3D11Device1) failed 0x%08X — need D3D11.1", (unsigned)hr);
        return false;
    }

    // Initial client insets
    RefreshClientInsets();
    NativeLog("WGCCapture: ncInsets left=%d top=%d  clientSize=%dx%d",
              m_ncLeft, m_ncTop, m_clientW, m_clientH);

    DWORD mainPid = GetCurrentProcessId();
    wchar_t shmName[64], stopName[64];
    swprintf_s(shmName,  L"Local\\TW_CaptureInfo_%u", mainPid);
    swprintf_s(stopName, L"Local\\TW_CaptureStop_%u", mainPid);

    m_hStopEvent = CreateEventW(nullptr, TRUE, FALSE, stopName);
    if (!m_hStopEvent) {
        NativeLog("WGCCapture: CreateEvent(stop) failed %u", GetLastError());
        return false;
    }

    m_hMem = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr,
                                PAGE_READWRITE, 0, TW_SHMEM_SIZE, shmName);
    if (!m_hMem) {
        NativeLog("WGCCapture: CreateFileMapping failed %u", GetLastError());
        return false;
    }
    m_info = (TW_SharedInfo*)MapViewOfFile(m_hMem, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, TW_SHMEM_SIZE);
    if (!m_info) {
        NativeLog("WGCCapture: MapViewOfFile failed %u", GetLastError());
        return false;
    }
    m_info->seqLock = 0;
    m_info->epoch   = 0;

    wchar_t helperPath[MAX_PATH];
    if (!GetHelperPath(helperPath, MAX_PATH)) {
        NativeLog("WGCCapture: GetHelperPath failed");
        return false;
    }
    NativeLog("WGCCapture: helper path: %ls", helperPath);

    if (GetFileAttributesW(helperPath) == INVALID_FILE_ATTRIBUTES) {
        NativeLog("WGCCapture: helper exe not found");
        return false;
    }

    wchar_t cmdLine[512];
    swprintf_s(cmdLine, L"\"%ls\" %llu %ls %ls",
               helperPath, (unsigned long long)(uintptr_t)gameHwnd, shmName, stopName);
    NativeLog("WGCCapture: launching helper: %ls", cmdLine);

    PROCESS_INFORMATION pi = {};
    if (!LaunchAsShellUser(helperPath, cmdLine, pi)) {
        NativeLog("WGCCapture: LaunchAsShellUser failed — trying direct launch");
        STARTUPINFOW si = { sizeof(si) };
        si.dwFlags = STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;
        if (!CreateProcessW(helperPath, cmdLine, nullptr, nullptr, FALSE,
                            CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi)) {
            NativeLog("WGCCapture: CreateProcess also failed %u", GetLastError());
            return false;
        }
    }

    CloseHandle(pi.hThread);
    m_hProcess = pi.hProcess;
    NativeLog("WGCCapture: helper launched PID=%u", pi.dwProcessId);

    // Wait up to 2s for helper to create the shared texture (epoch > 0)
    NativeLog("WGCCapture: waiting for first shared texture...");
    for (int i = 0; i < 200; ++i) {
        LONG seq = InterlockedCompareExchange(&m_info->seqLock, 0, 0);
        if (!(seq & 1)) {  // header is stable
            LONG epoch = m_info->epoch;
            if (epoch > 0) {
                if (!OpenSharedTex(epoch)) return false;
                m_lastEpoch = epoch;
                m_lastW     = m_info->width;
                m_lastH     = m_info->height;
                NativeLog("WGCCapture: first shared texture ready (epoch=%ld)", (long)epoch);
                return true;
            }
        }
        if (WaitForSingleObject(m_hProcess, 0) == WAIT_OBJECT_0) {
            DWORD exitCode = 0;
            GetExitCodeProcess(m_hProcess, &exitCode);
            NativeLog("WGCCapture: helper exited early (code=%u)", exitCode);
            return false;
        }
        Sleep(10);
    }

    NativeLog("WGCCapture: timeout waiting for shared texture — falling back to DXGI");
    return false;
}

// ─── TryAcquireFrame ─────────────────────────────────────────────────────────

bool WGCCapture::TryAcquireFrame(CapturedFrame& out) {
    if (!m_info || !m_device1) return false;

    m_frameCount++;

    // Periodic helper process health check
    if (m_hProcess && m_frameCount % 300 == 0) {
        if (WaitForSingleObject(m_hProcess, 0) == WAIT_OBJECT_0) {
            DWORD exitCode = 0;
            GetExitCodeProcess(m_hProcess, &exitCode);
            NativeLog("WGCCapture: helper died (exitCode=%u)", exitCode);
            CloseHandle(m_hProcess);
            m_hProcess = nullptr;
            return false;
        }
    }
    if (!m_hProcess) return false;

    // Check for shared texture recreation (size change → new epoch)
    LONG seq = InterlockedCompareExchange(&m_info->seqLock, 0, 0);
    if (!(seq & 1)) {  // header is stable
        LONG epoch = m_info->epoch;
        if (epoch != m_lastEpoch && epoch > 0) {
            NativeLog("WGCCapture: epoch changed %ld → %ld, reopening shared tex",
                      (long)m_lastEpoch, (long)epoch);
            if (!OpenSharedTex(epoch)) return false;
            m_lastEpoch = epoch;
        }
    }

    if (!m_sharedTex || !m_keyedMutex) return false;

    // Try to acquire shared texture (key=1 means helper wrote a new frame).
    // Non-blocking: the render loop sleeps 1ms and retries if no frame yet.
    HRESULT hr = m_keyedMutex->AcquireSync(1, 0);
    if (hr == DXGI_ERROR_WAIT_TIMEOUT || hr == static_cast<HRESULT>(WAIT_TIMEOUT))
        return false;  // no new frame yet
    if (FAILED(hr)) {
        NativeLog("WGCCapture: AcquireSync failed 0x%08X", (unsigned)hr);
        return false;
    }

    // Update client insets on frame size change
    LONG w = m_info->width, h = m_info->height;
    if (w != m_lastW || h != m_lastH) {
        RefreshClientInsets();
        NativeLog("WGCCapture: frame resized %dx%d → %dx%d, client=%dx%d ncInset=(%d,%d)",
                  m_lastW, m_lastH, w, h, m_clientW, m_clientH, m_ncLeft, m_ncTop);
        m_lastW = w;
        m_lastH = h;
    }

    if (m_frameCount <= 3 || m_frameCount % 300 == 0)
        NativeLog("WGC frame #%u size=%dx%d", m_frameCount, w, h);

    out.texture    = m_sharedTex;
    out.sourceRect = { m_ncLeft, m_ncTop, m_ncLeft + m_clientW, m_ncTop + m_clientH };
    out.valid      = true;
    return true;
}

// ─── ReleaseFrame ─────────────────────────────────────────────────────────────

void WGCCapture::ReleaseFrame() {
    // Release keyed mutex (key 1→0): signals helper that main is done, safe to write next frame.
    // ReleaseSync flushes all pending GPU commands (CopySubresourceRegion etc.) before releasing.
    if (m_keyedMutex) m_keyedMutex->ReleaseSync(0);
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────

void WGCCapture::Shutdown() {
    if (m_hStopEvent) {
        SetEvent(m_hStopEvent);
        if (m_hProcess) {
            DWORD wr = WaitForSingleObject(m_hProcess, 500);
            if (wr == WAIT_TIMEOUT)
                NativeLog("WGCCapture: helper did not exit in 500ms");
        }
        CloseHandle(m_hStopEvent);
        m_hStopEvent = nullptr;
    }
    if (m_hProcess) { CloseHandle(m_hProcess); m_hProcess = nullptr; }

    ReleaseSharedTex();

    SafeRelease(m_device1);
    SafeRelease(m_context);

    if (m_info)  { UnmapViewOfFile(m_info); m_info = nullptr; }
    if (m_hMem)  { CloseHandle(m_hMem); m_hMem = nullptr; }

    m_gameHwnd  = nullptr;
    m_lastEpoch = -1;
    m_lastW     = 0;
    m_lastH     = 0;
    m_frameCount = 0;
}
