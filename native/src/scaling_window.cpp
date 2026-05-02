#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "scaling_window.h"
#include "input_forwarder.h"
#include "native_log.h"

static const wchar_t* k_ClassName       = L"TW_ScalingWindow";
static const wchar_t* k_AnchorClassName = L"TW_DwmAnchor";

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_CLOSE:
        return 0;
    case WM_ERASEBKGND:
        return 1;
    case WM_MOUSEACTIVATE:
        // C++ 창을 non-topmost 최상단으로 올리고, 게임에 포커스를 넘김
        // tw-overlay 창들(TOPMOST)은 여전히 위에 있고, 브라우저 등 일반 창은 아래로 내려감
        SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0,
                     SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
        {
            HWND gh = InputForwarder::GetGameHwnd();
            if (gh) SetForegroundWindow(gh);
        }
        return MA_NOACTIVATE;
    default:
        return DefWindowProcW(hwnd, msg, wp, lp);
    }
}

HWND ScalingWindow::Create(HWND electronHwnd, HWND gameHwnd) {
    HINSTANCE hInst = GetModuleHandleW(nullptr);
    NativeLog("ScalingWindow::Create  electronHwnd=0x%p  gameHwnd=0x%p", electronHwnd, gameHwnd);

    // Detect the monitor that contains the game window.
    HMONITOR hMon = MonitorFromWindow(gameHwnd, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi = { sizeof(mi) };
    GetMonitorInfo(hMon, &mi);
    m_monitorRect = mi.rcMonitor;
    int monX = m_monitorRect.left;
    int monY = m_monitorRect.top;
    int monW = m_monitorRect.right  - m_monitorRect.left;
    int monH = m_monitorRect.bottom - m_monitorRect.top;
    NativeLog("ScalingWindow: game monitor (%d,%d) %dx%d", monX, monY, monW, monH);

    // ── DWM anchor window ────────────────────────────────────────────────────
    // A 2×2 transparent window that is DWM-composited (no WS_EX_NOREDIRECTIONBITMAP).
    // Its sole purpose is to force DWM to actively composite this monitor.
    // When DWM is compositing, no game swap chain can use Windowed Independent Flip
    // (WIF/FSO), so the game submits frames through DWM — making them visible to
    // DXGI Desktop Duplication.
    {
        WNDCLASSEXW wcA = {};
        wcA.cbSize        = sizeof(wcA);
        wcA.lpfnWndProc   = DefWindowProcW;
        wcA.hInstance     = hInst;
        wcA.lpszClassName = k_AnchorClassName;
        RegisterClassExW(&wcA);

        m_anchorHwnd = CreateWindowExW(
            WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW,
            k_AnchorClassName, nullptr,
            WS_POPUP,
            monX, monY, 2, 2,
            nullptr, nullptr, hInst, nullptr);

        if (m_anchorHwnd) {
            SetLayeredWindowAttributes(m_anchorHwnd, 0, 1, LWA_ALPHA);
            SetWindowPos(m_anchorHwnd, HWND_TOP, 0, 0, 0, 0,
                         SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE);
            NativeLog("ScalingWindow: DWM anchor=0x%p at (%d,%d)", m_anchorHwnd, monX, monY);
        } else {
            NativeLog("ScalingWindow: DWM anchor FAILED (err=%u) — game may use Independent Flip",
                      GetLastError());
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    WNDCLASSEXW wc   = {};
    wc.cbSize        = sizeof(wc);
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = hInst;
    wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wc.lpszClassName = k_ClassName;
    ATOM atom = RegisterClassExW(&wc);
    DWORD regErr = GetLastError();
    NativeLog("ScalingWindow: RegisterClassEx atom=%u  lastErr=%u", atom, regErr);
    if (!atom && regErr != ERROR_CLASS_ALREADY_EXISTS) {
        NativeLog("ScalingWindow: RegisterClassExW FAILED (not already-exists) — aborting");
        if (m_anchorHwnd) { DestroyWindow(m_anchorHwnd); m_anchorHwnd = nullptr; }
        return nullptr;
    }

    // WS_EX_NOREDIRECTIONBITMAP: the scaling window uses a hardware flip chain that
    // bypasses DWM's redirection surface.  DWM does NOT include this window in its
    // composition, so DXGI Desktop Duplication only captures the game content below.
    // WDA_EXCLUDEFROMCAPTURE is still set by DXGICapture::Initialize to prevent the
    // rendering output from bleeding into WGC or BitBlt-based tools.
    // The DWM anchor window (created above) is what prevents the game from using WIF.
    HWND hwnd = CreateWindowExW(
        WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_NOREDIRECTIONBITMAP,
        k_ClassName, nullptr,
        WS_POPUP,
        monX, monY, monW, monH,
        nullptr, nullptr, hInst, nullptr);

    if (!hwnd) {
        NativeLog("ScalingWindow: CreateWindowExW FAILED  lastErr=%u", GetLastError());
        if (m_anchorHwnd) { DestroyWindow(m_anchorHwnd); m_anchorHwnd = nullptr; }
        return nullptr;
    }
    NativeLog("ScalingWindow: window created=0x%p (hidden, on game monitor)", hwnd);

    // WS_EX_LAYERED windows are invisible until SetLayeredWindowAttributes is called.
    // LWA_ALPHA=255 makes the window fully opaque; the flip swap chain provides pixel content.
    BOOL sla = SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    NativeLog("ScalingWindow: SetLayeredWindowAttributes(255) result=%d  lastErr=%u", sla, GetLastError());

    return hwnd;
}

void ScalingWindow::BringToTop(HWND cppHwnd, HWND gameHwnd) {
    int monX = m_monitorRect.left;
    int monY = m_monitorRect.top;
    int monW = m_monitorRect.right  - m_monitorRect.left;
    int monH = m_monitorRect.bottom - m_monitorRect.top;

    BOOL result = SetWindowPos(cppHwnd, HWND_TOP, monX, monY, monW, monH,
                               SWP_SHOWWINDOW | SWP_NOACTIVATE);
    NativeLog("ScalingWindow: BringToTop (%d,%d %dx%d) result=%d  lastErr=%u",
              monX, monY, monW, monH, result, GetLastError());

    // Focus the game window so keyboard input goes directly to it
    if (gameHwnd) {
        SetForegroundWindow(gameHwnd);
        NativeLog("ScalingWindow: SetForegroundWindow(game) lastErr=%u", GetLastError());
    }
}

void ScalingWindow::Destroy(HWND cppHwnd, HWND /*electronHwnd*/) {
    // electronHwnd GWLP_HWNDPARENT is restored by the main thread in StopFullscreen
    // before join() to avoid cross-thread SendMessage deadlock.
    if (cppHwnd) {
        DestroyWindow(cppHwnd);
    }
    if (m_anchorHwnd) {
        DestroyWindow(m_anchorHwnd);
        m_anchorHwnd = nullptr;
        UnregisterClassW(k_AnchorClassName, GetModuleHandleW(nullptr));
    }
    m_monitorRect = {};
    UnregisterClassW(k_ClassName, GetModuleHandleW(nullptr));
}
