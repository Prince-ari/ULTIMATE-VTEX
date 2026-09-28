-- Retour arrière MANUEL de 0008_admin_foundation (Drizzle ne génère pas de « down »).
-- À exécuter uniquement après avoir sauvegardé la base (scripts/db-backup.ps1).
-- Le rétrécissement de l'enum `role` échoue (volontairement) s'il existe encore des utilisateurs `super_admin` / `account_manager` :
-- les rétrograder d'abord (UPDATE users SET role = 'admin' WHERE role = 'super_admin'; ... 'agent' WHERE role = 'account_manager').
DROP INDEX `logs_holder_idx` ON `logs`;
ALTER TABLE `logs` DROP COLUMN `support_session_id`, DROP COLUMN `holder_id`, DROP COLUMN `wallet_type`, DROP COLUMN `request_id`, DROP COLUMN `ip`, DROP COLUMN `session_jti`, DROP COLUMN `actor_role`;
ALTER TABLE `otp_codes` DROP COLUMN `attempts`, DROP COLUMN `code_hash`;
ALTER TABLE `users` DROP COLUMN `locked_until`, DROP COLUMN `failed_login_count`, DROP COLUMN `temp_password_expires_at`, DROP COLUMN `password_changed_at`, DROP COLUMN `must_change_password`, DROP COLUMN `last_active_at`;
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','agent','user') NOT NULL DEFAULT 'user';
DELETE FROM `__drizzle_migrations_core` WHERE `created_at` = 1790349844622;
