#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "input_forwarder.h"
#include "native_log.h"
#include <atomic>
#include <algorithm>
#include <array>
#include <cmath>
#include <magnification.h>

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
    bool    g_magInitialized = false;
    bool    g_cursorHidden   = false;
    INT     g_originSpeed    = 0;   // saved mouse speed for restore

    // ── Coordinate mapping ──────────────────────────────────────────────────

    POINT OverlayToGameScreen(LONG x, LONG y) {
        float relX = (float)(x - g_monitorX) / g_monitorW;
        float relY = (float)(y - g_monitorY) / g_monitorH;
        POINT pt;
        pt.x = g_clientOriginX + (int)(relX * g_clientW);
        pt.y = g_clientOriginY + (int)(relY * g_clientH);
        return pt;
    }

    POINT GameScreenToOverlay(LONG x, LONG y) {
        float relX = (float)(x - g_clientOriginX) / g_clientW;
        float relY = (float)(y - g_clientOriginY) / g_clientH;
        POINT pt;
        pt.x = g_monitorX + (int)(relX * g_monitorW);
        pt.y = g_monitorY + (int)(relY * g_monitorH);
        return pt;
    }

    bool IsOnMonitor(LONG x, LONG y) {
        return x >= g_monitorX && x < g_monitorX + g_monitorW &&
               y >= g_monitorY && y < g_monitorY + g_monitorH;
    }

    // ── Cursor visibility ───────────────────────────────────────────────────

    void HideCursor() {
        if (g_cursorHidden || !g_magInitialized) return;
        MagShowSystemCursor(FALSE);
        g_cursorHidden = true;
    }

    void ShowCursorRestore() {
        if (!g_cursorHidden || !g_magInitialized) return;
        MagShowSystemCursor(TRUE);
        g_cursorHidden = false;
    }

    // ── Cursor speed adjustment (Magpie 동일 공식) ──────────────────────────
    // 게임 창(clientW×clientH)이 모니터(monitorW×monitorH)보다 작을 때,
    // 물리 마우스 이동이 업스케일된 화면에서 자연스럽게 느껴지도록
    // 시스템 커서 속도를 스케일 비율만큼 낮춥니다.
    void AdjustCursorSpeed() {
        if (g_monitorW <= 0 || g_clientW <= 0) return;

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

    void StartCapture(POINT overlayPt) {
        if (g_isCapturing) return;

        POINT gamePt = OverlayToGameScreen(overlayPt.x, overlayPt.y);

        HideCursor();
        AdjustCursorSpeed();

        // Confine cursor to game client screen rect
        RECT gameRect = {
            g_clientOriginX, g_clientOriginY,
            g_clientOriginX + g_clientW, g_clientOriginY + g_clientH
        };
        ClipCursor(&gameRect);
        SetCursorPos(gamePt.x, gamePt.y);

        // Make overlay transparent → OS routes all events directly to game window
        LONG_PTR exStyle = GetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);

        g_isCapturing = true;
        NativeLog("InputForwarder: StartCapture overlayPt=(%ld,%ld) gamePt=(%d,%d)",
                  overlayPt.x, overlayPt.y, gamePt.x, gamePt.y);
    }

    void StopCapture() {
        if (!g_isCapturing) return;

        // Remove transparency so overlay can receive events again
        LONG_PTR exStyle = GetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(g_scalingHwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);

        // Map cursor back from game position to overlay position
        POINT cursorPos;
        if (GetCursorPos(&cursorPos)) {
            POINT overlayPt = GameScreenToOverlay(cursorPos.x, cursorPos.y);
            ClipCursor(nullptr);
            SetCursorPos(overlayPt.x, overlayPt.y);
        } else {
            ClipCursor(nullptr);
        }

        RestoreCursorSpeed();
        ShowCursorRestore();

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

    if (!g_magInitialized) {
        g_magInitialized = MagInitialize();
        NativeLog("InputForwarder: MagInitialize %s", g_magInitialized ? "OK" : "FAILED");
    }

    NativeLog("InputForwarder: monitor=(%d,%d %dx%d) clientOrigin=(%d,%d) client=%dx%d",
              g_monitorX, g_monitorY, g_monitorW, g_monitorH,
              g_clientOriginX, g_clientOriginY, g_clientW, g_clientH);
    return true;
}

void Stop() {
    StopCapture();
    if (g_magInitialized) {
        MagUninitialize();
        g_magInitialized = false;
    }
    g_gameHwnd    = nullptr;
    g_scalingHwnd = nullptr;
}

void SetOverlayActive(bool active) {
    g_overlayActive.store(active, std::memory_order_relaxed);
    if (active) StopCapture();
}

void UpdateFrame() {
    if (!g_scalingHwnd || !g_gameHwnd) return;
    if (g_monitorW <= 0 || g_monitorH <= 0 || g_clientW <= 0 || g_clientH <= 0) return;
    if (g_overlayActive.load(std::memory_order_relaxed)) return;

    POINT cursor;
    if (!GetCursorPos(&cursor)) return;

    if (!g_isCapturing) {
        if (IsOnMonitor(cursor.x, cursor.y)) {
            StartCapture(cursor);
        }
    }
    // When capturing: cursor moves naturally inside ClipCursor(gameRect).
    // WS_EX_TRANSPARENT delivers all mouse events directly to the game window.
    // Keyboard events go to the game window naturally (it retains focus via WS_EX_NOACTIVATE).
}

}  // namespace InputForwarder
