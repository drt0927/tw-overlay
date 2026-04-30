$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
Set-Location 'D:\github\tw-overlay'

$electronVer = node -e "process.stdout.write(require('./node_modules/electron/package.json').version)"
Write-Host "Building for Electron $electronVer"

$result = & node node_modules\node-gyp\bin\node-gyp.js rebuild `
    --target=$electronVer `
    --arch=x64 `
    --dist-url=https://electronjs.org/headers `
    --directory native 2>&1
$result | Tee-Object -FilePath 'D:\github\tw-overlay\build_native_output.txt'
Write-Host "Exit: $LASTEXITCODE"
