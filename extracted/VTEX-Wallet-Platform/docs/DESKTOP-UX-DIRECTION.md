# Direction UX/UI — Wallet VTEX Desktop

## Héritage mobile à préserver

Le Wallet mobile possède une identité forte et distinctive : un **fond diagonal ivoire / indigo nuit**, une fine couture lumineuse, un réseau concentrique discret, les motifs facettés `vtx-field`, une palette de bleu signature et des surfaces sombres profondes. La typographie combine **Bricolage Grotesque** pour les titres, **Inter** pour l’interface et **JetBrains Mono** pour les signaux financiers. La version desktop doit amplifier ces signatures sans transformer la surface en simple téléphone agrandi.

## Principes de disposition desktop

Le shell desktop devient une application pleine largeur à trois zones : une navigation latérale de marque persistante, un canevas opérationnel central de 12 colonnes et un rail contextuel réservé à la carte, aux raccourcis et aux signaux de sécurité. La page d’accueil placera le solde disponible et les actions monétaires au premier regard, suivis de l’activité, des objectifs et des informations de carte. Les écrans transactionnels conserveront leurs étapes et données serveur, mais utiliseront des panneaux multi-colonnes et des récapitulatifs fixes.

| Décision | Intention UX | Référence de conception |
|---|---|---|
| Solde, disponible et réservé au premier écran | Répondre immédiatement à la question financière principale | UXDA recommande que le solde et les dernières opérations soient accessibles sans étapes inutiles.[1] |
| Navigation permanente, à faible saillance | Guider sans concurrencer les données financières | UXDA recommande une navigation toujours disponible mais non intrusive.[1] |
| Grille modulaire avec hiérarchie explicite | Densité maîtrisée pour desktop sans bruit visuel | Les guides dashboard recommandent de prioriser les données actionnables, regrouper et éviter les métriques superflues.[2] [3] |
| Couleur et verre employés avec retenue | Préserver lisibilité, contraste et confiance | Une palette fonctionnelle, l’alignement et un usage prudent du glassmorphism évitent le bruit visuel.[3] |
| Actions monétaires visibles et peu nombreuses | Réduire la charge cognitive des tâches de paiement | Les flux de transfert doivent présenter l’intention et les données essentielles sans catalogue d’options.[1] |

## Système desktop proposé

La couche claire conservera le rôle de surface de lecture calme. La couche indigo servira aux éléments de confiance : rail de marque, carte de paiement, états de sécurité, solde principal et actions privilégiées. Le bleu signature ne sera pas une couleur de remplissage généralisée ; il signalera l’action ou la donnée active. Les transitions seront limitées au survol, à l’apparition des panneaux et aux changements d’état, avec le respect de `prefers-reduced-motion`.

## Critères de recette

Chaque vue existante devra rester accessible avec les mêmes identifiants de navigation et le même client API. La cible desktop est `≥ 1024 px`; le téléphone conserve son rendu entre 0 et 767 px. Des captures de contrôle seront prises pour l’accueil, les cartes, l’activité, l’envoi, les bénéficiaires, les objectifs, les notifications, le profil, la banque et le support.

## Journal de revue visuelle

La prévisualisation confirme que l’authentification conserve son écran mobile centré, intentionnellement isolé du shell de produit. Pour examiner la réorganisation desktop sans fabriquer de session, la vue Accueil a été activée localement uniquement dans le DOM ; aucune donnée financière ni mutation n’a été injectée. La revue suivante porte sur le rail de navigation, la grille d’accueil et les vues secondaires.

L’Accueil desktop confirme le nouvel usage de l’espace : navigation de marque sur fond indigo, solde prioritaire, carte 3D en scène dédiée et modules financiers alignés. La vue Cartes a été vérifiée sans données injectées ; sa scène reste volontairement vide dans ce contexte, puisque les cartes proviennent exclusivement du bootstrap API. Le contrôle suivant cible les formulaires, l’historique, le profil et les surfaces d’assistance.

Le clic réel sur une entrée de navigation sans session a redirigé vers l’écran de Connexion, ce qui confirme que le shell desktop ne contourne pas la garde financière. Les écrans secondaires sont examinés au moyen d’une activation DOM locale, exclusivement pour la recette graphique.

La prévisualisation statique a ensuite été relancée avec la convention `PORT=3000` validée. Les captures suivantes utilisent ce serveur isolé et conservent l’absence de données simulées du produit.

La revue desktop a confirmé la page Accueil et l’écran de sélection Virement. La première concentre les indicateurs dans une grille bento, tandis que la seconde présente l’instantané et le classique comme deux panneaux de décision distincts. Le rail VTEX conserve sa présence sur ces écrans en mode grand écran.

