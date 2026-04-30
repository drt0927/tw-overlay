#pragma once
#include <d3d11.h>
#include <dxgi1_2.h>
#include <windows.h>
#include <atomic>
#include <thread>
#include <string>

class D3D11Renderer {
public:
    bool  Initialize(HWND hwnd, int monitorW, int monitorH);
    void  Shutdown();

    void  RenderFrame(ID3D11Texture2D* srcTexture, const RECT& gameRect);
    void  SetShaderMode(int mode);  // 0=passthrough, 1=anime4k-s, 2=anime4k-l

    ID3D11Device* GetDevice() const { return m_device; }
    float GetFPS()         const { return m_fps; }
    float GetFrameTimeMs() const { return m_frameTimeMs; }

private:
    void EnsureGameTexture(int w, int h);
    bool CompileShaders();
    bool CompileComputeShaders();
    bool EnsureAnime4KTextures(int w, int h);
    void RunAnime4K(int mode, int inW, int inH);
    void ShutdownAnime4K();

    // Rasterizer pipeline
    ID3D11Device*             m_device      = nullptr;
    ID3D11DeviceContext*      m_context     = nullptr;
    IDXGISwapChain*           m_swapChain   = nullptr;
    ID3D11RenderTargetView*   m_rtv         = nullptr;
    ID3D11VertexShader*       m_vs          = nullptr;
    ID3D11PixelShader*        m_ps          = nullptr;      // passthrough
    ID3D11PixelShader*        m_psA4k       = nullptr;      // Anime4K display (RGBA→BGRA)
    ID3D11SamplerState*       m_sampler     = nullptr;

    // Game texture (BGRA, from capture)
    ID3D11Texture2D*          m_gameTex     = nullptr;
    ID3D11ShaderResourceView* m_gameSRV     = nullptr;
    int                       m_gameTexW    = 0;
    int                       m_gameTexH    = 0;

    // Compute shaders
    ID3D11ComputeShader*      m_csS[4]      = {};
    ID3D11ComputeShader*      m_csL[4]      = {};
    ID3D11Buffer*             m_csCBuffer   = nullptr;
    ID3D11SamplerState*       m_csPointSamp = nullptr;
    ID3D11SamplerState*       m_csLinearSamp= nullptr;

    // Anime4K textures (lazy, resized per game resolution)
    ID3D11Texture2D*           m_a4kTex[4]   = {};          // RGBA16F, game res
    ID3D11ShaderResourceView*  m_a4kSRV[4]   = {};
    ID3D11UnorderedAccessView* m_a4kUAV[4]   = {};
    ID3D11Texture2D*           m_a4kOutTex   = nullptr;     // RGBA, 2x game res
    ID3D11ShaderResourceView*  m_a4kOutSRV   = nullptr;
    ID3D11UnorderedAccessView* m_a4kOutUAV   = nullptr;
    int m_a4kTexW = 0, m_a4kTexH = 0;

    // Background compute-shader compilation (avoids blocking startup/promise)
    // S and L readiness are tracked separately so S mode is usable as soon as
    // S shaders finish, without waiting for the slower L-model compilation.
    std::atomic<bool> m_csSReady      { false };
    std::atomic<bool> m_csLReady      { false };
    std::atomic<bool> m_cancelCompile { false }; // signals compile thread to skip remaining shaders on shutdown
    std::thread       m_compileThread;

    int   m_monitorW     = 0;
    int   m_monitorH     = 0;
    int   m_currentMode  = -1;

    LARGE_INTEGER m_perfFreq       = {};
    LARGE_INTEGER m_lastFrame      = {};
    LARGE_INTEGER m_fpsTimer       = {};
    int           m_frameCount     = 0;
    unsigned      m_renderCallCount = 0;
    float         m_fps            = 0.0f;
    float         m_frameTimeMs    = 0.0f;
};
