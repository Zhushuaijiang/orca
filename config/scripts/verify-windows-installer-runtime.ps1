param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [Parameter(Mandatory = $true)]
  [string]$EvidencePath
)

$ErrorActionPreference = 'Stop'
$installer = (Resolve-Path $InstallerPath).Path
Get-Process Orca -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$install = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait
if ($install.ExitCode -ne 0) {
  throw "NSIS installer exited with code $($install.ExitCode)."
}

$roots = @(
  (Join-Path $env:LOCALAPPDATA 'Programs'),
  $env:ProgramFiles,
  ${env:ProgramFiles(x86)}
) | Where-Object { $_ -and (Test-Path $_) }
$orca = $roots |
  ForEach-Object { Get-ChildItem $_ -Recurse -Filter 'Orca.exe' -File -ErrorAction SilentlyContinue } |
  Where-Object { $_.FullName -notlike '*WindowsApps*' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($null -eq $orca) {
  throw 'Installed Orca.exe was not found under the Windows program directories.'
}

Start-Process -FilePath $orca.FullName | Out-Null
$deadline = (Get-Date).AddSeconds(45)
$running = $null
while ((Get-Date) -lt $deadline) {
  $running = Get-Process Orca -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -ieq $orca.FullName -and $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if ($null -ne $running) { break }
  Start-Sleep -Seconds 2
}
if ($null -eq $running) {
  $observed = Get-Process Orca -ErrorAction SilentlyContinue |
    Select-Object Id, Path, MainWindowTitle, MainWindowHandle |
    Format-Table -AutoSize | Out-String
  throw "Installed Orca did not expose a main window within 45 seconds.`n$observed"
}

$hash = (Get-FileHash -Algorithm SHA256 -Path $installer).Hash.ToLowerInvariant()
@(
  "installer=$installer",
  "installer_sha256=$hash",
  "installed_executable=$($orca.FullName)",
  "installed_version=$($orca.VersionInfo.FileVersion)",
  "process_id=$($running.Id)",
  "main_window_handle=$($running.MainWindowHandle)",
  "main_window_title=$($running.MainWindowTitle)"
) | Set-Content -Path $EvidencePath
Get-Content $EvidencePath
taskkill /PID $running.Id /T /F | Out-Null
