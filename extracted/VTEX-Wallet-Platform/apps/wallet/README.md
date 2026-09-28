# VTEX — Dashboard bancaire statique

Cette version contient une refonte Desktop inspirée des standards d’outils financiers modernes : navigation latérale persistante, surface claire, grille de contenu en deux colonnes, typographie resserrée, bordures fines et ombres discrètes. La scène de cartes 3D VTEX conserve son identité originale (cartes navy, puce, reflets et profondeur) dans une scène Desktop dédiée. La version mobile reste conservée sous le seuil de `1024px`, et ses interactions restent disponibles sur ordinateur.

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| `index.html` | Application VTEX principale, autonome côté navigateur |
| `vtex3d.js` | Moteur du carrousel de cartes 3D |
| `three.min.js` | Dépendance Three.js locale |
| `manifest.json` | Métadonnées PWA |
| `icon.svg` | Icône VTEX |
| `.htaccess` | Configuration de secours pour Apache |
| `nginx-vtex.conf.example` | Exemple de serveur virtuel Nginx pour un VPS |
| `deploy-vps.sh` | Copie simple du dossier vers `/var/www/vtex` |
| `DESKTOP_REVIEW.md` | Journal technique de la refonte Desktop |
| `CARDS_DESKTOP_REVIEW.md` | Journal de validation des cartes 3D et des interactions |

## Compatibilité fonctionnelle

Le Desktop conserve les fonctions mobiles importantes : changement de carte par clic sur la carte, swipe horizontal et inertie, dots de sélection, aide de glissement, touches `←`/`→`, animation du solde à chaque retour sur l’accueil, sidebar active sur les vues secondaires, actions Envoyer/Recevoir/Ajouter et navigation vers les écrans Cartes, Profil, Notifications et Infos bancaires.

## Déploiement le plus simple sur Hostinger

Le projet est un **site statique** : il n’a besoin ni de Node.js, ni de PHP, ni de base de données, ni de commande `npm install`. Il suffit de servir les fichiers du dossier depuis la racine publique du domaine.

### Option A — Hébergement web Hostinger / Apache

Dans le gestionnaire de fichiers ou par SFTP, téléversez le contenu de ce dossier dans `public_html/` en conservant `index.html` à la racine. Ouvrez ensuite votre domaine : l’application doit se charger directement. Aucun build et aucune migration ne sont nécessaires.

### Option B — VPS Hostinger avec Nginx

Depuis votre ordinateur, envoyez le dossier sur le VPS, puis exécutez :

```bash
chmod +x deploy-vps.sh
sudo ./deploy-vps.sh /var/www/vtex
```

Copiez ensuite `nginx-vtex.conf.example` vers `/etc/nginx/sites-available/vtex`, remplacez `votre-domaine.com` par votre domaine réel, puis activez le site :

```bash
sudo cp nginx-vtex.conf.example /etc/nginx/sites-available/vtex
sudo ln -s /etc/nginx/sites-available/vtex /etc/nginx/sites-enabled/vtex
sudo nginx -t
sudo systemctl reload nginx
```

Si un autre serveur virtuel utilise déjà le domaine, adaptez uniquement le bloc `server_name` et le chemin `root`. Pour HTTPS, activez ensuite le certificat depuis le panneau Hostinger ou avec Certbot selon la configuration de votre VPS.

## Déploiement par SFTP

Connectez-vous au VPS avec un client SFTP, créez `/var/www/vtex`, puis envoyez tous les fichiers du dossier. Le fichier `index.html` doit se trouver exactement ici :

```text
/var/www/vtex/index.html
```

Le serveur doit servir ce dossier comme racine du domaine. Le projet ne contient aucune clé secrète ni donnée serveur.

## Points à vérifier après mise en ligne

Ouvrez la page en navigation privée et vérifiez le loader, la connexion de démonstration, l’accueil Desktop, la navigation latérale, l’animation du solde, le changement de devise et le changement de carte 3D. Sur un écran large, le contenu doit occuper la fenêtre sans cadre de téléphone ni défilement horizontal; la carte navy, ses reflets et les dots doivent rester visibles.

Les polices Google Fonts et les icônes Phosphor/Lucide sont chargées depuis leurs CDN publics. Si votre VPS applique une politique CSP stricte, autorisez `fonts.googleapis.com`, `fonts.gstatic.com`, `unpkg.com` et les ressources nécessaires à votre configuration.
