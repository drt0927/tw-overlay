@echo off
set NODE_TLS_REJECT_UNAUTHORIZED=0
cd /d D:\github\tw-overlay
for /f "delims=" %%v in ('node -e "process.stdout.write(require('./node_modules/electron/package.json').version)"') do set ELECTRON_VER=%%v
echo Building for Electron %ELECTRON_VER% >> build_native_output.txt
node node_modules\node-gyp\bin\node-gyp.js rebuild --target=%ELECTRON_VER% --arch=x64 --dist-url=https://electronjs.org/headers --directory native > build_native_output.txt 2>&1
echo Exit code: %ERRORLEVEL% >> build_native_output.txt
