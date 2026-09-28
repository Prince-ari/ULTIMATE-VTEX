ALTER TABLE `wallet_documents`
  MODIFY COLUMN `content` text NULL,
  MODIFY COLUMN `document_type` enum('statement','receipt','contract','identity','account_document','transfer_proof') NOT NULL DEFAULT 'statement',
  ADD COLUMN `storage_key` varchar(512) NULL AFTER `content`,
  ADD COLUMN `size_bytes` int NULL AFTER `storage_key`,
  ADD COLUMN `source` enum('admin','user') NOT NULL DEFAULT 'admin' AFTER `size_bytes`,
  ADD COLUMN `status` enum('active','revoked') NOT NULL DEFAULT 'active' AFTER `source`,
  ADD COLUMN `uploaded_by` bigint NULL AFTER `status`,
  ADD COLUMN `transaction_reference` varchar(120) NULL AFTER `uploaded_by`,
  ADD COLUMN `metadata` json NULL AFTER `transaction_reference`,
  ADD CONSTRAINT `wallet_documents_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD UNIQUE INDEX `wallet_documents_storage_key_unique` (`storage_key`),
  ADD INDEX `wallet_documents_status_idx` (`status`,`created_at`);
