# Refonte de l'administration — Sprint 8 : accès délégué / session opérateur sécurisée

## Décision produit validée

Un membre de l'équipe doit pouvoir **accéder au wallet d'un titulaire et agir dessus pour le dépanner efficacement** —
pas seulement le consulter. Décision explicite du propriétaire de la plateforme : lecture seule **par défaut**, avec un
**mode opérateur** explicite (motif obligatoire, durée bornée). Restriction de sécurité assumée pour cette première
itération : le mode opérateur (mutations) est réservé à `ADMIN`/`SUPER_ADMIN` ; `SUPPORT` (`agent`) ne peut ouvrir
qu'une session en lecture seule. Cette limite se lève en une ligne dans `auth/rbac.ts` (`access_session.start_operator`
ajouté au tableau `agent`) si le produit décide d'étendre ce pouvoir.

## Modèle

`support_sessions` (core, migration `0013_support_sessions`, retour arrière `down/0013_support_sessions.down.sql`) :
`started_by` (le membre d'équipe réel), `wallet_type`/`holder_id` (le titulaire concerné), `mode`
(`read_only` | `operator`), `reason` (motif, 8 caractères minimum), `started_at`/`expires_at`/`ended_at`/`ended_reason`
(`manual` | `expired` | `superseded`). Une seule session active à la fois par membre d'équipe : en ouvrir une nouvelle
referme silencieusement la précédente (`superseded`), jamais empilée. Durée bornée entre 5 et 120 minutes. Une session
expirée est refermée silencieusement à la prochaine lecture (`getMyActiveAccessSession`) — pas de tâche planifiée.

La colonne `logs.support_session_id`, présente depuis le Sprint 1 mais jamais renseignée jusqu'ici, est maintenant
alimentée automatiquement : `packages/core/src/api/context.ts` résout la session active de l'acteur à chaque requête
authentifiée (uniquement pour un membre d'équipe, jamais pour un titulaire) et la pose dans le contexte d'audit lu par
`logAction`. **L'acteur journalisé reste toujours le membre d'équipe réel** — la session ne fait jamais dire au journal
qu'un titulaire a agi sur son propre wallet ; c'est `support_session_id` qui indique qu'une action s'est déroulée
pendant un accès délégué, jamais un changement d'identité de l'acteur.

## Droits (RBAC serveur)

| Permission | SUPPORT | ADMIN / SUPER_ADMIN | Titulaire |
|---|---|---|---|
| `access_session.start_readonly` (ouvrir une session de consultation) | oui | oui | non |
| `access_session.start_operator` (ouvrir une session opérateur, agir) | **non** | oui | non |
| `access_session.manage_any` (terminer/lister la session d'un autre acteur) | non | oui | non |

## Garde-fou côté écriture (`assertOperatorAccess`)

Nouvelle fonction (`packages/core/src/modules/support/accessSessions.ts`), appelée par le Wallet **uniquement quand
l'acteur agit sur un compte qui n'est pas le sien** (jamais pour un titulaire sur son propre wallet — comportement
utilisateur strictement inchangé) : si cet acteur a une session **active** sur **ce titulaire précis** et qu'elle est
en lecture seule, la mutation est refusée (« Session d'accès en lecture seule : passez en mode opérateur pour agir »).
Sans session active sur ce titulaire (le cas normal aujourd'hui), rien ne change : le RBAC habituel de chaque mutation
continue seul de décider — additif d'abord, jamais une régression du fonctionnement existant.

Branché dans `packages/wallet/src/service.ts` à chaque point où un membre d'équipe agit sur le wallet d'un titulaire :
RIB (provisionner/modifier/révoquer), cartes (geler/dégeler, contrôles, PIN, renouveler/remplacer), bénéficiaire créé
par l'administration, ajustement de solde, statut de compte, gel d'urgence, et — via le helper partagé `ownedAccount` —
virement interne, ordre externe et partage de fonds.

## API

`accessSessions.*` (core, monté au niveau racine du routeur composé) : `mine` (session active de l'acteur courant),
`start` (walletType, holderId, mode, reason, durationMinutes), `end` (sessionId), `listForHolder` (historique,
`audit.read`).

## Interface (Dashboard › Wallets)

Nouveau panneau « Session d'accès » en tête de la fiche compte : par défaut, invite à ouvrir une session (motif, mode,
durée) ; une fois active, bandeau avec compte à rebours et bouton « Terminer la session ». Tant qu'aucune session
opérateur n'est active sur CE compte, les commandes de mutation (RIB, permissions Wallet, statut/devise, gel d'urgence,
ajustement, cartes, bénéficiaires, objectifs, virements/partage) sont remplacées par un message invitant à ouvrir une
session opérateur — les informations de lecture (solde, historique, IBAN affiché, etc.) restent visibles sans session,
conformément à « lecture seule par défaut ».

## Vérifications

- `pnpm -r typecheck` : propre sur les 10 workspaces.
- Nouvelle suite `packages/core/src/modules/support/accessSessions.test.ts` (14 cas) : permissions par mode et par
  rôle, motif/durée validés, supersession, expiration silencieuse, fin de session (idempotente, réservée au
  titulaire de la session ou `access_session.manage_any`), garde-fou `assertOperatorAccess` (bloque en lecture seule
  sur le titulaire ciblé, laisse passer en opérateur, n'affecte jamais un autre titulaire ni l'absence de session),
  `listAccessSessionsForHolder` réservé à `audit.read`.
- Suites existantes non régressées : wallet (17 tests non liés à une base passent, échecs restants = `ECONNREFUSED`
  déjà connus), router `index.test.ts` mis à jour (nouvelle branche `accessSessions` dans le contrat du routeur
  composé) et repassé au vert.
- **Non vérifié dans ce sandbox** : aucune base MySQL disponible ici (limite d'environnement déjà documentée dans
  `AUDIT-CHECKUP-2026-09-21.md`) — la suite `accessSessions.test.ts` et le rendu réel du panneau Dashboard restent à
  rejouer contre une base et une session Dashboard authentifiée avant mise en production.

## Limites connues / suite

- Le garde-fou d'écriture couvre les mutations Wallet personnel les plus significatives (RIB, cartes, bénéficiaire,
  ajustement, statut, gel d'urgence, virements) mais pas la totalité de `walletAdmin.*` (ex. `createWallet`,
  `reconcileTopup`/`cancelTopup`/`refundTopup`) — ces dernières restent gouvernées par leur seul RBAC habituel, comme
  avant ce sprint. À étendre au même mécanisme si le produit le juge nécessaire.
- Le Wallet Pro (PROFESSIONAL) appelle désormais `assertOperatorAccess` sur ses écritures sensibles (RIB admin,
  ajustement de solde, statut entreprise, gel/paramètres carte pro — `packages/business/src/service.ts`), au même
  titre que le Wallet personnel. Ce qui MANQUE encore : le Dashboard business (`apps/business/page.tsx`) n'a AUCUN
  `AccessSessionPanel` — il n'existe donc aujourd'hui aucun moyen d'ouvrir une session support ciblant un
  `PROFESSIONAL`, ce qui rend le garde-fou inerte en pratique (jamais bloquant, faute de session active possible).
  Étendre l'UI de session d'accès à la page business suppose de choisir quel sous-ensemble de ses ~10 onglets
  (largement hors périmètre « portefeuille ») doit être concerné — non fait dans cette passe, volontairement
  circonscrite au wallet.
- Pas de double validation ni de ré-authentification renforcée pour ouvrir une session opérateur (contrairement à la
  révélation carte/CVV du Sprint « Coffre de cartes », qui reste inchangée et indépendante de ce mécanisme).
- Le compte à rebours de session côté Dashboard est un simple minuteur d'affichage ; l'expiration réelle est
  toujours vérifiée côté serveur à la prochaine requête, jamais côté client.

## Allègement de la friction (suite, même sprint)

Retour explicite du propriétaire de la plateforme : le garde-fou devait rester en place, mais son **ouverture**
devait être quasi immédiate pour un usage quotidien efficace. Traité par l'interface, pas par un affaiblissement du
mécanisme serveur (aucune règle RBAC ni `assertOperatorAccess` n'a changé) :

- Bouton **« Accès rapide »** (Dashboard, ADMIN/SUPER_ADMIN uniquement) : ouvre en un clic une session **opérateur**
  de 60 minutes avec un motif par défaut (« Dépannage demandé par le titulaire »). Le motif et la durée restent
  personnalisables juste en dessous pour qui préfère préciser.
- Le sélecteur de mode démarre désormais sur **Opérateur** (au lieu de Lecture seule) pour un ADMIN/SUPER_ADMIN —
  il n'y a plus de bascule à faire pour le cas d'usage le plus fréquent.
- Durée par défaut portée de 20 à 60 minutes pour éviter de rouvrir une session en cours de dépannage.
- Boutons de motifs rapides (« Dépannage demandé par le titulaire », « Vérification suite signalement »,
  « Intervention technique en cours ») pour remplir le champ motif en un clic sans taper de texte.

**Explicitement refusé, et pourquoi** : une demande de « mot de passe universel » (un secret partagé donnant accès à
n'importe quel compte) a été déclinée. Un tel mécanisme constituerait un point de défaillance unique catastrophique
pour une plateforme financière — une fuite unique exposerait tous les comptes — et rendrait le journal d'audit de ce
sprint inutile, puisque `support_session_id` et l'acteur réel n'auraient plus de sens si l'authentification n'était
plus individuelle. L'accès rapide ci-dessus répond au même besoin de vitesse en gardant chaque action attribuable à
son véritable auteur : chaque membre de l'équipe continue de s'authentifier avec son propre compte.
