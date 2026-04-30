#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "d3d11_renderer.h"
#include "anime4k_shaders.h"
#include "native_log.h"
#include <d3dcompiler.h>
#include <cstring>
#include <string>
#include <algorithm>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "d3dcompiler.lib")
#pragma comment(lib, "dxgi.lib")

// ─── Shaders ─────────────────────────────────────────────────────────────────

static const char* k_VS = R"hlsl(
struct VS_OUT { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
VS_OUT main(uint id : SV_VertexID) {
    VS_OUT o;
    o.uv.x = (id == 1) ? 2.0f : 0.0f;
    o.uv.y = (id == 2) ? 2.0f : 0.0f;
    o.pos  = float4(o.uv.x * 2.0f - 1.0f, 1.0f - o.uv.y * 2.0f, 0.0f, 1.0f);
    return o;
}
)hlsl";

static const char* k_PS_PASSTHROUGH = R"hlsl(
Texture2D    tex : register(t0);
SamplerState smp : register(s0);
float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
    float4 c = tex.Sample(smp, uv);
    c.a = 1.0f;
    return c;
}
)hlsl";

// ─── Helpers ──────────────────────────────────────────────────────────────────

template<class T> static void SafeRelease(T*& p) { if (p) { p->Release(); p = nullptr; } }

// ─── Initialize ───────────────────────────────────────────────────────────────

bool D3D11Renderer::Initialize(HWND hwnd, int monitorW, int monitorH) {
    m_monitorW = monitorW;
    m_monitorH = monitorH;
    NativeLog("D3D11Renderer::Initialize hwnd=0x%p  %dx%d", hwnd, monitorW, monitorH);

    // D3D11 device
    D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1 };
    D3D_FEATURE_LEVEL featureLevel = {};
    HRESULT hr = D3D11CreateDevice(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        levels, 2, D3D11_SDK_VERSION,
        &m_device, &featureLevel, &m_context);
    NativeLogHR("D3D11CreateDevice", hr);
    if (FAILED(hr)) return false;
    NativeLog("D3D11: feature level 0x%X", (unsigned)featureLevel);

    // DXGI factory → swap chain
    IDXGIDevice*   dxgiDevice  = nullptr;
    IDXGIAdapter*  adapter     = nullptr;
    IDXGIFactory2* factory     = nullptr;
    hr = m_device->QueryInterface(__uuidof(IDXGIDevice), (void**)&dxgiDevice);
    if (FAILED(hr)) { NativeLogHR("QI(IDXGIDevice)", hr); return false; }
    hr = dxgiDevice->GetAdapter(&adapter);
    if (FAILED(hr)) { NativeLogHR("GetAdapter", hr); dxgiDevice->Release(); return false; }
    hr = adapter->GetParent(__uuidof(IDXGIFactory2), (void**)&factory);
    if (FAILED(hr)) { NativeLogHR("GetParent(IDXGIFactory2)", hr); adapter->Release(); dxgiDevice->Release(); return false; }

    DXGI_SWAP_CHAIN_DESC1 sc = {};
    sc.Width        = (UINT)monitorW;
    sc.Height       = (UINT)monitorH;
    sc.Format       = DXGI_FORMAT_B8G8R8A8_UNORM;
    sc.SampleDesc   = { 1, 0 };
    sc.BufferUsage  = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sc.BufferCount  = 2;
    sc.SwapEffect   = DXGI_SWAP_EFFECT_FLIP_DISCARD;
    sc.Scaling      = DXGI_SCALING_STRETCH;
    sc.AlphaMode    = DXGI_ALPHA_MODE_IGNORE;

    IDXGISwapChain1* sc1 = nullptr;
    hr = factory->CreateSwapChainForHwnd(m_device, hwnd, &sc, nullptr, nullptr, &sc1);
    NativeLogHR("CreateSwapChainForHwnd", hr);
    if (SUCCEEDED(hr)) {
        sc1->QueryInterface(__uuidof(IDXGISwapChain), (void**)&m_swapChain);
        sc1->Release();
        factory->MakeWindowAssociation(hwnd, DXGI_MWA_NO_ALT_ENTER);
    }
    factory->Release(); adapter->Release(); dxgiDevice->Release();
    if (FAILED(hr)) return false;

    // RenderTargetView
    ID3D11Texture2D* backBuf = nullptr;
    hr = m_swapChain->GetBuffer(0, __uuidof(ID3D11Texture2D), (void**)&backBuf);
    if (FAILED(hr)) { NativeLogHR("GetBuffer", hr); return false; }
    hr = m_device->CreateRenderTargetView(backBuf, nullptr, &m_rtv);
    backBuf->Release();
    if (FAILED(hr)) { NativeLogHR("CreateRenderTargetView", hr); return false; }

    // Sampler (bilinear clamp)
    D3D11_SAMPLER_DESC sd = {};
    sd.Filter   = D3D11_FILTER_MIN_MAG_LINEAR_MIP_POINT;
    sd.AddressU = sd.AddressV = sd.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
    hr = m_device->CreateSamplerState(&sd, &m_sampler);
    if (FAILED(hr)) { NativeLogHR("CreateSamplerState", hr); return false; }

    // Compile rasterizer shaders (fast, must be ready before first frame)
    CompileShaders();
    // Compile compute shaders on a background thread so the 5s startup promise
    // is not blocked by the large Anime4K-L shader compilation.
    // RenderFrame checks m_csReady before dispatching Anime4K.
    m_cancelCompile.store(false, std::memory_order_relaxed);
    m_compileThread = std::thread([this]() {
        CompileComputeShaders();  // sets m_csSReady / m_csLReady internally
    });

    // Viewport (fullscreen)
    D3D11_VIEWPORT vp = { 0, 0, (float)monitorW, (float)monitorH, 0, 1 };
    m_context->RSSetViewports(1, &vp);
    m_context->OMSetRenderTargets(1, &m_rtv, nullptr);
    m_context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);

    QueryPerformanceFrequency(&m_perfFreq);
    QueryPerformanceCounter(&m_lastFrame);
    QueryPerformanceCounter(&m_fpsTimer);
    return true;
}

