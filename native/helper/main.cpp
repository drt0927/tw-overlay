// tw_capture_helper.exe
// Usage: tw_capture_helper.exe <gameHwnd_decimal> <shmemName> <stopEventName>
// Runs at normal user privilege (no UAC manifest) so WGC works.
// Captures game window via WGC, writes frames to a D3D11 shared texture (GPU-to-GPU).
// No CPU memcpy — IDXGIKeyedMutex synchronises access between helper and main process.

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <windows.graphics.capture.interop.h>

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <dxgi1_2.h>   // IDXGIResource1::CreateSharedHandle
#include <windows.graphics.directx.direct3d11.interop.h>
#include <cstdio>
#include <cstring>

#include "shared_frame.h"

namespace wgc  = winrt::Windows::Graphics::Capture;
namespace wgdx = winrt::Windows::Graphics::DirectX;

static void Log(const char* fmt, ...) {
    char buf[512];
    va_list a; va_start(a, fmt); _vsnprintf_s(buf, sizeof(buf), _TRUNCATE, fmt, a); va_end(a);
    OutputDebugStringA("[TW_HELPER] "); OutputDebugStringA(buf); OutputDebugStringA("\n");
    char path[MAX_PATH];
    if (GetTempPathA(MAX_PATH, path)) {
        strcat_s(path, "tw_native_debug.log");
        static const long k_MaxBytes = 10 * 1024 * 1024;
        FILE* f = nullptr;
        if (fopen_s(&f, path, "a") == 0 && f) {
            if (ftell(f) > k_MaxBytes) {
                fclose(f);
                DeleteFileA(path);
                if (fopen_s(&f, path, "a") != 0) f = nullptr;
            }
        }
        if (f) {
            SYSTEMTIME st; GetLocalTime(&st);
            fprintf(f, "[%02d:%02d:%02d.%03d][HELPER] %s\n",
                    st.wHour, st.wMinute, st.wSecond, st.wMilliseconds, buf);
            fclose(f);
        }
    }
}

template<class T> static void SafeRelease(T*& p) { if (p) { p->Release(); p = nullptr; } }

static wgdx::Direct3D11::IDirect3DDevice CreateWinRTDevice(ID3D11Device* d3d) {
    winrt::com_ptr<IDXGIDevice> dxgi;
    if (FAILED(d3d->QueryInterface(__uuidof(IDXGIDevice), dxgi.put_void()))) return nullptr;
    winrt::com_ptr<IInspectable> insp;
    if (FAILED(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), insp.put()))) return nullptr;
    return insp.as<wgdx::Direct3D11::IDirect3DDevice>();
}

