# Audit structurel — Dashboard et Wallet desktop

## Référence transmise

La référence confirme deux directions complémentaires : un Dashboard d’opération structuré par un rail, une bande KPI et des grilles analytiques régulières ; et une surface Wallet plus éditoriale, contenue dans le viewport, construite autour d’une asymétrie de volumes et d’un objet carte assumé.

## Constat de recette

| Zone | Observation | Décision de refonte |
| --- | --- | --- |
| Dashboard connexion | La carte de connexion est visuellement trop petite face au viewport et manque d’une composition enveloppante. | Recaler l’espace de connexion et la surface de travail avec une trame de marges cohérente. |
| Dashboard opérateur | La page rassemble déjà KPI, activité et actions, mais les modules ne partagent pas encore une grille de lecture assez explicite. | Renforcer la bande KPI, les en-têtes de module, les contrôles locaux et les gabarits en deux colonnes. |
| Wallet desktop | Le fond split et la carte 3D sont présents, mais la hiérarchie desktop doit devenir plus éditoriale et moins superposée. | Définir une grande surface contenue, une colonne narrative et une colonne produit avec débordement maîtrisé. |
| Responsive | Les breakpoints existent mais doivent préserver prioritairement les proportions, les libellés et l’accès clavier. | Adopter une grille fluide, des tailles clampées, des points de rupture explicites et aucun débordement horizontal. |

## Règles de conception

1. Employer le texte, les espacements et les contrastes de taille avant les accents décoratifs.
2. Limiter les icônes à l’orientation et aux actions ; aucun pictogramme ne remplace un libellé fonctionnel.
3. Garder les actions et filtres à proximité de l’en-tête du module concerné.
4. Préserver le Wallet mobile : les règles de la refonte desktop seront strictement encapsulées dans des media queries desktop.
5. Vérifier à 1440 px, 1280 px, 1024 px et 390 px avec les parcours clavier disponibles.

## Contrôle visuel post-refonte — première passe

La connexion Dashboard a été reformulée en surface bi-colonne : la zone narrative ancre l’application à gauche, tandis que le formulaire conserve une largeur de lecture stable à droite. Le Wallet conserve son décor split au chargement ; l’inspection de l’accueil applicatif après authentification reste nécessaire pour valider la nouvelle fenêtre desktop et la grille des modules réels.
