#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "dxgi_capture.h"
#include "native_log.h"
#include <dxgi1_2.h>
#include <dwmapi.h>

// Win11 DWM corner preference (not in all SDK versions)
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#define DWMWCP_DEFAULT    0
#define DWMWCP_DONOTROUND 1
#endif

// Win10 2004+ capture exclusion (guard for older SDKs)
#ifndef WDA_EXCLUDEFROMCAPTURE
#define WDA_EXCLUDEFROMCAPTURE 0x00000011
#endif

template<class T> static void SafeRelease(T*& p) { if (p) { p->Release(); p = nullptr; } }

static bool RectsOverlap(const RECT& a, const RECT& b) noexcept {
    return a.left < b.right && a.right > b.left &&
           a.top  < b.bottom && a.bottom > b.top;
}

void DXGICapture::RefreshWindowInfo() {
    m_hMonitor = MonitorFromWindow(m_gameHwnd, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi = { sizeof(mi) };
    GetMonitorInfo(m_hMonitor, &mi);
    m_monitorRect = mi.rcMonitor;

    RECT windowRect = {}, clientRect = {};
    GetWindowRect(m_gameHwnd, &windowRect);
    GetClientRect(m_gameHwnd, &clientRect);
    POINT clientOrigin = {0, 0};
    ClientToScreen(m_gameHwnd, &clientOrigin);
    m_ncLeft   = clientOrigin.x - windowRect.left;
    m_ncTop    = clientOrigin.y - windowRect.top;
    m_clientW  = clientRect.right  - clientRect.left;
    m_clientH  = clientRect.bottom - clientRect.top;
    m_lastWinW = windowRect.right  - windowRect.left;
    m_lastWinH = windowRect.bottom - windowRect.top;
    NativeLog("DXGICapture::RefreshWindowInfo monitor=(%d,%d %dx%d) ncInset=(%d,%d) client=%dx%d",
              m_monitorRect.left, m_monitorRect.top,
              m_monitorRect.right - m_monitorRect.left,
              m_monitorRect.bottom - m_monitorRect.top,
              m_ncLeft, m_ncTop, m_clientW, m_clientH);
}

bool DXGICapture::Initialize(HWND gameHwnd, HWND scalingHwnd, ID3D11Device* device) {
    m_gameHwnd    = gameHwnd;
    m_scalingHwnd = scalingHwnd;
    m_device      = device;

    RefreshWindowInfo();

    // Exclude the scaling window from DXGI capture so it appears BLACK,
    // not as rendered content — prevents feedback loops.
    if (scalingHwnd) {
        BOOL ok = SetWindowDisplayAffinity(scalingHwnd, WDA_EXCLUDEFROMCAPTURE);
        NativeLog("DXGICapture: SetWindowDisplayAffinity(EXCLUDEFROMCAPTURE) result=%d err=%u",
                  ok, GetLastError());
    }

    // Win11: disable rounded corners on the game window so DXGI captures
    // sharp pixel-accurate edges without DWM corner blending.
    {
        INT pref = DWMWCP_DONOTROUND;
        HRESULT hr = DwmSetWindowAttribute(gameHwnd, DWMWA_WINDOW_CORNER_PREFERENCE,
                                           &pref, sizeof(pref));
        if (SUCCEEDED(hr)) {
            m_roundCornerDisabled = true;
            NativeLog("DXGICapture: rounded corners disabled on game window");
        }
        // silently ignore on Win10 (attribute unknown → E_INVALIDARG)
    }

    return RecreateCapture();
}

bool DXGICapture::RecreateCapture() {
    NativeLog("DXGICapture::RecreateCapture");
    SafeRelease(m_duplication);
    RefreshWindowInfo();  // re-detect monitor/client in case window moved or resized

    IDXGIDevice*  dxgiDevice = nullptr;
    IDXGIAdapter* adapter    = nullptr;

    HRESULT hr = m_device->QueryInterface(__uuidof(IDXGIDevice), (void**)&dxgiDevice);
    if (FAILED(hr)) return false;
    hr = dxgiDevice->GetAdapter(&adapter);
    dxgiDevice->Release();
    if (FAILED(hr)) return false;

    // Find the DXGI output matching the game's monitor.
    IDXGIOutput*  output  = nullptr;
    IDXGIOutput1* output1 = nullptr;
    for (UINT i = 0; adapter->EnumOutputs(i, &output) != DXGI_ERROR_NOT_FOUND; ++i) {
        DXGI_OUTPUT_DESC desc = {};
        output->GetDesc(&desc);
        if (desc.Monitor == m_hMonitor) break;
        output->Release();
        output = nullptr;
    }
    adapter->Release();

    if (!output) {
        NativeLog("DXGICapture: monitor not found in adapter outputs — cannot capture");
        return false;  // adapter already released above
    }

    hr = output->QueryInterface(__uuidof(IDXGIOutput1), (void**)&output1);
    output->Release();
    if (FAILED(hr)) return false;

    hr = output1->DuplicateOutput(m_device, &m_duplication);
    output1->Release();
    NativeLog("DXGICapture: DuplicateOutput hr=0x%08X", (unsigned)hr);
    return SUCCEEDED(hr);
}

bool DXGICapture::TryAcquireFrame(CapturedFrame& out) {
    if (!m_duplication) return false;

    // Release previous frame first (doc recommends immediate release before next acquire)
    if (m_frameHeld) {
        m_duplication->ReleaseFrame();
        m_frameHeld = false;
        SafeRelease(m_lastTexture);
    }

    DXGI_OUTDUPL_FRAME_INFO info = {};
    IDXGIResource* resource      = nullptr;
    HRESULT hr = m_duplication->AcquireNextFrame(0, &info, &resource);

    if (hr == DXGI_ERROR_WAIT_TIMEOUT) return false;
    if (hr == DXGI_ERROR_ACCESS_LOST)  { RecreateCapture(); return false; }
    if (FAILED(hr)) return false;

    m_frameHeld = true;

    // Compute game client rect in monitor-local texture coordinates
    RECT winRect = {};
    GetWindowRect(m_gameHwnd, &winRect);

    // Detect window resize and refresh client insets accordingly
    int winW = winRect.right - winRect.left;
    int winH = winRect.bottom - winRect.top;
    if (winW != m_lastWinW || winH != m_lastWinH) {
        RECT clientRect = {};
        GetClientRect(m_gameHwnd, &clientRect);
        POINT origin = {0, 0};
        ClientToScreen(m_gameHwnd, &origin);
        m_ncLeft   = origin.x - winRect.left;
        m_ncTop    = origin.y - winRect.top;
        m_clientW  = clientRect.right  - clientRect.left;
        m_clientH  = clientRect.bottom - clientRect.top;
        m_lastWinW = winW;
        m_lastWinH = winH;
        NativeLog("DXGICapture: window resized to %dx%d, client=%dx%d ncInset=(%d,%d)",
                  winW, winH, m_clientW, m_clientH, m_ncLeft, m_ncTop);
    }

    RECT srcInMonitor = {
        winRect.left + m_ncLeft  - m_monitorRect.left,
        winRect.top  + m_ncTop   - m_monitorRect.top,
        winRect.left + m_ncLeft  + m_clientW - m_monitorRect.left,
        winRect.top  + m_ncTop   + m_clientH - m_monitorRect.top,
    };

    // ── Dirty rect optimization ──────────────────────────────────────────────
    // Skip render if no move/dirty rects overlap the game client area.
    if (info.TotalMetadataBufferSize > 0) {
        if (m_metaData.size() < info.TotalMetadataBufferSize)
            m_metaData.resize(info.TotalMetadataBufferSize);

        bool hasUpdate = false;
        UINT bufSize   = info.TotalMetadataBufferSize;

        // Move rects
        hr = m_duplication->GetFrameMoveRects(
            bufSize, (DXGI_OUTDUPL_MOVE_RECT*)m_metaData.data(), &bufSize);
        if (SUCCEEDED(hr)) {
            UINT n = bufSize / sizeof(DXGI_OUTDUPL_MOVE_RECT);
            for (UINT i = 0; i < n && !hasUpdate; ++i) {
                const auto& mr = ((DXGI_OUTDUPL_MOVE_RECT*)m_metaData.data())[i];
                if (RectsOverlap(srcInMonitor, mr.DestinationRect)) hasUpdate = true;
            }
        }

        // Dirty rects (only if move rects gave no hit)
        if (!hasUpdate) {
            bufSize = info.TotalMetadataBufferSize;
            hr = m_duplication->GetFrameDirtyRects(
                bufSize, (RECT*)m_metaData.data(), &bufSize);
            if (SUCCEEDED(hr)) {
                UINT n = bufSize / sizeof(RECT);
                for (UINT i = 0; i < n && !hasUpdate; ++i) {
                    if (RectsOverlap(srcInMonitor, ((RECT*)m_metaData.data())[i]))
                        hasUpdate = true;
                }
            }
        }

        if (!hasUpdate) {
            resource->Release();
            m_duplication->ReleaseFrame();
            m_frameHeld = false;
            return false;
        }
    } else {
        // No metadata → desktop unchanged
        resource->Release();
        m_duplication->ReleaseFrame();
        m_frameHeld = false;
        return false;
    }
    // ────────────────────────────────────────────────────────────────────────

    hr = resource->QueryInterface(__uuidof(ID3D11Texture2D), (void**)&m_lastTexture);
    resource->Release();
    if (FAILED(hr) || !m_lastTexture) {
        m_duplication->ReleaseFrame();
        m_frameHeld = false;
        return false;
    }

    out.texture    = m_lastTexture;
    out.sourceRect = srcInMonitor;
    out.valid      = true;
    return true;
}

void DXGICapture::ReleaseFrame() {
    SafeRelease(m_lastTexture);
    if (m_frameHeld && m_duplication) {
        m_duplication->ReleaseFrame();
        m_frameHeld = false;
    }
}

void DXGICapture::Shutdown() {
    ReleaseFrame();
    SafeRelease(m_duplication);

    // Restore rounded corners
    if (m_roundCornerDisabled && m_gameHwnd) {
        INT pref = DWMWCP_DEFAULT;
        DwmSetWindowAttribute(m_gameHwnd, DWMWA_WINDOW_CORNER_PREFERENCE,
                              &pref, sizeof(pref));
        m_roundCornerDisabled = false;
    }

    // Remove capture exclusion from overlay
    if (m_scalingHwnd) {
        SetWindowDisplayAffinity(m_scalingHwnd, WDA_NONE);
    }

    m_device      = nullptr;
    m_gameHwnd    = nullptr;
    m_scalingHwnd = nullptr;
    m_hMonitor    = nullptr;
    m_monitorRect = {};
    m_metaData.clear();
    m_metaData.shrink_to_fit();
}
