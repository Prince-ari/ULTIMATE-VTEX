-- Retour arrière de 0009_card_vault : supprime le coffre de cartes.
-- ATTENTION : les numéros / CVV / PIN chiffrés sont perdus (ils ne sont ni sauvegardés ni reconstructibles). Sauvegardez avant (scripts/db-backup.ps1).
DROP TABLE IF EXISTS `card_vault`;
