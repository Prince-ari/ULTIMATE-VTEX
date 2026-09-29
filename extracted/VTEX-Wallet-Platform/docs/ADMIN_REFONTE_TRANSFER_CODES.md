# Verrouillage des virements et codes de validation (Wallet personnel)

Demande initiale : les nouveaux wallets (pro comme perso) doivent démarrer avec l'envoi de virements
verrouillé ; le titulaire fait une demande de déblocage, un administrateur envoie manuellement le premier
code, et chaque virement sortant suivant exige un code de validation à usage unique. Le libellé d'origine
parlait de « confirmer l'anonymat » — reformulé ici en anti-fraude (autorisation de transaction), la seule
lecture défendable pour un établissement de paiement agréé (cf. `docs/LEGDAY.md` et le refus déjà documenté
de la demande « anonymat » côté marketing).

## Ce qui existe (Wallet personnel uniquement — voir « Reste à faire »)

- **Schéma** (`packages/wallet/src/db/schema.ts`, migration `0012_transfer_codes`) :
  - `wallet_accounts.transfers_locked` (bool, défaut `true`) et `unlock_requested_at` (nullable).
  - Les comptes déjà ouverts avant la migration sont explicitement débloqués par la migration elle-même
    (`UPDATE ... SET transfers_locked = false`) — seuls les comptes créés APRÈS ce déploiement démarrent
    verrouillés.
  - Table `transfer_codes` (une ligne par `(wallet_account_id, purpose)`, remplacée à chaque nouvelle
    demande) : même contrat que `otp_codes` (empreinte HMAC, comparaison à temps constant, essais bornés,
    code en clair uniquement hors production).
- **Service** (`packages/wallet/src/service.ts`) :
  - `requestTransferUnlock` (titulaire), `adminSendUnlockCode` (admin, motivé par une session opérateur —
    Sprint 8), `confirmTransferUnlock` (titulaire), `requestTransferCode` (titulaire, avant chaque envoi).
  - `assertTransferAuthorized` appliqué à `transferInternal`, `transferExternal`, `shareFunds` : **ne
    s'applique qu'à l'auto-service** (`actor.id === source.userId`). Le personnel qui agit via une session
    opérateur (déjà motivée et journalisée) n'a pas besoin du code envoyé à l'e-mail du titulaire pour
    dépanner — décision produit alignée sur l'esprit « efficacité sans contrainte majeure » déjà retenu pour
    l'allègement de friction du Sprint 8.
- **E-mail** : `packages/core/src/email/transferCodeTemplate.ts` + `sendTransferCodeEmail`, même chrome
  visuel que l'OTP de connexion, copie adaptée (« unlock » vs « transfer »).
- **Dashboard** : panneau « Virements sortants » sur la fiche wallet (`apps/dashboard/.../wallets/page.tsx`)
  — état verrouillé/débloqué, bouton d'envoi manuel du premier code.
- **Wallet (titulaire)** : bandeau doré sur la vue Envoyer (verrouillé → demander le déblocage ; demande en
  cours → saisir le code reçu) ; les trois parcours d'envoi (`submitClassique`, `submitSplit`, `submitSend`)
  demandent désormais un code automatiquement et invitent à le saisir avant d'exécuter le virement.

## Virements internes programmés (« latents »)

Demande initiale : « pouvoir programmer des virements latents ». Implémenté pour les virements INTERNES
uniquement (`scheduleTransferInternal`, `packages/wallet/src/service.ts`) — jamais pour un virement externe
(IBAN), qui a déjà sa propre notion de « en attente » (validation manuelle par le personnel via
`resolvePendingTransaction`) ; superposer une seconde notion de « en attente » (programmé) sur le même champ
`status` aurait créé une ambiguïté dans la bannière d'alerte du Dashboard (`api.walletAdmin.transactions.query({status:"pending"})`,
qui ne distingue pas aujourd'hui la RAISON d'une attente).

- Table dédiée `scheduled_transfers` (migration `0014_scheduled_transfers`) : les fonds sont réservés
  (`changeAvailable`/`changeReserved`, même mécanique que l'attente d'un virement externe) dès la
  programmation, et le CODE DE VALIDATION anti-fraude est consommé à ce moment-là — l'autorisation porte sur
  la demande, pas sur son exécution différée.
- `executeDueScheduledTransfers()` : purge paresseuse (pas de tâche planifiée), appelée à chaque
  `bootstrapWallet` (best-effort, ne bloque jamais l'ouverture du Wallet de l'appelant). Un compte devenu
  inactif ou une incompatibilité de devise entre la programmation et l'échéance annule proprement le
  virement et libère les fonds.
- UI Wallet : le sélecteur « Programmer » déjà présent sur `#view-virement-classique` (jusqu'ici bloqué côté
  serveur) fonctionne désormais quand le bénéficiaire est lié à un compte VTEX interne
  (`internalWalletAccountId`) ; une section « Virements programmés » sur la vue Envoyer liste les virements
  en attente d'exécution avec une action d'annulation.
- Pas de scheduling pour les virements externes (IBAN) ni pour le Wallet Pro dans cette passe — voir
  ci-dessous.

## Reste à faire

- **Wallet Pro (PROFESSIONAL)** : aucun verrou ni code n'est appliqué aux virements business
  (`packages/business/src/service.ts` — `createPayout`/`createPayoutBatch`). Le même schéma
  (`transfersLocked`/`transferCodes`) devrait être répliqué sur `businessWalletAccounts` si le produit
  souhaite une parité totale « pro comme perso ». Non fait dans cette passe (portée déjà large).
- **Premier login** : le bandeau n'apparaît aujourd'hui que sur la vue *Envoyer* (lu à chaque hydratation du
  wallet). Il n'y a pas d'écran dédié « bienvenue, débloquez vos virements » au tout premier accès — le
  bandeau suffit à faire passer le message dès que l'utilisateur ouvre Envoyer, mais un écran d'accueil
  dédié serait plus visible si le produit le juge nécessaire.
- **Saisie du code** : implémentée via `window.prompt()` (cohérent avec le seul précédent existant dans ce
  code — la révocation de RIB business côté Dashboard utilise aussi `window.prompt`), pas un écran dédié à
  clavier numérique façon `#view-otp`. Un écran dédié serait plus soigné visuellement mais représente un
  chantier UI significativement plus long ; non fait ici.
