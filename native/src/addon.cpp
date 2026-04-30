#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <napi.h>
#include "scaling_window.h"
#include "d3d11_renderer.h"
#include "dxgi_capture.h"
#include "wgc_capture.h"
#include "input_forwarder.h"
#include "capture_backend.h"

#include <atomic>
#include <thread>
#include <future>
#include <memory>
#include <string>
#include <chrono>
#include <windows.h>
#include <timeapi.h>
#pragma comment(lib, "winmm.lib")
#include "native_log.h"

// ─── Global State ─────────────────────────────────────────────────────────────

static std::atomic<bool>     g_running    { false };
static std::atomic<int>      g_shaderMode { 0 };      // 0=passthrough, 1=anime4k-s, 2=anime4k-l
static std::atomic<uint32_t> g_renderGen  { 0 };      // generation counter: prevents detached thread from writing globals
static std::thread           g_renderThread;

// Atomic so both the render thread (natural exit) and the main thread (StopFullscreen)
// can race-free exchange it to nullptr — whichever wins is responsible for restoring
// GWLP_HWNDPARENT. Using atomic<HWND> (pointer-sized, lock-free on x64).
static std::atomic<HWND> g_electronHwnd { nullptr };

// Status (written by render thread, read by main thread via atomics)
static std::atomic<float> g_fps         { 0.0f };
static std::atomic<float> g_frameTimeMs { 0.0f };
static std::atomic<int>   g_captureModeId { 0 };  // 0=none, 1=dxgi, 2=WGC

static const char* kCaptureModeNames[] = { "none", "dxgi", "WGC" };
static int CaptureNameToId(const char* name) {
    if (name && strcmp(name, "WGC")  == 0) return 2;
    if (name && strcmp(name, "dxgi") == 0) return 1;
    return 0;
}

// ─── Render Thread ────────────────────────────────────────────────────────────

