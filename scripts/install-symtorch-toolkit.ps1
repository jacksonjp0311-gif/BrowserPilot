param(
  [string]$AgntEvoRoot = "C:\\Users\\jacks\\OneDrive\\Desktop\\agnt-evo",
  [switch]$ForceReplace
)

$ErrorActionPreference = "Stop"

$src = Join-Path (Split-Path -Parent $PSScriptRoot) "agnt-plugins\symtorch-toolkit"
$dst = Join-Path $AgntEvoRoot "backend\plugins\dev\symtorch-toolkit"

if (-not (Test-Path $src)) {
  throw "Source plugin not found: $src"
}

if (-not (Test-Path $AgntEvoRoot)) {
  throw "AGNT root not found: $AgntEvoRoot"
}

Write-Host "Installing symtorch-toolkit..."
Write-Host "  from: $src"
Write-Host "  to:   $dst"

if (Test-Path $dst) {
  if (-not $ForceReplace) {
    Write-Host "Destination already exists. Re-run with -ForceReplace to replace it." -ForegroundColor Yellow
    return
  }
  Rename-Item -Force $dst ($dst + ".backup." + (Get-Date -Format "yyyyMMdd-HHmmss"))
}

Copy-Item -Recurse -Force $src $dst
Write-Host "Done. Now reload plugins in AGNT (or restart AGNT)."
