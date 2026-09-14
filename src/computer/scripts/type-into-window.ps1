param(
  [int]$TargetPid = 0,
  [string]$TextFile = "",
  [string]$LaunchedAt = "",
  [string]$ProcessNames = "notepad",
  [string]$ExcludeHwnds = "",
  [switch]$ListHwndsOnly
)

$ErrorActionPreference = "Stop"

function Emit([hashtable]$obj) {
  $obj | ConvertTo-Json -Compress
}

$procNames = @($ProcessNames.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($procNames.Count -eq 0) { $procNames = @("notepad") }

$exclude = New-Object "System.Collections.Generic.HashSet[long]"
foreach ($h in @($ExcludeHwnds.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
  try { [void]$exclude.Add([int64]$h) } catch { }
}

if ($ListHwndsOnly) {
  Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class JarvisWinEnum {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  public static List<long> HwndsForPid(int pid) {
    var found = new List<long>();
    EnumWindows((hWnd, l) => {
      uint wpid;
      GetWindowThreadProcessId(hWnd, out wpid);
      if (wpid == (uint)pid && IsWindowVisible(hWnd)) found.Add(hWnd.ToInt64());
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@ -ErrorAction SilentlyContinue
  $hwnds = New-Object "System.Collections.Generic.List[long]"
  foreach ($n in $procNames) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
      if ([int64]$_.MainWindowHandle -ne 0 -and -not $hwnds.Contains([int64]$_.MainWindowHandle)) {
        [void]$hwnds.Add([int64]$_.MainWindowHandle)
      }
      try {
        foreach ($h in [JarvisWinEnum]::HwndsForPid($_.Id)) {
          if (-not $hwnds.Contains($h)) { [void]$hwnds.Add($h) }
        }
      } catch { }
    }
  }
  Emit @{ hwnds = @($hwnds) }
  exit 0
}

if (-not $TextFile -or -not (Test-Path -LiteralPath $TextFile)) {
  Emit @{ ok = $false; error = "TEXT_FILE_MISSING" }
  exit 1
}

$text = [System.IO.File]::ReadAllText($TextFile)
if ([string]::IsNullOrWhiteSpace($text)) {
  Emit @{ ok = $false; error = "EMPTY_TEXT" }
  exit 1
}
if ($text.Length -gt 500) {
  Emit @{ ok = $false; error = "TEXT_TOO_LONG" }
  exit 1
}

$since = [datetime]::UtcNow.AddSeconds(-20)
if ($LaunchedAt) {
  try {
    $parsed = [datetime]::Parse($LaunchedAt, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
    if ($parsed.Kind -eq [System.DateTimeKind]::Utc) {
      $since = $parsed.ToLocalTime().AddSeconds(-3)
    } else {
      $since = $parsed.AddSeconds(-3)
    }
  } catch {
    # keep default window
  }
}

try {
  $seed = Get-Process -Id $TargetPid -ErrorAction Stop
  if ($seed.StartTime -lt $since) { $since = $seed.StartTime.AddSeconds(-2) }
} catch {
  $seed = $null
}

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class JarvisWinEnum {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  public static List<long> HwndsForPid(int pid) {
    var found = new List<long>();
    EnumWindows((hWnd, l) => {
      uint wpid;
      GetWindowThreadProcessId(hWnd, out wpid);
      if (wpid == (uint)pid && IsWindowVisible(hWnd)) found.Add(hWnd.ToInt64());
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@ -ErrorAction SilentlyContinue

function Get-CandidatePids([int]$seedPid, [datetime]$notBefore) {
  $ids = New-Object "System.Collections.Generic.List[int]"
  if ($seedPid -gt 0) { [void]$ids.Add($seedPid) }
  foreach ($n in $procNames) {
    $cimName = if ($n -match '\.exe$') { $n } else { "$n.exe" }
    try {
      Get-CimInstance Win32_Process -Filter "Name='$cimName'" | ForEach-Object {
        if ([int]$_.ParentProcessId -eq $seedPid -and -not $ids.Contains([int]$_.ProcessId)) {
          [void]$ids.Add([int]$_.ProcessId)
        }
      }
    } catch { }
    Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
      $recent = $_.StartTime -ge $notBefore
      $already = $ids.Contains($_.Id)
      if ($recent -and -not $already) { [void]$ids.Add($_.Id) }
      elseif (-not $already -and $exclude.Count -gt 0) { [void]$ids.Add($_.Id) }
    }
  }
  return $ids
}

function Get-WindowHandle([int]$pid) {
  try {
    $proc = Get-Process -Id $pid -ErrorAction Stop
  } catch {
    return $null
  }
  $candidates = New-Object "System.Collections.Generic.List[long]"
  if ([int64]$proc.MainWindowHandle -ne 0) { [void]$candidates.Add([int64]$proc.MainWindowHandle) }
  try {
    foreach ($h in [JarvisWinEnum]::HwndsForPid($pid)) {
      if (-not $candidates.Contains($h)) { [void]$candidates.Add($h) }
    }
  } catch { }
  $preferred = $candidates | Where-Object { -not $exclude.Contains($_) }
  $hwnd = $null
  if (@($preferred).Count -gt 0) { $hwnd = @($preferred)[0] }
  elseif ($exclude.Count -eq 0 -and $candidates.Count -gt 0) { $hwnd = $candidates[0] }
  if ($null -eq $hwnd) { return $null }
  $proc.Refresh()
  return @{ hwnd = [int64]$hwnd; title = $proc.MainWindowTitle; proc = $proc }
}

$deadline = [datetime]::UtcNow.AddSeconds(25)
$found = $null
$ownerPid = $TargetPid
while ($null -eq $found) {
  if ([datetime]::UtcNow -gt $deadline) { break }
  foreach ($pid in (Get-CandidatePids -seedPid $TargetPid -notBefore $since)) {
    $win = Get-WindowHandle -pid $pid
    if ($null -ne $win) {
      $found = $win
      $ownerPid = $pid
      break
    }
  }
  if ($null -ne $found) { break }
  if ($null -ne $seed -and $seed.HasExited) { $seed = $null }
  Start-Sleep -Milliseconds 250
}

if ($null -eq $found) {
  $alive = $false
  try { $alive = $null -ne (Get-Process -Id $TargetPid -ErrorAction Stop) } catch { $alive = $false }
  Emit @{
    ok = $false
    error = "WINDOW_NOT_IDENTIFIED"
    pid = $TargetPid
    process_running = $alive
  }
  exit 1
}

$hwnd = $found.hwnd
$proc = $found.proc

Add-Type -AssemblyName UIAutomationClient | Out-Null

$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$hwnd)
if ($null -eq $root) {
  Emit @{ ok = $false; error = "UIA_ROOT_MISSING"; pid = $ownerPid; hwnd = $hwnd }
  exit 1
}

function Find-Editor($rootEl) {
  $docCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Document
  )
  $el = $rootEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $docCond)
  if ($null -ne $el) { return $el }

  foreach ($cls in @("RichEditD2DPT", "Edit", "RichEdit")) {
    $clsCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ClassNameProperty,
      $cls
    )
    $el = $rootEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $clsCond)
    if ($null -ne $el) { return $el }
  }

  $editType = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Edit
  )
  return $rootEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editType)
}

$edit = Find-Editor $root
if ($null -eq $edit) {
  Emit @{
    ok = $false
    error = "EDIT_NOT_IDENTIFIED"
    pid = $ownerPid
    hwnd = $hwnd
    window_title = $found.title
    process_running = -not $proc.HasExited
  }
  exit 1
}

$keystrokes_sent = $false
try {
  $setPattern = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  if ($null -ne $setPattern) {
    $setPattern.SetValue($text)
    $keystrokes_sent = $true
  }
} catch {
  $keystrokes_sent = $false
}

if (-not $keystrokes_sent) {
  $edit.SetFocus() | Out-Null
  Start-Sleep -Milliseconds 120
  Add-Type -AssemblyName System.Windows.Forms | Out-Null
  $escaped = [regex]::Replace($text, '([+\^%~(){}])', '{$1}')
  [System.Windows.Forms.SendKeys]::SendWait($escaped)
  $keystrokes_sent = $true
  Start-Sleep -Milliseconds 400
} else {
  Start-Sleep -Milliseconds 150
}

$readback = $null
$text_readback_feasible = $false
try {
  $vp = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  if ($null -ne $vp) {
    $readback = [string]$vp.Current.Value
    $text_readback_feasible = $true
  }
} catch { }
if (-not $text_readback_feasible) {
  try {
    $tp = $edit.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($null -ne $tp) {
      $readback = [string]$tp.DocumentRange.GetText(-1)
      $text_readback_feasible = $true
    }
  } catch { }
}

$proc.Refresh()
Emit @{
  ok = $true
  pid = $ownerPid
  hwnd = $hwnd
  process_running = -not $proc.HasExited
  window_title = $proc.MainWindowTitle
  keystrokes_sent = $keystrokes_sent
  text_readback_feasible = $text_readback_feasible
  readback = $readback
}
exit 0
