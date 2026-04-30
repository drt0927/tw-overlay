#pragma once
#include <windows.h>

// Shared memory: small header only — pixel data exchanged via D3D11 shared texture.
//
// Named objects (created by helper, opened by main):
//   Shared memory:  "Local\TW_CaptureInfo_<mainPid>"
//   Shared texture: "TW_CaptureTex_<helperPid>_<epoch>"  (NT named, keyed mutex)
//   Stop event:     "Local\TW_CaptureStop_<mainPid>"
//
// Seqlock protects width/height/epoch updates (even=stable, odd=updating).
// Frame sync uses IDXGIKeyedMutex on the shared texture:
//   Helper acquires key=0, writes frame via CopyResource, releases key=1.
//   Main   acquires key=1 (new frame ready),   uses texture,  releases key=0.

#pragma pack(push, 1)
struct TW_SharedInfo {
    volatile LONG seqLock;  // seqlock for header fields (even=stable, odd=updating)
    LONG          width;    // WGC frame width  (full window, not client)
    LONG          height;   // WGC frame height
    LONG          epoch;    // incremented each time shared texture is recreated
};
#pragma pack(pop)

static const DWORD TW_SHMEM_SIZE = sizeof(TW_SharedInfo);
