CREATE TABLE IF NOT EXISTS `wallet_documents` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `user_id` bigint NOT NULL,
  `title` varchar(180) NOT NULL,
  `document_type` enum('statement','receipt','contract','identity') NOT NULL DEFAULT 'statement',
  `file_name` varchar(180) NOT NULL,
  `mime_type` varchar(120) NOT NULL DEFAULT 'text/plain; charset=utf-8',
  `content` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `wallet_documents_id` PRIMARY KEY(`id`),
  CONSTRAINT `wallet_documents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action,
  INDEX `wallet_documents_user_idx` (`user_id`, `created_at`)
);
