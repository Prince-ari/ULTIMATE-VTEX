CREATE TABLE `api_keys` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`label` varchar(100) NOT NULL,
	`key_prefix` varchar(12) NOT NULL,
	`key_hash` varchar(128) NOT NULL,
	`mode` enum('live','sandbox') NOT NULL DEFAULT 'sandbox',
	`scopes` json NOT NULL,
	`last_used_at` datetime,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`created_by` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`name` varchar(120) NOT NULL,
	`client_id` varchar(64) NOT NULL,
	`client_secret_hash` varchar(128) NOT NULL,
	`redirect_uris` json NOT NULL,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `applications_client_id_unique` UNIQUE(`client_id`)
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`kind` enum('payout','payout_batch','refund','team_invite','api_key') NOT NULL,
	`target_id` bigint NOT NULL,
	`requested_by` bigint NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reason` varchar(250),
	`approved_by` bigint,
	`approved_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_cards` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_wallet_account_id` bigint NOT NULL,
	`assigned_to_user_id` bigint,
	`cardholder_name` varchar(140) NOT NULL,
	`last_four` char(4) NOT NULL,
	`network` enum('visa','mastercard','cb') NOT NULL DEFAULT 'visa',
	`label` varchar(80) NOT NULL DEFAULT 'Carte VTEX Business',
	`theme` enum('navy','teal','brick') NOT NULL DEFAULT 'navy',
	`token_reference` varchar(160) NOT NULL,
	`status` enum('active','frozen','expired','cancelled') NOT NULL DEFAULT 'active',
	`daily_limit_cents` bigint NOT NULL DEFAULT 200000,
	`monthly_limit_cents` bigint NOT NULL DEFAULT 1000000,
	`per_transaction_limit_cents` bigint NOT NULL DEFAULT 100000,
	`online_payments_enabled` boolean NOT NULL DEFAULT true,
	`contactless_enabled` boolean NOT NULL DEFAULT true,
	`cash_withdrawal_enabled` boolean NOT NULL DEFAULT false,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_cards_token_reference_unique` UNIQUE(`token_reference`)
);
--> statement-breakpoint
CREATE TABLE `business_ledger_entries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_wallet_account_id` bigint NOT NULL,
	`transaction_id` bigint NOT NULL,
	`entry_kind` enum('available','reserved') NOT NULL DEFAULT 'available',
	`delta_cents` bigint NOT NULL,
	`balance_after_cents` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_ledger_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_members` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`role` enum('owner','admin','finance','support','viewer') NOT NULL DEFAULT 'viewer',
	`status` enum('active','invited','suspended') NOT NULL DEFAULT 'invited',
	`invited_by` bigint,
	`last_active_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_members_business_user_unique` UNIQUE(`business_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `business_settings` (
	`business_id` bigint NOT NULL,
	`checkout_brand_color` char(7) NOT NULL DEFAULT '#8EA9FF',
	`invoice_prefix` varchar(12) NOT NULL DEFAULT 'INV',
	`default_currency` char(3) NOT NULL DEFAULT 'EUR',
	`notify_email` boolean NOT NULL DEFAULT true,
	`notify_sms` boolean NOT NULL DEFAULT false,
	`notify_push` boolean NOT NULL DEFAULT true,
	`require_2fa` boolean NOT NULL DEFAULT false,
	`ip_allowlist` json DEFAULT ('[]'),
	`session_timeout_minutes` int NOT NULL DEFAULT 60,
	`integrations` json DEFAULT ('{}'),
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_settings_business_id` PRIMARY KEY(`business_id`)
);
--> statement-breakpoint
CREATE TABLE `business_transactions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`reference` varchar(64) NOT NULL,
	`idempotency_key` varchar(100),
	`business_id` bigint NOT NULL,
	`business_wallet_account_id` bigint NOT NULL,
	`card_id` bigint,
	`initiated_by_user_id` bigint NOT NULL,
	`type` enum('payout','transfer','card_payment','invoice_payment','payment_link','checkout','fee','adjustment','refund') NOT NULL,
	`direction` enum('debit','credit') NOT NULL,
	`status` enum('pending','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`amount_cents` bigint NOT NULL,
	`fee_cents` bigint NOT NULL DEFAULT 0,
	`currency` char(3) NOT NULL,
	`description` varchar(250),
	`metadata` json,
	`completed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_transactions_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `business_wallet_accounts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`label` varchar(100) NOT NULL DEFAULT 'Compte principal',
	`iban` char(34),
	`bic` char(11),
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`available_balance_cents` bigint NOT NULL DEFAULT 0,
	`reserved_balance_cents` bigint NOT NULL DEFAULT 0,
	`status` enum('active','frozen','closed') NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_wallet_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_wallet_accounts_iban_unique` UNIQUE(`iban`)
);
--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`owner_user_id` bigint NOT NULL,
	`legal_name` varchar(160) NOT NULL,
	`brand_name` varchar(100) NOT NULL,
	`industry` varchar(100),
	`siren` varchar(20),
	`vat_id` varchar(32),
	`address` varchar(250),
	`email` varchar(160),
	`phone` varchar(32),
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`logo_url` varchar(300),
	`status` enum('active','suspended','closed') NOT NULL DEFAULT 'active',
	`verified_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `businesses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chargebacks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`dispute_id` bigint,
	`network` enum('visa','mastercard','cb') NOT NULL DEFAULT 'visa',
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`reference` varchar(64) NOT NULL,
	`status` enum('open','accepted','represented','won','lost') NOT NULL DEFAULT 'open',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `chargebacks_id` PRIMARY KEY(`id`),
	CONSTRAINT `chargebacks_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(160),
	`phone` varchar(32),
	`company` varchar(160),
	`address` varchar(250),
	`status` enum('active','blocked') NOT NULL DEFAULT 'active',
	`total_spent_cents` bigint NOT NULL DEFAULT 0,
	`orders_count` int NOT NULL DEFAULT 0,
	`notes` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`transaction_id` bigint,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`reason` varchar(250) NOT NULL,
	`status` enum('open','under_review','won','lost') NOT NULL DEFAULT 'open',
	`evidence_due_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `disputes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `estimate_items` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`estimate_id` bigint NOT NULL,
	`description` varchar(250) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_price_cents` bigint NOT NULL,
	`total_cents` bigint NOT NULL,
	CONSTRAINT `estimate_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `estimates` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`number` varchar(32) NOT NULL,
	`customer_id` bigint NOT NULL,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`status` enum('draft','sent','accepted','declined','expired') NOT NULL DEFAULT 'draft',
	`valid_until` datetime,
	`converted_invoice_id` bigint,
	`created_by` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `estimates_id` PRIMARY KEY(`id`),
	CONSTRAINT `estimates_business_number_unique` UNIQUE(`business_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`invoice_id` bigint NOT NULL,
	`description` varchar(250) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_price_cents` bigint NOT NULL,
	`total_cents` bigint NOT NULL,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`invoice_id` bigint NOT NULL,
	`amount_cents` bigint NOT NULL,
	`method` enum('card','transfer','payment_link','manual') NOT NULL DEFAULT 'manual',
	`reference` varchar(64),
	`paid_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `invoice_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`number` varchar(32) NOT NULL,
	`customer_id` bigint NOT NULL,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`status` enum('draft','sent','viewed','partial','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
	`issued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`due_at` datetime NOT NULL,
	`description` varchar(250),
	`created_by` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_business_number_unique` UNIQUE(`business_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`order_id` bigint NOT NULL,
	`product_id` bigint,
	`description` varchar(250) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_price_cents` bigint NOT NULL,
	`total_cents` bigint NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`number` varchar(32) NOT NULL,
	`customer_id` bigint,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`channel` enum('pos','online','manual') NOT NULL DEFAULT 'online',
	`status` enum('pending','paid','fulfilled','refunded','cancelled') NOT NULL DEFAULT 'pending',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_business_number_unique` UNIQUE(`business_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `payment_link_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`payment_link_id` bigint NOT NULL,
	`kind` enum('visit','payment') NOT NULL,
	`amount_cents` bigint,
	`customer_id` bigint,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payment_link_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_links` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`slug` varchar(24) NOT NULL,
	`name` varchar(160) NOT NULL,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`mode` enum('unique','recurring') NOT NULL DEFAULT 'unique',
	`status` enum('active','expired','draft') NOT NULL DEFAULT 'draft',
	`created_by` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payment_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_links_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `payout_batches` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`label` varchar(120) NOT NULL,
	`total_cents` bigint NOT NULL DEFAULT 0,
	`items_count` int NOT NULL DEFAULT 0,
	`status` enum('draft','pending_approval','processing','completed','failed') NOT NULL DEFAULT 'draft',
	`created_by` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payout_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`batch_id` bigint,
	`beneficiary_name` varchar(160) NOT NULL,
	`iban` char(34) NOT NULL,
	`bic` char(11),
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`reference` varchar(64) NOT NULL,
	`status` enum('pending_approval','approved','rejected','processing','completed','failed') NOT NULL DEFAULT 'pending_approval',
	`requested_by` bigint NOT NULL,
	`approved_by` bigint,
	`approved_at` datetime,
	`transaction_id` bigint,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payouts_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`name` varchar(160) NOT NULL,
	`sku` varchar(64),
	`price_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`stock` int NOT NULL DEFAULT 0,
	`category` varchar(100),
	`description` varchar(500),
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_business_sku_unique` UNIQUE(`business_id`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `risk_flags` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`transaction_id` bigint,
	`kind` enum('velocity','geo','amount','device') NOT NULL,
	`severity` enum('low','medium','high') NOT NULL DEFAULT 'low',
	`status` enum('open','dismissed','confirmed') NOT NULL DEFAULT 'open',
	`description` varchar(250) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`resolved_at` datetime,
	CONSTRAINT `risk_flags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`customer_id` bigint NOT NULL,
	`plan_name` varchar(120) NOT NULL,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`interval` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
	`status` enum('active','paused','cancelled','past_due') NOT NULL DEFAULT 'active',
	`current_period_start` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`current_period_end` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`webhook_id` bigint NOT NULL,
	`event` varchar(80) NOT NULL,
	`payload` json,
	`status_code` int,
	`success` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`business_id` bigint NOT NULL,
	`url` varchar(300) NOT NULL,
	`events` json NOT NULL,
	`secret` varchar(64) NOT NULL,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`last_delivery_at` datetime,
	`last_status_code` int,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `applications` ADD CONSTRAINT `applications_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cards` ADD CONSTRAINT `business_cards_assigned_to_user_id_users_id_fk` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_cards` ADD CONSTRAINT `business_cards_wallet_account_fk` FOREIGN KEY (`business_wallet_account_id`) REFERENCES `business_wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_ledger_entries` ADD CONSTRAINT `business_ledger_entries_wallet_account_fk` FOREIGN KEY (`business_wallet_account_id`) REFERENCES `business_wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_ledger_entries` ADD CONSTRAINT `business_ledger_entries_transaction_fk` FOREIGN KEY (`transaction_id`) REFERENCES `business_transactions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_members` ADD CONSTRAINT `business_members_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_members` ADD CONSTRAINT `business_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_members` ADD CONSTRAINT `business_members_invited_by_users_id_fk` FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_settings` ADD CONSTRAINT `business_settings_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_transactions` ADD CONSTRAINT `business_transactions_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_transactions` ADD CONSTRAINT `business_transactions_card_id_business_cards_id_fk` FOREIGN KEY (`card_id`) REFERENCES `business_cards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_transactions` ADD CONSTRAINT `business_transactions_initiated_by_user_id_users_id_fk` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_transactions` ADD CONSTRAINT `business_transactions_wallet_account_fk` FOREIGN KEY (`business_wallet_account_id`) REFERENCES `business_wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_wallet_accounts` ADD CONSTRAINT `business_wallet_accounts_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chargebacks` ADD CONSTRAINT `chargebacks_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chargebacks` ADD CONSTRAINT `chargebacks_dispute_id_disputes_id_fk` FOREIGN KEY (`dispute_id`) REFERENCES `disputes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `disputes` ADD CONSTRAINT `disputes_transaction_id_business_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `business_transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estimate_items` ADD CONSTRAINT `estimate_items_estimate_id_estimates_id_fk` FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estimates` ADD CONSTRAINT `estimates_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estimates` ADD CONSTRAINT `estimates_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estimates` ADD CONSTRAINT `estimates_converted_invoice_id_invoices_id_fk` FOREIGN KEY (`converted_invoice_id`) REFERENCES `invoices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estimates` ADD CONSTRAINT `estimates_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_payments` ADD CONSTRAINT `invoice_payments_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_link_events` ADD CONSTRAINT `payment_link_events_payment_link_id_payment_links_id_fk` FOREIGN KEY (`payment_link_id`) REFERENCES `payment_links`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_link_events` ADD CONSTRAINT `payment_link_events_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_batches` ADD CONSTRAINT `payout_batches_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_batches` ADD CONSTRAINT `payout_batches_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_batch_id_payout_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `payout_batches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_transaction_id_business_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `business_transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `risk_flags` ADD CONSTRAINT `risk_flags_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `risk_flags` ADD CONSTRAINT `risk_flags_transaction_id_business_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `business_transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_webhook_id_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhooks` ADD CONSTRAINT `webhooks_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `api_keys_business_idx` ON `api_keys` (`business_id`);--> statement-breakpoint
CREATE INDEX `applications_business_idx` ON `applications` (`business_id`);--> statement-breakpoint
CREATE INDEX `approvals_business_status_idx` ON `approvals` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `approvals_target_idx` ON `approvals` (`kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `business_cards_account_idx` ON `business_cards` (`business_wallet_account_id`);--> statement-breakpoint
CREATE INDEX `business_ledger_entries_account_created_idx` ON `business_ledger_entries` (`business_wallet_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `business_members_business_role_idx` ON `business_members` (`business_id`,`role`);--> statement-breakpoint
CREATE INDEX `business_transactions_business_created_idx` ON `business_transactions` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `business_transactions_account_created_idx` ON `business_transactions` (`business_wallet_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `business_transactions_status_idx` ON `business_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `business_wallet_accounts_business_idx` ON `business_wallet_accounts` (`business_id`);--> statement-breakpoint
CREATE INDEX `businesses_owner_idx` ON `businesses` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `businesses_status_idx` ON `businesses` (`status`);--> statement-breakpoint
CREATE INDEX `chargebacks_business_status_idx` ON `chargebacks` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `customers_business_idx` ON `customers` (`business_id`);--> statement-breakpoint
CREATE INDEX `customers_business_email_idx` ON `customers` (`business_id`,`email`);--> statement-breakpoint
CREATE INDEX `disputes_business_status_idx` ON `disputes` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `estimate_items_estimate_idx` ON `estimate_items` (`estimate_id`);--> statement-breakpoint
CREATE INDEX `estimates_business_status_idx` ON `estimates` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_payments_invoice_idx` ON `invoice_payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoices_business_status_idx` ON `invoices` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `invoices_customer_idx` ON `invoices` (`customer_id`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `orders_business_status_idx` ON `orders` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `payment_link_events_link_kind_idx` ON `payment_link_events` (`payment_link_id`,`kind`);--> statement-breakpoint
CREATE INDEX `payment_links_business_idx` ON `payment_links` (`business_id`);--> statement-breakpoint
CREATE INDEX `payout_batches_business_idx` ON `payout_batches` (`business_id`);--> statement-breakpoint
CREATE INDEX `payouts_business_status_idx` ON `payouts` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `payouts_batch_idx` ON `payouts` (`batch_id`);--> statement-breakpoint
CREATE INDEX `products_business_idx` ON `products` (`business_id`);--> statement-breakpoint
CREATE INDEX `risk_flags_business_status_idx` ON `risk_flags` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_business_status_idx` ON `subscriptions` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_webhook_idx` ON `webhook_deliveries` (`webhook_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `webhooks_business_idx` ON `webhooks` (`business_id`);