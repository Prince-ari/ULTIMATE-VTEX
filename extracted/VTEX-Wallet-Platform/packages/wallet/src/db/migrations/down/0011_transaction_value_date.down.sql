-- Retour arriere de 0011_transaction_value_date (date de valeur affichable, distincte de created_at).
-- ATTENTION : toute date de valeur personnalisee deja enregistree est perdue ; l'affichage retombe sur created_at.
-- Sauvegardez avant (scripts/db-backup.ps1).
ALTER TABLE `transactions` DROP COLUMN `value_date`;
