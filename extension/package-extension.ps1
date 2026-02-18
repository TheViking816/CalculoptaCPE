param(
  [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"
$zipName = "cpe-distancia-puertas-v$Version.zip"
$zipPath = Join-Path $dist $zipName

if (Test-Path $dist) {
  Remove-Item -Recurse -Force $dist
}
New-Item -ItemType Directory -Path $dist | Out-Null

$tmp = Join-Path $dist "package"
New-Item -ItemType Directory -Path $tmp | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp "icons") | Out-Null

Copy-Item (Join-Path $root "manifest.json") (Join-Path $tmp "manifest.json")
Copy-Item (Join-Path $root "popup.html") (Join-Path $tmp "popup.html")
Copy-Item (Join-Path $root "popup.css") (Join-Path $tmp "popup.css")
Copy-Item (Join-Path $root "popup.js") (Join-Path $tmp "popup.js")
Copy-Item (Join-Path $root "content.js") (Join-Path $tmp "content.js")
Copy-Item (Join-Path $root "icons\\icon-16.png") (Join-Path $tmp "icons\\icon-16.png")
Copy-Item (Join-Path $root "icons\\icon-32.png") (Join-Path $tmp "icons\\icon-32.png")
Copy-Item (Join-Path $root "icons\\icon-48.png") (Join-Path $tmp "icons\\icon-48.png")
Copy-Item (Join-Path $root "icons\\icon-128.png") (Join-Path $tmp "icons\\icon-128.png")

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zipPath -CompressionLevel Optimal

Remove-Item -Recurse -Force $tmp

Write-Host "ZIP generado: $zipPath"
