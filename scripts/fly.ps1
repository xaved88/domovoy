<#
.SYNOPSIS
  Run fly.io commands via Docker — no local flyctl install needed.

.PARAMETER Command
  login   — Authenticate with fly.io (browser-based, run once)
  setup   — Create the fly.io app (run once)
  secrets — Sync secrets from .env to fly.io (re-run whenever .env changes)
  token   — Create a CI deploy token (copy output to GitHub as FLY_API_TOKEN secret)
  deploy  — Build and deploy to fly.io

.EXAMPLE
  .\scripts\fly.ps1 login
  .\scripts\fly.ps1 setup
  .\scripts\fly.ps1 secrets
  .\scripts\fly.ps1 token
  .\scripts\fly.ps1 deploy
#>
param([string]$Command = "help")

$ErrorActionPreference = "Stop"

$Image   = "domovoy-flyctl"
$FlyDir  = Join-Path $env:USERPROFILE ".fly"
$EnvFile = Join-Path $PWD.Path ".env"

# Ensure ~/.fly exists so the mount doesn't create it as root
if (-not (Test-Path $FlyDir)) {
    New-Item -ItemType Directory -Path $FlyDir | Out-Null
}

# Build the flyctl image if it doesn't exist yet
if (-not (docker images -q $Image 2>$null)) {
    Write-Host "Building flyctl image (first run only)..." -ForegroundColor Cyan
    docker build -f Dockerfile.flyctl -t $Image .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$Vol = @("-v", "${FlyDir}:/root/.fly", "-v", "$($PWD.Path):/app", "-w", "/app")

switch ($Command) {
    "login" {
        docker run --rm -it @Vol $Image auth login
    }
    "setup" {
        docker run --rm -it @Vol $Image apps create domovoy
    }
    "secrets" {
        # Normalize line endings (CRLF -> LF) before piping to flyctl
        (Get-Content $EnvFile) -join "`n" | docker run --rm -i @Vol $Image secrets import
    }
    "token" {
        docker run --rm -it @Vol $Image tokens create deploy -x 999999h
    }
    "deploy" {
        docker run --rm -it @Vol $Image deploy --remote-only
    }
    "logs" {
        docker run --rm -it @Vol $Image logs
    }
    "secrets-list" {
        docker run --rm -it @Vol $Image secrets list
    }
    "status" {
        docker run --rm -it @Vol $Image status
    }
    default {
        Write-Host ""
        Write-Host "Usage: .\scripts\fly.ps1 <command>" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  login    Authenticate with fly.io (browser-based, run once)"
        Write-Host "  setup    Create the fly.io app (run once)"
        Write-Host "  secrets  Sync secrets from .env to fly.io"
        Write-Host "  token    Create a CI deploy token for GitHub Actions"
        Write-Host "  deploy   Build and deploy to fly.io"
        Write-Host "  logs     Tail live logs from the running app"
        Write-Host ""
    }
}
