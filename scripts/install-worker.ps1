param([string]$ConfigPath, [string]$InstallDir = (Join-Path $env:USERPROFILE ".deploypilot-worker"), [string]$Version = "main", [switch]$PrepareOnly)
$ErrorActionPreference = "Stop"
$RepoUrl = if ($env:DEPLOYPILOT_REPO_URL) { $env:DEPLOYPILOT_REPO_URL } else { "https://github.com/porwalakshat124/deploypilot.git" }
foreach ($command in @("git","node","pnpm","docker")) {
  if (!(Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required" }
}
if ((docker info --format "{{.OSType}}") -ne "linux") { throw "Start Docker Desktop with its Linux engine before installing" }
if (!$ConfigPath) { throw "Provide -ConfigPath pointing to a private .env containing WORKER_API_URL, WORKER_ID and WORKER_TOKEN only." }
$ConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$config = Get-Content -LiteralPath $ConfigPath -Raw
foreach ($key in @("WORKER_API_URL","WORKER_ID","WORKER_TOKEN")) {
  if ($config -notmatch ("(?m)^" + $key + "=\S+")) { throw "Worker config is missing $key" }
}
if ($config -match "(?m)^(DATABASE_URL|DIRECT_URL|REDIS_URL|GITHUB_PRIVATE_KEY|OPENAI_API_KEY)=") { throw "Use a worker-only config; server credentials must stay on the API." }
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if ($InstallDir -eq [IO.Path]::GetPathRoot($InstallDir) -or $InstallDir -eq $env:USERPROFILE) { throw "Unsafe installation directory" }
$TaskName = "DeployPilot Worker"
if (Test-Path -LiteralPath (Join-Path $InstallDir ".git")) {
  if ($PrepareOnly) { throw "PrepareOnly requires a fresh installation directory" }
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  git -C $InstallDir fetch --depth 1 origin $Version
  if ($LASTEXITCODE) { throw "Unable to fetch worker release" }
  git -C $InstallDir checkout --detach FETCH_HEAD
  if ($LASTEXITCODE) { throw "Worker checkout has local changes; preserve them before upgrading" }
} else {
  if (Test-Path -LiteralPath $InstallDir) { throw "Existing directory is not a worker checkout. Choose an empty installation path." }
  git clone --depth 1 --branch $Version $RepoUrl $InstallDir
  if ($LASTEXITCODE) { throw "Unable to clone worker release" }
}
# Release version comes from the installed worker, not a stale copied override.
$config = $config -replace '(?m)^WORKER_VERSION=[^\r\n]*(\r?\n|$)', ''
[IO.File]::WriteAllText((Join-Path $InstallDir '.env'), $config)
$privateFile = Join-Path $InstallDir ".env"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $privateFile /inheritance:r /grant:r ($identity + ":(F)") | Out-Null
if ($LASTEXITCODE) { throw "Unable to restrict worker config permissions" }
Push-Location $InstallDir
try {
  pnpm install --filter @deploypilot/worker... --frozen-lockfile
  if ($LASTEXITCODE) { throw "Worker dependency installation failed" }
  pnpm --filter @deploypilot/worker build
  if ($LASTEXITCODE) { throw "Worker compilation failed" }
} finally { Pop-Location }
$nodePath = (Get-Command node).Source
$runner = Join-Path $InstallDir "run-worker.ps1"
$runnerText = @'
$ErrorActionPreference = "Continue"
Set-Location -LiteralPath "__DIRECTORY__"
while ($true) {
  if ((Test-Path worker.log) -and (Get-Item worker.log).Length -gt 10485760) { Move-Item worker.log worker.previous.log -Force }
  & "__NODE__" "__DIRECTORY__/apps/worker/dist/main.js" *>> worker.log
  Start-Sleep -Seconds 10
}
'@
$runnerText.Replace("__DIRECTORY__", $InstallDir.Replace('"','')).Replace("__NODE__", $nodePath.Replace('"','')) | Set-Content -LiteralPath $runner
if ($PrepareOnly) { Write-Host "Worker prepared without changing the running scheduled task."; return }
$taskArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"'
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "DeployPilot outbound Docker worker" -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Worker installed. It restarts after failure and starts when this user logs in."
