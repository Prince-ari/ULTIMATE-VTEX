-- Retour arriere de 0004_api_keys_v1 (cles d'API : expiration, revocation tracee, rotation, derniere adresse ; idempotence des liens crees par l'API).
-- ATTENTION : la trace de revocation, d'expiration et de rotation des cles est perdue. Sauvegardez avant (scripts/db-backup.ps1).
ALTER TABLE `payment_links` DROP INDEX `payment_links_business_idempotency_unique`;
ALTER TABLE `payment_links` DROP COLUMN `idempotency_key`, DROP COLUMN `created_via_key_id`;
ALTER TABLE `api_keys` DROP FOREIGN KEY `api_keys_revoked_by_users_id_fk`;
ALTER TABLE `api_keys` DROP COLUMN `rotated_from_id`, DROP COLUMN `revoke_reason`, DROP COLUMN `revoked_by`, DROP COLUMN `revoked_at`, DROP COLUMN `expires_at`, DROP COLUMN `last_used_ip`;