// ─── Shader Compilation ───────────────────────────────────────────────────────

bool D3D11Renderer::CompileShaders() {
    auto compile = [&](const char* src, const char* entry, const char* target,
                       ID3DBlob** ppBlob) -> bool {
        ID3DBlob* err = nullptr;
        HRESULT hr = D3DCompile(src, strlen(src), nullptr, nullptr, nullptr,
                                entry, target,
                                D3DCOMPILE_OPTIMIZATION_LEVEL3, 0,
                                ppBlob, &err);
        if (err) { NativeLog("Shader compile warn: %s", (char*)err->GetBufferPointer()); err->Release(); }
        return SUCCEEDED(hr);
    };

    ID3DBlob* vsBlob = nullptr;
    ID3DBlob* psBlob = nullptr;
    // All modes use the passthrough PS; Anime4K rendering uses compute shaders + m_psA4k
    if (!compile(k_VS,             "main", "vs_4_0", &vsBlob)) return false;
    if (!compile(k_PS_PASSTHROUGH, "main", "ps_4_0", &psBlob)) { vsBlob->Release(); return false; }

    SafeRelease(m_vs);
    SafeRelease(m_ps);
    m_device->CreateVertexShader(vsBlob->GetBufferPointer(), vsBlob->GetBufferSize(), nullptr, &m_vs);
    m_device->CreatePixelShader (psBlob->GetBufferPointer(), psBlob->GetBufferSize(), nullptr, &m_ps);
    vsBlob->Release(); psBlob->Release();

    // Compile Anime4K display PS once (RGBA output → BGRA swap chain)
    if (!m_psA4k) {
        static const char* kA4kPS = R"hlsl(
Texture2D    tex : register(t0);
SamplerState smp : register(s0);
float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
    float4 c = tex.Sample(smp, uv);
    return float4(c.b, c.g, c.r, 1.0f);
}
)hlsl";
        ID3DBlob* b = nullptr; ID3DBlob* e = nullptr;
        if (SUCCEEDED(D3DCompile(kA4kPS, strlen(kA4kPS), nullptr, nullptr, nullptr,
                                 "main", "ps_4_0", D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &b, &e))) {
            m_device->CreatePixelShader(b->GetBufferPointer(), b->GetBufferSize(), nullptr, &m_psA4k);
            b->Release();
        }
        if (e) e->Release();
    }

    m_context->VSSetShader(m_vs, nullptr, 0);
    m_context->PSSetShader(m_ps, nullptr, 0);
    m_currentMode = 0;
    return true;
}

