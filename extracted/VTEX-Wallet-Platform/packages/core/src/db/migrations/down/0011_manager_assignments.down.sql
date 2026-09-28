-- Retour arriere de 0011_manager_assignments (attributions gestionnaire <-> wallet ; suggestions dans notifications).
-- ATTENTION : les attributions sont perdues, et les suggestions deviennent de simples notifications (colonnes kind / wallet_type / holder_id supprimees).
-- Sauvegardez avant (scripts/db-backup.ps1).
DROP TABLE IF EXISTS `manager_assignments`;
-- La cle etrangere created_by s'appuyait sur l'index composite ajoute par la migration : on lui rend un index dedie avant de le supprimer.
ALTER TABLE `notifications` ADD INDEX `notifications_created_by_users_id_fk` (`created_by`);
DROP INDEX IF EXISTS `notifications_sender_idx` ON `notifications`;
DROP INDEX IF EXISTS `notifications_kind_wallet_idx` ON `notifications`;
ALTER TABLE `notifications` DROP COLUMN `holder_id`, DROP COLUMN `wallet_type`, DROP COLUMN `kind`;