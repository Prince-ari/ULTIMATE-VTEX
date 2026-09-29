-- Retour arriere de 0012_transfer_codes (verrouillage des virements + codes de deblocage/validation).
-- ATTENTION : toute demande de deblocage en cours et tout code emis sont perdus ; le verrouillage des comptes
-- neufs disparait (plus aucun compte ne demarrera verrouille tant que cette migration n'est pas rejouee).
-- Sauvegardez avant (scripts/db-backup.ps1).
DROP TABLE IF EXISTS `transfer_codes`;
--> statement-breakpoint
ALTER TABLE `wallet_accounts` DROP COLUMN `unlock_requested_at`;
--> statement-breakpoint
ALTER TABLE `wallet_accounts` DROP COLUMN `transfers_locked`;
