# Validation navigateur — flux média Wallet

Date de recette : 14 août 2026.

Le Wallet servi par le proxy local a été ouvert sur le compte de recette authentifié. La vue **Profil** expose un sélecteur de fichier pour une photo de profil JPEG, PNG ou WebP, la saisie URL HTTPS conservée pour compatibilité, et une section **Mes documents** hydratée depuis le serveur. Aucun document n’étant attribué au compte de recette, l’état vide est explicite et ne présente aucune donnée fictive.

La vue **Recevoir de l’argent** expose le chemin métier complet et le formulaire **Transmettre un justificatif**. Celui-ci accepte PDF, JPEG, PNG et WebP, prévoit une référence de virement facultative et annonce une limite de 8 Mo. La soumission vise le gestionnaire côté serveur ; aucune information de document ou de transaction n’est inventée dans le navigateur.

| Surface contrôlée | Résultat |
|---|---|
| Profil — import direct d’avatar | Sélecteur fichier et commande d’import visibles |
| Profil — documents attribués | État vide serveur visible, sans contenu simulé |
| Réception — remise justificatif | Sélecteur fichier, référence facultative et commande d’envoi visibles |
| Session Wallet | Compte de recette hydraté après authentification |

## Contrôle Dashboard

Le Dashboard a été vérifié avec la session administrateur sur la route **Documents**. La page présente le bouton **Attribuer un PDF**, les indicateurs de documents actifs, PDF attribués, justificatifs reçus et éléments à examiner, ainsi que l’état vide attendu pour une base sans document créé artificiellement. La navigation inclut également les Notifications et le Journal système, surfaces de supervision et d’audit des flux concernés.

| Surface contrôlée | Résultat |
|---|---|
| Dashboard — centre Documents | Accessible à la session administrateur |
| Attribution PDF | Commande visible, aucune donnée fictive soumise |
| Indicateurs de supervision | Tous alimentés par l’état serveur réel : 0 à la recette |
| Audit et notifications | Entrées de navigation disponibles pour la supervision des opérations |

## Contrats serveur validés

La recette automatisée couvre désormais l’import multipart d’un avatar vers une clé privée, le rejet avant stockage d’un format non accepté, la génération de clés cloisonnées, la remise d’un justificatif avec référence, les notifications persistantes ciblant les administrateurs et agents, les événements SSE associés, l’attribution d’un PDF et le refus de téléchargement à un autre titulaire. Les 108 tests Core, dont les recettes média supplémentaires, et les 14 tests Wallet non ignorés ont été exécutés avec succès ; les 2 tests d’intégration Wallet explicitement signalés comme dépendants d’infrastructure restent ignorés.

> Le sandbox ne contient pas le moteur Docker, donc MinIO n’y est pas démarrable. Le comportement S3 est validé au niveau de son contrat d’adaptateur et de ses routes ; la recette de transport réelle s’exécutera au déploiement via les services `minio` et `minio-init` déjà décrits dans Compose.

| Contrat | Résultat de recette |
|---|---|
| Upload multipart avatar | Réponse 201, clé privée et URL interne contrôlée |
| Format média interdit | Rejet 400 avant tout appel de stockage |
| Justificatif de virement | Document et référence persistés ; alertes superviseur persistantes |
| SSE | Événement de remise et événements de notification observés dans le test métier |
| PDF attribué | Résolution autorisée pour le titulaire ; refusée pour un autre utilisateur |
