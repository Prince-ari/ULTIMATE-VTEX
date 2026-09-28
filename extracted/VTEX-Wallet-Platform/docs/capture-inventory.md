# Inventaire de captures — Wallet et Dashboard

## Préparation

Le Dashboard est disponible en prévisualisation sur le port 3000. Il s’appuie sur les réécritures Next.js vers l’API locale du port 4000. Une API locale temporaire a été démarrée pour la session de capture afin de rendre les contrôles d’accès joignables.

## Écrans Dashboard déclarés

Les routes principales déclarées sont : accueil, utilisateurs, wallets, documents, notifications, support, leads, analytics, journal et paramètres. L’écran de connexion est également disponible via `/login`.

## État d’accès observé

La prévisualisation Dashboard a d’abord affiché une erreur de connexion à l’API, puis a relancé la vérification de session après le démarrage de l’API locale. Les captures métier nécessitent une session d’administrateur ou d’agent valide ; les écrans publics et d’erreur seront identifiés séparément si l’authentification n’est pas disponible.

## Écrans Wallet observés avant authentification

Le Wallet statique est accessible sur le port 3002. Sa page initiale présente un écran de connexion avec e-mail, mot de passe, Face ID et code PIN. Le document initial expose également des surfaces modales prévues pour le sélecteur de devise, le blocage d’une carte, le renommage d’une carte et l’affichage d’informations de carte.

Les vues financières après connexion nécessitent une session Wallet et des données API disponibles. Elles seront consignées comme inaccessibles si l’authentification et les données locales ne peuvent pas être établies sans créer de comptes ni de données fictives.

## Mode aperçu local sans OTP

Le Wallet affiche maintenant un message explicite de mode aperçu sur les hôtes locaux et de prévisualisation. Le code d’accès OTP reste le parcours par défaut hors de ces hôtes. Le Dashboard applique la même règle : son accès d’aperçu est désactivé lorsque `NODE_ENV` vaut `production` et il signale que les données métier et les actions réelles sont indisponibles.

Le formulaire Wallet d’aperçu ne requiert plus la saisie d’e-mail ou de mot de passe. Le passage à la vue d’accueil est vérifié séparément après le chargement de l’animation initiale, qui peut temporairement intercepter les interactions à l’ouverture de la page.

Le gestionnaire d’aperçu est bien détecté sur l’hôte de prévisualisation, mais la vue active est restée sur la connexion immédiatement après son déclenchement. La transition de vue nécessite donc une vérification différée et une correction si elle ne devient pas effective après l’animation de chargement.

Le client API du Wallet a été adapté afin que le gestionnaire de connexion effectivement chargé reconnaisse le mode aperçu et n’exécute ni appel d’authentification ni validation OTP. La recette visuelle du passage vers l’accueil reste à confirmer après la fin de l’animation de chargement.

Le passage vers l’accueil Wallet est validé après la transition : l’application active son état authentifié visuel sans requête réseau. Les entrées de navigation exposées à la capture comprennent l’accueil, les cartes, l’envoi, l’historique, les notifications, les informations bancaires et le profil. Les zones chargées depuis l’API restent en état de chargement ou vide, conformément à l’absence de données de démonstration.

L’accès Dashboard en aperçu est validé : la garde de session est contournée uniquement en prévisualisation et l’accueil s’affiche après la résolution de ses chargements. Les indicateurs et listes affichent leurs états vides avec des valeurs nulles ; aucune donnée métier réelle n’est injectée.

Le Wallet accepte désormais le paramètre d’aperçu `preview` pour toutes ses vues applicatives accessibles sans OTP, dont l’accueil, les cartes, les transferts, les bénéficiaires, le support, les paramètres et les informations bancaires. La route testée avec `?preview=cartes` a activé la vue Cartes sans authentification ni appel réseau.

Les captures Wallet sont générées avec le navigateur déjà ouvert, aux formats 1440 × 1000 et 375 × 812. La capture mobile de l’accueil a été vérifiée visuellement : elle affiche bien la vue Wallet active et non le chargeur initial.
