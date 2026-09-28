<#
  Sauvegarde logique de la base avant toute migration (règle : « sauvegarder, migrer, vérifier »).

  Usage :
    .\scripts\db-backup.ps1 -Database vtex_wallet_dev -User vtexdev -Port 3307 [-OutDir backups] [-Dump "<chemin de mysqldump/mariadb-dump>"]
  Le mot de passe se lit dans la variable d'environnement DB_BACKUP_PASSWORD (jamais en argument, donc jamais dans l'historique du shell).
  Restauration : mysql -h 127.0.0.1 -P 3307 -u <user> -p <base> < backups\<fichier>.sql
#>
param(
  [Parameter(Mandatory = $true)][string]$Database,
  [string]$DbHost = "127.0.0.1",
  [int]$Port = 3306,
  [string]$User = "root",
  [string]$OutDir = "backups",
  [string]$Dump = ""
)

if (-not $Dump) {
  $cmd = Get-Command mysqldump, mariadb-dump -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cmd) { throw "mysqldump introuvable : passez -Dump avec son chemin complet." }
  $Dump = $cmd.Source
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "$Database-$stamp.sql"

$argsList = @("--host=$DbHost", "--port=$Port", "--user=$User", "--single-transaction", "--routines", "--triggers", "--default-character-set=utf8mb4", "--result-file=$file")
if ($env:DB_BACKUP_PASSWORD) { $argsList += "--password=$($env:DB_BACKUP_PASSWORD)" }
& $Dump @argsList $Database
if ($LASTEXITCODE -ne 0) { throw "La sauvegarde a échoué (code $LASTEXITCODE)." }

$size = (Get-Item $file).Length
if ($size -lt 1024) { throw "Sauvegarde suspecte : $file ne fait que $size octets." }
Write-Output ("Sauvegarde écrite : {0} ({1:N0} Ko)" -f $file, ($size / 1KB))
