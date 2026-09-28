CREATE TABLE `document_files` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`file_name` varchar(180) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`size_bytes` int NOT NULL,
	`sha256` char(64) NOT NULL,
	`uploaded_by` bigint,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `document_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_files_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
ALTER TABLE `wallet_documents` MODIFY COLUMN `document_type` enum('statement','receipt','contract','identity','account_document','transfer_proof','tax','notice','other') NOT NULL DEFAULT 'statement';--> statement-breakpoint
ALTER TABLE `wallet_documents` MODIFY COLUMN `status` enum('active','revoked','archived') NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `file_id` bigint;--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `wallet_type` enum('PERSONAL','PROFESSIONAL');--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `holder_id` bigint;--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `batch_id` char(36);--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `note` varchar(500);--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `review_status` enum('none','pending','validated','rejected') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `reviewed_by` bigint;--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `reviewed_at` datetime;--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `review_reason` varchar(250);--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `first_viewed_at` datetime;--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD `archived_at` datetime;--> statement-breakpoint
ALTER TABLE `document_files` ADD CONSTRAINT `document_files_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `document_files_sha256_idx` ON `document_files` (`sha256`);--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD CONSTRAINT `wallet_documents_file_id_document_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `document_files`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_documents` ADD CONSTRAINT `wallet_documents_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `wallet_documents_wallet_idx` ON `wallet_documents` (`wallet_type`,`holder_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wallet_documents_batch_idx` ON `wallet_documents` (`batch_id`);--> statement-breakpoint
CREATE INDEX `wallet_documents_review_idx` ON `wallet_documents` (`review_status`,`created_at`);
--> statement-breakpoint
-- Rattrapage : chaque remise existante concerne le wallet personnel de son destinataire ; les justificatifs deja deposes par les titulaires deviennent "a examiner".
UPDATE `wallet_documents` SET `wallet_type` = 'PERSONAL', `holder_id` = `user_id` WHERE `wallet_type` IS NULL;--> statement-breakpoint
UPDATE `wallet_documents` SET `review_status` = 'pending' WHERE `document_type` = 'transfer_proof' AND `source` = 'user' AND `status` = 'active' AND `review_status` = 'none';