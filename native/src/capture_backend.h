#pragma once
#include <d3d11.h>
#include <windows.h>

struct CapturedFrame {
    ID3D11Texture2D* texture = nullptr;
    RECT             sourceRect = {};  // game window rect within source texture
    bool             valid = false;
};

class ICaptureBackend {
public:
    virtual ~ICaptureBackend() = default;
    virtual bool        Initialize(HWND gameHwnd, HWND scalingHwnd, ID3D11Device* device) = 0;
    virtual bool        TryAcquireFrame(CapturedFrame& outFrame) = 0;
    virtual void        ReleaseFrame() = 0;
    virtual void        Shutdown() = 0;
    virtual const char* GetName() const = 0;
    // Returns true when the backend has permanently failed and will never produce frames.
    virtual bool        IsDead() const { return false; }
};
