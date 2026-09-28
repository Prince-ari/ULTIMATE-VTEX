# Matrice de pilotage Wallet depuis le Dashboard

## Principes de sécurité

Le Dashboard ne calcule aucun solde et ne modifie pas directement la base. Chaque commande passe par une procédure tRPC, applique une validation Zod, vérifie le rôle serveur, journalise l’action et déclenche la notification métier appropriée. Une devise historique ne peut pas être modifiée : l’administration crée un **nouveau compte dans la devise choisie**, ce qui préserve la cohérence du ledger et des transactions existantes.

| Domaine | Lecture Dashboard existante | Commande existante | Écart identifié | Extension retenue | Rôle |
|---|---|---|---|---|---|
| Comptes | Liste, devises, soldes, statut, IBAN | Ajustement de solde | Pas de détail complet, pas de cycle de vie, pas d’ouverture multidevise | Détail avec titulaire, IBAN/BIC, cartes, bénéficiaires, objectifs et transactions ; ouverture de compte EUR/USD/XPF ; activation, gel et clôture conditionnelle | Admin |
| Cartes | Liste, statut, limites partielles | Gel/dégel | Pas de contrôle des canaux, plafonds complets, création ou annulation dans l’UI | Édition des canaux et plafonds, création, annulation irréversible, consultation liée au compte | Admin ; gel/dégel par agent |
| Virements et journal | Ordres en attente et historique | Validation/refus des ordres externes | Détail de transaction absent du tiroir | Historique lié au compte dans le tiroir ; validation/refus conservés | Admin, Agent |
| Bénéficiaires | Non | Service CRUD serveur existant | Liste et statut absents | Lecture des bénéficiaires liés au titulaire ; activation/désactivation administrable | Admin, Agent |
| Objectifs d’épargne | Non | Service client et contrôles serveur existants | Liste, édition et clôture absentes | Lecture liée au compte ; édition et clôture explicites, avec idempotence sur la clôture | Admin |
| Devise | Champ consulté | Aucune mutation sûre | Changer une devise en place casserait le ledger | Ouverture d’un nouveau compte sous devise prise en charge ; devise existante en lecture seule | Admin |

## Limites volontaires

Les numéros complets de carte et les références de token restent exclus du Dashboard. Les changements de devise en place, la modification du ledger, la suppression de transactions et la suppression directe de comptes restent interdits : une correction comptable passe par l’ajustement journalisé existant, et une clôture exige des soldes disponible et réservé nuls.

## Inventaire exhaustif des procédures Wallet

| Procédure tRPC | Nature | État Dashboard avant extension | État cible Dashboard | Rôle cible |
|---|---|---|---|---|
| `wallets.mine` | Lecture du compte courant | Indirecte via la liste admin | Détail consolidé d’un compte sélectionné | Admin, Agent |
| `wallets.ensure` | Création idempotente d’un compte utilisateur | Absente | Ouverture administrative contrôlée d’un compte dans une nouvelle devise | Admin |
| `wallets.bootstrap` | Lecture consolidée du Wallet personnel | Absente | Remplacée par une lecture admin ciblée sans session client | Admin, Agent |
| `cards.listMine` | Lecture des cartes personnelles | Liste globale partielle | Cartes liées au compte dans le tiroir de détail | Admin, Agent |
| `cards.setFrozen` | Gel et dégel de carte | Présente | Conservée, avec l’état et le titulaire visibles | Admin, Agent |
| `cards.updateControls` | Canaux et plafonds de carte | Absente | Formulaire d’administration complet | Admin |
| `cards.create` | Émission de carte | Absente | Émission contrôlée depuis le détail compte | Admin |
| `cards.authorizePayment` | Autorisation de paiement marchand | Absente | **Exclue** : reste réservée au canal de paiement/terminal, mais ses transactions sont visibles | N/A |
| `beneficiaries.listMine` | Liste des bénéficiaires client | Absente | Liste du titulaire dans le détail compte | Admin, Agent |
| `beneficiaries.create` | Ajout d’un bénéficiaire client | Absente | Création assistée sur le compte sélectionné | Admin |
| `beneficiaries.update` | Mise à jour/activation/désactivation | Absente | Édition et activation/désactivation | Admin, Agent |
| `beneficiaries.delete` | Suppression | Absente | **Exclue** par défaut : désactivation traçable privilégiée | N/A |
| `transactions.listMine` | Historique personnel | Liste globale limitée | Historique lié au compte, avec références et motifs | Admin, Agent |
| `transactions.transferInternal` | Mouvement entre comptes Wallet | Absente | Virement interne opérateur avec idempotence et journal | Admin |
| `transactions.transferExternal` | Ordre externe | Absente | Création d’ordre externe au nom du titulaire, puis validation séparée | Admin |
| `transactions.shareFunds` | Répartition interne | Absente | Répartition opérateur contrôlée entre comptes de même devise | Admin |
| `transactions.resolvePending` | Validation/refus d’ordre externe | Présente | Conservée, avec justification de refus obligatoire dans l’UI | Admin, Agent |
| `savingsGoals.listMine` | Objectifs d’épargne personnels | Absente | Liste liée au compte | Admin, Agent |
| `savingsGoals.create` | Création d’objectif | Absente | Création dans le détail compte | Admin |
| `savingsGoals.fund` | Alimentation d’objectif | Absente | Alimentation contrôlée, idempotente et journalisée | Admin |
| `savingsGoals.update` | Mise à jour d’objectif | Absente | Édition des champs métier | Admin |
| `savingsGoals.close` | Clôture avec restitution | Absente | Clôture confirmée, idempotente et journalisée | Admin |
| `walletAdmin.wallets/cards/transactions/kpis` | Lectures d’exploitation | Présentes partiellement | Conservées et enrichies par un détail consolidé | Admin, Agent |
| `walletAdmin.adjustBalance` | Correction comptable | Présente | Conservée, justification et idempotence obligatoires | Admin |
