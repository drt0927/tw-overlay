#pragma once
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cstdarg>

// Writes to both OutputDebugString and a log file next to the .node binary.
// Disable by defining NATIVE_LOG_DISABLE before including this header.

static void NativeLog(const char* fmt, ...) {
    char buf[1024];
    va_list args;
    va_start(args, fmt);
    _vsnprintf_s(buf, sizeof(buf), _TRUNCATE, fmt, args);
    va_end(args);

    // OutputDebugString (visible in DebugView / VS debugger)
    OutputDebugStringA("[TW_NATIVE] ");
    OutputDebugStringA(buf);
    OutputDebugStringA("\n");

    // Append to log file (10 MB size cap — truncate oldest content on overflow)
    char logPath[MAX_PATH];
    if (GetTempPathA(MAX_PATH, logPath)) {
        strcat_s(logPath, "tw_native_debug.log");
        static const long k_MaxBytes = 10 * 1024 * 1024;
        FILE* f = nullptr;
        if (fopen_s(&f, logPath, "a") == 0 && f) {
            if (ftell(f) > k_MaxBytes) {
                fclose(f);
                // Rotate: delete old file so next open starts fresh
                DeleteFileA(logPath);
                if (fopen_s(&f, logPath, "a") != 0) f = nullptr;
            }
        }
        if (f) {
            SYSTEMTIME st;
            GetLocalTime(&st);
            fprintf(f, "[%02d:%02d:%02d.%03d] %s\n",
                st.wHour, st.wMinute, st.wSecond, st.wMilliseconds, buf);
            fclose(f);
        }
    }
}

static void NativeLogHR(const char* label, HRESULT hr) {
    if (SUCCEEDED(hr)) {
        NativeLog("%s OK (0x%08X)", label, (unsigned)hr);
    } else {
        char msg[256] = {};
        FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
            nullptr, hr, 0, msg, sizeof(msg), nullptr);
        // strip trailing newline
        for (int i = (int)strlen(msg) - 1; i >= 0 && (msg[i] == '\n' || msg[i] == '\r'); --i)
            msg[i] = 0;
        NativeLog("%s FAILED (0x%08X): %s", label, (unsigned)hr, msg);
    }
}
