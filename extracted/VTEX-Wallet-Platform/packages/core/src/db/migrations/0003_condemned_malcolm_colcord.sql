CREATE TABLE `webauthn_challenges` (
	`user_id` bigint NOT NULL,
	`challenge` varchar(255) NOT NULL,
	`purpose` enum('register','login') NOT NULL,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `webauthn_challenges_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `webauthn_credentials` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`credential_id` varchar(255) NOT NULL,
	`public_key` text NOT NULL,
	`counter` bigint NOT NULL DEFAULT 0,
	`device_name` varchar(100) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`last_used_at` datetime,
	CONSTRAINT `webauthn_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `webauthn_credentials_credential_id_unique` UNIQUE(`credential_id`)
);
--> statement-breakpoint
ALTER TABLE `webauthn_credentials` ADD CONSTRAINT `webauthn_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `webauthn_credentials_user_idx` ON `webauthn_credentials` (`user_id`);