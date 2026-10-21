[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $projectRoot 'data\server.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host '没有找到后台服务 PID 文件。若服务在前台运行，请在该终端按 Ctrl+C。'
  exit
}

$serverPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
if ($serverPid -notmatch '^\d+$') {
  Remove-Item -LiteralPath $pidFile -Force
  throw 'PID 文件内容无效，已移除；请确认服务是否仍在运行。'
}

$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
if (-not $processInfo) {
  Remove-Item -LiteralPath $pidFile -Force
  Write-Host '记录的服务进程已经结束。'
  exit
}

$expectedRoot = [System.IO.Path]::GetFullPath($projectRoot)
$commandLine = [string]$processInfo.CommandLine
if (
  $processInfo.Name -ne 'node.exe' -or
  $commandLine -notmatch 'src[\\/]server\.mjs' -or
  $commandLine -notmatch [regex]::Escape($expectedRoot)
) {
  throw "PID=$serverPid 与当前项目服务不匹配，已停止操作。请人工核对该进程。"
}

Stop-Process -Id ([int]$serverPid) -ErrorAction Stop
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (-not (Get-Process -Id ([int]$serverPid) -ErrorAction SilentlyContinue)) {
    break
  }
  Start-Sleep -Milliseconds 100
}
Remove-Item -LiteralPath $pidFile -Force
Write-Host "服务已停止，PID=$serverPid。"

