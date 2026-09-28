# Préparation de mise en ligne et de recette réelle

## Décision d’architecture

La topologie versionnée pour une recette complète repose sur un **VPS Docker** : Nginx expose uniquement les deux domaines publics ; Dashboard, Wallet, API, MySQL et MinIO restent sur le réseau privé Docker. Cette architecture est cohérente avec la séparation des sessions, du stockage privé, des migrations et des opérations Wallet. L’hébergement géré permet une publication séparée d’une application, mais ne remplace pas directement cette topologie multi-service sans adaptation dédiée.

| Composant | Exposition prévue | Lien contrôlé |
|---|---|---|
| Wallet | `https://<WALLET_HOST>` | Nginx → Wallet `3002` ; Wallet → API interne via `API_PROXY_URL=http://api:4000`. |
| Dashboard | `https://<DASHBOARD_HOST>` | Nginx → Dashboard `3001` ; routes `/api/*` relayées vers l’API interne. |
| API | Aucune exposition directe | Port `4000` seulement dans le réseau Docker. |
| MySQL et MinIO | Aucune exposition directe | Volumes persistants et accès applicatif privé uniquement. |

## Corrections de préparation déjà appliquées

| Élément | État |
|---|---|
| Proxy API Wallet dans Compose | Ajouté. Les appels Wallet ne dépendent plus d’une configuration implicite et ne doivent plus échouer par `502` après démarrage. |
| Relais Dashboard/API | Validé en prévisualisation avec réponse tRPC accessible sur l’origine Dashboard. |
| Script d’exploitation | Le fallback affiche désormais le domaine Dashboard configuré, jamais un domaine d’exemple. |
| Documentation | Les procédures actives indiquent l’injection de variables par l’hébergeur, sans fichier `.env` dans le dépôt. L’ancien exemple Nginx monodomaine a été retiré. |
| Actifs d’entrée Wallet | Les références de prévisualisation utilisent les actifs publiés hors dépôt. Pour un VPS, livrer ces médias dans un stockage objet/CDN de production avant ouverture publique. |

## Conditions bloquantes avant ouverture publique

Le déploiement ne doit pas être lancé tant que les conditions suivantes ne sont pas remplies. Elles dépendent du contrôle du propriétaire de l’infrastructure et ne peuvent pas être résolues par une prévisualisation locale.

| Priorité | Condition | Décision requise |
|---|---|---|
| P0 | Clé Resend précédemment exposée tournée, expéditeur vérifié. | Rotation dans le compte fournisseur, puis injection sécurisée de la nouvelle valeur. |
| P0 | Deux domaines définitifs et DNS A vers le VPS. | Confirmer `WALLET_HOST` et `DASHBOARD_HOST`. |
| P0 | Certificats TLS actifs pour les deux domaines et redirection HTTP → HTTPS. | Provisionner les certificats sur le serveur avant toute connexion OTP. |
| P0 | Secrets de base, JWT, MinIO et compte administrateur initial injectés hors dépôt. | Saisir les valeurs dans le panneau de l’hébergeur ou le coffre de secrets choisi. |
| P1 | Sauvegardes MySQL et MinIO testées avant les premières données utiles. | Définir une politique de conservation et de restauration. |

## Déroulé de recette

Après validation de ces conditions, lancer la topologie depuis le VPS avec le script versionné. Contrôler les migrations avant l’ouverture des URL HTTPS, puis suivre pas à pas [`recette-reelle-controlee.md`](./recette-reelle-controlee.md). Les premières opérations financières demeurent limitées aux données isolées de recette ; aucun transfert externe, justificatif client ni code OTP ne doit être partagé dans les échanges de validation.
