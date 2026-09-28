-- Retour arriere de 0013_support_sessions (sessions d'acces support/admin a un wallet, Sprint 8).
-- ATTENTION : l'historique des sessions d'acces (qui a consulte/agi sur quel wallet, quand, pourquoi) est perdu.
-- La colonne logs.support_session_id (ajoutee des le Sprint 1) redevient orpheline mais n'est pas supprimee :
-- elle n'a pas de contrainte de cle etrangere vers cette table.
-- Sauvegardez avant (scripts/db-backup.ps1).
DROP TABLE IF EXISTS `support_sessions`;
