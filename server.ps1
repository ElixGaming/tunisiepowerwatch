param(
  [int]$Port = 8088
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($node) { $node.Source } else { Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js 24 ou plus récent est requis. Installez Node.js, puis exécutez npm install."
}

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\ws"))) {
  throw "Les dépendances ne sont pas installées. Exécutez npm install dans le dossier du projet."
}

$env:PORT = $Port.ToString()
Push-Location $root
try {
  & $nodePath "server.mjs"
  if ($LASTEXITCODE -ne 0) { throw "Le serveur s'est arrêté avec le code $LASTEXITCODE." }
} finally {
  Pop-Location
}
