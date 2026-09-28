# Prototypes publiés (artefacts)

Trois pages autonomes, sans réseau ni clé : la recharge par carte y est simulée par `core.js` (même logique que le vrai backend : plafonds 2 000 € par recharge (wallet perso) ou 5 000 € (Wallet Pro), 5 000 € par 24 h pour les deux, paiement en € ou en ₣ à la parité fixe 1 € = 119,3317 ₣, crédit unique après relecture du paiement, remboursement refusé si le solde ne suffit plus, RIB, soldes, journal des actions).

| Artefact | Sources | Build |
|---|---|---|
| Wallet personnel | l'application réelle `apps/wallet` + `wallet-backend.js` (faux `/api/trpc`) | `WALLET_DIR=apps/wallet node build-wallet.mjs` |
| Wallet Pro | `receipt.js/css`, `pro.js/css`, `pro-data.js`, `stage3d.js` (carrousel 3D) | `BUSINESS_DIR=apps/business node build-stage3d.mjs` puis `node build-pro.mjs` |
| Dashboard | `dash.js/css`, `dash-data.js` | `node build-dash.mjs` |

- `stage3d.js` est **généré** depuis `apps/business/src/components/dashboard/CardStage3D.tsx` (transpilation TypeScript, sans React) : ne pas l'éditer à la main. `build-pro.mjs` attend `three.min.js` (Three.js r160) à côté : copier `node_modules/three/build/three.min.js` d'`apps/business`.
- Devise d'affichage (€ / ₣) : choisie en haut de chaque page, mémorisée dans le navigateur ; tous les montants et champs de saisie suivent (le compte, lui, reste dans sa devise).
- Dashboard : créer une entreprise, attribuer / remplacer / retirer un RIB, mettre à jour le solde d'un compte ou d'une carte Wallet Pro, plafonds visibles dans Recharges et Paramètres.

Les builds écrivent `out/*.html` (fragments à publier). `node serve.mjs` les sert enveloppés comme le fait la publication (port 3010) : `/wallet`, `/pro`, `/dashboard`.

Sections du Pro et du Dashboard : ouvrir avec `#topup`, `#wallet`, `#payouts`… (Pro) ou `#topups`, `#business`, `#journal`, `#settings`… (Dashboard).
