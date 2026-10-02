param([Parameter(Mandatory=$true)][string]$CurrentDir,[string]$Version="main",[switch]$PrepareOnly)
$ErrorActionPreference="Stop"
$current=(Resolve-Path -LiteralPath $CurrentDir).Path
$taskName="DeployPilot Worker"
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$oldRunner=Join-Path $current "run-worker.ps1"
if (!(Test-Path -LiteralPath (Join-Path $current '.env')) -or $task.Actions.Arguments.IndexOf($oldRunner,[StringComparison]::OrdinalIgnoreCase) -lt 0) {throw "CurrentDir must match the existing worker scheduled task"}
$parent=Split-Path -Parent $current
$candidate=[IO.Path]::GetFullPath((Join-Path $parent ((Split-Path -Leaf $current)+"-upgrade-"+[Guid]::NewGuid().ToString('N'))))
if ((Split-Path -Parent $candidate) -ne $parent -or $candidate -eq $current -or (Test-Path -LiteralPath $candidate)) {throw "Unsafe upgrade staging path"}
# Build and authenticate in a sibling checkout while the old worker remains online.
& (Join-Path $PSScriptRoot 'install-worker.ps1') -ConfigPath (Join-Path $current '.env') -InstallDir $candidate -Version $Version -PrepareOnly
Push-Location $candidate
try {
  $entry=Join-Path $candidate 'apps/worker/dist/main.js'
  if(!(Select-String -LiteralPath $entry -SimpleMatch '--check' -Quiet)){throw "Candidate lacks read-only preflight; previous worker remains running"}
  $probe=Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"'+$entry+'" --check') -WorkingDirectory $candidate -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $candidate 'preflight.log') -RedirectStandardError (Join-Path $candidate 'preflight-error.log')
  if(!$probe.WaitForExit(45000)){Stop-Process -Id $probe.Id;throw "Candidate preflight timed out; previous worker remains running"}
  $probe.Refresh()
  if($probe.ExitCode -ne 0){throw "Candidate preflight failed; previous worker remains running"}
} finally {Pop-Location}
if($PrepareOnly){Write-Host "Prepared and verified $candidate. Running worker unchanged.";return}
. (Join-Path $PSScriptRoot 'worker-activation.ps1')
Activate-WorkerCandidate -CurrentDir $current -CandidateDir $candidate -TaskName $taskName
