-- Retour arriere de 0013_wallet_display_name (nom affiche aux contreparties d'un virement).
-- ATTENTION : tout nom personnalise deja enregistre est perdu ; l'affichage retombe sur le nom legal.
-- Sauvegardez avant (scripts/db-backup.ps1).
ALTER TABLE `wallet_settings` DROP COLUMN `display_name`;
