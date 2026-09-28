# Audit de fiabilité fonctionnelle et dette technique — VTEX Wallet Platform

## Objectif et règle de décision

Cet audit vérifie les fonctionnalités du **Core**, du **Wallet mobile et desktop** et du **Dashboard opérateur** avant correction. Une fonctionnalité n’est considérée comme validée que lorsqu’une preuve reproductible existe : test automatisé réussi, parcours observable sur une API joignable, ou les deux. Une erreur liée à un schéma absent, une clé de service indisponible ou une prévisualisation incomplète est classée comme **blocage d’environnement**, non comme échec métier tant que le défaut ne peut pas être reproduit avec les prérequis réunis.

> Les flux financiers, les rôles, l’OTP, les données sensibles, les contraintes de fichiers et les clés d’idempotence sont des invariants. Aucune correction de dette ne doit les contourner ou les simplifier.

## Périmètre de couverture

| Domaine | Capacités à vérifier | Preuve attendue | Invariant majeur |
|---|---|---|---|
| Authentification | Connexion, OTP, session, limitation de débit, rôles, WebAuthn, déconnexion. | Tests de service, de routeur et de garde d’interface. | Aucune donnée métier sans session autorisée. |
| Wallet titulaire | Bootstrap, comptes, cartes, bénéficiaires, historiques, objectifs, documents, profils et notifications. | Tests de services et parcours d’aperçu non sensibles. | Le navigateur ne fait pas foi pour un solde ou une mutation financière. |
| Transactions | Transferts internes et externes, partage, réservations, validation/rejet, rapprochement, idempotence. | Tests intégrés sur schéma disponible, contrôle des transitions et du ledger. | Montants en centimes, transaction atomique, aucune double exécution. |
| Dashboard | Pilotage, utilisateurs, Wallets, documents, leads, notifications, analytics, support, journal et paramètres. | Tests UI, routeurs et services avec rôles administrateur/agent/utilisateur. | Les droits et confirmations restent appliqués côté serveur. |
| Plateforme | CORS, API tRPC, médias protégés, e-mail OTP, configuration, déploiement et tests. | Tests de configuration, routes et intégrations simulées ou réelles non sensibles. | Secrets et codes OTP ne sont jamais réimprimés. |

## État initial observé

Le monorepo expose des suites dédiées pour le Core, le domaine Wallet, le routeur, les montants, le Dashboard, l’API et le Wallet statique. Le Dashboard et le Wallet disposent également de contrôles visuels et d’accessibilité ciblés. La première exécution exhaustive a toutefois montré que les suites intégrées du Core s’arrêtent sur l’absence de tables dans la base de prévisualisation, notamment `users`. La requête de présence des tables confirme que le schéma n’est pas préparé dans cet environnement.

| Famille de vérification | Couverture déjà disponible | État initial |
|---|---:|---|
| Core | Authentification, session, CORS, environnement, e-mail, services métiers, stockage, WebAuthn. | Partiellement bloqué par schéma non migré. |
| Wallet métier | Accès, autorisation carte, routeur, validations et intégration de transaction. | À réexécuter sur schéma disponible. |
| Dashboard | 10 fichiers de tests UI, filtres, session, notifications et formatage. | Déjà validé au dernier contrôle ciblé ; à rejouer dans la recette globale. |
| Wallet statique | Entrée, vidéo, aperçu et régression UI des contrôles P0. | Déjà validé au dernier contrôle ciblé ; à rejouer dans la recette globale. |
| API Next | Route tRPC et téléversement média. | À exécuter et corréler à une API Core joignable. |

## Échecs et dettes à qualifier

