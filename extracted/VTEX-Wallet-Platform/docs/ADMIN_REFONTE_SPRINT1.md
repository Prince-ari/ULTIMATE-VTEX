# Refonte de l'administration — Sprint 1 (fondations : utilisateurs, wallets, devises, RBAC, audit, authentification)

## Décisions produit validées
1. Un **administrateur ouvre n'importe quel wallet / utilisateur par son identifiant** (console d'administration). Ce n'est pas un contournement : la permission est vérifiée côté serveur (`packages/core/src/auth/rbac.ts`) et **chaque ouverture de fiche est journalisée** (`user.file.view`).
2. Accès « comme l'utilisateur » (Sprint 8) : **lecture seule par défaut, avec un mode opérateur** (durée, motif et éventuelle double validation à fixer au Sprint 8).
3. Sous-RIB = **IBAN virtuels rattachés à un compte** (Sprint 2). 4. Payment links : Pro seulement, plus un `/api/v1` minimal (Sprints 3–4). 5. `bank_accounts` **unifié dans core** (Sprint 2).

## Modèle
- `wallet_type` est porté par le **titulaire** : PERSONAL → `users.id`, PROFESSIONAL → `businesses.id` (`(wallet_type, holder_id)`). Un utilisateur peut avoir les deux. Il n'y a **pas de deuxième table d'utilisateurs**.
- **Compte principal** d'un wallet personnel = son compte le plus ancien = sa **devise initiale** (`primaryAccount`). Le wallet, les cartes, le RIB, l'historique et les recharges suivent ce compte ; on n'ouvre plus d'euros « par défaut » à un titulaire créé en francs Pacifique. Les comptes ouverts ensuite (autres devises) existent côté serveur ; l'application Wallet affiche pour l'instant le compte principal.
- La devise d'un compte existant **ne change pas** (le grand livre est dans cette devise) : « modifier la devise » = ouvrir un compte dans une autre devise, ou régler la **devise d'affichage** (`wallet_settings.display_currency`, parité fixe uniquement).
- **Catalogue de devises** unique : `@vtex/money` (`CURRENCY_CATALOG` : code, symbole, décimales, glyphe/icône, région, teinte, parité). Les enums de validation, l'API publique `config.currencies` et l'application Wallet en dérivent.

## RBAC (`auth/rbac.ts`)
| Rôle (`users.role`) | RBAC | Permissions |
|---|---|---|
| `super_admin` | SUPER_ADMIN | toutes (dont `system.manage`, attribution des rôles `admin`/`super_admin`) |
| `admin` | ADMIN | toutes sauf `system.manage` et `staff.assign_privileged_role` |
| `agent` | SUPPORT | lecture : `users.read`, `wallets.read`, `companies.read` |
| `account_manager` | ACCOUNT_MANAGER | **aucune** tant que les attributions de wallets n'existent pas (Sprint 5) — fermé par défaut |
| `user` | titulaire | — |

`requireRole` est hiérarchique (SUPER_ADMIN satisfait toute exigence « admin »). Anti-escalade : personne ne change son propre rôle ; un ADMIN n'attribue que `user`/`agent`/`account_manager` et ne gère pas un autre administrateur (modification, suspension, réinitialisation) ; seul un SUPER_ADMIN le fait ; le dernier administrateur actif ne peut être ni suspendu ni rétrogradé. Le compte initial (`bootstrap-admin`) devient SUPER_ADMIN.

## Audit
`logs` porte désormais `actor_role`, `session_jti`, `ip`, `request_id`, `wallet_type`, `holder_id`, `support_session_id`. Ces colonnes sont **renseignées automatiquement** : `api/requestContext.ts` (AsyncLocalStorage) est alimenté par un middleware tRPC et lu par `logAction` — les ~150 appels existants n'ont pas changé. Ne jamais mettre de secret dans `detail` (test dédié : le mot de passe temporaire n'apparaît jamais dans le journal).

