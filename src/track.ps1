param(
    [string]$processName,
    [switch]$loop
)
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

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@

if (-not ([System.Management.Automation.PSTypeName]'Window').Type) {
    Add-Type -TypeDefinition $signature
}

function Get-GameRect {
    $p = Get-Process $processName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*Talesweaver*" } | Select-Object -First 1

    if ($p -and $p.MainWindowHandle -ne 0) {
        if ([Window]::IsIconic($p.MainWindowHandle)) {
            return "MINIMIZED"
        }

        $rect = New-Object RECT
        $res = [Window]::DwmGetWindowAttribute($p.MainWindowHandle, 9, [ref]$rect, [System.Runtime.InteropServices.Marshal]::SizeOf($rect))

        if ($res -eq 0) {
            return "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
        } else {
            if ([Window]::GetWindowRect($p.MainWindowHandle, [ref]$rect)) {
                return "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
            } else {
                return "ERROR: Failed to get rect"
            }
        }
    } else {
        return "NOT_RUNNING"
    }
}

if ($loop) {
    Write-Output "READY"
    while ($true) {
        $cmd = [Console]::In.ReadLine()
        if ($null -eq $cmd -or $cmd -eq "EXIT") { break }
        if ($cmd -eq "QUERY") {
            $result = Get-GameRect
            Write-Output $result
        }
        elseif ($cmd -eq "FOCUS") {
            $p = Get-Process $processName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*Talesweaver*" } | Select-Object -First 1
            if ($p -and $p.MainWindowHandle -ne 0) {
                $hwnd = $p.MainWindowHandle
                [Window]::keybd_event(0x12, 0, 0, 0)   # VK_MENU (Alt) down
                [Window]::keybd_event(0x12, 0, 2, 0)   # VK_MENU (Alt) up
                [Window]::ShowWindow($hwnd, 9) | Out-Null     # SW_RESTORE
                [Window]::BringWindowToTop($hwnd) | Out-Null
                [Window]::SetForegroundWindow($hwnd) | Out-Null
                Write-Output "FOCUSED"
            } else {
                Write-Output "FOCUS_FAIL"
            }
        }
    }
} else {
    $result = Get-GameRect
    Write-Output $result
}
