# Check-up et traçage — VTEX Wallet Platform

**Date de contrôle : 21 septembre 2026**

## Conclusion exécutive

La dernière itération visible dans l’artefact Claude est accessible et porte le titre **VTEX Aurora**. Elle n’est toutefois pas présente dans le ZIP `VTEX-Wallet-Platform.zip`. Le ZIP contient une version antérieure de l’application Wallet, tandis que l’artefact Claude est une interface HTML autonome, rendue dans un iframe Claude, sans connexion apparente aux fichiers applicatifs du monorepo.

Il ne s’agit donc pas d’un simple problème de cache du navigateur. La chaîne de synchronisation entre Claude Artifact et le dépôt local n’existe pas, ou bien elle n’a pas été exécutée après la dernière itération.

## Preuves de divergence

| Élément | Artefact Claude — VTEX Aurora | ZIP local — Wallet | Conclusion |
|---|---|---|---|
| Titre visible | `VTEX Aurora` | Aucun marqueur `VTEX Aurora` | La nouvelle identité n’est pas dans le ZIP |
| Interface | Compte Ariel Kouadio, solde de démonstration `12 480,65 €`, cartes Aurora | Ancienne interface avec `view-accueil`, données et structure historiques | Les deux interfaces sont différentes |
| Bouton de visibilité | `id="eyeBtn"`, classe `eye-btn` | `class="vx-eye-btn"`, id `wtg-eye-wrap` | Le HTML n’est pas la même version |
| Taille du document principal | Environ 108 KB pour le contenu extrait de l’iframe | 591 640 octets pour `apps/wallet/index.html` | L’artefact n’est pas une copie du fichier local |
| Scripts applicatifs | Uniquement Three.js externe dans l’artefact extrait | `vtex-api.js`, `router.js` et de nombreux scripts locaux | Aurora est un prototype autonome, pas le Wallet intégré |
| Contrat de reprise API | Aucun marqueur `wallet-service-state` | Présent dans le ZIP | Le prototype Aurora ne reprend pas les fonctions de production du ZIP |
| Hash SHA-256 | `1b2241063647604da3fada88b86611cdb39ea4349a7c9fc33c7673f61618a8be` | `67d54e4cf8656f8e77e941c797d61d5e6c9fb9806fef61cd686b3fd2fde07ae9` | Les fichiers sont distincts |

L’artefact est chargé depuis un iframe Claude versionné par une URL de type `frame.claudeusercontent.com/_f/...`. Il n’existe aucun mécanisme dans le ZIP ou dans les scripts racine qui télécharge automatiquement cette version depuis Claude.

## Pourquoi la dernière version n’est pas apparue dans le code

Le dépôt contient une application Wallet statique qui est construite à partir de `apps/wallet/index.html`, `apps/wallet/vtex-api.js` et `apps/wallet/router.js`. L’artefact Claude, lui, contient une page autonome avec son propre HTML, son propre CSS et ses propres scripts inline. Modifier l’artefact Claude ne modifie donc pas le fichier `apps/wallet/index.html` et ne peut pas modifier le ZIP déjà fourni.

La dernière itération doit être considérée comme une **maquette ou un prototype visuel séparé** tant qu’elle n’a pas été exportée puis fusionnée avec les fonctions du Wallet réel : authentification, appels API, transactions, états d’erreur, navigation, sécurité, accessibilité et tests.

## État technique du ZIP local

Les contrôles exécutés après réinstallation Linux propre des dépendances donnent l’état suivant :

| Contrôle | Résultat |
|---|---|
| Installation pnpm avec lockfile | Réussie ; lockfile à jour et contrôlé par la supply-chain |
| Test de configuration de déploiement | 3 tests réussis |
| Typecheck global | Échec sur deux imports d’icônes inexistants dans le Dashboard |
| Build global | Échec dans le Dashboard sur les mêmes imports |
| Tests Wallet | 2 tests réussis, 1 échec : le test attend `.wtg-eye`, alors que le HTML livré utilise `.vx-eye-btn` |
| Audit dépendances production | 34 vulnérabilités : 2 critiques, 15 hautes, 15 modérées, 2 faibles |