| Référence | Symptôme | Hypothèse initiale | Statut |
|---|---|---|---|
| ENV-01 | Les tests intégrés Core échouent sur `Table ... users doesn't exist`. | Base de prévisualisation sans migration Core/Wallet. | À confirmer puis corriger par migration de schéma ou isolement de la base de test. |
| ENV-02 | La prévisualisation Dashboard obtient des erreurs 500 / connexion refusée pour tRPC. | Service Core/API amont non démarré ou non routé dans le mode de prévisualisation. | À diagnostiquer séparément du comportement des composants Dashboard. |
| TEST-01 | Certains tests de route importent le serveur et exigent une configuration d’environnement réellement injectée. | Configuration de test insuffisamment hermétique. | À qualifier ; ne pas assouplir les règles de production. |
| TD-01 | Les capacités carte visibles doivent toutes être prouvées persistées ou explicitement limitées. | Écart possible entre interactions locales historiques et contrats serveur. | À auditer contrat par contrat. |
| TD-02 | La prévisualisation contient des différences de topologie par rapport au déploiement Compose. | Un seul serveur Dashboard est lancé, sans API métier joignable. | À documenter et corriger si un mode d’intégration local est attendu. |

## Journal de validation

Les sections suivantes seront complétées au fur et à mesure des exécutions, avec le résultat, le prérequis, la cause d’un éventuel échec et le correctif appliqué. Les données de test ne seront jamais injectées dans la base de production ou de prévisualisation partagée.

## Résultats de vérification

| Domaine | Preuve exécutée | Résultat | Portée confirmée |
|---|---|---|---|
| Core | Suite Vitest complète. | **121 tests réussis** dans 25 fichiers. | Authentification, OTP, sessions, refus RBAC, CORS, rate limiting, WebAuthn, utilisateurs, documents, notifications, leads, support, journal, analytics, paramètres, stockage, e-mail et environnement. |
| HTTP Core | Tests E2E sur serveur tRPC local. | **7 tests réussis**. | Paramètres publics, refus sans session, connexion → OTP → session, refus admin d’un utilisateur, déconnexion, création générique et limitation de débit. |
| Wallet métier | Suite unitaire complète. | **14 tests réussis**. | Validation, règles d’accès, autorisation carte et branches tRPC Wallet. |
| Wallet financier | Recette intégrée activée explicitement. | **2 tests réussis**. | Ajustement atomique, écriture ledger, idempotence/rejeu de réponse et refus pour rôle non administrateur. |
| Valeurs monétaires | Suite `@vtex/money`. | **20 tests réussis**. | Calculs monétaires et représentation en unités minimales. |
| Routeur composé | Suite `@vtex/router`. | **1 test réussi**. | Présence exacte des branches Core et Wallet attendues. |
| API Next | Suite route-handler. | **8 tests réussis**. | tRPC public/protégé, connexion HTTP, CORS et route de média. |
| Dashboard | Suite UI et utilitaires. | **82 tests réussis**. | Garde de session, états d’erreur, toasts, tables, filtres, KPI, aperçu, OTP de développement et relais API. |
| Wallet web | Tests statiques UI. | **3 tests réussis**. | Sémantique des contrôles sensibles, reprise et shell desktop. |
| Compilation | `pnpm typecheck` et compilation de production. | **Réussis** lors de l’audit. | Packages TypeScript, API Next, Dashboard Next et Wallet statique. |

## Défauts confirmés et corrections appliquées

