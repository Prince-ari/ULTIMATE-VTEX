# Reprise d’implémentation — VTEX Wallet

## Résumé

La reprise a été effectuée sur le monorepo `VTEX-Wallet-Platform`. Les fonctionnalités sensibles ajoutées sont exposées par le backend Wallet, journalisées et accessibles depuis le Dashboard administratif. La logique financière existante et le ledger n’ont pas été remplacés.

## Fonctionnalités ajoutées

| Domaine | Implémentation | Contrôle |
|---|---|---|
| Coordonnées bancaires | Provisionnement IBAN/BIC synthétique déterministe par compte, avec notification et audit | Réservé à l’utilisateur propriétaire ou aux rôles administratifs |
| PIN carte | Stockage uniquement sous forme de hash `scrypt`, sans retour ni affichage du PIN | Mutation authentifiée, audit et notification |
| Renouvellement carte | Émission d’une nouvelle carte et annulation de l’ancienne | Réservé aux rôles admin/agent, audit |
| Remplacement carte | Même cycle que le renouvellement, avec motif obligatoire | Réservé aux rôles admin/agent, audit |
| Dashboard Wallet | Bouton de provisionnement bancaire, renouvellement et remplacement dans le tiroir du compte | Rafraîchissement du détail après mutation |
| Paramètres | Édition du logo et des overrides statistiques déjà supportés par Core | Sauvegarde via `settings.update` |
| Nettoyage PIN | Suppression du PIN de démonstration, du code conseiller codé en dur et du champ associé | Aucun secret ou PIN de test ne reste dans le Wallet |

## Migration

Une migration est fournie dans `packages/wallet/src/db/migrations/0004_secure_card_pin.sql` pour ajouter `pin_hash` et `pin_updated_at` à la table `cards`. Le PIN en clair n’est jamais persisté.

## Validation réussie

Les contrôles suivants passent :

- `@vtex/wallet-web` : **3 tests passés**.
- `@vtex/dashboard` : **typecheck TypeScript passé**.
- `@vtex/wallet` et `@vtex/router` : **build TypeScript passé**.
- Syntaxe Node de `apps/wallet/vtex-api.js` et `apps/wallet/router.js` : **valide**.
- Références obsolètes `VTEX2024`, `4812`, `pin-advisor`, `validateAdvisorCode` et `code conseiller` : **absentes**.
- Les fichiers temporaires d’extraction d’artifact et backups runtime : **absents du dossier servi par le Wallet**.

## Limite de validation d’environnement

La suite complète du monorepo n’a pas pu terminer ses tests d’intégration, car aucune base MySQL n’écoute sur `127.0.0.1:3306` dans le sandbox. Les échecs observés sont des `ECONNREFUSED` et empêchent les tests Core dépendants de la base de vérifier leurs erreurs métier. Ils ne constituent pas un échec de compilation des fonctionnalités ajoutées.

Avant hébergement, appliquer la migration sur la base de staging/production, puis rejouer la suite complète avec les variables de connexion configurées. Il est également recommandé de remplacer l’IBAN synthétique par un fournisseur bancaire réel si le produit doit effectuer des opérations SEPA réelles.

## Fichiers principaux modifiés

- `packages/wallet/src/db/schema.ts`
- `packages/wallet/src/db/migrations/0004_secure_card_pin.sql`
- `packages/wallet/src/service.ts`
- `packages/wallet/src/router.ts`
- `apps/wallet/index.html`
- `apps/wallet/vtex-api.js`
- `apps/dashboard/src/app/(main)/wallets/page.tsx`
- `apps/dashboard/src/app/(main)/parametres/page.tsx`
