param([string]$Workspace = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$taskWorkspace = (Resolve-Path -LiteralPath $Workspace).Path
$taskNode = (Get-Command node).Source
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -StartWhenAvailable
$taskMonitorAction = New-ScheduledTaskAction -Execute $taskNode -Argument ('"' + (Join-Path $taskWorkspace 'scripts\operations-monitor.mjs') + '"') -WorkingDirectory $taskWorkspace
$taskMonitorTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'DeployPilot Operations Monitor' -Action $taskMonitorAction -Trigger $taskMonitorTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
$taskBackupAction = New-ScheduledTaskAction -Execute $taskNode -Argument ('"' + (Join-Path $taskWorkspace 'scripts\database-backup.mjs') + '" backup --include-managed') -WorkingDirectory $taskWorkspace
$taskBackupTrigger = New-ScheduledTaskTrigger -Daily -At '02:00'
Register-ScheduledTask -TaskName 'DeployPilot Encrypted Backup' -Action $taskBackupAction -Trigger $taskBackupTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
$taskStorageAction = New-ScheduledTaskAction -Execute $taskNode -Argument ('"' + (Join-Path $taskWorkspace 'scripts\storage-inventory.mjs') + '"') -WorkingDirectory $taskWorkspace
$taskStorageTrigger = New-ScheduledTaskTrigger -Daily -At '05:00'
Register-ScheduledTask -TaskName 'DeployPilot Storage Inventory' -Action $taskStorageAction -Trigger $taskStorageTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
Write-Output 'Installed limited per-user monitor (5 minutes) and encrypted backup (daily 02:00). PC login, network and Docker remain required.'
