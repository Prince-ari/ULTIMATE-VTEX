-- Retour arriere de 0014_document_rib_category (ajout de la categorie "rib" aux documents wallet).
-- ATTENTION : si des documents ont deja ete enregistres avec document_type = 'rib', cette migration
-- echouera (valeur enum inconnue apres coup) tant qu'ils n'ont pas ete reclasses (ex. 'account_document').
-- Sauvegardez avant (scripts/db-backup.ps1).
ALTER TABLE `wallet_documents` MODIFY COLUMN `document_type` enum('statement','receipt','contract','identity','account_document','transfer_proof','tax','notice','other') NOT NULL DEFAULT 'statement';
