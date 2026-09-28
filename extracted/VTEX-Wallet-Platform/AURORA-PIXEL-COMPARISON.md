# Comparaison Aurora Artifact / Wallet — accueil uniquement

**Artifact de référence :** https://claude.ai/artifact/DuTSxctwWTWw2xXAHe5AKh  
**Capture artifact :** `/home/ubuntu/screenshots/claude_ai_2026-09-21_02-34-49_2852.webp`  
**Capture intégrée :** `/home/ubuntu/screenshots/4305-i76hko6sh2agxjz_2026-09-21_02-41-45_4611.webp`  
**Viewport comparé :** 893 × 768 px.

## Résultat pixel brut

La différence brute est de **92.336 %** (633,261 pixels sur 685,824), avec une différence RGB moyenne de [38.513, 41.565, 41.598] et une bounding box couvrant toute la capture `[0, 0, 893, 768]`. Ce chiffre est volontairement strict : il inclut les données de démonstration différentes, l’état vide de l’API locale, l’animation WebGL et le bruit JPEG. Il ne signifie pas que le markup Aurora n’a pas été récupéré.

## Différences constatées

| Zone | Artifact | Wallet intégré | Cause / décision |
|---|---|---|---|
| Solde | `12 480,65 €` | `0,00 €` en preview locale | L’artifact contient un compte de démonstration ; le Wallet attend `wallets.bootstrap`. En session authentifiée, le solde serveur remplace cette valeur. |
| Carte 3D | Carte Aurora bleue visible | Scène sans carte quand `CARDS` est vide | `vtex3d.js` dépend des cartes hydratées ; aucune carte fictive n’a été injectée dans le backend. |
| Activité | Trois mouvements de démonstration | État vide « Aucun mouvement » | `renderTransactions()` conserve le contrat réel et affiche l’état sans données locales. |
| Objectifs | Trois objectifs statiques | Même structure Aurora, alimentable par `renderSavingsGoals()` | Le conteneur est maintenant `#goals-list`; les données backend remplacent les cartes de démonstration après bootstrap. |
| Résumé financier | `+3 200 €`, `−1 780 €`, `+1 420 €` | Valeurs locales ou backend selon session | Le résumé reste piloté par `renderFinancialSummary()`, pas par des chiffres codés en production. |
| Identité | Ariel Kouadio | Ariel Kouadio en preview | Identité de démonstration conservée visuellement ; `applyProfile()` remplace l’identité en session réelle. |
| Navigation | Tabbar propre à l’artifact, boutons démo | Sidebar/tabbar Wallet masquées uniquement sur accueil ; actions réelles `showView()` | L’accueil reprend l’artifact ; les autres vues restent intouchées. |
| Actions de carte | Toasts `à venir` / démo | Handlers Wallet réels pour Cartes, Historique, Envoyer, Recevoir, Banque et objectifs | Branchement métier demandé, sans conserver les faux toasts. |
| Bouton solde | `id=eyeBtn`, `class=eye-btn`, `toggleBalance()` | `id=wtg-eye-wrap`, `class=wtg-eye`, `toggleFinBalance()` | Adaptation sémantique nécessaire pour le contrat Wallet et les tests. |
| Scripts | JavaScript inline autonome de l’artifact | `vtex3d.js`, `vtex-api.js`, `router.js` existants | Les scripts Aurora démo ne sont pas dupliqués ; les scripts de production restent la source fonctionnelle. |
| Cadre | Shell `.shell` max 1240px | Même markup `.shell` et CSS artifact exact activé uniquement sur accueil | Le wrapper `#view-accueil` a été restauré pour le routeur. |

## Vérifications structurelles

- CSS artifact extrait : **23 036 octets environ**, copié dans `apps/wallet/aurora-home.css` puis enrichi seulement de l’alias `.wtg-eye` nécessaire au contrat Wallet.
- Markup artifact accueil installé dans `#view-accueil`; les vues `cartes`, `historique`, `envoyer`, `profil`, etc. restent hors du bloc remplacé.
- Les anciennes couches `aurora.css` et `aurora-wallet.css` ont été supprimées du runtime et du disque.
- La feuille `aurora-home.css` est désactivée hors accueil par `#aurora-home-style` et activée par le contrôleur MutationObserver.
- Contrôle navigateur : après navigation vers Cartes, `#aurora-home-style.disabled === true`, `body.className === ''`, `#view-cartes` conserve son ancien `.vx-page-title`.
- Tests Wallet : **3/3 réussis**. Syntaxes `vtex-api.js` et `router.js` valides.

## Verdict

L’accueil est désormais l’écran Aurora de référence. Les différences pixel restantes sont intentionnelles et principalement dues aux données de démonstration de l’artifact versus l’absence de session backend dans la preview locale. Les autres écrans ne sont pas concernés par cette intégration.
