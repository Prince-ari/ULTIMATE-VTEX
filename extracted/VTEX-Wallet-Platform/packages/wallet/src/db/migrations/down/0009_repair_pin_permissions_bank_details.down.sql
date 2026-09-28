-- 0009 est une réparation idempotente : elle ne crée que des objets que le schéma exige déjà (wallet_permissions, wallet_bank_details,
-- cards.pin_hash / pin_updated_at). Il n'y a volontairement PAS de retour arrière : les supprimer casserait le service Wallet.
SELECT 'aucune action : migration de réparation' AS note;
