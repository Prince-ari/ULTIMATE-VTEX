-- Retour arriere de 0010_bank_accounts : supprime la table des RIB / sous-RIB.
-- ATTENTION : les sous-RIB (IBAN virtuels) n'existent que dans cette table et sont perdus ; les RIB principaux restent dans les colonnes iban/bic des comptes (ecriture jumelee).
-- Sauvegardez avant (scripts/db-backup.ps1).
DROP TABLE IF EXISTS `bank_accounts`;
