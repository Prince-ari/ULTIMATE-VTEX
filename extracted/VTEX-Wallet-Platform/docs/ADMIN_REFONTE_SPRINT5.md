# Refonte de l'administration — Sprint 5 : support, gestionnaires de compte, suggestions

Livré le 2026-09-26. Une vraie section « Support / Gestionnaires » : des comptes d'équipe (SUPPORT et GESTIONNAIRE DE COMPTE), les wallets confiés à chacun, un espace « Portefeuille » borné pour le gestionnaire, et des suggestions qui arrivent dans les notifications des wallets (Wallet personnel et Wallet Pro).

## 1. Modèle

| Élément | Où | Détail |
|---|---|---|
| `manager_assignments` | core, migration `0011_manager_assignments` (+ `down/`, aller-retour vérifié) | une ligne par `(gestionnaire, wallet_type, holder_id)`, unique ; `(wallet_type, holder_id)` = utilisateur ou entreprise. Retirer supprime la ligne ; l'historique vit dans le journal d'audit |
| Suggestions | table `notifications` étendue : `kind` (`notification` / `suggestion`), `wallet_type`, `holder_id` | pas de nouvelle table : la lecture reste `notification_reads` (un état « lu » **par destinataire**) |
| Gestionnaire | `users.role` = `agent` (SUPPORT) ou `account_manager` | pas de table parallèle ; création via `insertUserRow` (mot de passe temporaire haché, changement obligatoire, 72 h) |

## 2. Permissions (RBAC, vérifiées côté serveur)

