# Notes de validation

La vérification visuelle du Wallet v4 dans son application statique confirme que l’écran de connexion se charge correctement. Le conteneur applicatif est une racine `.phone` contenant les vues du Wallet, dont `#view-login` constitue l’écran de session.

À la suite de cette vérification, le client `vtex-api.js` impose une garde de session côté interface : en l’absence de cookie HttpOnly validé par le Core, les vues financières sont masquées et toute navigation vers une vue applicative est redirigée vers la connexion. Ainsi, aucune donnée de démonstration restante ne doit être visible ni actionnable hors session.

La prévisualisation managée du Dashboard ne démarre pas le service API séparé ; le proxy de Dashboard renvoie donc `ECONNREFUSED` vers son URL API locale. Cette limite ne s’applique pas à la topologie Docker Hostinger, où Nginx, le Dashboard et l’API sont des services Compose reliés par le réseau interne.

La recette locale MariaDB a appliqué les migrations Core et Wallet, créé le compte administrateur initial depuis les variables d’environnement, puis validé la connexion via l’API réelle. Le mot de passe est vérifié par hash, l’OTP est exigé, et le pont HTTP pose le cookie `vtex_session` HttpOnly. Le premier bootstrap Wallet crée automatiquement le compte de règlement et la carte virtuelle rattachée au profil authentifié.

La vérification dans le navigateur a confirmé le parcours Wallet jusqu’à la session authentifiée. Elle a également permis de corriger les deux appels tRPC de lecture qui devaient employer GET, puis de retirer les derniers montants, objectifs et recommandations statiques visibles sur l’accueil. Le résumé est maintenant dérivé des transactions, cartes et objectifs retournés par le serveur.

La capture de recette Wallet affiche le compte « Administrateur VTEX » réellement authentifié, sa carte virtuelle provisionnée, des statistiques à zéro correspondant à la base vierge et les états vides serveur. Le Dashboard de recette atteint son étape de vérification de session ; son parcours de connexion est vérifié séparément avant la capture administrative finale.

La tentative de connexion Dashboard a mis en évidence puis corrigé un défaut de proxy : le chemin amont ne contenait pas le préfixe `/api/trpc/`, ce qui produisait une page HTML 404 à la place de la réponse JSON attendue. Le correctif est commun à la recette locale et au déploiement Docker.

La seconde étape OTP Dashboard a conduit au même contrôle sur le client serveur du Dashboard. Son lien tRPC cible désormais l’endpoint `/api/trpc`, ce qui permet à la route HTTP de vérification de créer et de transmettre le cookie `vtex_session` à l’interface d’administration.

La seconde recette Dashboard a validé l’intégralité du parcours avec le compte administrateur initial : authentification par mot de passe, OTP, création de session HTTP et accès à l’accueil de pilotage. L’interface a chargé les indicateurs issus de la base de recette, dont l’utilisateur actif et les virements à valider.

La capture finale du module « Pilotage Wallet » confirme qu’un administrateur connecté peut consulter le compte Wallet provisionné, son solde disponible et réservé, la carte virtuelle, les plafonds exposés, les virements externes en attente et l’historique des transactions. Le menu utilisateur Dashboard affiche désormais les initiales et le nom du profil tRPC réel (« Administrateur VTEX »), sans identité d’exemple.

La recette finale a validé une autorisation de paiement carte par l’API avec un crédit administratif contrôlé, un rejeu à clé d’idempotence identique et une seule écriture de transaction/ledger. La suite Core a aussi été exécutée contre la base MariaDB migrée : 16 fichiers et 100 tests ont réussi, couvrant notamment les rôles, sessions, OTP, rate limiting et services transversaux.

Le cycle complet Savings Goals a également été exécuté via l’API de recette : création avec échéance, modification du nom, du montant cible et de l’échéance, alimentation puis clôture avec restitution. La suite Wallet inclut maintenant les contrats tRPC, validations, règles RBAC et autorisation carte, complétée par les recettes monétaires MariaDB.

Un test Vitest transactionnel Wallet exécuté sur MariaDB vérifie également qu’un ajustement monétaire est écrit une seule fois, que son rejeu idempotent retourne le même objet de transaction, qu’une seule ligne de ledger est créée et qu’un rôle `user` est refusé. Cette recette a corrigé la désérialisation de la réponse JSON idempotente lue depuis MariaDB.
