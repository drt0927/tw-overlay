#pragma once
#include <windows.h>

class ScalingWindow {
public:
    // Auto-detects the monitor containing gameHwnd and stores its rect.
    HWND Create(HWND electronHwnd, HWND gameHwnd);
    void BringToTop(HWND cppHwnd, HWND gameHwnd = nullptr);
    void Destroy(HWND cppHwnd, HWND electronHwnd);

    const RECT& GetMonitorRect() const { return m_monitorRect; }

private:
    RECT m_monitorRect = {};
    HWND m_anchorHwnd  = nullptr;   // tiny DWM window that prevents game Independent Flip
};