static void RenderThreadFunc(HWND electronHwnd, HWND gameHwnd,
                              std::string captureMode,
                              std::promise<HWND> hwndPromise,
                              uint32_t myGen) {
    NativeLog("RenderThread: start  electronHwnd=0x%p  gameHwnd=0x%p  captureMode=%s",
              electronHwnd, gameHwnd, captureMode.c_str());

    // Raise Windows timer resolution to 1ms so Sleep(1) actually sleeps ~1ms.
    // Without this, Sleep(1) can sleep up to ~15ms, capping effective capture
    // poll rate to ~67fps regardless of the game's actual frame rate.
    timeBeginPeriod(1);

    ScalingWindow  scalingWin;
    D3D11Renderer  renderer;
    std::unique_ptr<ICaptureBackend> capture;

    // 1. Create WS_POPUP scaling window (must be on this thread for message pump)
    NativeLog("RenderThread: [1] Creating scaling window...");
    HWND cppHwnd = scalingWin.Create(electronHwnd, gameHwnd);
    if (!cppHwnd) {
        NativeLog("RenderThread: [1] FAILED - CreateWindowEx returned null (GetLastError=%u)",
                  GetLastError());
        hwndPromise.set_value(nullptr);
        return;
    }
    NativeLog("RenderThread: [1] Scaling window created: 0x%p", cppHwnd);

    // 2. Initialize D3D11 renderer using the game's monitor dimensions
    const RECT& monRect = scalingWin.GetMonitorRect();
    int screenW = monRect.right  - monRect.left;
    int screenH = monRect.bottom - monRect.top;
    NativeLog("RenderThread: [2] Initializing D3D11 renderer (%dx%d)...", screenW, screenH);
    if (!renderer.Initialize(cppHwnd, screenW, screenH)) {
        NativeLog("RenderThread: [2] FAILED - D3D11Renderer::Initialize");
        hwndPromise.set_value(nullptr);
        scalingWin.Destroy(cppHwnd, electronHwnd);
        return;
    }
    NativeLog("RenderThread: [2] D3D11 ready. shaderMode=%d", g_shaderMode.load());
    renderer.SetShaderMode(g_shaderMode.load());

    // 3. Initialize capture backend (DXGI default, WGC fallback)
    auto tryInit = [&](bool useWGC) -> bool {
        const char* name = useWGC ? "WGC" : "DXGI";
        NativeLog("RenderThread: [3] Trying %s capture...", name);
        capture = useWGC
            ? std::unique_ptr<ICaptureBackend>(new WGCCapture())
            : std::unique_ptr<ICaptureBackend>(new DXGICapture());
        bool result = capture->Initialize(gameHwnd, cppHwnd, renderer.GetDevice());
        NativeLog("RenderThread: [3] %s capture %s", name, result ? "OK" : "FAILED");
        return result;
    };

    bool ok = false;
    if (captureMode == "wgc") {
        ok = tryInit(true);
        if (!ok) { NativeLog("RenderThread: [3] WGC failed, trying DXGI fallback"); ok = tryInit(false); }
    } else {
        ok = tryInit(false);
        if (!ok) { NativeLog("RenderThread: [3] DXGI failed, trying WGC fallback"); ok = tryInit(true); }
    }

    if (!ok) {
        NativeLog("RenderThread: [3] All capture backends failed");
        hwndPromise.set_value(nullptr);
        renderer.Shutdown();
        scalingWin.Destroy(cppHwnd, electronHwnd);
        return;
    }

    // Record actual capture mode for getStatus()
    g_captureModeId.store(CaptureNameToId(capture->GetName()), std::memory_order_relaxed);
    NativeLog("RenderThread: [3] Capture active: %s", capture->GetName());

    // 4. Start input forwarder
    NativeLog("RenderThread: [4] Starting input forwarder...");
    RECT clientRect = {};
    GetClientRect(gameHwnd, &clientRect);
    int gameClientW = clientRect.right  - clientRect.left;
    int gameClientH = clientRect.bottom - clientRect.top;
    POINT clientOrigin = {0, 0};
    ClientToScreen(gameHwnd, &clientOrigin);
    InputForwarder::Start(gameHwnd, cppHwnd, monRect,
                          clientOrigin.x, clientOrigin.y, gameClientW, gameClientH);
    NativeLog("RenderThread: [4] Input forwarder started, clientOrigin=(%d,%d) size=%dx%d",
              clientOrigin.x, clientOrigin.y, gameClientW, gameClientH);

    // 5. Signal HWND to main thread first, THEN set GWLP_HWNDPARENT and bring to top.
    // Both SetWindowLongPtrW(GWLP_HWNDPARENT) and SetWindowPos can internally SendMessage
    // to electronHwnd's thread. The main thread is blocked in wait_for() until this
    // promise fires — so we must unblock it first so it can pump those messages.
    NativeLog("RenderThread: [5] Signaling success (GWLP + BringToTop follow after unblock)");
    hwndPromise.set_value(cppHwnd);

    // 5b. Now safe — main thread is unblocked and pumping messages.
    // Load g_electronHwnd atomically: if StopFullscreen ran concurrently and exchanged
    // it to nullptr, skip the set (StopFullscreen already handles cleanup).
    bool startupOk = false;
    if (g_renderGen.load(std::memory_order_relaxed) == myGen) {
        HWND eHwnd = g_electronHwnd.load(std::memory_order_relaxed);
        if (eHwnd) {
            LONG_PTR pr = SetWindowLongPtrW(eHwnd, GWLP_HWNDPARENT, (LONG_PTR)cppHwnd);
            NativeLog("RenderThread: [5b] SetWindowLongPtr(GWLP_HWNDPARENT=cppHwnd) pr=0x%p err=%u",
                      (void*)pr, GetLastError());
        }
        NativeLog("RenderThread: [5b] Calling BringToTop...");
        scalingWin.BringToTop(cppHwnd, gameHwnd);
        NativeLog("RenderThread: [5b] BringToTop done, entering render loop");
        startupOk = true;
    } else {
        NativeLog("RenderThread: [5b] Generation mismatch — aborting startup, skipping render loop");
    }

    // 6. Render loop (also checks generation: prevents a timed-out detached thread from running)
    int currentShader = g_shaderMode.load();
    while (startupOk &&
           g_running.load(std::memory_order_relaxed) &&
           g_renderGen.load(std::memory_order_relaxed) == myGen) {
        // Pump Win32 messages for the scaling window
        MSG msg;
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) {
                g_running.store(false);
                break;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        if (!g_running.load(std::memory_order_relaxed)) break;

        // Apply shader mode change if requested
        int newShader = g_shaderMode.load();
        if (newShader != currentShader) {
            renderer.SetShaderMode(newShader);
            currentShader = newShader;
        }

        // Remap cursor and manage WS_EX_TRANSPARENT for click-through
        InputForwarder::UpdateFrame();

        // Capture + render
        CapturedFrame frame;
        if (capture->TryAcquireFrame(frame)) {
            renderer.RenderFrame(frame.texture, frame.sourceRect);
            capture->ReleaseFrame();

            g_fps.store(renderer.GetFPS(),         std::memory_order_relaxed);
            g_frameTimeMs.store(renderer.GetFrameTimeMs(), std::memory_order_relaxed);
        } else if (capture->IsDead()) {
            NativeLog("RenderThread: capture backend died, exiting render loop");
            g_running.store(false);
            break;
        } else {
            Sleep(1);   // No new frame - yield briefly
        }
    }

    // 7. Cleanup (in reverse init order)
    NativeLog("RenderThread: [7] Render loop ended, cleaning up...");
    timeEndPeriod(1);
    InputForwarder::Stop();
    capture->Shutdown();
    renderer.Shutdown();

    // Natural-exit path: restore GWLP_HWNDPARENT BEFORE destroying cppHwnd so
    // electronHwnd is never left with a stale owner pointing at a dead window.
    // We use atomic exchange so exactly one of (this thread, StopFullscreen) restores it.
    // StopFullscreen path: main thread calls exchange(nullptr) before join(), so we get
    // nullptr here → no-op (already handled, and main is blocked → skip SendMessage risk).
    if (g_renderGen.load(std::memory_order_relaxed) == myGen) {
        HWND eHwnd = g_electronHwnd.exchange(nullptr, std::memory_order_acq_rel);
        if (eHwnd && IsWindow(eHwnd)) {
            SetWindowLongPtrW(eHwnd, GWLP_HWNDPARENT, 0);
            NativeLog("RenderThread: [7] GWLP_HWNDPARENT restored (natural exit)");
        }
    }

    scalingWin.Destroy(cppHwnd, electronHwnd);

    // Only reset status globals if this is still the current generation.
    // A timed-out+detached old thread must not overwrite a new thread's state.
    if (g_renderGen.load(std::memory_order_relaxed) == myGen) {
        g_fps.store(0.0f, std::memory_order_relaxed);
        g_frameTimeMs.store(0.0f, std::memory_order_relaxed);
        g_captureModeId.store(0, std::memory_order_relaxed);
    }
    NativeLog("RenderThread: [7] Cleanup complete");
}

