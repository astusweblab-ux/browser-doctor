param(
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found in project root"
}

$manifest = Get-Content $manifestPath | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
  throw "Version not found in manifest.json"
}

$targetDir = Join-Path $root $OutDir
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$zipPath = Join-Path $targetDir "browser-doctor-v$version.zip"
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$include = @(
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons"
)

$tempDir = Join-Path $env:TEMP ("browser-doctor-package-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir | Out-Null

foreach ($item in $include) {
  $source = Join-Path $root $item
  if (-not (Test-Path $source)) {
    throw "Missing release file or directory: $item"
  }

  Copy-Item -Path $source -Destination (Join-Path $tempDir $item) -Recurse -Force
}

Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force

Write-Output "Created: $zipPath"
