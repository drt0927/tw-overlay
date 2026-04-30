{
  "targets": [
    {
      "target_name": "tw_native",
      "sources": [
        "src/addon.cpp",
        "src/d3d11_renderer.cpp",
        "src/scaling_window.cpp",
        "src/dxgi_capture.cpp",
        "src/wgc_capture.cpp",
        "src/input_forwarder.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-ld3d11",
        "-ldxgi",
        "-ld3dcompiler",
        "-luser32",
        "-lgdi32",
        "-lMagnification",
        "-ldwmapi"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "_WIN32_WINNT=0x0A00",
        "UNICODE",
        "_UNICODE"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [
                "/std:c++17",
                "/EHsc",
                "/W3"
              ],
              "Optimization": "2",
              "RuntimeLibrary": "2"
            },
            "VCLinkerTool": {
              "SubSystem": "2"
            }
          }
        }]
      ]
    },
    {
      "target_name": "tw_capture_helper",
      "type": "executable",
      "sources": [
        "helper/main.cpp"
      ],
      "include_dirs": [
        "helper"
      ],
      "libraries": [
        "-ld3d11",
        "-ldxgi",
        "-lwindowsapp",
        "-luser32"
      ],
      "defines": [
        "_WIN32_WINNT=0x0A00",
        "UNICODE",
        "_UNICODE"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [
                "/std:c++17",
                "/EHsc",
                "/W3"
              ],
              "Optimization": "2",
              "RuntimeLibrary": "2"
            },
            "VCLinkerTool": {
              "SubSystem": "2",
              "EntryPointSymbol": "wmainCRTStartup"
            }
          }
        }]
      ]
    }
  ]
}