void D3D11Renderer::SetShaderMode(int mode) {
    if (mode != m_currentMode) {
        m_currentMode = mode;  // Anime4K modes 1/2 don't need PS recompile
    }
}

// ─── Compute Shaders ─────────────────────────────────────────────────────────

bool D3D11Renderer::CompileComputeShaders() {
    auto compileCS = [&](const char* body, ID3D11ComputeShader** ppCS) -> bool {
        std::string src = std::string(k_A4K_COMMON) + body;
        ID3DBlob* blob = nullptr; ID3DBlob* err = nullptr;
        HRESULT hr = D3DCompile(src.c_str(), src.size(), nullptr, nullptr, nullptr,
                                "main", "cs_5_0",
                                D3DCOMPILE_OPTIMIZATION_LEVEL1, 0, &blob, &err);
        if (err) { NativeLog("CS error: %s", (char*)err->GetBufferPointer()); err->Release(); }
        if (FAILED(hr)) return false;
        hr = m_device->CreateComputeShader(blob->GetBufferPointer(), blob->GetBufferSize(), nullptr, ppCS);
        blob->Release();
        return SUCCEEDED(hr);
    };

    // Shared resources (samplers + cbuffer) must exist before either model runs.
    // Create them first so m_csSReady/m_csLReady can safely gate RunAnime4K.
    D3D11_SAMPLER_DESC sd = {};
    sd.Filter   = D3D11_FILTER_MIN_MAG_MIP_POINT;
    sd.AddressU = sd.AddressV = sd.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
    m_device->CreateSamplerState(&sd, &m_csPointSamp);
    sd.Filter = D3D11_FILTER_MIN_MAG_LINEAR_MIP_POINT;
    m_device->CreateSamplerState(&sd, &m_csLinearSamp);

    D3D11_BUFFER_DESC cbd = {};
    cbd.ByteWidth = 16; cbd.Usage = D3D11_USAGE_DYNAMIC;
    cbd.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
    cbd.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
    m_device->CreateBuffer(&cbd, nullptr, &m_csCBuffer);

    bool sharedOk = m_csPointSamp && m_csLinearSamp && m_csCBuffer;

    // Compile S shaders, then signal S-ready independently of L compilation
    const char* sP[4] = { k_A4K_S_P1, k_A4K_S_P2, k_A4K_S_P3, k_A4K_S_P4 };
    for (int i = 0; i < 4; i++) {
        if (m_cancelCompile.load(std::memory_order_relaxed)) break;
        compileCS(sP[i], &m_csS[i]);
    }
    bool sOk = sharedOk && m_csS[0] && m_csS[1] && m_csS[2] && m_csS[3];
    m_csSReady.store(sOk, std::memory_order_release);
    NativeLog("CompileComputeShaders: S %s", sOk ? "OK" : "FAILED");

    // Compile L shaders (heavier — takes longer, signals L-ready when done)
    const char* lP[4] = { k_A4K_L_P1, k_A4K_L_P2, k_A4K_L_P3, k_A4K_L_P4 };
    for (int i = 0; i < 4; i++) {
        if (m_cancelCompile.load(std::memory_order_relaxed)) break;
        compileCS(lP[i], &m_csL[i]);
    }
    bool lOk = sharedOk && m_csL[0] && m_csL[1] && m_csL[2] && m_csL[3];
    m_csLReady.store(lOk, std::memory_order_release);
    NativeLog("CompileComputeShaders: L %s", lOk ? "OK" : "FAILED");

    return sOk && lOk;
}

