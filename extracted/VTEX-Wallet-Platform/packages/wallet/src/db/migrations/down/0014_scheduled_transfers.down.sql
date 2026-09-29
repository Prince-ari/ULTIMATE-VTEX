-- Retour arriere de 0014_scheduled_transfers (virements internes programmes / "latents").
-- ATTENTION : tout virement programme en attente est perdu SANS que les fonds reserves soient liberes
-- automatiquement -- verifiez et corrigez manuellement les soldes reserves concernes avant de jouer ceci.
-- Sauvegardez avant (scripts/db-backup.ps1).
DROP TABLE IF EXISTS `scheduled_transfers`;