## Authentification
- OTP : **empreinte HMAC** en base (le clair n'existe qu'hors production pour `devPeekOtp`), comparaison à temps constant, **5 essais par code**, verrouillage du compte après 10 échecs (15 min), message d'erreur identique pour un compte verrouillé et des identifiants faux.
- Mot de passe temporaire : généré côté serveur (16 caractères, ~93 bits), affiché **une seule fois**, valable 72 h, changement **imposé côté serveur** (`PASSWORD_CHANGE_REQUIRED` : seules `auth.changePassword`, `auth.logout`, `users.getMe` restent permises). Changement de mot de passe et réinitialisation coupent les autres sessions. Politique : 10–128 caractères, une lettre et un chiffre, sans l'identifiant e-mail.
- IP : `X-Forwarded-For` lu depuis la **droite** (`VTEX_TRUSTED_PROXY_HOPS`, défaut 1) — l'entrée de gauche est falsifiable et ne sert plus de clé de limitation.
- `POST users.create` (ancienne route) est conservé pour les scripts ; le Dashboard utilise `admin.users.create`.

## Ce qui a été livré
- **API** : `admin.users.create` (utilisateur + wallet [+ société, membre owner, paramètres, compte principal] en **une transaction**), `admin.users.list` (type de wallet, devises, filtres), `admin.users.file` (fiche centrale), `users.resetPassword` (mot de passe temporaire), `users.unlock`, `auth.changePassword`, `walletSettings.*`, `config.currencies`.
- **Atomicité** : création de société (`insertBusinessRows`) et ouverture de compte + carte (`createAdminWallet`) sont désormais transactionnelles.
- **Dashboard › Utilisateurs** : liste enrichie, « Nouvel utilisateur » (type de wallet, devise initiale, statut, mot de passe généré ou saisi, société), **fiche** à 4 onglets (Profil, Wallets, Sécurité, Activité), page `/change-password`.
- **Wallet** : fenêtre de changement de mot de passe temporaire, devise d'affichage relue depuis le serveur, sélecteur et **icône de devise générés depuis le catalogue** (plus de symbole € codé en dur), identité de l'en-tête lue depuis le serveur. **Wallet Pro** : page `/change-password`.

## Migrations
| Paquet | Fichier | Contenu | Retour arrière |
|---|---|---|---|
| wallet | `0009_repair_pin_permissions_bank_details` | **Répare le journal** : 0004–0006 étaient sur disque mais jamais appliquées sur une base créée par `db:migrate`. Idempotente (MySQL 8 et MariaDB). | aucun (réparation) |
| core | `0008_admin_foundation` | rôles étendus, colonnes de `users`, de `logs`, de `otp_codes` | `down/0008_admin_foundation.down.sql` |
| wallet | `0010_wallet_settings` | table `wallet_settings` | `down/0010_wallet_settings.down.sql` |

Avant toute migration : `scripts/db-backup.ps1`. Règle : additif d'abord (ajouter, rattraper, basculer les lectures), supprimer plus tard.

## Vérifications
- `pnpm -r typecheck` : propre. Tests : money 26, core 190 (**8 échecs préexistants inchangés** : limiteur de débit / fuseau horaire et clés Resend), wallet 24, router 16, dashboard 96, apps/api 8.
- `scripts/admin-users-e2e.mjs` (API réelle, 40 contrôles) et `scripts/topup-limits-e2e.mjs` (non-régression des plafonds, ₣, RIB, société) passent.
- Vérifié dans le navigateur : fiche et création côté Dashboard, fenêtre de mot de passe temporaire et devise côté Wallet (sur `wallet.localhost`, car `localhost` active le mode démo du Wallet), page de changement côté Wallet Pro.

## Limites connues (à traiter aux sprints suivants)
- Le texte de partage des coordonnées bancaires du Wallet contient encore un IBAN et un nom **en dur** (`index.html`, fonction de partage) : remplacé au Sprint 2 (RIB) / 7 (QR).
- `createBusiness` reste ouvert à tout utilisateur connecté, sans contrôle KYB (`businesses.verifiedAt` et `users.kycVerified` ne sont jamais vérifiés).
- Le limiteur de connexion reste à 5 essais/minute/IP ; la réinitialisation par lien (`resetPasswordRequest`) est toujours inopérante (jeton en mémoire, jamais envoyé) — la réinitialisation passe par l'administrateur.
- Dépendances : `pnpm audit --prod` signale 34 avis (dont 2 critiques sur Next 14.2.35, corrigés ≥ 15.5.24) — mise à niveau à planifier avant la production.
