param(
  [string]$TaskName = "FabriqFlow ERP - Backup diario",
  [string]$RunTime = "21:00",
  [string]$DestinationPath,
  [int]$RetentionDays = 7
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupScriptPath = (Resolve-Path (Join-Path $PSScriptRoot "backup-db.ps1")).Path

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$backupScriptPath`""
)

if ($DestinationPath) {
  $arguments += @("-DestinationPath", "`"$DestinationPath`"")
}

$arguments += @("-RetentionDays", $RetentionDays)

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($arguments -join " ")
$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Description "Copia diaria de la base SQLite de Fabriq Flow ERP" `
  -Force | Out-Null

Write-Output "Tarea programada registrada correctamente."
Write-Output "Nombre: $TaskName"
Write-Output "Hora diaria: $RunTime"
Write-Output "Script: $backupScriptPath"
