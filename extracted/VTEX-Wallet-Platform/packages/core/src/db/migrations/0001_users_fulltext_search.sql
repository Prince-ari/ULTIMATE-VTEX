-- Index de préfixe portable MySQL/TiDB. La recherche applicative utilise LIKE
-- préfixé par token afin de conserver la saisie progressive sans MATCH AGAINST.
CREATE INDEX `users_search_idx` ON `users` (`first_name`, `last_name`, `email`);
