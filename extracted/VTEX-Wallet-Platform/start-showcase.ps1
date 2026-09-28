# Démarre le showcase VTEX localement :
#   mock-api (4000) · Wallet (3002) · Dashboard admin (3000) · Business PRO (3001).
# Utilise le Node portable + pnpm installés dans .tools/.
# Chaque service lance dans sa propre fenêtre PowerShell — ferme la fenêtre pour arrêter.

$repo = $PSScriptRoot
$node = Join-Path $repo ".tools\node\node.exe"
$pnpm = Join-Path $repo ".tools\pnpm-bin\pnpm.exe"
$pathPrefix = Join-Path $repo ".tools\node"

if (-not (Test-Path $node)) {
    Write-Error "Node portable introuvable : $node. Lance d'abord la mise en place initiale."
    exit 1
}

Write-Host ""
Write-Host "=== VTEX Showcase — démarrage local ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Quatre fenêtres PowerShell vont s'ouvrir : mock-api, Wallet, Dashboard, Business."
Write-Host "Ferme-les pour arrêter les services."
Write-Host ""

# 1. Mock-API sur 4000
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$env:Path = '$pathPrefix;' + `$env:Path; `$env:PORT = '4000'; cd '$repo\mock-api'; & '$node' server.mjs"
)

Start-Sleep -Seconds 2

# 2. Wallet static sur 3002, proxy vers mock-api
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$env:Path = '$pathPrefix;' + `$env:Path; `$env:PORT = '3002'; `$env:API_PROXY_URL = 'http://127.0.0.1:4000'; cd '$repo\apps\wallet'; & '$node' server.mjs"
)

Start-Sleep -Seconds 2

# 3. Dashboard Next.js sur 3000
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$env:Path = '$pathPrefix;' + `$env:Path; cd '$repo'; & '$pnpm' --filter '@vtex/dashboard' exec next dev -p 3000"
)

Start-Sleep -Seconds 2

# 4. Business PRO Next.js sur 3001
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$env:Path = '$pathPrefix;' + `$env:Path; cd '$repo'; & '$pnpm' --filter '@vtex/business' exec next dev -p 3001"
)

Start-Sleep -Seconds 8

Write-Host ""
Write-Host "URLs :" -ForegroundColor Green
Write-Host "  Wallet (client)         : http://localhost:3002/"
Write-Host "  Dashboard admin         : http://localhost:3000/?demo=1"
Write-Host "  Business PRO (console)  : http://localhost:3001/"
Write-Host "  Mock API health         : http://localhost:4000/health"
Write-Host ""
Write-Host "Astuce navigation Wallet :"
Write-Host "  Le Wallet détecte localhost et affiche l'accueil directement (mode aperçu client)."
Write-Host "  Ouvre /cartes, /historique, /profil, /envoyer, /virement-choix, /beneficiaires..."
Write-Host "  Deep-link + bouton retour navigateur fonctionnent (router.js)."
Write-Host ""
Write-Host "Astuce navigation Dashboard admin :"
Write-Host "  Ajoute ?demo=1 à l'URL du Dashboard pour activer le mode aperçu (banner amber)."
Write-Host "  Sans ça, l'AuthGuard cherche une session serveur qui n'existe pas dans le showcase."
Write-Host ""
Write-Host "Astuce navigation Business PRO :"
Write-Host "  Sidebar 10 groupes navigables — 4 modules maquettés (Dashboard, Payment Links,"
Write-Host "  Invoices, Team Users), les 32 autres sont des squelettes 'Phase 2/3/4' avec"
Write-Host "  la liste des livrables prévus. Design 100 % LEGDAY (docs/LEGDAY.md)."
Write-Host ""