bool D3D11Renderer::EnsureAnime4KTextures(int w, int h) {
    if (m_a4kTexW == w && m_a4kTexH == h) return true;

    SafeRelease(m_a4kOutUAV);  SafeRelease(m_a4kOutSRV);  SafeRelease(m_a4kOutTex);
    for (int i = 0; i < 4; i++) {
        SafeRelease(m_a4kUAV[i]); SafeRelease(m_a4kSRV[i]); SafeRelease(m_a4kTex[i]);
    }

    auto mkTex = [&](int tw, int th, DXGI_FORMAT fmt,
                     ID3D11Texture2D** ppTex,
                     ID3D11ShaderResourceView** ppSRV,
                     ID3D11UnorderedAccessView** ppUAV) -> bool {
        D3D11_TEXTURE2D_DESC td = {};
        td.Width = (UINT)tw; td.Height = (UINT)th;
        td.MipLevels = td.ArraySize = 1;
        td.Format = fmt;
        td.SampleDesc.Count = 1;
        td.Usage = D3D11_USAGE_DEFAULT;
        td.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_UNORDERED_ACCESS;
        if (FAILED(m_device->CreateTexture2D(&td, nullptr, ppTex))) {
            NativeLog("EnsureAnime4KTextures: CreateTexture2D(%dx%d) failed", tw, th);
            return false;
        }
        m_device->CreateShaderResourceView(*ppTex, nullptr, ppSRV);
        m_device->CreateUnorderedAccessView(*ppTex, nullptr, ppUAV);
        return true;
    };

    for (int i = 0; i < 4; i++) {
        if (!mkTex(w, h, DXGI_FORMAT_R16G16B16A16_FLOAT,
                   &m_a4kTex[i], &m_a4kSRV[i], &m_a4kUAV[i]))
            return false;
    }

    if (!mkTex(w*2, h*2, DXGI_FORMAT_R8G8B8A8_UNORM,
               &m_a4kOutTex, &m_a4kOutSRV, &m_a4kOutUAV))
        return false;

    m_a4kTexW = w; m_a4kTexH = h;
    NativeLog("EnsureAnime4KTextures: %dx%d → %dx%d", w, h, w*2, h*2);

    // Update cbuffer only when dimensions change (not every frame)
    if (m_csCBuffer) {
        struct CsCB { UINT iW, iH, oW, oH; };
        CsCB cb = { (UINT)w, (UINT)h, (UINT)w*2, (UINT)h*2 };
        D3D11_MAPPED_SUBRESOURCE mr;
        if (SUCCEEDED(m_context->Map(m_csCBuffer, 0, D3D11_MAP_WRITE_DISCARD, 0, &mr))) {
            memcpy(mr.pData, &cb, sizeof(cb)); m_context->Unmap(m_csCBuffer, 0);
        }
    }
    return true;
}

