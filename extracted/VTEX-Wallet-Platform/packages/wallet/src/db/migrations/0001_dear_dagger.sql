CREATE INDEX `wallet_ledger_entries_transaction_kind_idx` ON `wallet_ledger_entries` (`transaction_id`,`entry_kind`);--> statement-breakpoint
ALTER TABLE `wallet_ledger_entries` DROP INDEX `wallet_ledger_entries_transaction_kind_unique`;--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `type` enum('transfer_internal','transfer_external','split_debit','split_credit','savings_deposit','savings_withdrawal','card_payment','fee','adjustment') NOT NULL;--> statement-breakpoint
ALTER TABLE `wallet_accounts` MODIFY COLUMN `iban` char(34);
