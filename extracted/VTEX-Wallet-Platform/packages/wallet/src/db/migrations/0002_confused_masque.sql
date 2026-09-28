ALTER TABLE `transactions` ADD `card_id` bigint;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_card_id_cards_id_fk` FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `transactions_card_created_idx` ON `transactions` (`card_id`,`created_at`);