void D3D11Renderer::RunAnime4K(int mode, int inW, int inH) {
    if (!EnsureAnime4KTextures(inW, inH)) return;

    // cbuffer is updated in EnsureAnime4KTextures when dimensions change
    m_context->CSSetConstantBuffers(0, 1, &m_csCBuffer);

    ID3D11SamplerState* samps[2] = { m_csPointSamp, m_csLinearSamp };
    m_context->CSSetSamplers(0, 2, samps);

    ID3D11ShaderResourceView*  nullS[4] = {};
    ID3D11UnorderedAccessView* nullU[4] = {};

    auto run = [&](ID3D11ComputeShader* cs,
                   int ns, ID3D11ShaderResourceView**  srvs,
                   int nu, ID3D11UnorderedAccessView** uavs,
                   UINT dx, UINT dy) {
        m_context->CSSetShader(cs, nullptr, 0);
        m_context->CSSetShaderResources(0, ns, srvs);
        m_context->CSSetUnorderedAccessViews(0, nu, uavs, nullptr);
        m_context->Dispatch(dx, dy, 1);
        m_context->CSSetUnorderedAccessViews(0, nu, nullU, nullptr);
        m_context->CSSetShaderResources(0, ns, nullS);
    };

    UINT d16x = ((UINT)inW  + 15) / 16, d16y = ((UINT)inH  + 15) / 16;
    UINT d8x  = ((UINT)inW  +  7) /  8, d8y  = ((UINT)inH  +  7) /  8;
    UINT d16ox= ((UINT)inW*2+ 15) / 16, d16oy= ((UINT)inH*2+ 15) / 16;

    // P1 reads BGRA game texture directly (inline channel swap in shader)
    // P4 also reads BGRA game texture directly (using .bgr swizzle in shader)
    ID3D11ComputeShader** cs = (mode == 1) ? m_csS : m_csL;

    if (mode == 1) {
        { ID3D11ShaderResourceView* s[]={m_gameSRV};
          ID3D11UnorderedAccessView*u[]={m_a4kUAV[0]};
          run(cs[0],1,s,1,u,d16x,d16y); }
        { ID3D11ShaderResourceView* s[]={m_a4kSRV[0]};
          ID3D11UnorderedAccessView*u[]={m_a4kUAV[1]};
          run(cs[1],1,s,1,u,d16x,d16y); }
        { ID3D11ShaderResourceView* s[]={m_a4kSRV[1]};
          ID3D11UnorderedAccessView*u[]={m_a4kUAV[0]};
          run(cs[2],1,s,1,u,d16x,d16y); }
        { ID3D11ShaderResourceView* s[]={m_gameSRV, m_a4kSRV[0]};
          ID3D11UnorderedAccessView*u[]={m_a4kOutUAV};
          run(cs[3],2,s,1,u,d16ox,d16oy); }
    } else {
        { ID3D11ShaderResourceView* s[]={m_gameSRV};
          ID3D11UnorderedAccessView*u[]={m_a4kUAV[0], m_a4kUAV[1]};
          run(cs[0],1,s,2,u,d16x,d16y); }
        { ID3D11ShaderResourceView* s[]={m_a4kSRV[0], m_a4kSRV[1]};
          ID3D11UnorderedAccessView*u[]={m_a4kUAV[2], m_a4kUAV[3]};
          run(cs[1],2,s,2,u,d8x,d8y); }
        { ID3D11ShaderResourceView* s[]={m_a4kSRV[2], m_a4kSRV[3]};
          ID3D11UnorderedAccessView*u[]={m_a4kUAV[0], m_a4kUAV[1]};
          run(cs[2],2,s,2,u,d8x,d8y); }
        { ID3D11ShaderResourceView* s[]={m_gameSRV, m_a4kSRV[0], m_a4kSRV[1]};
          ID3D11UnorderedAccessView*u[]={m_a4kOutUAV};
          run(cs[3],3,s,1,u,d16ox,d16oy); }
    }

    m_context->CSSetShader(nullptr, nullptr, 0);
}

void D3D11Renderer::ShutdownAnime4K() {
    SafeRelease(m_a4kOutUAV);  SafeRelease(m_a4kOutSRV);  SafeRelease(m_a4kOutTex);
    for (int i = 0; i < 4; i++) {
        SafeRelease(m_a4kUAV[i]); SafeRelease(m_a4kSRV[i]); SafeRelease(m_a4kTex[i]);
        SafeRelease(m_csS[i]); SafeRelease(m_csL[i]);
    }
    SafeRelease(m_csCBuffer);
    SafeRelease(m_csPointSamp);
    SafeRelease(m_csLinearSamp);
    SafeRelease(m_psA4k);
    m_a4kTexW = m_a4kTexH = 0;
}

// ─── Game Texture (lazy, resizes on window resize) ────────────────────────────

void D3D11Renderer::EnsureGameTexture(int w, int h) {
    if (m_gameTex && m_gameTexW == w && m_gameTexH == h) return;
    SafeRelease(m_gameSRV);
    SafeRelease(m_gameTex);

    D3D11_TEXTURE2D_DESC td = {};
    td.Width            = (UINT)w;
    td.Height           = (UINT)h;
    td.MipLevels        = 1;
    td.ArraySize        = 1;
    td.Format           = DXGI_FORMAT_B8G8R8A8_UNORM;
    td.SampleDesc.Count = 1;
    td.Usage            = D3D11_USAGE_DEFAULT;
    td.BindFlags        = D3D11_BIND_SHADER_RESOURCE;
    if (FAILED(m_device->CreateTexture2D(&td, nullptr, &m_gameTex))) {
        NativeLog("D3D11Renderer: CreateTexture2D(game) failed %dx%d", w, h);
        return;
    }
    m_device->CreateShaderResourceView(m_gameTex, nullptr, &m_gameSRV);
    m_gameTexW = w;
    m_gameTexH = h;
}

// ─── RenderFrame ─────────────────────────────────────────────────────────────

