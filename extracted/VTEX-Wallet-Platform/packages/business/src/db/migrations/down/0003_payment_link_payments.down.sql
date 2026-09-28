-- Retour arriere de 0003_payment_link_payments (Wallet Pro : liens de paiement attribues + paiements publics).
-- ATTENTION : l'historique des paiements par lien public est perdu. Sauvegardez avant (scripts/db-backup.ps1).
DROP TABLE IF EXISTS `payment_link_payments`;
ALTER TABLE `payment_links` DROP FOREIGN KEY `payment_links_updated_by_users_id_fk`;
DROP INDEX `payment_links_target_idx` ON `payment_links`;
ALTER TABLE `payment_links` DROP COLUMN `updated_by`, DROP COLUMN `expires_at`, DROP COLUMN `description`, DROP COLUMN `target_account_id`;
UPDATE `payment_links` SET `status` = 'draft' WHERE `status` = 'disabled';
ALTER TABLE `payment_links` MODIFY COLUMN `status` enum('active','expired','draft') NOT NULL DEFAULT 'draft';