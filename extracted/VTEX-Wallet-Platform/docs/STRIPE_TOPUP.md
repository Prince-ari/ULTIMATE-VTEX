# Recharge par carte (Stripe) — wallet personnel et Wallet Pro

## Ce que fait la fonctionnalité
Un utilisateur crédite son wallet (ou un compte / une carte de son entreprise, côté Wallet Pro) depuis une carte bancaire extérieure. Les fonds arrivent sur le compte Stripe de VTEX, puis le ledger est crédité et le solde se met à jour immédiatement.

| Où | Entrée |
|---|---|
| Wallet personnel | vue `#view-recharger` (`apps/wallet/topup.js`, `topup.css`) — tuile « Recharger » de l'accueil, item de sidebar, bouton « Recharger cette carte » (écran Cartes), boutons de Recevoir et de Infos bancaires |
| Wallet Pro | `/topup` (`apps/business/src/app/topup`) — nav « Recharger », bouton du hero, `?account=ID` / `?card=ID` présélectionnent le compte ou la carte |
| Dashboard | `/recharges` — état Stripe, KPIs, tableau unifié perso + Pro, tiroir (relire l'état, annuler, rembourser avec justification) ; journal système avec libellés et filtre « Recharges » |

## Règles de sécurité (non négociables)
1. **Le solde n'est jamais crédité sur la foi du navigateur.** Le serveur crée le PaymentIntent, puis *relit* son état auprès de Stripe (`confirm`) et vérifie référence, montant et devise avant de créditer — dans une transaction SQL (`SELECT … FOR UPDATE`) qui rend le crédit unique (clé d'idempotence `topup:<ref>`).
2. Le webhook signé (`POST /api/stripe/webhook`, secret `STRIPE_WEBHOOK_SECRET`) est un filet de sécurité : il ne fait que déclencher la même relecture.
3. **Les clés Stripe vivent uniquement dans `apps/api/.env.local`** (voir `.env.example`). Jamais dans le code, un zip, un artefact ou un navigateur.
4. `STRIPE_ALLOW_LIVE_CHARGES=true` est requis pour débiter de vraies cartes avec des clés `live`. Ce verrou, les plafonds par recharge et le limiteur de débit (10 opérations d'argent / minute) sont **volontairement conservés** : leur retrait a été refusé par le garde-fou de la session et doit être décidé explicitement.
5. Une clé `mk_…` n'est pas une clé secrète Stripe (HTTP 401). Il faut `sk_live_…` / `sk_test_…` ou une clé restreinte `rk_…`.

## Plafonds de recharge (par portefeuille)
| Plafond | Wallet personnel | Wallet Pro | Portée |
|---|---|---|---|
| Par recharge | **2 000 €** = **238 663 ₣** | **5 000 €** = **596 658 ₣** | chaque recharge |
| Cumulé | **5 000 €** = **596 658 ₣** | **5 000 €** = **596 658 ₣** | 24 h glissantes, par portefeuille (wallet perso : par utilisateur ; Wallet Pro : par entreprise, tous comptes confondus) |

- Contrôlés **côté serveur** (`topupLimits`, `topupDailyRemaining` dans `packages/core/src/stripe/gateway.ts`) à la création, jamais seulement dans l'interface. Sont comptées les recharges `pending`, `requires_action`, `processing` et `succeeded` ; une recharge `pending` abandonnée depuis plus de 10 min est annulée et libère son quota ; un remboursement, un refus ou une annulation libèrent aussi le quota.
- L'équivalent en francs Pacifique est calculé à la parité fixe et **arrondi vers le bas** (`floorConvertMinor`) pour ne jamais dépasser le plafond en euros (2 000 € × 119,3317 = 238 663,4 ₣ → 238 663 ₣ ; 5 000 € × 119,3317 = 596 658,5 ₣ → 596 658 ₣).
- Interprétation retenue de la demande : « 2 000 € max par recharge » pour le wallet personnel et « 5 000 € max » pour le Wallet Pro, avec en plus un plafond commun de **5 000 € cumulés par 24 h** par portefeuille. Un Wallet Pro peut donc faire une seule recharge de 5 000 €, ou plusieurs recharges tant que le cumul du jour reste sous 5 000 €. Les valeurs sont centralisées dans `TOPUP_MAX_EUR_CENTS` (`{ wallet, business }`) et `TOPUP_DAILY_MAX_EUR_CENTS` ; les artifacts les reprennent dans `docs/prototypes/core.js` (`MAX_EUR`, `DAILY_MAX_EUR`).
- Le dollar n'est jamais converti : un compte Wallet Pro en USD applique les mêmes nombres (5 000 $ par recharge).
- Les interfaces (wallet, Wallet Pro, Dashboard › Recharges / Paramètres) affichent le plafond du portefeuille concerné et le quota restant sur 24 h, et grisent les montants prédéfinis qui les dépassent.

## Devise : euro ↔ franc Pacifique (₣)
- Parité **fixe** : 1 000 ₣ = 8,38 € ⇒ **1 € = 119,3317 ₣** (`packages/core/src/stripe/fx.ts`, `@vtex/money`). Le franc n'a pas de centimes (unité mineure = 1 ₣). Le dollar n'a pas de parité fixe : il n'est jamais converti.
- Le signe est **₣** (U+20A3) partout — jamais « XPF », « FCFP » ni « F CFP » dans un montant affiché.
- Un compte reste dans sa devise. Un paiement en ₣ sur un compte en € (ou l'inverse) est converti **au crédit** ; un remboursement débite le montant converti et est refusé si le solde ne le couvre plus.
- Choisir la devise dans **Profil › Devise** (wallet), dans la barre du haut (Wallet Pro) ou en tête de page (Dashboard) reconvertit à l'écran tous les soldes, opérations, plafonds et champs de saisie ; la page de recharge se recale sur la devise choisie.

## Dashboard : entreprises, RIB, soldes (`/business`)
- **Créer une entreprise** (administrateur) : titulaire, raison sociale, devise, **solde initial**, **RIB** (généré, saisi ou aucun) — `businessAdmin.createBusiness` puis `provisionBankDetails` / `updateBankDetails` / `adjustBalance`.
- **Attribuer, remplacer, générer ou retirer un RIB** par compte (`businessAdmin.updateBankDetails` / `revokeBankDetails` ; IBAN contrôlé MOD 97, BIC contrôlé, motif ≥ 8 caractères, appartenance du compte à l'entreprise vérifiée, actions `admin.business.bank_details_*` au journal).
- **Mettre à jour le solde d'un compte et de ses cartes** : « ajouter / retirer » ou « définir le solde » (`businessAdmin.adjustBalance`, motif obligatoire, refus si le solde deviendrait négatif). Une carte Wallet Pro dépense le solde de son compte : mettre à jour le compte met la carte à jour.

## Modes (`STRIPE_MODE`)
- `auto` (défaut) : Stripe réel si les clés sont valides, sinon simulateur local (développement uniquement, avec la raison affichée dans l'interface et le Dashboard).
- `real` : Stripe obligatoire, aucun repli. `sim` : simulateur forcé, interdit en production.
- Simulateur : `4242 4242 4242 4242` (succès), `4000 0027 6000 3184` (3D Secure), `4000 0000 0000 0002` (refus), `4000 0000 0000 9995` (fonds insuffisants), `4000 0000 0000 0069` (expirée).

## Backend
- `packages/core/src/stripe/gateway.ts` — passerelle `RealGateway` / `SimGateway`, configuration, plafonds.
- `packages/wallet/src/topups.ts`, `packages/business/src/topups.ts` — création, confirmation, crédit, listes, administration (réconciliation, annulation, remboursement).
- Routeurs : `topups.*`, `walletAdmin.{stripeStatus,topups,reconcileTopup,cancelTopup,refundTopup}` ; `businessTopups.*`, `businessAdmin.*` (même forme).
- Migrations : wallet `0007_wallet_topups`, `0008_wallet_topups_refund` (SQL idempotent écrit à la main) ; business `0001_*`, `0002_*` (générées).
- ⚠️ Le journal Drizzle du wallet ne référence que `0000–0003` + `0007–0008` : les fichiers `0004–0006` existants n'ont jamais été appliqués sur une base neuve. Défaut antérieur à cette fonctionnalité, non modifié ici.

## Tester
1. `cp apps/api/.env.example apps/api/.env.local`, renseigner `DATABASE_URL`, `JWT_SECRET`, l'admin initial ; laisser `STRIPE_MODE=auto` sans clés → simulateur.
2. Démarrer l'API puis `E2E_PASSWORD=… node scripts/topup-e2e.mjs`, `scripts/topup-admin-e2e.mjs` (parcours nominal, refus, 3D Secure, concurrence, isolation Pro, puis administration : relecture, annulation, remboursement) et `scripts/topup-limits-e2e.mjs` (plafonds 2 000 € perso / 5 000 € Pro par recharge et 5 000 € par 24 h, paiement en ₣ à la parité fixe, quota 24 h, remboursement converti, création d'entreprise, RIB, soldes ; crée ses propres utilisateur et entreprise de test). Les scripts d'argent attendent le limiteur (10 opérations / minute) : comptez quelques minutes.
3. Pour du vrai Stripe en test : `pk_test_…`/`sk_test_…`, puis `stripe listen --forward-to localhost:4000/api/stripe/webhook` pour obtenir `whsec_…`.

## Prototypes publiés
Les trois artefacts (Wallet, Wallet Pro, Dashboard) sont des prototypes **autonomes** dont la recharge est simulée : `docs/prototypes/` contient leurs sources et leurs scripts de build.

## Point de conformité
Conserver des fonds clients sous forme de solde de wallet peut relever du statut d'établissement de paiement / de monnaie électronique selon la juridiction. À faire valider avant toute mise en production avec de vrais débits.