Les imports bloquants sont dans `apps/dashboard/src/components/Dropdown.tsx` : `RiCheckboxBlankCircleLine` et `RiRadioButtonFill` ne sont pas exportés par `@phosphor-icons/react`.

## Anomalies importantes relevées dans le domaine financier

Le service `packages/wallet/src/service.ts` crée deux transactions pour un virement interne, une ligne débit et une ligne crédit. Cependant, les deux écritures ledger utilisent l’identifiant de la transaction débit :

```ts
await writeLedger(executor, { accountId: source.id, transactionId: debit.id, ... })
await writeLedger(executor, { accountId: destination.id, transactionId: debit.id, ... })
```

La transaction crédit créée juste avant n’est pas conservée dans une variable et son identifiant n’est pas utilisé pour l’écriture ledger. Cela peut rendre la réconciliation et la traçabilité transactionnelle ambiguës. Cette correction doit être traitée avant toute utilisation financière réelle.

## Plan de correction recommandé

### Priorité 0 — Ne pas remplacer le Wallet de production par l’artefact brut

L’artefact Aurora ne contient pas les contrats API visibles dans le Wallet actuel. Il ne faut pas copier son HTML par-dessus `apps/wallet/index.html` sans phase d’intégration, car cela supprimerait ou contournerait des fonctions métier et des contrôles de sécurité.

### Priorité 1 — Réparer la chaîne de qualité existante

Il faut corriger les deux imports d’icônes du Dashboard, mettre à jour le test Wallet pour refléter le contrat HTML réellement voulu, puis relancer typecheck, tests et build séquentiellement.

### Priorité 2 — Réintégrer Aurora par composants

La bonne approche est d’extraire d’Aurora les blocs visuels utiles — carte, solde, activité, objectifs et actions — puis de les intégrer dans le Wallet réel en conservant `vtex-api.js`, `router.js`, les états de chargement et les contrôles d’accessibilité. Les données de démonstration comme `12 480,65 €` et `Ariel Kouadio` doivent être remplacées par les données serveur.

### Priorité 3 — Corriger la cohérence ledger

La création de la transaction crédit doit être affectée à une variable et son identifiant doit être transmis à `writeLedger`. Il faut ensuite ajouter un test de réconciliation vérifiant que chaque mouvement crédit/débit pointe vers la bonne transaction.

### Priorité 4 — Traiter les dépendances vulnérables

La version de Next.js utilisée est concernée par plusieurs alertes, dont deux critiques selon `pnpm audit --prod`. Une mise à niveau contrôlée de Next.js, Drizzle ORM, PostCSS et des dépendances transitives doit être planifiée, avec reconstruction et tests complets.

## Fichier extrait pour intégration contrôlée

Le contenu HTML de l’artefact Aurora a été extrait localement à des fins de comparaison uniquement : `apps/wallet/claude-aurora-artifact.html`. Ce fichier est une copie de travail du prototype et n’a pas été branché au runtime.

## Verdict

**La dernière itération existe bien, mais elle est restée dans Claude Artifact. Elle n’a jamais été synchronisée avec le dépôt local ni incorporée au ZIP.** La prochaine étape sûre est une intégration visuelle contrôlée d’Aurora dans l’application Wallet existante, après réparation des erreurs de compilation et définition des éléments fonctionnels à conserver.


## Intégration Aurora — phase 1 exécutée le 21 septembre 2026

Une première intégration réversible a été ajoutée dans `apps/wallet/aurora.css`. Elle applique le langage visuel Aurora sur l’accueil existant sans remplacer son HTML métier ni ses scripts. La couche traite notamment le fond sombre, la carte de solde claire, la scène carte bleu nuit, le panneau sécurité vert, la répartition sombre et les trois actions rapides colorées.

