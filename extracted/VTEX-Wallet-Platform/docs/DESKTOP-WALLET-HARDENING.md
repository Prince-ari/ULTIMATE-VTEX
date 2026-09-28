# Revue de finition — Wallet desktop et Dashboard

## Cartes 3D

Le moteur WebGL reconstruit désormais ses objets lorsqu’une session hydratée remplace le tableau initial vide par les cartes issues de l’API. Cette correction élimine l’état où le canvas était initialisé avant l’arrivée des données et restait sans carte visible. Le carrousel comporte désormais une zone focalisable, une navigation `←`, `→`, `Home` et `End`, des points accessibles et, au desktop, deux contrôles précédent/suivant à la souris. Les mouvements de ressort sont neutralisés lorsque `prefers-reduced-motion` est activé.

## Cohérence visuelle desktop

Les transactions hydratées ne réinjectent plus de SVG au desktop : elles utilisent Remix Icon, tandis que le rendu SVG historique demeure exclusivement mobile. Les contrôles 3D possèdent des états de focus à contraste élevé, des cibles de 46 px au desktop et des transitions limitées à `transform`, `background` et `border-color`.

## Commandes Dashboard

La console Wallet ajoute une recherche de titulaire actif avant l’ouverture de compte, avec une saisie d’identifiant technique de secours. Les alertes agrègent virements en attente, cartes gelées, expirations proches et éventuels écarts de rapprochement. Le rapprochement est une lecture serveur des dernières écritures `available` du ledger comparées aux soldes de compte ; il ne corrige jamais un solde automatiquement.

## Validation

Les builds TypeScript Wallet, Router et Dashboard sont validés. Les tests ciblés Wallet passent et la suite Dashboard locale totalise 73 tests réussis. La recette navigateur confirme les nouvelles sections Dashboard avec un compte et une carte de recette, et le Wallet à 390 px conserve son isolation de styles mobile.

La capture hydratée de l’accueil desktop montre une carte 3D effectivement rendue dans le canvas avec ses commandes précédent/suivant. Une recette dédiée émule `prefers-reduced-motion: reduce`, confirme le média actif et vérifie que la propriété `transition` calculée des contrôles est `none`. Elle attend la disparition du préchargeur avant la capture de l’accueil.

La surface desktop reprend désormais le fond split et son dégradé ivoire-vers-navy. Les icônes de navigation et d’action utilisent des tons bleu-gris sur des surfaces sombres plutôt que des aplats blancs. La signature de session adopte un monogramme facetté avec indicateur d’état, et l’entrée Profil du rail reprend une forme VTEX dédiée au lieu du pictogramme de compte générique.

La console Wallet a émis, par son formulaire administrateur, une seconde carte virtuelle Mastercard de recette. Elle est relue dans la liste Dashboard avec son réseau, ses quatre derniers chiffres masqués, ses plafonds et son statut actif. Cette donnée serveur permet désormais d’attester le passage effectif entre deux cartes sans injecter de modèle fictif dans le navigateur.

Sur l’accueil hydraté, le carrousel expose deux points accessibles (« Afficher la carte 1 » et « Afficher la carte 2 ») et indique la Mastercard comme carte active initiale. La preuve avant/après utilise ces deux états serveur.

Après activation de la commande suivante, la carte active devient `Carte virtuelle VTEX` à l’index `1`. La recette observe deux cartes, les états ARIA `false` puis `true`, et le sous-titre synchronisé « Solde disponible · Carte virtuelle VTEX ». Les captures avant et après sont archivées sous des noms explicites avec cette assertion.

Lors de la revue suivante, les surfaces Wallet n’exposent plus le rôle administrateur : l’espace client utilise une identité personnelle courte. Les blocs d’identité du rail et de l’en-tête sont contraints à une colonne rétractable avec troncature, afin qu’un intitulé long ne puisse empiéter sur les commandes.

L’audit hydraté du Dashboard confirme que le rôle administrateur reste correctement réservé à cette console. La structure des KPI est lisible à 1280 px ; la passe suivante harmonise toutefois la cadence verticale des tableaux et du formulaire d’ouverture de compte afin de renforcer la perception de produit fini.

Après la correction, l’accueil desktop du Wallet présente l’identité courte « Espace personnel », sans rôle administratif et sans collision avec la recherche ni la zone de notification. Le Dashboard conserve son identité administrateur mais ses KPI et tableaux possèdent désormais des contraintes de contenu et de défilement qui évitent la compression des colonnes. À 390 px, la recette relève zéro débordement de contenu, aucune collision d’en-tête et un ordre vertical cohérent des surfaces.

Le rechargement complet du Wallet confirme que l’identité utilisateur est appliquée au profil hydraté, au rail et à l’en-tête. La grille desktop conserve les deux panneaux sans chevauchement à 1280 px ; la vue Cartes fait l’objet d’un dernier contrôle dédié de palette et d’actions de sécurité.

