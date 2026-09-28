# Refonte de l'administration — Sprint 4 : clés d'API et `/api/v1`

Livré le 2026-09-26. Les clés d'API du Wallet Pro deviennent réelles : elles s'authentifient, portent des droits vérifiés à chaque requête, s'expirent, se renouvellent et se révoquent — et une API publique minimale (`/api/v1`) les utilise (lecture du wallet et des transactions, création de liens de paiement). Le Dashboard supervise sans jamais voir un secret. Référence développeur : `docs/API_V1.md`.

## 1. Clés

- Format `vtx_test_` / `vtx_live_` + 192 bits aléatoires. Le secret n'est montré qu'à la création ou à la rotation.
- **Empreinte HMAC-SHA256** avec un poivre serveur (`VTEX_API_KEY_PEPPER`, repli `JWT_SECRET`) — 64 caractères hexadécimaux, recherche par index unique. Les anciennes clés (scrypt, 128 caractères) ne s'authentifient plus et sont signalées « À recréer » ; aucune n'était utilisée (aucune route ne les vérifiait).
- **Droits fermés** (catalogue serveur) : `wallet:read`, `transactions:read`, `payment_links:read`, `payment_links:write`. Un droit inconnu est refusé à la création ; à la lecture, il est ignoré.
- **Expiration planifiée** (≤ 730 jours), **rotation avec période de grâce** (0–72 h : l'ancienne clé expire ou est révoquée, la nouvelle hérite des droits, de l'environnement et de l'échéance), **révocation immédiate** avec motif. Plafond de 20 clés actives par entreprise.
- **Dernière utilisation** (date et adresse), écrite au plus une fois par minute et par clé.
- Qui peut gérer : `owner` et `admin` de l'entreprise (vérifié côté serveur). Une autre entreprise ne peut ni lister, ni renouveler, ni révoquer.
- **Environnement** : une clé de test n'est utilisable que sur une plateforme en simulation/test, une clé de production que sur une plateforme en mode réel (`wrong_environment` sinon). L'espace Pro l'annonce (`developers.environment`).

## 2. `/api/v1`

Routes : `GET /me`, `GET /wallet`, `GET /transactions`, `GET|POST /payment_links`, `GET /payment_links/{id}`. Implémentation : `packages/business/src/apiV1.ts` (`handleApiV1`, standard `Request`/`Response`), branchée par `apps/api/src/app/api/v1/[[...path]]/route.ts` (GET, POST, PUT, PATCH, DELETE → même gestionnaire ; OPTIONS → 204 **sans CORS**).

Garanties : droit vérifié par route ; toutes les requêtes filtrées par l'entreprise de la clé (ressource d'autrui = 404) ; corps JSON borné (16 Ko), schéma **strict** (aucun champ inconnu, montant entier), `Idempotency-Key` (rejeu 200, contenu différent 409, requêtes simultanées → un seul lien grâce à l'unicité `(entreprise, clé)`) ; limites de débit par clé, par adresse et par échec d'authentification ; identifiant de requête dans l'en-tête et dans chaque erreur ; aucune mise en cache ; l'IP du payeur et l'identifiant d'intention ne sortent jamais.

Audit : la création par l'API est journalisée (`business.payment_link.create`, rôle `api_key`, `via: "api"`, identifiant et préfixe de la clé, jamais le secret) sur l'entreprise.

## 3. Dashboard

Page **Clés API** (`/cles-api`, Leg Day) : KPI, recherche, filtres état/environnement, liste, fiche (préfixe, droits, usage, rattachement) et révocation avec motif (`apikeys.manage`, ADMIN). SUPPORT lit (`apikeys.read`). Le formulaire de création de clé qui existait dans la fiche entreprise du Dashboard a été **supprimé** : il faisait apparaître le secret dans une notification de l'administrateur et créait des droits (`read`/`write`) qui n'existent plus. Le titulaire crée ses clés lui-même.

## 4. Wallet Pro

Page **Développeurs › Clés d'API** : création (nom, environnement, droits avec badges Lecture/Écriture, expiration), secret affiché une seule fois dans une fenêtre non fermable tant qu'il n'est pas copié (repli manuel si le presse-papiers est bloqué), liste (préfixe, droits, dernière utilisation + adresse, échéance), renouvellement (période de grâce), révocation (motif), prise en main (`curl`).

## 5. Données

Migration business `0004_api_keys_v1` (+ `down/`, vérifiée aller-retour) : `api_keys` (`last_used_ip`, `expires_at`, `revoked_at`, `revoked_by`, `revoke_reason`, `rotated_from_id`), `payment_links` (`created_via_key_id`, `idempotency_key`, unique `(business_id, idempotency_key)`). Ajouts uniquement.

## 6. Autres correctifs

- Le journal d'audit conserve le rôle `api_key` quand l'acteur n'est pas un utilisateur.
- **Recherche LIKE** : `%` et `_` de la saisie étaient supprimés, rendant introuvables les adresses e-mail, préfixes de clé et identifiants de lien contenant `_` ; ils sont désormais échappés (`likeContains`) — Dashboard : banque, liens de paiement, clés.
- `RateLimitError` exporté par le cœur.

## 7. Tests et vérifications

- `apiV1.test.ts` (16 tests, base réelle) : stockage et non-divulgation, droits fermés, expiration, plafonds, clé absente/mal formée/inconnue/révoquée/expirée/héritée, mauvais environnement, 30 échecs → 429, dernière utilisation, cloisonnement entre entreprises, transactions paginées, création/relecture/paiement d'un lien créé par l'API, idempotence (rejeu, conflit, course), validation stricte, rotation avec grâce, révocation (titulaire, autre entreprise, Dashboard), journal.
- `rbac.test.ts` (permissions `apikeys.*`), `apiKeyFormat.test.ts`.
- e2e HTTP réel `scripts/apiv1-e2e.mjs` : 29 contrôles (câblage Next, en-têtes, OPTIONS sans CORS, 405 JSON, isolation, paiement d'un lien créé par l'API, rotation, révocations, journal).
- Suites : router 69, core 229 (3 échecs Resend préexistants), dashboard, api ; typecheck des cinq applications/paquets touchés.
- Navigateur : création → secret unique → copie → fermeture ; renouvellement ; révocation avec motif ; Dashboard (liste, filtres, fiche) y compris mise en page téléphone.

## 8. Déploiement

`VTEX_API_KEY_PEPPER` (optionnel) et `VTEX_PAY_BASE_URL` ajoutées au service `api` du compose et à `VARIABLES-HOSTINGER.md`. Nginx transmet déjà `X-Forwarded-For` (dernier saut de confiance). Prévoir un sous-domaine dédié à l'API (Sprint 10) plutôt que le préfixe `/api/` des domaines Wallet/Dashboard.

## 9. Limites connues

- Pas de compteur de requêtes par clé sur 24 h (seulement la dernière utilisation) ; pas de webhooks sortants réels (la table existe, l'envoi reste à faire).
- Les « applications » OAuth (client secret) n'ont pas encore de flux : leur secret s'affiche encore dans une notification côté Dashboard — à traiter au Sprint 9 avec la même logique « secret montré une fois au titulaire ».
