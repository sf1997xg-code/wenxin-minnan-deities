[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8765,
  [string]$BindHost = '127.0.0.1',
  [switch]$Background
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node -ErrorAction Stop).Source
$dataDirectory = Join-Path $projectRoot 'data'
$logDirectory = Join-Path $projectRoot 'logs'
$pidFile = Join-Path $dataDirectory 'server.pid'

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
if ($Background) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

$env:HOST = $BindHost
$env:PORT = [string]$Port

if (-not $Background) {
  Write-Host "启动后请访问 http://127.0.0.1:$Port，按 Ctrl+C 停止。"
  Push-Location $projectRoot
  try {
    & $node 'src/server.mjs'
  }
  finally {
    Pop-Location
  }
  exit
}

if (Test-Path -LiteralPath $pidFile) {
  $existingPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  if ($existingPid -match '^\d+$' -and (Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue)) {
    throw "已有后台服务运行，PID=$existingPid。请先执行 .\stop.ps1。"
  }
}

$stdoutLog = Join-Path $logDirectory 'server.stdout.log'
$stderrLog = Join-Path $logDirectory 'server.stderr.log'
$serverScript = Join-Path $projectRoot 'src\server.mjs'
$process = Start-Process `
  -FilePath $node `
  -ArgumentList ('"' + $serverScript + '"') `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
Start-Sleep -Milliseconds 900
if ($process.HasExited) {
  throw "后台服务启动失败，请查看 $stderrLog"
}

$displayHost = if ($BindHost -eq '0.0.0.0') { '<本机局域网 IPv4>' } else { '127.0.0.1' }
Write-Host "后台服务已启动，PID=$($process.Id)"
Write-Host "访问地址：http://${displayHost}:$Port"
Write-Host "日志：$stdoutLog"

