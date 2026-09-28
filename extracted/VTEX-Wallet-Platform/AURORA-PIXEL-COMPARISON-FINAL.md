# Aurora Wallet — comparaison et intégration finale

## Périmètre

L’artifact Aurora de référence est l’écran d’accueil partagé via `https://claude.ai/artifact/DuTSxctwWTWw2xXAHe5AKh`. L’intégration finale concerne exclusivement `apps/wallet/index.html#view-accueil`. Les autres vues restent dans leur shell et leur markup Wallet existants.

## Résultat visuel

Le markup Aurora de l’accueil a été installé comme shell principal : topbar, recherche, carte de solde platine, scène de cartes, actions rapides, sécurité, répartition, activité, objectifs, résumé financier et zone de confiance. La feuille `aurora-home.css` est activée uniquement lorsque `view-accueil` est actif. Elle est désactivée automatiquement pour toutes les autres vues.

La comparaison brute de captures ne peut pas atteindre une égalité mathématique de 100 % lorsque l’artifact et le Wallet n’utilisent pas les mêmes données, la même session et le même rendu WebGL. Les écarts constatés proviennent des valeurs de démonstration de l’artifact, de l’hydratation backend, de l’absence éventuelle de cartes réelles dans le compte et de l’animation du canvas. La structure, les dimensions principales, les tokens, les rayons, les couleurs, les espacements et les composants Aurora sont désormais ceux de la référence.

## Corrections réalisées

| Domaine | Correction |
|---|---|
| Shell | Fermeture correcte de `view-accueil`; les 21 autres vues ne sont plus imbriquées dans l’accueil. |
| CSS | Suppression des anciennes couches runtime `aurora.css` et `aurora-wallet.css`; activation d’un stylesheet dédié Aurora. |
| DOM | Suppression du markup de l’ancien accueil; aucun ancien `vx-header`, `hero-scene`, `wallet-total-glass` ou `action-bar` ne reste dans `view-accueil`. |
| Solde | Compatibilité avec `toggleFinBalance`, `fin-balance`, `fin-balance-amount` et `fin-balance-currency`. |
| Cartes | Hooks compatibles avec `vtex3d.js`: `vtx-hero3d`, `vtx3d-canvas`, `vtx3d-hit`, `vtx-hero-sub`, `vtx-hero-amt`, `vtx3d-dots`. |
| Objectifs | `renderSavingsGoals()` produit maintenant les cartes Aurora et conserve les mutations backend create/fund/update/close. |
| Activité | `renderTransactions()` conserve la source réelle `TRANSACTIONS` et l’état vide Aurora. |
| Résumé | Les identifiants `fin-stat-in`, `fin-stat-out` et `fin-stat-net` sont hydratables par `renderFinancialSummary()`. |
| Actions | Navigation Cartes, Historique, Envoyer, Recevoir, Banque et Profil branchée sur `showView`; gel, copie de carte et Wallet mobile branchés sur les handlers Wallet existants. |
| Isolation | MutationObserver activant Aurora sur accueil et la désactivant sur Cartes, Historique, Profil et les autres écrans. |
| Nettoyage | Suppression des extractions artifact et des fichiers de sauvegarde temporaires du dossier runtime Wallet. |

## Tests effectués

Les tests `@vtex/wallet-web` passent à **3/3**. Les vérifications syntaxiques de `vtex-api.js`, `vtex3d.js` et `router.js` passent. Le test navigateur confirme que Cartes conserve son ancien header, qu’Aurora est désactivé hors accueil, puis réactivé au retour sur accueil.

## État final

Aurora est le nouvel accueil du Wallet. Les fonctions métier continuent d’utiliser `vtex-api.js`, `router.js`, `vtex3d.js` et les handlers existants. Les autres écrans n’ont pas été remplacés par Aurora.
