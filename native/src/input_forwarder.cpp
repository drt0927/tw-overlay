#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "input_forwarder.h"
#include "native_log.h"
#include <atomic>
#include <algorithm>
#include <array>
#include <cmath>

namespace {
    HWND    g_gameHwnd      = nullptr;
    HWND    g_scalingHwnd   = nullptr;
    int     g_monitorX      = 0;
    int     g_monitorY      = 0;
    int     g_monitorW      = 0;
    int     g_monitorH      = 0;
    int     g_clientOriginX = 0;
    int     g_clientOriginY = 0;
    int     g_clientW       = 0;
    int     g_clientH       = 0;
    std::atomic<bool> g_overlayActive{ false };
    bool    g_isCapturing    = false;
    INT     g_originSpeed    = 0;   // saved mouse speed for restore

    bool IsOnMonitor(LONG x, LONG y) {
        return x >= g_monitorX && x < g_monitorX + g_monitorW &&
               y >= g_monitorY && y < g_monitorY + g_monitorH;
    }

    // ── Cursor speed adjustment (Magpie 동일 공식) ──────────────────────────
    // 게임 창(clientW×clientH)이 모니터(monitorW×monitorH)보다 작을 때,
    // 물리 마우스 이동이 업스케일된 화면에서 자연스럽게 느껴지도록
    // 시스템 커서 속도를 스케일 비율만큼 낮춥니다.
    void AdjustCursorSpeed() {
        if (g_monitorW <= 0 || g_monitorH <= 0 || g_clientW <= 0 || g_clientH <= 0) return;

        if (!SystemParametersInfo(SPI_GETMOUSESPEED, 0, &g_originSpeed, 0)) return;

        // Mouse acceleration ("Enhance pointer precision") on/off
        bool accelOn = true;
        std::array<INT, 3> mouseParams{};
        if (SystemParametersInfo(SPI_GETMOUSE, 0, mouseParams.data(), 0))
            accelOn = (mouseParams[2] != 0);

        // Average scale factor (overlay / game)
        double scale = ((double)g_monitorW / g_clientW + (double)g_monitorH / g_clientH) / 2.0;

        INT newSpeed = 0;

        if (accelOn) {
            // With acceleration: speed mapping is linear (1-20)
            newSpeed = std::clamp((INT)std::lround(g_originSpeed / scale), 1, 20);
        } else {
            // Without acceleration: map through actual sensitivity table
            // Source: https://liquipedia.net/counterstrike/Mouse_Settings#Windows_Sensitivity
            static constexpr std::array<double, 20> SENS = {
                0.03125, 0.0625, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875,
                1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5
            };
            int idx = std::clamp(g_originSpeed, 1, 20) - 1;
            double targetSens = SENS[idx] / scale;

            // Find closest entry in table
            auto it = std::lower_bound(SENS.begin(), SENS.end(), targetSens - 1e-9);
            newSpeed = (INT)(it - SENS.begin()) + 1;
            if (it != SENS.begin() && it != SENS.end()) {
                if (std::abs(*it - targetSens) > std::abs(*(it - 1) - targetSens))
                    --newSpeed;
            }
            newSpeed = std::clamp(newSpeed, 1, 20);
        }

        if (newSpeed != g_originSpeed) {
            SystemParametersInfo(SPI_SETMOUSESPEED, 0, (PVOID)(intptr_t)newSpeed, 0);
            NativeLog("InputForwarder: cursor speed %d → %d (scale=%.2f)", g_originSpeed, newSpeed, scale);
        }
    }

    void RestoreCursorSpeed() {
        if (g_originSpeed > 0) {
            SystemParametersInfo(SPI_SETMOUSESPEED, 0, (PVOID)(intptr_t)g_originSpeed, 0);
            g_originSpeed = 0;
        }
    }

