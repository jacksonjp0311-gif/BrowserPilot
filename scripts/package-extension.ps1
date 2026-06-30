param(
  [ValidateSet("edge","chrome","legacy")]
  [string]$Browser = "edge",
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$extension = switch ($Browser) {
  "edge" { Join-Path $root "apps\edge-extension" }
  "chrome" { Join-Path $root "apps\chrome-extension" }
  "legacy" { Join-Path $root "extension" }
}
$dist = Join-Path $root "dist"

if (-not (Test-Path $extension)) {
  throw "Extension folder not found: $extension"
}

if (-not (Test-Path $dist)) {
  New-Item -ItemType Directory -Path $dist | Out-Null
}

if (-not $OutputPath) {
  if ($Browser -eq 'legacy') {
    $OutputPath = Join-Path $dist "browser-pilot-extension.zip"
  } else {
    $OutputPath = Join-Path $dist "browser-pilot-$Browser-extension.zip"
  }
}

if (Test-Path $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}

Compress-Archive -Path (Join-Path $extension "*") -DestinationPath $OutputPath -Force

Write-Host "Packaged BrowserPilot $Browser extension:"
Write-Host "  $OutputPath"