int wmain(int argc, wchar_t* argv[]) {
    if (argc < 4) { Log("Usage: <hwnd> <shmem> <stopevent>"); return 1; }

    HWND           gameHwnd = (HWND)(uintptr_t)_wcstoui64(argv[1], nullptr, 10);
    const wchar_t* shmName  = argv[2];
    const wchar_t* stopName = argv[3];

    Log("start gameHwnd=0x%p shmem=%ls stop=%ls", gameHwnd, shmName, stopName);

    if (!IsWindow(gameHwnd)) { Log("invalid hwnd"); return 1; }

    // --- Stop event ---
    HANDLE hStop = OpenEventW(EVENT_MODIFY_STATE | SYNCHRONIZE, FALSE, stopName);
    if (!hStop) { hStop = CreateEventW(nullptr, TRUE, FALSE, stopName); }
    if (!hStop) { Log("CreateEvent failed %u", GetLastError()); return 1; }

    // --- Shared memory (header only — no pixel data) ---
    HANDLE hMem = OpenFileMappingW(FILE_MAP_WRITE, FALSE, shmName);
    if (!hMem) { hMem = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, TW_SHMEM_SIZE, shmName); }
    if (!hMem) { Log("CreateFileMapping failed %u", GetLastError()); return 1; }
    TW_SharedInfo* info = (TW_SharedInfo*)MapViewOfFile(hMem, FILE_MAP_WRITE, 0, 0, TW_SHMEM_SIZE);
    if (!info) { Log("MapViewOfFile failed"); return 1; }
    info->seqLock = 0;
    info->width   = 0;
    info->height  = 0;
    info->epoch   = 0;

    // --- D3D11 device ---
    ID3D11Device*        device  = nullptr;
    ID3D11DeviceContext* context = nullptr;
    D3D_FEATURE_LEVEL lvl[] = { D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1 };
    HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, lvl, 2, D3D11_SDK_VERSION, &device, nullptr, &context);
    if (FAILED(hr)) { Log("D3D11CreateDevice failed 0x%08X", (unsigned)hr); return 1; }
    Log("D3D11 device created");

    auto winrtDevice = CreateWinRTDevice(device);
    if (!winrtDevice) { Log("CreateWinRTDevice failed"); return 1; }

    // --- WGC capture session ---
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    wgc::GraphicsCaptureItem     item    { nullptr };
    wgc::Direct3D11CaptureFramePool pool  { nullptr };
    wgc::GraphicsCaptureSession  session { nullptr };

    try {
        auto factory = winrt::get_activation_factory<wgc::GraphicsCaptureItem>();
        auto interop = factory.as<IGraphicsCaptureItemInterop>();
        hr = interop->CreateForWindow(gameHwnd, winrt::guid_of<wgc::GraphicsCaptureItem>(), winrt::put_abi(item));
        if (FAILED(hr)) { Log("CreateForWindow hr=0x%08X", (unsigned)hr); return 1; }

        auto captureSize = item.Size();
        Log("capture size %dx%d", captureSize.Width, captureSize.Height);

        pool = wgc::Direct3D11CaptureFramePool::CreateFreeThreaded(
            winrtDevice, wgdx::DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, captureSize);
        session = pool.CreateCaptureSession(item);

        try { session.as<wgc::IGraphicsCaptureSession3>().IsBorderRequired(false); } catch (...) {}
        try { session.IsCursorCaptureEnabled(false); } catch (...) {}

        session.StartCapture();
        Log("capture session started");
    } catch (winrt::hresult_error const& e) {
        Log("WGC init threw 0x%08X", e.code().value); return 1;
    }

    // --- Shared texture state (GPU-to-GPU, keyed mutex) ---
    ID3D11Texture2D* sharedTex  = nullptr;
    IDXGIKeyedMutex* keyedMutex = nullptr;
    int   sharedW     = 0, sharedH = 0;
    LONG  sharedEpoch = 0;
    DWORD helperPid   = GetCurrentProcessId();

    auto EnsureSharedTex = [&](int w, int h) -> bool {
        if (sharedTex && sharedW == w && sharedH == h) return true;

        // Release previous texture if any
        if (keyedMutex) { keyedMutex->Release(); keyedMutex = nullptr; }
        if (sharedTex)  { sharedTex->Release();  sharedTex  = nullptr; }

        D3D11_TEXTURE2D_DESC td = {};
        td.Width           = (UINT)w;
        td.Height          = (UINT)h;
        td.MipLevels       = 1;
        td.ArraySize       = 1;
        td.Format          = DXGI_FORMAT_B8G8R8A8_UNORM;
        td.SampleDesc.Count = 1;
        td.Usage           = D3D11_USAGE_DEFAULT;
        td.BindFlags       = D3D11_BIND_SHADER_RESOURCE;
        td.MiscFlags       = D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX
                           | D3D11_RESOURCE_MISC_SHARED_NTHANDLE;

        hr = device->CreateTexture2D(&td, nullptr, &sharedTex);
        if (FAILED(hr)) {
            Log("CreateTexture2D(shared) failed 0x%08X", (unsigned)hr);
            return false;
        }

        // Register NT named handle so the main process can open it by name
        IDXGIResource1* dxgiRes = nullptr;
        sharedTex->QueryInterface(__uuidof(IDXGIResource1), (void**)&dxgiRes);
        if (!dxgiRes) {
            Log("QueryInterface(IDXGIResource1) failed");
            SafeRelease(sharedTex);
            return false;
        }

        LONG newEpoch = ++sharedEpoch;
        wchar_t texName[64];
        swprintf_s(texName, L"TW_CaptureTex_%lu_%ld", (unsigned long)helperPid, (long)newEpoch);

        HANDLE hShare = nullptr;
        hr = dxgiRes->CreateSharedHandle(nullptr,
            DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE, texName, &hShare);
        dxgiRes->Release();

        if (FAILED(hr)) {
            Log("CreateSharedHandle failed 0x%08X", (unsigned)hr);
            SafeRelease(sharedTex);
            return false;
        }
        CloseHandle(hShare);  // main opens by name — we don't need to pass this handle

        hr = sharedTex->QueryInterface(__uuidof(IDXGIKeyedMutex), (void**)&keyedMutex);
        if (FAILED(hr)) {
            Log("QueryInterface(IDXGIKeyedMutex) failed");
            SafeRelease(sharedTex);
            return false;
        }

        sharedW = w;
        sharedH = h;

        // Publish dimensions + epoch to main process (seqlock write)
        // Must happen AFTER CreateSharedHandle so the name is registered before main reads epoch.
        InterlockedIncrement(&info->seqLock);  // → odd (updating)
        MemoryBarrier();
        info->width  = w;
        info->height = h;
        info->epoch  = newEpoch;
        MemoryBarrier();
        InterlockedIncrement(&info->seqLock);  // → even (stable)

        Log("shared tex: %dx%d epoch=%ld name=%ls", w, h, (long)newEpoch, texName);
        return true;
    };

    // --- Main loop ---
    Log("entering frame loop");
    auto captureSize = item.Size();

    while (WaitForSingleObject(hStop, 0) != WAIT_OBJECT_0) {
        MSG msg;
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); }

        auto wgcFrame = pool.TryGetNextFrame();
        if (!wgcFrame) { Sleep(1); continue; }

        auto sz = wgcFrame.ContentSize();
        if (sz.Width != captureSize.Width || sz.Height != captureSize.Height) {
            captureSize = sz;
            pool.Recreate(winrtDevice, wgdx::DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, captureSize);
            continue;
        }

        int w = sz.Width, h = sz.Height;
        if (!EnsureSharedTex(w, h)) continue;

        // Get WGC frame's GPU texture
        using DxgiAccess = ::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess;
        auto dxgiAccess = wgcFrame.Surface().as<DxgiAccess>();
        winrt::com_ptr<ID3D11Texture2D> srcTex;
        if (FAILED(dxgiAccess->GetInterface(__uuidof(ID3D11Texture2D), srcTex.put_void()))) continue;

        // GPU-to-GPU: acquire key=0 (main released it after consuming prev frame),
        // copy WGC texture into shared texture, release key=1 (signals main: new frame ready).
        hr = keyedMutex->AcquireSync(0, 32);  // wait up to 32ms for main to finish consuming
        if (FAILED(hr)) continue;

        context->CopyResource(sharedTex, srcTex.get());
        // ReleaseSync flushes pending GPU commands before signalling.
        keyedMutex->ReleaseSync(1);
    }

    Log("stop signal received, cleaning up");
    if (session)  { try { session.Close();  } catch (...) {} }
    if (pool)     { try { pool.Close();     } catch (...) {} }
    SafeRelease(keyedMutex);
    SafeRelease(sharedTex);
    SafeRelease(context);
    SafeRelease(device);
    UnmapViewOfFile(info);
    CloseHandle(hMem);
    CloseHandle(hStop);
    return 0;
}
