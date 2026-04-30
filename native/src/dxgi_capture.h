#pragma once
#include "capture_backend.h"
#include <dxgi1_2.h>
#include <vector>

class DXGICapture : public ICaptureBackend {
public:
    bool        Initialize(HWND gameHwnd, HWND scalingHwnd, ID3D11Device* device) override;
    bool        TryAcquireFrame(CapturedFrame& outFrame) override;
    void        ReleaseFrame() override;
    void        Shutdown() override;
    const char* GetName() const override { return "dxgi"; }
    // Dead when device is set (initialized) but duplication is gone (recreation failed)
    bool        IsDead() const override { return m_device != nullptr && m_duplication == nullptr; }

private:
    bool RecreateCapture();
    void RefreshWindowInfo();

    HWND                     m_gameHwnd            = nullptr;
    HWND                     m_scalingHwnd          = nullptr;
    HMONITOR                 m_hMonitor             = nullptr;
    RECT                     m_monitorRect          = {};
    int                      m_ncLeft               = 0;
    int                      m_ncTop                = 0;
    int                      m_clientW              = 0;
    int                      m_clientH              = 0;
    int                      m_lastWinW             = 0;
    int                      m_lastWinH             = 0;
    bool                     m_roundCornerDisabled  = false;
    ID3D11Device*            m_device               = nullptr;
    IDXGIOutputDuplication*  m_duplication          = nullptr;
    ID3D11Texture2D*         m_lastTexture          = nullptr;
    bool                     m_frameHeld            = false;
    std::vector<uint8_t>     m_metaData;            // dirty-rect metadata buffer
};
