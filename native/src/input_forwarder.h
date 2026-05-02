#pragma once
#include <windows.h>

namespace InputForwarder {
    // clientOriginX/Y: screen coordinates of game client area top-left
    bool Start(HWND gameHwnd, HWND scalingHwnd, const RECT& monitorRect,
               int clientOriginX, int clientOriginY, int clientW, int clientH);
    void Stop();
    void SetOverlayActive(bool active);
    bool IsOverlayActive();
    void UpdateFrame();
    HWND GetGameHwnd();
}
