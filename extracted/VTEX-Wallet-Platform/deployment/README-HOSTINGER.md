# Déploiement VTEX Wallet sur VPS Hostinger

Ce dossier contient la topologie de production : API Core, Dashboard, Wallet, MySQL privé, stockage objet MinIO privé et Nginx. Les migrations Core et Wallet, ainsi que le bootstrap du premier administrateur, s’exécutent automatiquement au démarrage du conteneur API.

> Cette archive ne contient **aucun** fichier d’environnement, modèle ou exemple. Le script ignore également tout fichier d’environnement qui existerait déjà sur le VPS. Les variables sont injectées exclusivement par Hostinger dans le processus de déploiement.

## 1. Préparer le VPS

Installez Docker Engine et Docker Compose v2 sur le VPS Ubuntu, puis ouvrez uniquement les ports HTTP/HTTPS nécessaires au proxy. **Ne publiez jamais les ports MySQL 3306, MinIO 9000/9001, API 4000, Dashboard 3001 ou Wallet 3002.**

Copiez le monorepo dans un répertoire persistant, par exemple `/opt/vtex-wallet-platform`, puis placez-vous à sa racine.

```bash
cd /opt/vtex-wallet-platform
```

## 2. Configurer Hostinger

Dans le panneau de variables du service Hostinger qui exécute le script, définissez chaque variable listée dans [`VARIABLES-HOSTINGER.md`](./VARIABLES-HOSTINGER.md). Le script lit uniquement ces variables injectées par l’hébergeur ; il ne lit ni ne crée de fichier d’environnement dans le dépôt.

Générez notamment un secret JWT fort :

```bash
openssl rand -base64 48
```

Le stockage objet est déjà configuré pour MinIO interne : conservez `VTEX_MEDIA_S3_ENDPOINT=http://minio:9000`, définissez un `VTEX_MEDIA_S3_SECRET_KEY` fort et gardez le bucket `VTEX_MEDIA_S3_BUCKET` privé. Ajoutez également une clé Resend active : l’OTP de production nécessite l’envoi e-mail.

> Le mot de passe administrateur initial sert uniquement au premier bootstrap. Après création, il est stocké sous forme de hash et ne doit pas être commité.

## 3. DNS et HTTPS

Créez deux enregistrements A vers l’adresse IPv4 du VPS : un pour le Wallet et un pour le Dashboard. Lancez ensuite le déploiement HTTP initial, puis installez les certificats TLS avec Certbot pour les deux noms de domaine selon votre politique d’exploitation Nginx.

## 4. Construire et démarrer

Le script vérifie les variables requises, construit les quatre images et démarre la topologie complète.

```bash
./deployment/deploy-hostinger.sh
```

Contrôlez les services et les migrations :

```bash
docker compose --env-file /dev/null -f deployment/docker-compose.hostinger.yml ps
docker compose --env-file /dev/null -f deployment/docker-compose.hostinger.yml logs -f api nginx
```

Les volumes `vtex_mysql_data` et `vtex_media_data` contiennent respectivement la base et les médias privés. Ils doivent être inclus dans votre stratégie de sauvegarde VPS.

## Dépannage : variables manquantes

Si le script indique qu’une variable est manquante, corrigez-la dans le panneau Hostinger puis relancez le script depuis la racine du monorepo. Le contrôle rejette les valeurs vides, les marqueurs `CHANGE_ME_*` et les domaines `example.com` **avant** toute construction ou création de conteneur. Si des services incomplets ont déjà été créés, vous pouvez les arrêter sans effacer la base ni les médias avec la commande suivante ; n’ajoutez jamais l’option `-v` :

```bash
docker compose --env-file /dev/null -f deployment/docker-compose.hostinger.yml down
./deployment/deploy-hostinger.sh
```

## 5. Vérification fonctionnelle

Après activation de TLS, ouvrez `https://<WALLET_HOST>` et `https://<DASHBOARD_HOST>`. Vérifiez la connexion OTP, le Dashboard administrateur, l’import d’avatar, l’attribution d’un PDF, son téléchargement côté Wallet et la remise d’un justificatif. Les médias restent privés : ils passent exclusivement par les routes autorisées de l’API.
