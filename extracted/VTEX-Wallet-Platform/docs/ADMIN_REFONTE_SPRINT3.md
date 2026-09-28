# Refonte de l'administration — Sprint 3 : contrôle des cartes et liens de paiement

Livré le 2026-09-25. Deux volets : (1) l'administrateur pilote les cartes (statut, canaux, plafonds, cycle de vie) ; (2) les liens de paiement Wallet Pro deviennent réels — une personne **sans compte** paie par carte sur une page publique, le compte Pro est crédité **après vérification** auprès du prestataire, et le Dashboard supervise.

## 1. Contrôle des cartes (`admin.cards.*`, permission `cards.manage`)

| Action | Procédure | Règles serveur |
|---|---|---|
| Geler / dégeler | `admin.cards.setFrozen` | ADMIN et SUPER_ADMIN ; carte annulée ou expirée refusée ; journalisé |
| Canaux (en ligne, sans contact, retraits) et plafonds | `admin.cards.updateControls` | par opération ≤ par jour ≤ par mois ; montants entiers positifs |
| Renouveler / remplacer | `admin.cards.reissue` (`renew` / `replace`) | carte personnelle ; idempotent ; l'ancienne est annulée et son coffre purgé ; motif obligatoire pour « remplacer » |
| Annuler | `admin.cards.cancel` | irréversible ; coffre purgé ; titulaire notifié |

Le Wallet du titulaire relit l'état à sa prochaine requête : la source de vérité est la base, jamais une copie locale. Les cartes Wallet Pro passent par les mêmes contrôles côté `@vtex/business`, avec **cloisonnement par entreprise** (une carte ou un compte n'est jamais atteignable par son seul identifiant — corrige un IDOR préexistant).

UI : panneau « Statut et dernière utilisation / Canaux autorisés / Plafonds / Cycle de vie » dans la fiche carte (`CardControls.tsx`), protocole Leg Day (interrupteurs pilule, socles pleins, aucune bordure).

## 2. Liens de paiement

### Parcours

1. **Wallet Pro** (`/payment-links`) : le titulaire crée un lien (nom, description, montant, usage unique ou réutilisable, compte crédité, expiration). Adresse opaque de 12 caractères (72 bits, `base64url`), jamais devinable.
2. **Payeur** (`/pay/[slug]`, aucun compte, aucune session) : voit le nom du lien, la société, le montant (fixé par le commerçant — un montant envoyé par le client est ignoré), saisit nom et e-mail, paie. Le numéro de carte ne touche **jamais** nos serveurs : Payment Element du prestataire en test/live, simulateur uniquement en développement.
3. **Règlement** : `publicPayments.start` crée un paiement `pending` + une intention chez le prestataire (métadonnées `scope=payment_link`) ; `publicPayments.confirm` (retour du payeur) et le webhook revérifient référence, montant et devise **avant** de créditer, dans une transaction verrouillée (`FOR UPDATE`), en écrivant transaction + écriture de grand livre + événement + notification + audit. Un lien à usage unique se ferme à l'encaissement.
4. **Dashboard** (`/liens-de-paiement`) : liste transverse des liens et des paiements, fiche du lien, suspension/réactivation, revérification et remboursement.

### Garanties