// ─── N-API Exports ────────────────────────────────────────────────────────────

// startFullscreen(electronHwnd: number, gameHwnd: number, options: object)
// → { success: boolean, captureMode: string, hwnd?: number }
Napi::Value StartFullscreen(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_running.load()) {
        Napi::Object r = Napi::Object::New(env);
        r.Set("success", false);
        r.Set("error", Napi::String::New(env, "already running"));
        return r;
    }

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "expected (electronHwnd, gameHwnd, options)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    HWND electronHwnd = (HWND)(uintptr_t)info[0].As<Napi::Number>().Int64Value();
    HWND gameHwnd     = (HWND)(uintptr_t)info[1].As<Napi::Number>().Int64Value();
    g_electronHwnd.store(electronHwnd, std::memory_order_relaxed);

    NativeLog("startFullscreen called: electronHwnd=0x%p  gameHwnd=0x%p  valid_e=%d  valid_g=%d",
              electronHwnd, gameHwnd, IsWindow(electronHwnd), IsWindow(gameHwnd));

    std::string captureMode = "wgc";
    std::string upscaleMode = "passthrough";
    if (info.Length() >= 3 && info[2].IsObject()) {
        Napi::Object opts = info[2].As<Napi::Object>();
        if (opts.Has("captureMode"))
            captureMode = opts.Get("captureMode").As<Napi::String>().Utf8Value();
        if (opts.Has("upscaleMode"))
            upscaleMode = opts.Get("upscaleMode").As<Napi::String>().Utf8Value();
    }

    // Map upscaleMode string to int
    g_shaderMode.store(
        upscaleMode == "anime4k-l" ? 2 :
        upscaleMode == "anime4k-s" ? 1 : 0
    );

    std::promise<HWND> hwndPromise;
    auto hwndFuture = hwndPromise.get_future();

    g_running.store(true);
    uint32_t myGen = g_renderGen.fetch_add(1, std::memory_order_relaxed) + 1;
    g_renderThread = std::thread(RenderThreadFunc,
        electronHwnd, gameHwnd, captureMode, std::move(hwndPromise), myGen);

    // Wait up to 5s for the render thread to create the window and initialize
    auto status = hwndFuture.wait_for(std::chrono::seconds(5));

    Napi::Object result = Napi::Object::New(env);
    if (status == std::future_status::ready) {
        HWND cppHwnd = hwndFuture.get();
        if (cppHwnd) {
            result.Set("success", true);
            result.Set("captureMode", Napi::String::New(env, kCaptureModeNames[g_captureModeId.load()]));
            result.Set("hwnd", Napi::Number::New(env, (double)(uintptr_t)cppHwnd));
        } else {
            g_running.store(false);
            if (g_renderThread.joinable()) g_renderThread.join();
            g_electronHwnd.store(nullptr, std::memory_order_relaxed);
            result.Set("success", false);
            result.Set("error", Napi::String::New(env, "initialization failed"));
        }
    } else {
        NativeLog("startFullscreen: 5s timeout — detaching hung render thread");
        // Invalidate this generation so the detached thread's render loop and
        // final cleanup writes are skipped when it eventually unblocks.
        g_renderGen.fetch_add(1, std::memory_order_relaxed);
        g_running.store(false);
        HWND eHwnd = g_electronHwnd.exchange(nullptr, std::memory_order_acq_rel);
        if (eHwnd && IsWindow(eHwnd)) {
            SetWindowLongPtrW(eHwnd, GWLP_HWNDPARENT, 0);
            NativeLog("startFullscreen: GWLP_HWNDPARENT cleared on main thread after timeout");
        }
        if (g_renderThread.joinable()) g_renderThread.detach();
        result.Set("success", false);
        result.Set("error", Napi::String::New(env, "timeout"));
    }
    return result;
}

