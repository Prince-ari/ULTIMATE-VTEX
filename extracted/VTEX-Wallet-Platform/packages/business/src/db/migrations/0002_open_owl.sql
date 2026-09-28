ALTER TABLE `business_topups` MODIFY COLUMN `status` enum('pending','requires_action','processing','succeeded','failed','canceled','refunded') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `business_topups` ADD `refunded_at` datetime;--> statement-breakpoint
ALTER TABLE `business_topups` ADD `refund_reason` varchar(250);