La vue Cartes desktop confirme que les états « Active » et « Geler la carte » utilisent maintenant des surfaces bleu-gris et une hiérarchie monochrome. Le contrôle Dashboard hydraté confirme l’alignement des KPI, du tableau de comptes et du formulaire de recherche de titulaire ; les tableaux gardent désormais une largeur de colonnes stable avec un défilement horizontal explicite lorsque nécessaire.

Le Wallet traite désormais le profil technique administrateur comme une session utilisateur lorsqu’il est consommé par le client final : il affiche l’identité dérivée de l’adresse authentifiée (`Finavie2`) dans le rail et l’en-tête, tout en conservant le rôle admin exclusivement dans le Dashboard. Ce comportement garde un repli neutre seulement lorsque aucun attribut de profil n’est disponible.

Validation de clôture : le typage du Dashboard et la syntaxe des scripts Wallet sont valides. Les recettes attestent zéro débordement de contenu sur les vues mobile Accueil, Cartes, Envoyer et Profil à 390 px, ainsi que l’absence de débordement horizontal sur les modules Dashboard Accueil, Wallets, Utilisateurs, Support et Journal à 1280 px.

Précondition de l’itération suivante : après rechargement du Wallet, la session restaure bien l’identité `Finavie2` et l’accès au profil avant toute modification de l’avatar ; aucun libellé administratif n’est réintroduit côté client.

Le rechargement suivant confirme à nouveau l’identité hydratée et la disponibilité de la navigation Profil. La validation de la surface de réglage vérifie séparément que ses textes d’aide restent statiques et ne sont pas remplacés par les données de session.

Contrôle Dashboard de l’itération opérationnelle : la console Wallet hydratée affiche un compte EUR, deux cartes serveur et le rapprochement du ledger. L’intervention d’urgence est inspectée uniquement en ouvrant le détail du compte ; aucune mutation de gel n’est déclenchée lors de la recette visuelle.

Le panneau de gel de protection apparaît dans le détail du compte avec une justification obligatoire, une confirmation dédiée et une explication de la portée des cartes. Le retour au Wallet permet ensuite de vérifier indépendamment le rendu du fond split et la transition 3D, sans changer de donnée financière.

Recette 3D après réglage de physique : le contrôle « Carte suivante » fait passer le libellé de `Carte 3D Mastercard` à `Carte virtuelle VTEX`, sélectionne la Visa dans le canevas et synchronise l’état du carrousel. La transition s’effectue sans mutation financière.

Recette clavier post-réglage — état initial : la région 3D est focalisable, le deuxième point possède `aria-pressed=true` et le libellé actif est `Carte virtuelle VTEX`. La touche `Home` est ensuite envoyée sur cette région pour vérifier le retour par clavier avant les contrôles de lecture d’état.

Le premier relevé différé après cette touche conserve le second point actif ; la validation est donc complétée par un diagnostic du gestionnaire `keydown`, puis par les touches fléchées et `End`, plutôt que de déduire un résultat d’un seul événement de recette.

Le document reçoit maintenant un écouteur de diagnostic temporaire et la flèche gauche est envoyée sur `#vtx3d-hit`. Le journal de cet écouteur est relevé avant toute conclusion ou correction de l’accessibilité clavier.

Diagnostic : la flèche gauche atteint effectivement `#vtx3d-hit`. Un événement clavier annulable émis sur cette région retourne `defaultPrevented=true`, ce qui atteste le gestionnaire du carrousel. L’état visuel est ensuite relevé après le temps de ressort, plutôt qu’immédiatement à l’émission de la touche.

Le diagnostic montre que l’index applicatif passe bien à `0`, tandis que la recette automatisée maintient le document en arrière-plan (`document.hidden=true`) et suspend volontairement la boucle WebGL. Pour rendre l’accessibilité indépendante de cette condition et plus réactive en usage réel, toute commande discrète synchronise désormais immédiatement le libellé et les points ARIA ; le ressort conserve l’animation du canevas dès qu’une frame est disponible.

Après rechargement, l’accueil hydraté retrouve la Mastercard comme première carte et le fond split reste appliqué. La recette clavier finale se concentre sur les états textuels et ARIA immédiatement publiés, ce qui permet une vérification fiable même si le navigateur de recette met le canvas en arrière-plan.

Séquence finale clavier : avec la première carte sélectionnée et `#vtx3d-hit` focalisé, `End` publie immédiatement le libellé `Carte virtuelle VTEX`. Les états ARIA et les touches fléchées/Home sont relevés dans l’étape suivante.

Le relevé ARIA confirme après `End` que seul le deuxième point porte `aria-pressed=true`. La flèche gauche publie ensuite `Carte 3D Mastercard`, ce qui démontre le retour par clavier avant les derniers contrôles de borne `ArrowRight` et `Home`.

La flèche droite republie `Carte virtuelle VTEX`, puis `Home` rétablit `Carte 3D Mastercard`. La dernière lecture des deux points ARIA confirme la borne de retour et clôt la recette clavier post-réglage.
