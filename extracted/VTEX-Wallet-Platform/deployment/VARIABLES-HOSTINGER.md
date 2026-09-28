# Variables Hostinger requises

Définissez ces variables dans l’environnement de déploiement Hostinger. **Ne créez ni ne chargez de fichier d’environnement dans le monorepo.** Le script `deployment/deploy-hostinger.sh` lit uniquement les variables déjà injectées à son processus.

| Groupe | Variables requises | Valeur attendue |
| --- | --- | --- |
| Base MySQL | `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Identifiants privés de la base conteneurisée. |
| Session et admin | `JWT_SECRET`, `VTEX_INITIAL_ADMIN_EMAIL`, `VTEX_INITIAL_ADMIN_PASSWORD` | Secret de session robuste, e-mail et mot de passe du premier administrateur. |
| Domaines | `WALLET_HOST`, `DASHBOARD_HOST`, `WALLET_PUBLIC_URL`, `DASHBOARD_PUBLIC_URL`, `ALLOWED_ORIGINS`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID` | Domaines DNS réels et URL HTTPS correspondantes. |
| Stockage privé | `VTEX_MEDIA_S3_ENDPOINT`, `VTEX_MEDIA_S3_ACCESS_KEY`, `VTEX_MEDIA_S3_SECRET_KEY`, `VTEX_MEDIA_S3_BUCKET` | Pour MinIO interne : endpoint `http://minio:9000`, clés fortes et bucket privé. |
| OTP e-mail | `RESEND_API_KEY`, `EMAIL_FROM` | Clé Resend active et expéditeur associé à un domaine vérifié. |
| Coffre de données sensibles | `VTEX_VAULT_KEYS` (obligatoire) ; optionnels : `VTEX_VAULT_ACTIVE_KEY`, `VTEX_VAULT_INDEX_KEY`, `VTEX_VAULT_STORE_CVV` | Chiffre au repos le numéro, le CVV et le PIN des cartes saisis par l’administration. Forme : `v1:<base64 de 32 octets>` (générer : `openssl rand -base64 32`). Rotation : ajouter `v2:…` en tête, `VTEX_VAULT_ACTIVE_KEY=v2`, **garder `v1`** tant que des lignes l’utilisent. `VTEX_VAULT_STORE_CVV=false` refuse toute conservation du CVV (recommandation PCI-DSS). |

| API publique `/api/v1` | Optionnelles : `VTEX_API_KEY_PEPPER`, `VTEX_PAY_BASE_URL` | `VTEX_API_KEY_PEPPER` : poivre du HMAC qui empreinte les clés d’API (repli : `JWT_SECRET`). **Le changer invalide toutes les clés existantes** : ne le faites qu’en cas de compromission. `VTEX_PAY_BASE_URL` : origine HTTPS de la page publique de paiement (Wallet Pro), utilisée pour renvoyer l’adresse `…/pay/<lien>` dans les réponses de l’API. |

**Coffre : sauvegardez `VTEX_VAULT_KEYS` séparément de la base.** Sans elle, les numéros, CVV et PIN chiffrés sont définitivement illisibles ; avec la base seule, ils restent illisibles pour un attaquant. Le serveur refuse de démarrer en production sans cette variable.

Générez `JWT_SECRET`, les mots de passe MySQL et la clé MinIO avec une source cryptographiquement sûre. Ne les placez pas dans le dépôt, le ZIP, un historique de terminal ou une capture d’écran.
