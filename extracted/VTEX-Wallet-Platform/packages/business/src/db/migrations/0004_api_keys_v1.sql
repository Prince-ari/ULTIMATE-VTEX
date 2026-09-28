ALTER TABLE `api_keys` ADD `last_used_ip` varchar(45);--> statement-breakpoint
ALTER TABLE `api_keys` ADD `expires_at` datetime;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `revoked_at` datetime;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `revoked_by` bigint;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `revoke_reason` varchar(250);--> statement-breakpoint
ALTER TABLE `api_keys` ADD `rotated_from_id` bigint;--> statement-breakpoint
ALTER TABLE `payment_links` ADD `created_via_key_id` bigint;--> statement-breakpoint
ALTER TABLE `payment_links` ADD `idempotency_key` varchar(100);--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_business_idempotency_unique` UNIQUE(`business_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_revoked_by_users_id_fk` FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;