| Référence | Constats | Correction | Validation post-correction |
|---|---|---|---|
| DB-01 | La migration initiale utilisait une valeur par défaut JSON rejetée par TiDB serverless, empêchant toute création de table et masquant les tests intégrés. | Les notes de lead sont désormais toujours initialisées explicitement par le service ; le schéma et la migration initiale n’exigent plus de `DEFAULT` JSON. Une migration versionnée aligne les instances existantes. | Les 13 tables Core et les 7 tables Wallet sont créées dans l’environnement d’intégration ; les 121 tests Core passent. |
| DB-02 | La recherche utilisateurs dépendait de `MATCH ... AGAINST`, expression non prise en charge par le moteur TiDB de prévisualisation. | Remplacement par une recherche multi-champs par préfixe, échappée et composée token par token, compatible MySQL et TiDB. | Les 20 tests utilisateurs, y compris la recherche progressive et la non-correspondance de sous-chaîne, passent. |
| TEST-01 | Le test de fenêtre expirée du rate limiter dépendait d’une attente de 50 ms ; la latence réelle de base rendait le résultat non déterministe. | Injection optionnelle de l’horodatage pour le test, sans changer les appelants de production. | Les 7 tests de rate limiting passent, y compris concurrence et réinitialisation de fenêtre. |
| TEST-02 | Les suites HTTP Core et API pouvaient hériter d’un secret JWT local trop court et échouer avant d’exercer leur logique. | Fixtures Vitest non sensibles, de longueur conforme, appliquées seulement si la valeur locale est absente ou invalide. | Tests E2E Core, CORS et route handlers API exécutés et réussis. |
| TEST-03 | Le test du routeur composé conservait l’ancienne attente « Core seul » malgré l’ajout des branches Wallet. | Contrat de test mis à jour pour lister explicitement les branches métier attendues et interdire la branche obsolète `goals`. | Test `@vtex/router` réussi. |
| DEV-01 | Le script de développement lançait le Dashboard sans garantir l’API ; la prévisualisation donnait des 500 tRPC. | Lanceur local coordonné : Dashboard exposé sur 3000, API démarrée en dépendance sur 4000, avec une fixture JWT de développement strictement locale si nécessaire. | Appel `settings.get` à travers `http://127.0.0.1:3000/api/trpc` : **HTTP 200**. |
| DEV-02 | Les routes de proxy Dashboard ne couvraient pas explicitement tRPC et OTP dans la configuration de relais. | Ajout de relais contrôlés pour tRPC, authentification, médias et événements, avec test de présence des routes. | Test Dashboard de relais réussi ; 82 tests Dashboard passent. |
| UI-01 | Le mot-symbole chargé depuis le stockage temporaire renvoyait 404 en prévisualisation. | Les vues Dashboard réutilisent désormais les actifs versionnés sous `/brand/`, avec variantes clair/sombre. | Prévisualisation du Dashboard chargée sans requête de mot-symbole temporaire. |
| PERF-01 | Le navigateur signalait `ChunkLoadError` sur `app/(main)/layout.js` après expiration du téléchargement. Le chunk de développement mesurait environ 9,6 Mo et incluait une bibliothèque d’icônes complète, des menus et le shell interactif. | Le layout est désormais une frontière serveur minimale. Le shell de session charge le rail client de façon asynchrone et ses icônes utilisent une bibliothèque locale ciblée au lieu de l’import monolithique. Les caches Next obsolètes ont été régénérés. | Le chunk critique est ramené à 960 745 octets, sans référence à la bibliothèque d’icônes précédente ; HTTP 200, directive `no-store`, chargement local mesuré à moins de 0,01 s et capture Dashboard réussie. |

## Dette résiduelle et limites de recette

| Priorité | Élément | Risque et décision |
|---|---|---|
| P0 opérationnel | Rotation de la clé Resend précédemment exposée. | La valeur doit être considérée compromise, tournée chez le fournisseur, puis supprimée de tout fichier suivi ou historique accessible. Cette action requiert le propriétaire du compte fournisseur. |
| P1 environnement | Journal de migration de la base de prévisualisation. | Le schéma de recette a été préparé à partir des migrations analysées pour permettre les tests. Le déploiement Docker/Hostinger doit continuer à appliquer les migrations versionnées par ses runners, sur une base vierge ou correctement suivie. |
| P1 produit | Recette utilisateur avec données et identifiants de production. | Les tests n’autorisent pas une opération financière réelle ni l’accès à des données de clients. Une recette contrôlée sur environnement isolé reste requise avant diffusion. |
| P2 UX de recette | Avertissements de test simulant une panne fournisseur e-mail. | Ils sont attendus : les scénarios vérifient que le développement reste exploitable quand le fournisseur échoue. Ils ne masquent aucun échec de test ni envoi réel. |
| P2 build | Avertissements Next sur des balises `<img>` dans des composants Dashboard. | La compilation réussit. Une optimisation `next/image` peut être planifiée lorsque les contraintes de tailles et de domaine des actifs sont stabilisées. |

> **Conclusion de contrôle.** Toutes les fonctionnalités disposant d’une preuve automatisable dans cet environnement sont validées après correction. Les limites restantes relèvent de la rotation de secret, de la recette sur données réelles et de la mise en production — elles ne doivent pas être confondues avec des défauts fonctionnels non résolus.
