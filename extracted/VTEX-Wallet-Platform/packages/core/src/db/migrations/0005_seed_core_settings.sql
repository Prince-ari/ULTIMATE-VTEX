INSERT INTO `settings` (`id`, `platform_name`, `logo_url`, `default_theme`, `maintenance_mode`, `maintenance_message`, `support_email`)
SELECT 1, 'VTEX', NULL, 'light', 0, NULL, 'support@example.com'
WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `id` = 1);
