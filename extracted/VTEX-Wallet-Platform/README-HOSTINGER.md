# Déploiement VTEX Wallet sur un VPS Hostinger

Le monorepo déploie cinq services coordonnés : **MySQL 8** comme stockage privé, l’**API Next/tRPC** comme frontière métier et de session, le **Dashboard** d’administration, le client **Wallet VTEX v4** et **Nginx** comme reverse proxy public. Les services applicatifs et MySQL restent dans le réseau Docker ; seul Nginx publie le port HTTP.

| Service | Rôle | Port interne | Exposition publique |
|---|---|---:|---|
| `mysql` | MySQL 8, données Core et Wallet | 3306 | Aucune |
| `api` | OTP, tRPC, règles financières et migrations | 4000 | Via `/api/` du Wallet |
| `dashboard` | Administration, journal, support, leads et pilotage financier | 3001 | `https://admin.votre-domaine` |
| `wallet` | Interface VTEX final v4 connectée au Core | 3002 | `https://app.votre-domaine` |
| `nginx` | Reverse proxy, en-têtes de sécurité et routage multi-domaines | 80 | 80, puis 443 après TLS |

## Préparation du VPS

Installez Docker Engine et le plugin Docker Compose v2 sur le VPS, puis clonez ce dépôt sous un compte administrateur dédié. Configurez les variables de production dans le panneau sécurisé de l’hébergeur ou dans un mécanisme d’injection externe ; **ne créez ni ne copiez de fichier `.env` dans le dépôt ou son archive**.

```bash
openssl rand -base64 48
```

Utilisez la valeur générée pour `JWT_SECRET` dans le panneau sécurisé, définissez les mots de passe MySQL et MinIO, puis configurez `WALLET_HOST` et `DASHBOARD_HOST` avec deux enregistrements DNS réels qui pointent vers l’IP du VPS. `RESEND_API_KEY` et `EMAIL_FROM` sont obligatoires : l’OTP est envoyé par e-mail et le mode de lecture de code de développement est désactivé en production.

> **Ne publiez pas le port 3306, ne partagez jamais de secret et ne conservez aucun fichier d’environnement dans le monorepo.**

## Démarrage et migrations

Lancez le script depuis la racine :

```bash
chmod +x deployment/deploy-hostinger.sh
./deployment/deploy-hostinger.sh
```

L’API attend le healthcheck MySQL, applique les migrations versionnées de `@vtex/core`, applique ensuite celles de `@vtex/wallet`, exécute enfin `db:bootstrap-admin`, puis démarre. L’amorçage lit `VTEX_INITIAL_ADMIN_EMAIL` et `VTEX_INITIAL_ADMIN_PASSWORD` depuis les variables injectées, crée le compte `admin` une seule fois avec un hash de mot de passe et ne remplace jamais un compte existant. Les tables `__drizzle_migrations_core` et `__drizzle_migrations_wallet` empêchent la réapplication d’une migration déjà exécutée. Les migrations Wallet couvrent les comptes, cartes, bénéficiaires, objectifs, transactions, écritures de ledger et clés d’idempotence.

| Contrôle | Commande | Résultat attendu |
|---|---|---|
| État des conteneurs | `docker compose --env-file /dev/null -f deployment/docker-compose.hostinger.yml ps` | Les cinq services sont `running` |
| Migrations | `docker compose --env-file /dev/null -f deployment/docker-compose.hostinger.yml logs api` | Core puis Wallet terminent sans erreur |
| Wallet | `curl -I http://app.votre-domaine` | Réponse Nginx/Wallet |
| Dashboard | `curl -I http://admin.votre-domaine` | Réponse Nginx/Dashboard |

## TLS et reverse proxy

Après le premier démarrage HTTP, obtenez les certificats TLS pour les deux domaines avec Certbot et ajoutez les blocs `listen 443 ssl http2` ainsi qu’une redirection HTTP vers HTTPS. Le cookie de session devient alors `Secure` car l’API s’exécute avec `NODE_ENV=production`.

Le Wallet appelle l’API via `/api/` sous **son propre domaine**. Le cookie JWT `HttpOnly` est donc envoyé sans être lisible par JavaScript. Le Dashboard utilise également un proxy tRPC sécurisé et conserve cette séparation de session.

## Exploitation et limites réglementaires

Le Dashboard permet aux rôles `admin` et `agent` de consulter les comptes, cartes, KPI et virements externes en attente. Seul un administrateur peut ajuster un solde, avec justification, clé d’idempotence et événement de journal d’audit. Toute écriture monétaire utilise un entier `BIGINT` dans l’unité minimale de devise et s’exécute dans une transaction MySQL ; le navigateur ne modifie jamais un solde localement.

Les virements externes restent volontairement en état `pending` jusqu’à validation. La plateforme n’intègre pas encore un établissement de paiement, un émetteur de cartes ni un fournisseur IBAN réglementé. Avant tout usage avec de l’argent réel, ajoutez un prestataire conforme pour le provisionnement IBAN, SEPA, cartes, KYC/AML, filtrage des sanctions, rapprochement et webhooks signés. L’IBAN apparaît donc comme **en cours de provisionnement** tant qu’un fournisseur approuvé ne le renseigne pas.

L’autorisation de paiement carte (`cards.authorizePayment`) est une opération **serveur-à-serveur** destinée à être invoquée par le connecteur d’un acquéreur ou d’un processeur de paiement. Elle contrôle le statut de la carte, son expiration, les canaux activés, les plafonds et le solde, puis écrit la transaction et le ledger de façon atomique et idempotente. Le Wallet v4 n’expose volontairement aucun bouton de simulation de paiement : un navigateur ne doit pas usurper le rôle d’un terminal ou d’un prestataire de paiement.

## Journaux et sauvegardes

```bash
docker compose --env-file /dev/null -f deployment/docker-compose.hostinger.yml logs -f api nginx dashboard wallet
```

Sauvegardez régulièrement le volume `vtex_mysql_data` via une procédure MySQL cohérente (`mysqldump` ou sauvegarde de volume arrêtée). Avant chaque mise à jour, sauvegardez la base puis relancez `./deployment/deploy-hostinger.sh` : les migrations supplémentaires seront appliquées une seule fois par leur table de suivi.