    // ── Capture state ───────────────────────────────────────────────────────
    // "Capturing" = 게임이 포그라운드 상태. C++ 창을 WS_EX_TRANSPARENT로 설정하여
    // 마우스 이벤트가 게임으로 직접 전달되도록 한다.
    // 커서 숨김/ClipCursor는 사용하지 않음 — overlay는 항상 보이고 마우스 투과는
    // Electron 레벨(setIgnoreMouseEvents)에서 제어한다.

    void StartCapture() {
        if (g_isCapturing) return;

        AdjustCursorSpeed();

        // C++ 창을 투명하게 → 마우스 이벤트가 게임으로 전달
        LONG_PTR exStyle = GetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);

        g_isCapturing = true;
        NativeLog("InputForwarder: StartCapture");
    }

    void StopCapture() {
        if (!g_isCapturing) return;

        // C++ 창 투명 해제
        LONG_PTR exStyle = GetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);

        RestoreCursorSpeed();

        g_isCapturing = false;
        NativeLog("InputForwarder: StopCapture");
    }
}

namespace InputForwarder {

bool Start(HWND gameHwnd, HWND scalingHwnd, const RECT& monitorRect,
           int clientOriginX, int clientOriginY, int clientW, int clientH) {
    g_gameHwnd      = gameHwnd;
    g_scalingHwnd   = scalingHwnd;
    g_monitorX      = monitorRect.left;
    g_monitorY      = monitorRect.top;
    g_monitorW      = monitorRect.right  - monitorRect.left;
    g_monitorH      = monitorRect.bottom - monitorRect.top;
    g_clientOriginX = clientOriginX;
    g_clientOriginY = clientOriginY;
    g_clientW       = clientW;
    g_clientH       = clientH;
    g_overlayActive = false;
    g_isCapturing   = false;

    NativeLog("InputForwarder: monitor=(%d,%d %dx%d) clientOrigin=(%d,%d) client=%dx%d",
              g_monitorX, g_monitorY, g_monitorW, g_monitorH,
              g_clientOriginX, g_clientOriginY, g_clientW, g_clientH);
    return true;
}

void Stop() {
    StopCapture();
    g_gameHwnd    = nullptr;
    g_scalingHwnd = nullptr;
}

HWND GetGameHwnd() {
    return g_gameHwnd;
}

void SetOverlayActive(bool active) {
    g_overlayActive.store(active, std::memory_order_relaxed);
    // StopCapture()를 여기서 직접 호출하지 않는다.
    // 이 함수는 N-API 콜백(메인 스레드)에서 호출되지만, StopCapture()가 접근하는
    // g_isCapturing / g_originSpeed / g_scalingHwnd 는 비원자 변수이며
    // 렌더 스레드의 UpdateFrame()도 동시에 접근할 수 있어 data race가 된다.
    // g_overlayActive를 true로 세팅하면 렌더 스레드의 UpdateFrame()이
    // 다음 프레임에서 즉시 감지해 StopCapture()를 안전하게 호출한다.
}

bool IsOverlayActive() {
    return g_overlayActive.load(std::memory_order_relaxed);
}

void UpdateFrame() {
    if (!g_scalingHwnd || !g_gameHwnd) return;
    if (g_monitorW <= 0 || g_monitorH <= 0 || g_clientW <= 0 || g_clientH <= 0) return;
    if (g_overlayActive.load(std::memory_order_relaxed)) {
        // overlay가 active로 전환된 경우 capture 상태를 렌더 스레드 안에서 정리
        if (g_isCapturing) StopCapture();
        return;
    }

    // 게임이 포그라운드를 잃으면 캡처 해제
    if (g_isCapturing && GetForegroundWindow() != g_gameHwnd) {
        StopCapture();
        return;
    }

    POINT cursor;
    if (!GetCursorPos(&cursor)) return;

    if (!g_isCapturing) {
        if (IsOnMonitor(cursor.x, cursor.y) && GetForegroundWindow() == g_gameHwnd) {
            StartCapture();
        }
    }
}

}  // namespace InputForwarder
