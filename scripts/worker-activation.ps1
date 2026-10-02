function Activate-WorkerCandidate {
  param([string]$CurrentDir,[string]$CandidateDir,[string]$TaskName="DeployPilot Worker",[ValidateRange(2,90)][int]$StartupTimeoutSeconds=90)
  $ErrorActionPreference="Stop"
  $current=(Resolve-Path -LiteralPath $CurrentDir).Path
  $candidate=(Resolve-Path -LiteralPath $CandidateDir).Path
  if((Split-Path -Parent $candidate) -ne (Split-Path -Parent $current) -or $candidate -eq $current){throw "Candidate must be a distinct sibling checkout"}
  $oldRunner=Join-Path $current 'run-worker.ps1'
  $runner=Join-Path $candidate 'run-worker.ps1'
  $task=Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  if(!(Test-Path -LiteralPath $runner) -or $task.Actions.Arguments.IndexOf($oldRunner,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw "Worker task does not match the previous runner"}
  $xml=Export-ScheduledTask -TaskName $TaskName
  $snapshot=Join-Path $candidate 'previous-task.xml'
  $xml | Set-Content -LiteralPath $snapshot
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  icacls $snapshot /inheritance:r /grant:r ($identity+':(F)') | Out-Null
  if($LASTEXITCODE){throw "Unable to protect task rollback snapshot"}
  function Stop-ScopedWorker([string]$workerRunner) {
    $processes=Get-CimInstance Win32_Process
    $parents=@($processes | Where-Object {$_.Name -in @('powershell.exe','pwsh.exe') -and $_.CommandLine -and $_.CommandLine.IndexOf($workerRunner,[StringComparison]::OrdinalIgnoreCase) -ge 0})
    if($parents.Count -gt 1){throw "Multiple worker supervisors found; activation stopped"}
    $children=@($processes | Where-Object {$_.Name -eq 'node.exe' -and $_.ParentProcessId -in $parents.ProcessId})
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    foreach($child in $children){
      $fresh=Get-CimInstance Win32_Process -Filter ("ProcessId="+$child.ProcessId)
      if($fresh -and $fresh.CreationDate -eq $child.CreationDate){Stop-Process -Id $child.ProcessId -ErrorAction Stop}
    }
  }
  try {
    Stop-ScopedWorker $oldRunner
    $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$runner+'"')
    Set-ScheduledTask -TaskName $TaskName -Action $action | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    $ready=$false
    for($attempt=0;$attempt -lt [Math]::Ceiling($StartupTimeoutSeconds/2);$attempt++){
      Start-Sleep -Seconds 2
      $log=Join-Path $candidate 'worker.log'
      if((Test-Path -LiteralPath $log) -and (Select-String -LiteralPath $log -SimpleMatch '[worker] ready; polling control plane for jobs' -Quiet)){$ready=$true;break}
    }
    if(!$ready){throw "Candidate failed startup readiness"}
    Write-Host "Upgrade healthy. Previous checkout retained at $current; rollback task snapshot at $snapshot."
  } catch {
    $failure=$_.Exception.Message
    Stop-ScopedWorker $runner
    Register-ScheduledTask -TaskName $TaskName -Xml $xml -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    throw "Upgrade rolled back to the previous scheduled task: $failure"
  }
}
