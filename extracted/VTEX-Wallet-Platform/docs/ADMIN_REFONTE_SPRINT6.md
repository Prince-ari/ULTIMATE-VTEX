# Sprint 6 — Documents

## Périmètre
Envoi de documents du Dashboard vers un ou plusieurs wallets (personnels ou Pro), réception côté titulaire / entreprise, pièces remises par les titulaires (examen), archivage, traçabilité.

## Modèle (migration core `0012_document_deliveries`, réversible : `down/0012_document_deliveries.down.sql`)
- `document_files` : un fichier stocké UNE fois (clé privée, SHA-256, type vérifié, taille, expéditeur).
- `wallet_documents` étendu : `wallet_type` + `holder_id` (wallet concerné), `file_id`, `batch_id` (un envoi = N remises), `note`, catégories (+ `tax`, `notice`, `other`), statut `archived`, examen (`review_status` none|pending|validated|rejected, `reviewed_by/at`, `review_reason`), `first_viewed_at`, `archived_at`. Rattrapage : wallets personnels des remises existantes, justificatifs de titulaires « à examiner ».

## Droits (RBAC serveur)
`documents.read` (SUPPORT, ADMIN, SUPER_ADMIN, GESTIONNAIRE — ce dernier limité à ses wallets attribués), `documents.send` (ADMIN, SUPER_ADMIN, GESTIONNAIRE dans son périmètre — un seul wallet hors périmètre annule tout l'envoi), `documents.review` et `documents.archive` (ADMIN, SUPER_ADMIN). Hors périmètre : « introuvable », jamais « interdit ».

## API (`admin.documents.*`)
`send`, `list`, `get` (empreinte + historique d'audit), `review` (compare-and-swap : une seule décision, refus motivé ≥ 8 caractères), `setStatus` (archiver / retirer / rétablir, motif obligatoire), `targets`.

## Sécurité fichiers
- Stockage : S3 en production (échec fermé), dossier local `.data/media` (ou `VTEX_MEDIA_LOCAL_DIR`) en développement — à ne pas déployer ni versionner.
- Téléversement (`/api/media/upload`) : session, mot de passe temporaire remplacé, limite 20/min, type + taille + **signature du contenu** (PDF/JPEG/PNG/WebP), nom nettoyé, `admin-document` par permission `documents.send`. Le serveur revérifie le contenu à l'envoi.
- Téléchargement (`/api/media/documents/{id}`) : destinataire actif, personnel autorisé ou gestionnaire dans son périmètre ; `attachment`, `nosniff`, `no-store`, `CSP default-src 'none'; sandbox`, `CORP same-origin` ; chaque ouverture est journalisée (rôle, IP, session). Relais Wallet Pro : `apps/business/src/app/api/media/documents/[id]/route.ts`.
- Aucune clé de stockage ni empreinte n'est exposée aux titulaires ni dans les listes.
- Les routes API importent tout depuis `@vtex/core` (mêmes classes d'erreur et même contexte d'audit que les services).

## Interfaces (Leg Day)
Dashboard `/documents` (KPI, filtres, lignes, fiche, dépôt de fichier, sélecteur de wallets), Wallet Pro `/documents`, Wallet personnel (catégorie, note, statut d'examen).

## Tests
Routeur `adminDocuments.test.ts` (5), API `upload/route.test.ts` (5), Dashboard `documentFormat.test.ts`, e2e `scripts/documents-e2e.mjs`.
