param(
  [string]$SourcePath,
  [string]$DestinationPath,
  [int]$RetentionDays
)

$ErrorActionPreference = "Stop"

function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-EnvironmentValue {
  param(
    [string]$Name
  )

  $processValue = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ($processValue) {
    return $processValue
  }

  $userValue = [Environment]::GetEnvironmentVariable($Name, "User")
  if ($userValue) {
    return $userValue
  }

  $machineValue = [Environment]::GetEnvironmentVariable($Name, "Machine")
  if ($machineValue) {
    return $machineValue
  }

  return $null
}

function Get-BackupConfig {
  param(
    [string]$ProjectRoot
  )

  $configPath = Join-Path $ProjectRoot "backup.config.json"
  if (-not (Test-Path $configPath)) {
    return $null
  }

  try {
    return Get-Content -Raw $configPath | ConvertFrom-Json
  } catch {
    throw "No se pudo leer backup.config.json. Revisa que el JSON sea valido."
  }
}

function Resolve-BackupPath {
  param(
    [string]$ProjectRoot,
    [object]$Config
  )

  if ($DestinationPath) {
    return $DestinationPath
  }

  $configuredDestination = Get-EnvironmentValue -Name "ERP_BACKUP_DESTINATION"
  if ($configuredDestination) {
    return $configuredDestination
  }

  if ($Config -and $Config.destinationPath) {
    return [string]$Config.destinationPath
  }

  return (Join-Path $ProjectRoot "backups")
}

function Resolve-RetentionDays {
  param(
    [object]$Config,
    [Nullable[int]]$ProvidedRetentionDays
  )

  if ($null -ne $ProvidedRetentionDays) {
    return [int]$ProvidedRetentionDays
  }

  $configuredRetention = Get-EnvironmentValue -Name "ERP_BACKUP_RETENTION_DAYS"
  if ($configuredRetention) {
    $parsed = 0
    if ([int]::TryParse($configuredRetention, [ref]$parsed)) {
      return $parsed
    }
  }

  if ($Config -and $null -ne $Config.retentionDays) {
    return [int]$Config.retentionDays
  }

  return 7
}

$projectRoot = Get-ProjectRoot
$config = Get-BackupConfig -ProjectRoot $projectRoot

if (-not $SourcePath) {
  $SourcePath = Join-Path $projectRoot "data\fabriq-erp.db"
}

$resolvedSourcePath = [System.IO.Path]::GetFullPath($SourcePath)
$resolvedDestinationPath = [System.IO.Path]::GetFullPath((Resolve-BackupPath -ProjectRoot $projectRoot -Config $config))
$providedRetention = $null
if ($PSBoundParameters.ContainsKey("RetentionDays")) {
  $providedRetention = $RetentionDays
}
$resolvedRetentionDays = Resolve-RetentionDays -Config $config -ProvidedRetentionDays $providedRetention

if (-not (Test-Path $resolvedSourcePath)) {
  throw "No existe la base de datos origen: $resolvedSourcePath"
}

if (-not (Test-Path $resolvedDestinationPath)) {
  New-Item -ItemType Directory -Path $resolvedDestinationPath -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupName = "fabriq-erp-$timestamp.db"
$backupPath = Join-Path $resolvedDestinationPath $backupName
$backupCreatedAt = Get-Date

try {
  Copy-Item -LiteralPath $resolvedSourcePath -Destination $backupPath -Force
  $createdFile = Get-Item -LiteralPath $backupPath
  $createdFile.CreationTime = $backupCreatedAt
  $createdFile.LastWriteTime = $backupCreatedAt
  $createdFile.LastAccessTime = $backupCreatedAt
} catch {
  throw "No se pudo crear la copia de seguridad. Si la base esta siendo usada intensamente, vuelve a intentarlo en un momento estable. Detalle: $($_.Exception.Message)"
}

$backupFiles = Get-ChildItem -Path $resolvedDestinationPath -Filter "fabriq-erp-*.db" -File |
  Sort-Object LastWriteTimeUtc -Descending

if ($backupFiles.Count -gt 1 -and $resolvedRetentionDays -ge 0) {
  $latestBackup = $backupFiles[0]
  $cutoff = (Get-Date).AddDays(-$resolvedRetentionDays)

  foreach ($file in $backupFiles | Select-Object -Skip 1) {
    if ($file.LastWriteTime -lt $cutoff) {
      Remove-Item -LiteralPath $file.FullName -Force
    }
  }
}

$result = [PSCustomObject]@{
  source = $resolvedSourcePath
  destination = $backupPath
  retentionDays = $resolvedRetentionDays
  createdAt = $backupCreatedAt.ToString("s")
}

$result | ConvertTo-Json -Depth 3
