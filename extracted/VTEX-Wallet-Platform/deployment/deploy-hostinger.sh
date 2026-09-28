#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v docker >/dev/null || { echo "Docker est requis." >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 est requis." >&2; exit 1; }

require_env() {
  local name="$1"
  local value="${!name:-}"

  if [[ -z "${value//[[:space:]]/}" ]]; then
    echo "Erreur : ${name} est manquant ou vide dans l’environnement Hostinger." >&2
    exit 1
  fi

  if [[ "$value" == CHANGE_ME_* ]]; then
    echo "Erreur : ${name} contient encore une valeur d’exemple CHANGE_ME_*." >&2
    exit 1
  fi
}

for required in \
  MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD MYSQL_ROOT_PASSWORD \
  JWT_SECRET VTEX_INITIAL_ADMIN_EMAIL VTEX_INITIAL_ADMIN_PASSWORD \
  WALLET_HOST DASHBOARD_HOST ALLOWED_ORIGINS WEBAUTHN_ORIGIN WEBAUTHN_RP_ID \
  VTEX_MEDIA_S3_ENDPOINT VTEX_MEDIA_S3_ACCESS_KEY VTEX_MEDIA_S3_SECRET_KEY VTEX_MEDIA_S3_BUCKET \
  RESEND_API_KEY EMAIL_FROM VTEX_VAULT_KEYS; do
  require_env "$required"
done

for placeholder_host in WALLET_HOST DASHBOARD_HOST WEBAUTHN_RP_ID; do
  if [[ "${!placeholder_host}" == *.example.com ]]; then
    echo "Erreur : ${placeholder_host} doit contenir votre vrai domaine DNS, pas example.com." >&2
    exit 1
  fi
done

for placeholder_url in WEBAUTHN_ORIGIN ALLOWED_ORIGINS; do
  if [[ "${!placeholder_url}" == *example.com* ]]; then
    echo "Erreur : ${placeholder_url} doit contenir vos vraies URL HTTPS, pas example.com." >&2
    exit 1
  fi
done

COMPOSE_FILE=deployment/docker-compose.hostinger.yml
# /dev/null désactive explicitement le chargement implicite d’un éventuel fichier
# d’environnement présent sur le VPS. Docker Compose reçoit seulement les variables
# injectées par Hostinger dans le processus qui exécute ce script.
COMPOSE=(docker compose --env-file /dev/null -f "$COMPOSE_FILE")

echo "[0/3] Validation de la configuration Docker..."
"${COMPOSE[@]}" config --quiet

echo "[1/3] Construction des images API, Dashboard, Wallet et Nginx..."
"${COMPOSE[@]}" build --pull

echo "[2/3] Démarrage de la topologie complète et migrations automatiques..."
"${COMPOSE[@]}" up -d

echo "[3/3] État des services..."
"${COMPOSE[@]}" ps

echo
printf 'Wallet : %s\n' "${WALLET_PUBLIC_URL:-https://${WALLET_HOST}}"
printf 'Dashboard : %s\n' "${DASHBOARD_PUBLIC_URL:-https://${DASHBOARD_HOST}}"
printf 'API interne : %s\n' "${API_INTERNAL_URL:-http://api:4000}"
echo "Activez TLS avec Certbot sur le VPS avant l’ouverture publique. Consultez les journaux avec : ${COMPOSE[*]} logs -f api nginx"