void D3D11Renderer::RenderFrame(ID3D11Texture2D* srcTexture, const RECT& gameRect) {
    if (!srcTexture || !m_device) return;

    int gW = gameRect.right  - gameRect.left;
    int gH = gameRect.bottom - gameRect.top;
    if (gW <= 0 || gH <= 0) return;

    m_renderCallCount++;
    if (m_renderCallCount <= 3 || m_renderCallCount % 300 == 0)
        NativeLog("D3D11Renderer::RenderFrame #%u src=%dx%d", m_renderCallCount, gW, gH);

    EnsureGameTexture(gW, gH);

    // Copy source → game texture
    D3D11_TEXTURE2D_DESC srcDesc;
    srcTexture->GetDesc(&srcDesc);
    LONG srcL = std::max(0L, gameRect.left);
    LONG srcT = std::max(0L, gameRect.top);
    LONG srcR = std::min((LONG)srcDesc.Width,  gameRect.right);
    LONG srcB = std::min((LONG)srcDesc.Height, gameRect.bottom);
    if (srcR <= srcL || srcB <= srcT) return;
    D3D11_BOX box = { (UINT)srcL,(UINT)srcT,0,(UINT)srcR,(UINT)srcB,1 };
    m_context->CopySubresourceRegion(m_gameTex, 0, 0, 0, 0, srcTexture, 0, &box);

    // Re-bind rasterizer state
    m_context->OMSetRenderTargets(1, &m_rtv, nullptr);
    m_context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    m_context->VSSetShader(m_vs, nullptr, 0);
    m_context->PSSetSamplers(0, 1, &m_sampler);

    bool useAnime4K = m_psA4k &&
                   ((m_currentMode == 1 && m_csSReady.load(std::memory_order_acquire)) ||
                    (m_currentMode == 2 && m_csLReady.load(std::memory_order_acquire)));

    if (useAnime4K) {
        // Run CNN compute pipeline (P1/P4 read BGRA game texture directly)
        RunAnime4K(m_currentMode, gW, gH);
        // Display upscaled RGBA output (RGBA→BGRA swap in m_psA4k)
        m_context->PSSetShader(m_psA4k, nullptr, 0);
        m_context->PSSetShaderResources(0, 1, &m_a4kOutSRV);
    } else {
        m_context->PSSetShader(m_ps, nullptr, 0);
        m_context->PSSetShaderResources(0, 1, &m_gameSRV);
    }

    // Fullscreen triangle covers entire viewport — no need to clear
    m_context->Draw(3, 0);

    // Unbind SRV to avoid D3D11 hazard warnings on next frame
    ID3D11ShaderResourceView* nullSRV = nullptr;
    m_context->PSSetShaderResources(0, 1, &nullSRV);

    HRESULT hrPresent = m_swapChain->Present(0, 0);
    if (FAILED(hrPresent) || m_renderCallCount <= 3)
        NativeLog("D3D11Renderer: Present #%u hr=0x%08X", m_renderCallCount, (unsigned)hrPresent);

    // FPS tracking
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    double elapsed = (double)(now.QuadPart - m_lastFrame.QuadPart) / m_perfFreq.QuadPart;
    m_frameTimeMs = (float)(elapsed * 1000.0);
    m_lastFrame   = now;

    m_frameCount++;
    double fpsElapsed = (double)(now.QuadPart - m_fpsTimer.QuadPart) / m_perfFreq.QuadPart;
    if (fpsElapsed >= 1.0) {
        m_fps       = (float)(m_frameCount / fpsElapsed);
        m_frameCount = 0;
        m_fpsTimer   = now;
    }
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────

void D3D11Renderer::Shutdown() {
    // Signal compile thread to skip remaining shaders, then join.
    // D3DCompile itself is not interruptible, but subsequent shaders are skipped.
    m_cancelCompile.store(true, std::memory_order_relaxed);
    if (m_compileThread.joinable()) m_compileThread.join();
    ShutdownAnime4K();
    SafeRelease(m_gameSRV);
    SafeRelease(m_gameTex);
    SafeRelease(m_sampler);
    SafeRelease(m_ps);
    SafeRelease(m_vs);
    SafeRelease(m_rtv);
    SafeRelease(m_swapChain);
    if (m_context) { m_context->ClearState(); SafeRelease(m_context); }
    SafeRelease(m_device);
    m_gameTexW = m_gameTexH = 0;
    m_currentMode = -1;
    m_renderCallCount = 0;
}
