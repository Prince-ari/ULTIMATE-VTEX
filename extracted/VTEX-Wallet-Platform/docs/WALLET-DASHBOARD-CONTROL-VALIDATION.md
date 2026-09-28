# Validation — pilotage Wallet et isolation du Wallet mobile

La console Dashboard affiche désormais le module de pilotage Wallet avec les sections de comptes, de cartes, de bénéficiaires, d’objectifs et d’opérations. Sur une base de recette vide, son état explicite propose l’ouverture du premier compte par identifiant utilisateur et devise ; aucun enregistrement financier n’a été créé pour la validation visuelle.

Le Wallet a aussi été contrôlé à un viewport de **390 × 844 CSS px**. La capture produite est exportée en 780 × 1 688 px avec un `window.innerWidth` de 390 px et la vue `accueil` active. Les règles monochromes ajoutées sont toutes dans des media queries `min-width: 1024px`, ce qui préserve le layout, les couleurs et les interactions de la version mobile.

Les pictogrammes desktop utilisent désormais une famille fonctionnelle commune — Remix Icon — avec une palette graphite unique. Le Wallet convertit ses pictogrammes historiques vers cette famille seulement au breakpoint desktop ; Phosphor reste exclusivement le système mobile existant. Les SVG décoratifs du Wallet sont masqués uniquement sur desktop ; les pictogrammes fonctionnels de bibliothèque restent disponibles pour la navigation et les actions.

La recette finale a confirmé les deux rendus desktop. Le Dashboard affiche les KPI, les états vides réels, le formulaire d’ouverture du premier compte et le rail de contrôle en palette neutre. Le Wallet desktop affiche le rail permanent, les actions rapides et les pictogrammes harmonisés avec Remix Icon ; la conversion est déclenchée seulement au breakpoint desktop et le Wallet mobile reste sur son système visuel d’origine.

## Recette de commandes réelles

Sur la base MariaDB locale de recette, le Dashboard a créé le compte **EUR #1** de l’administrateur local et la carte virtuelle associée. Depuis le détail de cette carte, les plafonds ont ensuite été enregistrés à 450 € par opération, 900 € par jour et 2 500 € par mois. La liste Dashboard reflète immédiatement les nouveaux plafonds. Aucun paiement, virement, ajustement de solde ou donnée financière fictive n’a été créé.

## Audit iconographique desktop

L’audit a parcouru 21 vues Wallet desktop après normalisation. Il ne relève **aucun SVG visible** et **aucune classe Phosphor visible** dans ces vues ; les pictogrammes visibles appartiennent tous à Remix Icon. Le contrôle mobile 390 px demeure distinct et compte zéro classe Remix Icon.

Les captures finales montrent le compte EUR et les plafonds de carte mis à jour dans la console. La vue Cartes du Wallet est contrôlée dans son état de chargement authentifié réel — sans contenu simulé — avec le rail de navigation et ses icônes Remix visibles et monochromes.