// stopFullscreen()
Napi::Value StopFullscreen(const Napi::CallbackInfo& info) {
    // Restore electronHwnd owner from the main thread BEFORE blocking in join().
    // Atomic exchange ensures exactly one of (main thread, render thread natural-exit)
    // restores GWLP_HWNDPARENT — whichever wins the exchange gets the non-null value.
    HWND eHwnd = g_electronHwnd.exchange(nullptr, std::memory_order_acq_rel);
    if (eHwnd && IsWindow(eHwnd)) {
        SetWindowLongPtrW(eHwnd, GWLP_HWNDPARENT, 0);
        NativeLog("StopFullscreen: GWLP_HWNDPARENT cleared on main thread");
    }
    g_running.store(false, std::memory_order_relaxed);
    // Always join if joinable: covers both the active-stop path (render thread still
    // running) and the natural-exit path (thread already finished but not yet joined).
    // Skipping join in the natural-exit case would leave g_renderThread joinable,
    // causing std::terminate() when StartFullscreen assigns a new thread to it.
    if (g_renderThread.joinable()) {
        g_renderThread.join();
    }
    return info.Env().Undefined();
}

// setOverlayActive(active: boolean)
// Call with true when Electron overlay UI is interactive (disables input forwarding)
// Call with false when overlay is in click-through mode (enables input forwarding)
Napi::Value SetOverlayActive(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1 && info[0].IsBoolean()) {
        InputForwarder::SetOverlayActive(info[0].As<Napi::Boolean>().Value());
    }
    return info.Env().Undefined();
}

// setUpscaleMode(mode: "passthrough" | "anime4k-s" | "anime4k-l")
Napi::Value SetUpscaleMode(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1 && info[0].IsString()) {
        std::string mode = info[0].As<Napi::String>().Utf8Value();
        g_shaderMode.store(
            mode == "anime4k-l" ? 2 :
            mode == "anime4k-s" ? 1 : 0
        );
    }
    return info.Env().Undefined();
}

// getStatus() → { fps: number, frameTimeMs: number, captureMode: string, running: boolean }
Napi::Value GetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object s = Napi::Object::New(env);
    int mid = g_captureModeId.load(std::memory_order_relaxed);
    s.Set("fps",         Napi::Number::New(env, g_fps.load()));
    s.Set("frameTimeMs", Napi::Number::New(env, g_frameTimeMs.load()));
    s.Set("captureMode", Napi::String::New(env, kCaptureModeNames[mid >= 0 && mid <= 2 ? mid : 0]));
    s.Set("running",     Napi::Boolean::New(env, g_running.load()));
    return s;
}

// ─── Module Init ──────────────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("startFullscreen",  Napi::Function::New(env, StartFullscreen));
    exports.Set("stopFullscreen",   Napi::Function::New(env, StopFullscreen));
    exports.Set("setOverlayActive", Napi::Function::New(env, SetOverlayActive));
    exports.Set("setUpscaleMode",   Napi::Function::New(env, SetUpscaleMode));
    exports.Set("getStatus",        Napi::Function::New(env, GetStatus));
    return exports;
}

NODE_API_MODULE(tw_native, Init)