- **Jamais deux crédits** : garde `succeeded`/`refunded` sous verrou + unicité de la référence de transaction. (Le test a révélé qu'un paiement *remboursé* pouvait retenter un crédit à la confirmation suivante ; corrigé ici et dans les recharges Wallet et Wallet Pro.)
- **Idempotence** : la clé du client (conservée en `sessionStorage`) rejoue le même paiement ; réutilisée pour un autre payeur, elle est refusée.
- **Usage unique** : un paiement en cours réserve le lien 10 minutes ; au-delà il est libéré.
- **Indisponible = indistinct** : brouillon, suspendu, inconnu, société inactive → même réponse « n'est pas disponible » (pas d'énumération). Expiré → « n'est plus valable ».
- **Non-divulgation** : la page publique ne renvoie ni identifiant de société, ni de compte, ni de créateur, ni l'adresse du lien. Les vues Pro et Dashboard ne renvoient jamais l'IP du payeur ni l'identifiant d'intention (l'IP n'existe que dans le journal d'audit, pour la traçabilité anti-fraude).
- **Limites de débit par IP** : vue 60/min, démarrage 10/min (et 60/min par lien), confirmation 60/min, simulateur 30/min.
- **Messages de refus** normalisés par code (vouvoiement), indépendants de la langue du prestataire.
- Ancienne fonction `recordPaymentLinkPayment` (créditait sans encaissement réel, non utilisée) **supprimée**.

### Permissions (RBAC)

| Permission | SUPPORT (`agent`) | ADMIN | SUPER_ADMIN | ACCOUNT_MANAGER / user |
|---|---|---|---|---|
| `paymentlinks.read` | oui | oui | oui | non |
| `paymentlinks.manage` (suspendre, revérifier, rembourser) | non | oui | oui | non |

Côté Wallet Pro : créer / suspendre = `owner`, `admin`, `finance` de l'entreprise ; lire = tous les rôles ; le compte crédité doit appartenir à l'entreprise.

### Audit

Actions : `business.payment_link.create`, `business.payment_link.status_update`, `payment_link.payment.start`, `.credit`, `.mismatch`, `.reconcile`, `.refund`, `payment_link.admin.disable`, `payment_link.admin.enable` — rattachées à la société (`walletType = PROFESSIONAL`, `holderId`), motif conservé, jamais de numéro de carte.

### Données

Migration business `0003_payment_link_payments` (+ `down/`) : table `payment_link_payments`, colonnes `target_account_id`, `description`, `expires_at`, `updated_by`, statut `disabled` sur `payment_links` ; anciens liens rattachés au premier compte de leur entreprise.

## 3. Correctifs découverts en route

- **Limiteur de débit décalé par le fuseau horaire** (`packages/core/src/api/rateLimit.ts`) : les dates passées en SQL brut étaient sérialisées dans le fuseau du process alors que la colonne les lit en UTC — sur un serveur non UTC, chaque fenêtre durait « décalage » heures de plus (verrouillages de 2 h en local). Dates désormais encodées par la colonne. Suite `core` : 8 échecs préexistants → 3 (restent les tests Resend, liés aux clés).
- **IP réelle du client** : les proxys Next (`apps/business`, `apps/dashboard`) ne transmettaient pas `x-forwarded-for` ; tous les visiteurs partageaient l'IP du serveur Next pour les limiteurs. Transmis désormais (l'API ne retient que l'entrée la plus à droite, ajoutée par le proxy de bordure).
- Confirmation d'un paiement remboursé : plus de tentative de re-crédit (lien, recharges Wallet, recharges Pro).

## 4. Fichiers

- `packages/business/src/paymentLinkPay.ts` (paiement public, crédit, remboursement, réconciliation, simulateur), `service.ts` (création/statut), `topups.ts` (webhook), `router.ts` (`publicPayments`, `paymentLinks.payments`), `db/schema.ts`, migration `0003`.
- `packages/router/src/adminPaymentLinks.ts`, `adminCards.ts` ; `packages/core/src/auth/rbac.ts`.
- `apps/business/src/app/pay/[slug]/{page.tsx,pay.css}`, `pay/layout.tsx` (noindex, `referrer: no-referrer`), `payment-links/page.tsx`, `BusinessShell.tsx` (exemption de la page publique).
- `apps/dashboard/src/app/(main)/liens-de-paiement/page.tsx`, `components/admin/paymentlinks/PaymentLinkDrawer.tsx`, `lib/paymentLinkFormat.ts`, `components/admin/cards/CardControls.tsx`, `app/legday.css`.
- Tests : `adminPaymentLinks.test.ts` (10), `rbac.test.ts`, `paymentLinkFormat.test.ts` ; e2e `scripts/paylink-e2e.mjs` (37 contrôles, API et base réelles).

## 5. Vérifications

- Typecheck : core, wallet, business, router, apps business et dashboard.
- Tests : router 53 verts, wallet 24, api 8, dashboard 113, core 228 (3 échecs Resend préexistants, liés aux clés d'environnement).
- e2e réel : création, paiement 4242 / refus / 3D Secure, idempotence, non-recrédit, usage unique, indisponibilité, supervision SUPPORT/ADMIN, suspension, remboursement, journal.
- Navigateur : parcours 3D Secure complet sur `/pay/[slug]` (saisie → validation banque → reçu « PAYÉ »), lien suspendu (« Ce lien est indisponible »), Dashboard (KPI, liste, fiche) et Wallet Pro (`/payment-links`), gel/dégel d'une carte.

## 6. Variables et déploiement

- `NEXT_PUBLIC_BUSINESS_URL` (Dashboard) : origine de l'application Wallet Pro, pour afficher/copier l'adresse publique d'un lien. Sans elle en production, seul le chemin relatif `/pay/[slug]` est affiché.
- **Écart de déploiement constaté** : l'application Wallet Pro (`apps/business`) n'apparaît ni dans `deployment/docker-compose.hostinger.yml` ni dans le gabarit Nginx. La page publique `/pay/[slug]` n'est donc pas encore servie en production. À traiter au Sprint 10 (service, domaine, `X-Forwarded-For`, CSP autorisant `js.stripe.com`).
- Le webhook du prestataire (`payment_intent.*`) atteint `handleBusinessStripeEvent`, qui délègue aux liens de paiement quand l'intention ne correspond pas à une recharge.

## 7. Limites connues

- Pas de remboursement partiel ni de reçu par e-mail envoyé par VTEX (le prestataire envoie le sien en mode live).
- Les liens « réutilisables » n'ont pas de plafond de nombre de paiements ni de quantité.
- Un remboursement se fait uniquement depuis le Dashboard (pas depuis Wallet Pro) — volontaire à ce stade.
