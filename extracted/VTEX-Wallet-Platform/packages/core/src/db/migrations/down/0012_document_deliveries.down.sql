-- Retour arriere de 0012_document_deliveries (fichiers partages, remises multi-wallets, validation, archivage).
-- ATTENTION : les remises creees depuis (file_id renseigne, storage_key NULL) perdent leur fichier ; les colonnes de revue et d'archivage sont perdues.
-- Les remises historiques (storage_key renseigne) restent intactes. Les statuts 'archived' redeviennent 'revoked' ; les types tax/notice/other redeviennent 'account_document'.
-- Sauvegardez avant (scripts/db-backup.ps1).
UPDATE `wallet_documents` SET `status` = 'revoked' WHERE `status` = 'archived';
UPDATE `wallet_documents` SET `document_type` = 'account_document' WHERE `document_type` IN ('tax','notice','other');
ALTER TABLE `wallet_documents` DROP FOREIGN KEY `wallet_documents_file_id_document_files_id_fk`;
ALTER TABLE `wallet_documents` DROP FOREIGN KEY `wallet_documents_reviewed_by_users_id_fk`;
DROP INDEX `wallet_documents_wallet_idx` ON `wallet_documents`;
DROP INDEX `wallet_documents_batch_idx` ON `wallet_documents`;
DROP INDEX `wallet_documents_review_idx` ON `wallet_documents`;
ALTER TABLE `wallet_documents` DROP COLUMN `archived_at`, DROP COLUMN `first_viewed_at`, DROP COLUMN `review_reason`, DROP COLUMN `reviewed_at`, DROP COLUMN `reviewed_by`, DROP COLUMN `review_status`, DROP COLUMN `note`, DROP COLUMN `batch_id`, DROP COLUMN `holder_id`, DROP COLUMN `wallet_type`, DROP COLUMN `file_id`;
ALTER TABLE `wallet_documents` MODIFY COLUMN `status` enum('active','revoked') NOT NULL DEFAULT 'active';
ALTER TABLE `wallet_documents` MODIFY COLUMN `document_type` enum('statement','receipt','contract','identity','account_document','transfer_proof') NOT NULL DEFAULT 'statement';
DROP TABLE IF EXISTS `document_files`;