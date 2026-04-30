#pragma once
#include "capture_backend.h"
#include <d3d11.h>
#include <d3d11_1.h>
#include <dxgi.h>
#include <windows.h>

// WGC capture via a de-elevated helper process (tw_capture_helper.exe).
// The helper runs at normal user privilege so WGC CreateForWindow succeeds
// even when the main process is running as Administrator.
//
// Frame data is exchanged via a D3D11 NT-shared texture (GPU-to-GPU, no CPU memcpy).
// IDXGIKeyedMutex synchronises access: helper writes with key 0→1, main reads with key 1→0.
class WGCCapture : public ICaptureBackend {
public:
    WGCCapture() = default;
    ~WGCCapture() override { Shutdown(); }

    bool        Initialize(HWND gameHwnd, HWND scalingHwnd, ID3D11Device* device) override;
    bool        TryAcquireFrame(CapturedFrame& out) override;
    void        ReleaseFrame() override;   // releases keyed mutex (key 1→0)
    void        Shutdown() override;
    const char* GetName() const override { return "WGC"; }
    bool        IsDead() const override  { return m_hProcess == nullptr; }

private:
    bool OpenSharedTex(LONG epoch);
    void ReleaseSharedTex();
    void RefreshClientInsets();

    HWND m_gameHwnd = nullptr;

    // Helper process
    HANDLE m_hProcess   = nullptr;
    HANDLE m_hStopEvent = nullptr;
    HANDLE m_hMem       = nullptr;
    struct TW_SharedInfo* m_info = nullptr;

    // Shared GPU texture (keyed mutex)
    ID3D11Device1*   m_device1    = nullptr;
    ID3D11Texture2D* m_sharedTex  = nullptr;
    IDXGIKeyedMutex* m_keyedMutex = nullptr;
    LONG             m_lastEpoch  = -1;
    LONG             m_lastW      = 0;
    LONG             m_lastH      = 0;

    ID3D11DeviceContext* m_context = nullptr;

    unsigned m_frameCount = 0;

    // Non-client insets for cropping title bar / borders
    int m_ncLeft  = 0, m_ncTop   = 0;
    int m_clientW = 0, m_clientH = 0;
};
