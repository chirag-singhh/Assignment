param(
  [string]$ProjectRef = "muplpgqxfymtuonnyppg",
  [string]$PoolerHost = "aws-0-ap-northeast-2.pooler.supabase.com",
  [string]$DatabaseName = "postgres"
)

$ErrorActionPreference = "Stop"
$databaseUser = "postgres.$ProjectRef"
$projectRoot = Split-Path $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"

$psql = Get-Command psql.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $psql) {
  $psql = Get-ChildItem -Path "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -ExpandProperty FullName -First 1
}
if (-not $psql) { throw "psql.exe was not found. Install PostgreSQL client tools and retry." }
if (-not (Test-Path $envFile)) { throw ".env was not found in the project root." }

function Set-DotEnvValue([string]$Content, [string]$Name, [string]$Value) {
  $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
  $line = "$Name=`"$Value`""
  if ([regex]::IsMatch($Content, $pattern)) {
    return [regex]::Replace($Content, $pattern, { param($match) $line })
  }
  return $Content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
}

$securePassword = Read-Host "Supabase database password for project '$ProjectRef'" -AsSecureString
$credential = [System.Net.NetworkCredential]::new("", $securePassword)
$plainPassword = $credential.Password

try {
  $env:PGPASSWORD = $plainPassword
  Write-Host "Verifying the Supabase session pooler..." -ForegroundColor Cyan
  & $psql -w -h $PoolerHost -p 5432 -U $databaseUser -d $DatabaseName -v ON_ERROR_STOP=1 -tAc "SELECT 1;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Supabase authentication failed. .env was not changed." }

  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $runtimeUrl = "postgresql://${databaseUser}:${encodedPassword}@${PoolerHost}:6543/${DatabaseName}?pgbouncer=true&sslmode=require"
  $migrationUrl = "postgresql://${databaseUser}:${encodedPassword}@${PoolerHost}:5432/${DatabaseName}?sslmode=require"
  $envContent = [IO.File]::ReadAllText($envFile)
  $envContent = Set-DotEnvValue $envContent "DATABASE_URL" $runtimeUrl
  $envContent = Set-DotEnvValue $envContent "DIRECT_URL" $migrationUrl
  [IO.File]::WriteAllText($envFile, $envContent, [Text.UTF8Encoding]::new($false))
  Write-Host "Configured Supabase pooler URLs in .env." -ForegroundColor Green

  Push-Location $projectRoot
  try {
    & npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "Supabase migration failed." }
    & npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw "Supabase seed failed." }
  } finally {
    Pop-Location
  }

  Write-Host "Supabase is ready. Restart the backend to load the new connection." -ForegroundColor Green
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $plainPassword = $null
  $credential = $null
  $securePassword.Dispose()
}
