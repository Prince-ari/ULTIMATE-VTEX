# Refonte de l'administration — Sprint 2 : Banque (RIB principal, sous-RIB, IBAN virtuels)

## Ce que ça change
Avant : un IBAN n'était qu'une colonne texte sur le compte (`wallet_accounts.iban`, `business_wallet_accounts.iban`), en clair, sans sous-RIB, sans historique unifié.
Maintenant : une **table unique `bank_accounts`** (core, migration `0010_bank_accounts`, retour arrière `down/0010_bank_accounts.down.sql`) est la **source de vérité** des RIB du Wallet personnel et du Wallet Pro. Le Dashboard l'écrit, les Wallets la lisent.

## Modèle
| Colonne | Rôle |
|---|---|
| `wallet_type`, `holder_id` | titulaire : PERSONAL → `users.id`, PROFESSIONAL → `businesses.id` (NULL = sous-RIB **au stock**) |
| `ledger_account_id` | compte crédité : `wallet_accounts.id` / `business_wallet_accounts.id` |
| `kind` | `MAIN` (RIB principal du compte) ou `SUB` (IBAN virtuel rattaché à un compte) |
| `label`, `account_holder_name`, `bank_name`, `currency`, `bic` | coordonnées lisibles |
| `iban_enc`, `iban_fingerprint`, `iban_last4`, `iban_country`, `key_id` | IBAN chiffré AES-256-GCM (même coffre et mêmes clés que les cartes), index aveugle unique, 4 derniers caractères seuls en clair |
| `status` | `active` / `disabled` — **jamais de suppression** (traçabilité) |
| `main_slot` (colonne générée) | garde-fou de base : **un seul RIB principal actif par compte** |

- L'historique complet vit dans `logs` (`target_type = 'bank_account'`) : pas de table d'événements en plus.
- Écriture jumelée : un RIB principal reste écrit dans les colonnes `iban`/`bic` du compte (et `wallet_bank_details` pour le personnel) **dans la même transaction**, tant que le Wallet les lit — additif d'abord, suppression plus tard. Les anciens points d'entrée (`walletAdmin.updateBankDetails`, `businessAdmin.updateBankDetails`, `wallets.provisionBankDetails`…) écrivent donc aussi dans `bank_accounts` : une seule vérité.
- Un sous-RIB peut être attribué, **réattribué** (même entre un particulier et une société) ou retiré ; sa devise doit être celle du compte cible ; l'appartenance du compte au titulaire est revérifiée côté serveur (IDOR).
- IBAN généré : valide (MOD 97) et unique — RIB principal `30004`/`30005` (Wallet / Pro, déterministe par compte), sous-RIB `30006` (aléatoire, nouvel essai en cas de collision).

## Migration des données existantes
1. `scripts/db-backup.ps1` (sauvegarde), 2. `pnpm db:migrate` (core `0010`), 3. **rattrapage** : `pnpm --filter @vtex/router db:backfill-banking` — crée le RIB principal de chaque compte qui porte déjà un IBAN (le chiffrement exige la clé du coffre, ce n'est donc pas du SQL). Idempotent, ne touche jamais aux colonnes historiques, signale (sans migrer) un IBAN historique invalide. Aucune colonne supprimée.

## Droits (RBAC serveur)
| Permission | SUPER_ADMIN | ADMIN | SUPPORT | Autres |
|---|---|---|---|---|
| `banking.read` (listes, fiches masquées) | oui | oui | oui | non |
| `banking.reveal` (IBAN complet, journalisé) | oui | oui | non | non |
| `banking.manage` (créer, modifier, désactiver, attribuer, retirer) | oui | oui | non | non |
Le SUPPORT ne voit pas l'historique d'audit (`audit.read`). Le titulaire lit **ses** RIB (IBAN complet, c'est ce qu'il partage) : `bankAccounts.mine` (Wallet), `wallet.bankAccounts` (Wallet Pro, membres actifs).

## Journal (jamais l'IBAN)
`bank.account.create | update | disable | enable | assign | reassign | unassign`, `bank.iban.reveal`, `bank.iban.reveal_failed` : acteur, rôle, session, IP, requête, titulaire (`wallet_type/holder_id`), libellé, devise, **4 derniers caractères**, ancien/nouveau rattachement, motif, noms des champs modifiés. Les actions qui changent l'état exigent un **motif** (8 caractères minimum). Une réattribution s'inscrit aussi dans l'historique de l'ancien titulaire.

## Interface
- **Dashboard › Banque** : indicateurs cliquables (principaux, sous-RIB, au stock, désactivés), recherche (titulaire, libellé, 4 derniers, **IBAN complet** via l'empreinte), filtres, lignes alignées.
- **Fiche RIB** : héro platine (IBAN masqué → « Afficher l'IBAN » journalisé, remasquage 30 s, copie), coordonnées, **rattachement** (attribuer / réattribuer / retirer avec motif), **arbre société → compte → RIB → sous-RIB** (chaque nœud ouvre sa fiche), historique lisible, modification (rotation d'IBAN avec motif), désactivation.
- **Nouveau RIB** : principal ou sous-RIB, attribué ou laissé au stock, titulaire trouvé par recherche puis compte crédité, IBAN généré ou saisi (masque de saisie), motif.
- Fiche utilisateur : RIB et sous-RIB de chaque compte (masqués) avec lien direct ; liens `/banque?rib=12`.
- **Wallet** : écran Banque et Recevoir lisent le serveur (plus aucun IBAN ni nom en dur en mode connecté : copie et partage utilisent le vrai RIB), liste des **sous-RIB** avec copie ; l'aperçu local garde des valeurs de démonstration.
- **Wallet Pro › Wallet** (page auparavant vide) : comptes, soldes, tuiles RIB kaléidoscope (couleur pleine + socle, copie au toucher), génération du RIB principal pour propriétaire/admin.

## Vérifications
- Tests : core 222 (dont IBAN/banque 9), router 38 (dont `admin.banking` 11, cartes 11, contrat des branches), wallet 24, dashboard 107, api 8 ; **8 échecs préexistants inchangés**.
- `scripts/banking-e2e.mjs` (API réelle, **29 contrôles**) : permissions, écriture jumelée (le Wallet lit le nouvel IBAN après rotation, plus d'IBAN après désactivation), attribution / réattribution / retrait, IDOR, devise, journal sans IBAN, vue du titulaire et de la société.
- Contrôle visuel réel : page Banque, fiche RIB (masqué / révélé), création, fiche utilisateur, écran Banque du Wallet (mobile), page Wallet Pro.

## Limites connues / suite
- Aucun rapprochement bancaire réel : un virement entrant vers un sous-RIB n'est pas encore reconnu automatiquement (pas de flux bancaire) ; l'attribution est administrative.
- Les colonnes `iban`/`bic` historiques restent tant que le Wallet et les recharges les lisent ; leur suppression est un chantier ultérieur.
- Le QR de réception (EPC) du Wallet est rattaché au Sprint 7.