Le fichier `apps/wallet/index.html` ne contient que deux changements fonctionnels minimaux : le chargement de la feuille `/aurora.css` et le maintien de la classe sémantique `wtg-eye` sur le bouton de masquage du solde. Les fichiers `vtex-api.js` et `router.js` ont conservé exactement leurs empreintes SHA-256 avant et après l’intégration.

La preview HTTP réelle a confirmé que le serveur sert bien la feuille Aurora et le HTML modifié. Le test Wallet passe désormais à **3 tests réussis sur 3**. Une preview publique a également été inspectée visuellement : l’accueil conserve la navigation, le solde dynamique, la scène carte, la sécurité, les actions, les objectifs, les indicateurs et l’activité, avec le nouveau thème Aurora appliqué.

Cette phase n’intègre volontairement pas encore le HTML autonome de Claude. La prochaine phase consistera à remplacer progressivement les blocs encore statiques de l’artefact par les données déjà produites par `vtex-api.js`, en commençant par la carte, les activités et les objectifs.


## Intégration Aurora — phase 2 exécutée le 21 septembre 2026

Les blocs dynamiques de l’accueil ont été raccordés à la source de vérité déjà présente dans `vtex-api.js`. Les cartes et leurs soldes continuent de passer par `wallets.bootstrap`, les transactions par le même bootstrap puis `renderTransactions`, et les objectifs par `savingsGoals` puis `renderSavingsGoals`. Le résumé financier utilise également les lignes backend pour calculer les entrées, sorties, net du mois, activité du jour et répartition.

Un conflit de priorité a été corrigé : l’ancien fallback `localStorage` des objectifs pouvait remplacer visuellement les objectifs backend après l’hydratation. `window.__walletApiDataReady` marque désormais l’hydratation réussie et bloque uniquement ce fallback local ; les actions serveur de création, alimentation, modification et clôture des objectifs restent inchangées.

La feuille Aurora applique maintenant son traitement visuel aux éléments réellement générés : cartes d’objectifs, lignes de transactions, résumé financier, états vides et suggestions. Aucun doublon de données n’a été introduit et les points d’entrée API sont conservés.

Validation : **3/3 tests Wallet réussis**, syntaxe JavaScript validée avec `node --check`, preview HTTP inspectée visuellement, et `router.js` inchangé. La preview `?preview=accueil` utilise volontairement le mode local ; elle affiche donc les états vides lorsque l’API n’est pas appelée. En session authentifiée, les mêmes blocs sont remplis par `wallets.bootstrap` et les requêtes Wallet existantes.


## Remplacement global Aurora Wallet — phase de prévisualisation

Le catalogue exhaustif des fonctionnalités a été produit dans `AURORA-FUNCTIONAL-INVENTORY.md`. Il recense les 23 vues, 3 formulaires, 115 boutons, 29 champs, 16 mutations RPC, 6 requêtes RPC, l’authentification OTP, les cartes, virements, bénéficiaires, objectifs, notifications, profil, documents, RIB, sécurité, devises, reçus, états de service et flux temps réel.

Un snapshot complet de `apps/wallet` a été créé avant le remplacement dans `backups/wallet-before-aurora-full-20260921-020542.tar.gz`, ainsi qu’une copie directe de `index.html`.

Le design précédent n’est plus la couche visuelle active : `aurora-wallet.css` est chargé en dernier et remplace le shell, la navigation, les surfaces, les cartes, les formulaires, les boutons, les modales, les états de service et la composition desktop/mobile. Les identifiants DOM et handlers métier ont été conservés pour ne pas casser `vtex-api.js`, `router.js`, les mutations financières ou les tests.

La page interactive de prévisualisation est disponible ici : [Aurora Wallet — preview interactive](https://4305-i76hko6sh2agxjzr6vgjz-074880d8.us1.manus.computer/?preview=accueil). La navigation vers Cartes et le contrôle de masquage du solde ont été testés dans le navigateur. La preview locale utilise les états de démonstration ; les données réelles se chargent dans une session authentifiée via `wallets.bootstrap`.
