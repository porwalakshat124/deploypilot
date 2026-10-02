$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worker-activation.ps1')
$taskName='DeployPilot Upgrade Fixture '+[Guid]::NewGuid().ToString('N')
$base=[IO.Path]::GetFullPath((Join-Path $env:TEMP ('deploypilot-upgrade-fixture-'+[Guid]::NewGuid().ToString('N'))))
if((Split-Path -Parent $base) -ne [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')){throw 'Unsafe fixture path'}
$current=Join-Path $base 'old'; $candidate=Join-Path $base 'candidate'
New-Item -ItemType Directory -Path $current,$candidate -Force | Out-Null
$oldRunner=Join-Path $current 'run-worker.ps1'
$badRunner=Join-Path $candidate 'run-worker.ps1'
'while ($true) { Start-Sleep -Seconds 1 }' | Set-Content -LiteralPath $oldRunner
'exit 1' | Set-Content -LiteralPath $badRunner
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$oldRunner+'"')
$principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$registered=$false
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null
  $registered=$true; Start-ScheduledTask -TaskName $taskName
  $rolledBack=$false
  try {Activate-WorkerCandidate -CurrentDir $current -CandidateDir $candidate -TaskName $taskName -StartupTimeoutSeconds 2} catch {if($_.Exception.Message -notlike 'Upgrade rolled back*'){throw}; $rolledBack=$true}
  if(!$rolledBack -or (Get-ScheduledTask -TaskName $taskName).Actions.Arguments -ne $action.Arguments){throw 'Failed-start rollback did not restore the original task'}
  for($attempt=0;$attempt -lt 10;$attempt++){if((Get-ScheduledTask -TaskName $taskName).State -eq 'Running'){break};Start-Sleep -Seconds 1}
  if((Get-ScheduledTask -TaskName $taskName).State -ne 'Running'){$result=(Get-ScheduledTaskInfo -TaskName $taskName).LastTaskResult;throw ('Previous fixture worker did not restart; task result '+$result)}
  Write-Output 'PASS: failed candidate restored and restarted the original isolated scheduled task'
  '"[worker] ready; polling control plane for jobs" | Set-Content -LiteralPath (Join-Path $PSScriptRoot "worker.log"); while ($true) { Start-Sleep -Seconds 1 }' | Set-Content -LiteralPath $badRunner
  Activate-WorkerCandidate -CurrentDir $current -CandidateDir $candidate -TaskName $taskName -StartupTimeoutSeconds 20
  if((Get-ScheduledTask -TaskName $taskName).Actions.Arguments.IndexOf($badRunner,[StringComparison]::OrdinalIgnoreCase) -lt 0 -or (Get-ScheduledTask -TaskName $taskName).State -ne 'Running'){throw 'Healthy candidate was not activated'}
  Write-Output 'PASS: healthy candidate activated on the isolated scheduled task'
} finally {
  if($registered){Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
  if((Split-Path -Parent $base) -ne [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')){throw 'Fixture cleanup escaped temporary scope'}
  Remove-Item -LiteralPath $base -Recurse -Force
}