Le formulaire de virement instantané a été contrôlé dans son gabarit desktop. Les informations « vous / destinataire » forment un inset de contexte avant la séquence titulaire, IBAN, référence, montant et validation. La largeur est volontairement limitée afin de préserver la vérification attentive d’une opération financière.

La vue Profil a également été contrôlée : l’identité, le score de sécurité, les raccourcis, les paramètres de sécurité et les préférences utilisent des groupes visuellement distincts mais cohérents avec les surfaces indigo du shell.

Le formulaire Bénéficiaire a été contrôlé à son tour. Les champs de titulaire, IBAN, banque et compte interne sont présentés dans une colonne de vérification concentrée avec une action finale stable, ce qui évite que l’espace desktop dilue la saisie de données sensibles.

La vue Support a été contrôlée : le contact gestionnaire est mis en avant avant l’action d’e-mail, puis les réponses fréquentes sont regroupées dans une surface de consultation unique. Le résultat conserve le langage de rail, facettes et surfaces du produit sans réduire la lisibilité de l’assistance.

La vue Informations bancaires a été contrôlée après son adaptation dédiée. Le QR de réception est isolé dans une surface haute, puis les données titulaire et coordonnées sont structurées en lignes à forte lisibilité ; les statuts « en cours de provisionnement » restent visibles sans imiter un IBAN réel.

La vue Notifications a été contrôlée dans son état de prévisualisation non connectée. Son message d’attente est présenté dans une surface de statut cohérente ; aucune alerte fictive n’est créée pour remplir la composition desktop.

La vue Recevoir a été contrôlée : le QR et l’identité du titulaire constituent le haut de l’écran, suivis d’un résumé de compte, des lignes de coordonnées et des étapes explicatives. Les actions de partage restent accessibles au bas de la surface sans fournir de RIB fictif.

La vue Historique a été contrôlée dans l’état sans opérations de la prévisualisation locale. Le conteneur de liste conserve une largeur et une bordure cohérentes avec le shell desktop ; il sera alimenté par le serveur connecté, sans transaction d’exemple.

Le transfert entre cartes a aussi été contrôlé. Sa surface de sélection, son montant et son action restent présents dans le shell desktop ; sans cartes hydratées, aucun solde ni déplacement n’est inventé dans le navigateur.

La vue Confidentialité a été contrôlée : l’explication réglementaire, le contact du gestionnaire et les catégories de demandes sont rassemblés dans deux surfaces de sécurité à lecture immédiate, cohérentes avec les standards desktop du Wallet.

Un audit DOM final a contrôlé les vues Cartes, Notifications, Banque, Historique, Détail bénéficiaire, Confidentialité, Confirmation, E-mail et Transfert entre cartes. Elles existent toutes, portent le retrait desktop de `340 px` laissant le rail VTEX permanent et conservent leur contenu métier. Les écrans déclenchés par une action (confirmation, e-mail) ne sont pas remplis artificiellement pour les captures.

La vue Confirmation a été revue visuellement dans son état de recette à montant nul. Le statut, le montant, le justificatif et les lignes de détail occupent une zone de reçu centrée ; les valeurs réelles proviennent du virement serveur au moment de l’usage.

La vue E-mail a enfin été revue visuellement. Son en-tête de message, le destinataire, le brouillon et les actions d’ouverture, de copie et de retour sont organisés dans une seule surface de composition desktop. Les valeurs absentes restent indiquées par un tiret et ne sont pas inventées pour la recette.

La vue Cartes a été capturée dans la passe finale. Son état sans carte hydratée reste volontairement vide, avec l’instruction de gestion, afin de préserver l’absence de données financières fictives tout en conservant le cadrage desktop et le rail de marque.

La vue Partage de fonds a été capturée dans la passe finale. Le montant, les modes de répartition et l’action de demande sont regroupés dans une surface unique ; sans bénéficiaire hydraté, aucun participant ni montant n’est créé côté navigateur.

La vue Virement classique a été capturée dans la passe finale. Le destinataire, la source de fonds, le montant, la référence et les modes d’exécution sont structurés dans un panneau de validation centré, adapté à une lecture attentive sur desktop.

La vue Détail Bénéficiaire a été capturée dans la passe finale. L’identité du contact et les actions d’envoi, de modification et de suppression sont présentées sur des lignes desktop distinctes. Lorsqu’aucun bénéficiaire n’est hydraté, les valeurs restent neutres et aucune identité n’est simulée.

## Références

[1]: https://theuxda.com/blog/top-20-financial-ux-dos-and-donts-to-boost-customer-experience "UXDA — Banking UX problems and fixes"
[2]: https://star.global/posts/fintech-dashboard-design-data-visualization/ "Star — Fintech dashboard design and data visualization"
[3]: https://excited.agency/blog/dashboard-ux-design "Excited — Dashboard UX design principles"