| Permission | SUPPORT | ADMIN / SUPER_ADMIN | GESTIONNAIRE DE COMPTE |
|---|---|---|---|
| `managers.read` (liste, fiche, gestionnaires d'un wallet) | oui | oui | non |
| `managers.manage` (créer, suspendre, attribuer, retirer) | non | oui | non |
| `suggestions.send` | tous les wallets | tous les wallets | **uniquement ses wallets attribués** |
| `suggestions.read` | tous les envois | tous les envois | **uniquement ses propres envois** |
| `portfolio.read` | non | (sans attribution : vide) | ses wallets, lecture seule |

Les permissions sont des droits d'ACCÈS ; le PÉRIMÈTRE d'un gestionnaire (`isWalletAssigned`) est revérifié par les services à chaque appel — pour CHAQUE wallet d'un envoi, avant tout envoi : un seul refus annule l'ensemble. Un identifiant deviné hors périmètre reçoit « ne fait pas partie de votre portefeuille », sans indiquer si le wallet existe. Le retrait d'une attribution prend effet à la requête suivante.

## 3. Procédures (`admin.*`)

- `managers.list / get / create / setStatus / assign / unassign / forWallet / holders`
- `suggestions.list / send / targets`
- `portfolio.list / wallet`

Points de comportement :
- **Création** atomique (compte + audit) ; le mot de passe temporaire n'est renvoyé qu'une fois. Un e-mail déjà utilisé est refusé. Rôles admissibles : `agent`, `account_manager` uniquement.
- **Suspension** : motif obligatoire, sessions coupées, attribution impossible à un compte suspendu ; jamais soi-même, jamais un compte hors gestionnaires.
- **Attribution / retrait** : idempotents, journalisés **sur le wallet** (`manager.assign`, `manager.unassign`, avec le motif), le gestionnaire est notifié.
- **Suggestion** : une remise par destinataire (titulaire d'un wallet personnel ; propriétaires et administrateurs actifs d'une entreprise ; un compte suspendu ne reçoit rien, le wallet est signalé « ignoré »), 50 wallets au plus par envoi, 20 envois/minute, titre ≤ 120 et message ≤ 500 caractères. Journalisé sur le wallet (`suggestion.send` : titre, nombre de destinataires, jamais le texte).
- **Fiche portefeuille** : identité, soldes, dix dernières opérations, autres gestionnaires, suggestions déjà envoyées. Aucun RIB, carte, clé ni donnée d'authentification. Chaque ouverture est journalisée (`portfolio.view`, rôle `account_manager`). L'e-mail d'un titulaire personnel est visible (le gestionnaire le suit) ; c'est le seul identifiant personnel.
- Réception : `notifications.listMine` renvoie `kind`, `walletType`, `holderId` et l'auteur sous la forme `{ firstName, role }` — jamais son e-mail ni son identifiant.

## 4. Interfaces

- **Dashboard** (Leg Day) : `Gestionnaires` (`/gestionnaires` : KPI, liste, fiche avec portefeuille, attribution multiple, retrait avec motif, suspension, « suggestion à ses wallets », création avec mot de passe temporaire), `Suggestions` (`/suggestions` : envoyées, lues/non lues, composition multi-wallets, détail), `Portefeuille` (`/portefeuille` : l'accueil du gestionnaire de compte, fiche wallet en lecture seule). La fiche d'un utilisateur affiche, par wallet, ses gestionnaires et permet de lui en attribuer un.
- **Confinement du gestionnaire** : il entre au Dashboard (garde de session), la navigation ne lui propose que Portefeuille et Suggestions, toute autre page est masquée et le renvoie à son accueil ; de toute façon le serveur refuse le reste (vérifié : utilisateurs, banque, cartes, gestionnaires, liens, clés).
- **Wallet** (statique) : la vue « Suggestions » se fonde sur `kind = "suggestion"` (fin de l'heuristique par mots-clés) et affiche « Suggestion de Prénom · Votre gestionnaire / Support / Administration ».
- **Wallet Pro** : la cloche de la barre supérieure était décorative ; c'est désormais un vrai **centre de notifications** (compteur serveur, liste, lecture, « tout marquer comme lu », suggestions signalées).

## 5. Correctifs au passage

- `notifications.markRead` : un utilisateur pouvait marquer lue la notification d'un autre (ligne de lecture créée à tort) ; seules les notifications visibles de l'appelant sont acceptées.
- `notifications.list` (Dashboard) ne renvoie plus les suggestions (écran dédié).
- Recherche des sélecteurs de wallets : chaque mot doit se retrouver dans au moins un champ (« Prénom Nom » trouve la personne) ; caractères joker échappés.

## 6. Tests et vérifications

- `adminManagers.test.ts` (7, base réelle) : création, droits, statut, attributions (idempotence, journal, notification, fiche du wallet), périmètre du gestionnaire (liste, fiche, refus après retrait, aucun accès transverse, IDOR), suggestions (SUPPORT, remise par destinataire, lecture, périmètre du gestionnaire, envoi refusé en bloc, validation, destinataire suspendu).
- `rbac.test.ts`, `roles.test.ts`, `managerFormat.test.ts`, `AuthGuard.test.tsx` (gestionnaire redirigé).
- e2e HTTP réel `scripts/managers-e2e.mjs` : 32 contrôles (première connexion avec mot de passe temporaire et changement exigé, attributions, portefeuille borné, suggestions SUPPORT/gestionnaire, réception côté titulaire et côté entreprise, lecture, retrait, suspension, journal).
- Suites : router 76, core 231 (3 échecs Resend préexistants), dashboard 118+, api 8 ; typecheck core, router, dashboard, Wallet Pro.
- Navigateur : `/gestionnaires` (liste, fiche, portefeuille), composeur de suggestions, espace gestionnaire (redirection, navigation restreinte, portefeuille, fiche wallet), centre de notifications Wallet Pro.

## 7. Limites connues

- Pas de suggestion programmée ni de réponse du titulaire (message à sens unique).
- Le wallet statique n'affiche pas encore son gestionnaire attitré (« Mon gestionnaire ») ; la donnée existe (`forWallet`).
- Les descriptions d'opérations d'un wallet Pro (noms de payeurs des liens de paiement) sont visibles du gestionnaire dans l'activité récente.
