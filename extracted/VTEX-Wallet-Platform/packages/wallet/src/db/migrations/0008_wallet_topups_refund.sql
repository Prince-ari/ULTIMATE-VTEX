ALTER TABLE `wallet_topups` MODIFY COLUMN `status` ENUM('pending','requires_action','processing','succeeded','failed','canceled','refunded') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `wallet_topups` ADD `refunded_at` DATETIME NULL;--> statement-breakpoint
ALTER TABLE `wallet_topups` ADD `refund_reason` VARCHAR(250) NULL;
