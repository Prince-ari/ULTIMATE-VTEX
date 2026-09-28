CREATE TABLE IF NOT EXISTS `wallet_permissions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `permission` ENUM('wallet.read','wallet.accounts.manage','wallet.cards.manage','wallet.cards.pin','wallet.transactions.review','wallet.transactions.adjust','wallet.beneficiaries.manage','wallet.savings.manage','wallet.emergency') NOT NULL,
  `allowed` BOOLEAN NOT NULL DEFAULT FALSE,
  `updated_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_permissions_user_permission_unique` (`user_id`, `permission`),
  KEY `wallet_permissions_user_idx` (`user_id`),
  CONSTRAINT `wallet_permissions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wallet_permissions_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);
