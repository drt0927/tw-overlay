param([string]$processName)

$signature = @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class Window {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    
    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rc, int size);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
}
'@

if (-not ([System.Management.Automation.PSTypeName]'Window').Type) {
    Add-Type -TypeDefinition $signature
}

$p = Get-Process $processName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*Talesweaver*" } | Select-Object -First 1

if ($p -and $p.MainWindowHandle -ne 0) {
    # 최소화 상태인지 확인
    if ([Window]::IsIconic($p.MainWindowHandle)) {
        Write-Output "ERROR: Window is minimized"
        exit
    }

    $rect = New-Object RECT
    # DWMWA_EXTENDED_FRAME_BOUNDS = 9 (실제 보이는 창 테두리 좌표)
    $res = [Window]::DwmGetWindowAttribute($p.MainWindowHandle, 9, [ref]$rect, [System.Runtime.InteropServices.Marshal]::SizeOf($rect))
    
    if ($res -eq 0) {
        Write-Output "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
    } else {
        # DWM 실패 시 일반 Rect 시도
        if ([Window]::GetWindowRect($p.MainWindowHandle, [ref]$rect)) {
            Write-Output "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
        } else {
            Write-Output "ERROR: Failed to get rect"
        }
    }
} else {
    Write-Output "ERROR: Window not found"
}
