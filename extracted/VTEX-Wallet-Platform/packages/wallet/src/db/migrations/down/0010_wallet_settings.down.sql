-- Retour arrière MANUEL de 0010_wallet_settings (sauvegarder la base avant : scripts/db-backup.ps1).
DROP TABLE IF EXISTS `wallet_settings`;
DELETE FROM `__drizzle_migrations_wallet` WHERE `created_at` = 1790410000000;
