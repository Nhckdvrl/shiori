param([int]$OwnerPid)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
while (Get-Process -Id $OwnerPid -ErrorAction SilentlyContinue) {
  $rows = [System.Collections.Generic.List[object]]::new()
  foreach ($p in [System.Diagnostics.Process]::GetProcesses()) {
    try {
      $exePath=$null
      try {$exePath=$p.MainModule.FileName} catch {}
      $rows.Add(@{id=$p.Id; path=$exePath; started=([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds(); hasWindow=($p.MainWindowHandle -ne [IntPtr]::Zero)})
    } catch {} finally { $p.Dispose() }
  }
  $packet = @{at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); processes=@($rows.ToArray())}
  [Console]::WriteLine((ConvertTo-Json -InputObject $packet -Compress -Depth 4))
  Start-Sleep -Milliseconds 2000
}
