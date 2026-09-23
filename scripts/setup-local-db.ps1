param(
  [string]$DatabaseName = "portfolio_analyst",
  [string]$DatabaseUser = "postgres",
  [string]$DatabaseHost = "127.0.0.1",
  [int]$DatabasePort = 5432
)

$ErrorActionPreference = "Stop"

if ($DatabaseName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw "DatabaseName may contain only letters, numbers, and underscores."
}

$psql = Get-Command psql.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $psql) {
  $psql = Get-ChildItem -Path "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -ExpandProperty FullName -First 1
}
if (-not $psql) {
  throw "psql.exe was not found. Install PostgreSQL and rerun this command."
}

$createdb = Join-Path (Split-Path $psql) "createdb.exe"
$projectRoot = Split-Path $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"
$securePassword = Read-Host "Password for local PostgreSQL user '$DatabaseUser'" -AsSecureString
$credential = [System.Net.NetworkCredential]::new("", $securePassword)
$plainPassword = $credential.Password

function Set-DotEnvValue([string]$Content, [string]$Name, [string]$Value) {
  $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
  $line = "$Name=`"$Value`""
  if ([regex]::IsMatch($Content, $pattern)) {
    return [regex]::Replace($Content, $pattern, { param($match) $line })
  }
  return $Content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
}

try {
  $env:PGPASSWORD = $plainPassword
  & $psql -w -h $DatabaseHost -p $DatabasePort -U $DatabaseUser -d postgres -v ON_ERROR_STOP=1 -tAc "SELECT 1;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL login failed." }

  $existsOutput = & $psql -w -h $DatabaseHost -p $DatabasePort -U $DatabaseUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"
  $exists = if ($null -eq $existsOutput) { "" } else { "$existsOutput".Trim() }
  if ($exists -ne "1") {
    & $createdb -w -h $DatabaseHost -p $DatabasePort -U $DatabaseUser $DatabaseName
    if ($LASTEXITCODE -ne 0) { throw "Could not create database '$DatabaseName'." }
    Write-Host "Created database '$DatabaseName'." -ForegroundColor Green
  } else {
    Write-Host "Database '$DatabaseName' already exists." -ForegroundColor DarkGreen
  }

  if (Test-Path $envFile) {
    $envContent = [IO.File]::ReadAllText($envFile)
  } else {
    $envContent = [IO.File]::ReadAllText((Join-Path $projectRoot ".env.example"))
  }

  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $databaseUrl = "postgresql://${DatabaseUser}:${encodedPassword}@${DatabaseHost}:${DatabasePort}/${DatabaseName}?schema=public"
  $envContent = Set-DotEnvValue $envContent "DATABASE_URL" $databaseUrl
  $envContent = Set-DotEnvValue $envContent "DIRECT_URL" $databaseUrl
  [IO.File]::WriteAllText($envFile, $envContent, [Text.UTF8Encoding]::new($false))
  Write-Host "Updated DATABASE_URL and DIRECT_URL in .env." -ForegroundColor Green

  Push-Location $projectRoot
  try {
    & npm run db:generate
    if ($LASTEXITCODE -ne 0) { throw "Prisma client generation failed." }
    & npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
    & npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw "Database seed failed." }
  } finally {
    Pop-Location
  }

  Write-Host "Local PostgreSQL is ready. Start the app with: npm run dev" -ForegroundColor Green
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $plainPassword = $null
  $credential = $null
  $securePassword.Dispose()
}
