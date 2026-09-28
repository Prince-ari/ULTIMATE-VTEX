# Audit design final — Wallet, Dashboard et e-mails VTEX

## Objet, périmètre et niveau de preuve

Ce document prépare une **refonte visuelle totale** du Wallet mobile et desktop, du Dashboard opérateur et de l’e-mail OTP. Il ne propose aucune modification d’interface dans l’état actuel. Son objectif est de séparer précisément la dette visuelle à corriger des fonctions, autorisations et informations métier qui doivent rester inchangées.

L’audit repose sur les écrans de recette actuellement disponibles, l’inspection des styles, des structures de vues et des composants concernés. Les sources principales sont le Wallet statique, le carrousel 3D, le Dashboard Next.js, sa navigation et son gabarit e-mail transactionnel. Le référentiel fonctionnel antérieur, `docs/audit-fonctionnel-refonte.md`, reste la spécification de non-régression métier.

| Niveau de preuve | Surface | Conséquence pour l’audit |
|---|---|---|
| Capture rendue avec interface visible | Wallet mobile — accueil | Les constats de hiérarchie, contraste et densité sont visuels et directement observables. |
| Inspection de code et de structure | Wallet mobile/desktop — toutes les vues recensées | Les constats de patrons, interactions, états et adaptation responsive sont fondés sur l’implémentation. |
| Capture incomplète | Wallet desktop — accueil | Seul le fond est visible ; aucun jugement final de rendu hydraté ne peut être porté sans nouvelle recette. |
| Prévisualisation dégradée | Dashboard | L’API tRPC est inaccessible dans cet environnement et montre l’état d’indisponibilité ; les modules sont analysés par leurs composants et styles, pas présentés comme fonctionnels dans cette prévisualisation. |
| Gabarit transactionnel et tests ciblés | E-mail OTP | La structure, l’accessibilité pratique et le chemin de lecture sont analysés ; le rendu réel sur le téléphone destinataire reste à confirmer par l’utilisateur. |

> Les liens de prévisualisation temporaires ne constituent pas une preuve de production. Toute validation visuelle finale devra être réalisée avec une session de démonstration autorisée, des données non sensibles, une API joignable et des états contrôlés.

**Mise à jour de recette — correctifs P0.** Après l’application des premières corrections de contraste et d’états, la prévisualisation locale du Wallet restait sémantiquement hydratée dans le navigateur mais sa capture visuelle desktop ne montrait encore que le fond. Le diagnostic a identifié un shell `.phone` réduit à une largeur calculée de deux pixels par le contexte de grille desktop. Le calcul est désormais lié explicitement au viewport. Une vérification locale a ensuite confirmé le retour du rail, du solde, de la carte, des actions et des surfaces de l’accueil desktop. Des captures à 375 × 812 confirment également une carte d’entrée lisible, des champs distincts du fond vidéo et un contrôle Face ID sémantique accompagné d’une aide. L’écran OTP conserve une zone de code, une consigne persistante, un compteur et un clavier tactile sans perte de contraste. Les états OTP en échec et les données hydratées en environnement de production restent à valider lors de la recette finale.

## Conclusion exécutive

Le produit possède déjà trois expressions fortes mais insuffisamment reliées : un Wallet sombre, immersif et très éditorial ; un Dashboard opérateur dont les styles résultent de plusieurs directions superposées ; un e-mail OTP fortement transactionnel, contrasté et rassurant. La refonte doit construire une famille cohérente sans effacer les rôles de ces surfaces : **le Wallet doit aider à comprendre et agir sur l’argent, le Dashboard doit aider à surveiller et traiter, l’e-mail doit aider à s’authentifier sans ambiguïté.**

La priorité absolue n’est donc pas l’ajout de nouveaux effets. Elle est de rétablir un système de surfaces, d’états et de signalisation capable de rendre les montants, permissions, conséquences et erreurs plus visibles que les décors. Les signatures de marque — vidéo, matière lumineuse, carte 3D — restent pertinentes lorsqu’elles ne conditionnent pas la lecture ni l’accès.

| Priorité | Décision de programme |
|---|---|
| P0 | Stabiliser les contrastes, le rendu hydraté desktop, les tokens Dashboard, les états de panne et les contrôles sémantiques de sécurité. |
| P1 | Recomposer la hiérarchie des actions et données, les parcours de transfert, les tables opérateur, les états OTP et la cohérence des icônes. |
| P2 | Réduire les redondances, rendre les gestes découverts, harmoniser la densité mobile et réserver le rouge aux signaux nécessaires. |
| P3 | Raffiner les textures, motifs, micro-animations et détails décoratifs après validation des parcours réels. |

## Méthode et critères d’évaluation

Chaque constat répond à une question simple : la surface permet-elle de comprendre la tâche, l’état courant, la conséquence de l’action et le prochain geste sans diminuer les garanties de sécurité ? L’audit traite le design comme une couche de confiance et non comme un habillage isolé.

| Axe | Question d’audit | Attendu de la refonte |
|---|---|---|
| Identité | Palette, type, icônes et motifs sont-ils cohérents entre produits ? | Des conventions communes, des variantes de contexte explicites. |
| Hiérarchie | Donnée critique, état et action sont-ils compris en premier ? | Le montant, le statut, la permission et la conséquence priment sur l’ambiance. |
| Grille et densité | Alignements, largeurs et espaces sont-ils reproductibles ? | Une grille, une échelle d’espacement et des contenus adaptatifs par breakpoint. |
| Composants | Les contrôles semblables suivent-ils les mêmes règles ? | Une bibliothèque de boutons, champs, badges, cartes, tableaux, toasts et erreurs. |
| Responsive | La priorité et les gestes évoluent-ils correctement ? | Des patrons mobile et desktop pensés ensemble, pas une réduction mécanique. |
| Accessibilité | Contraste, focus, clavier, libellés et mouvement réduit sont-ils exploitables ? | Aucun effet décoratif ne supprime la lecture ou l’accès à une commande. |
| États | Chargement, vide, erreur, succès et reprise sont-ils explicites ? | Des états persistants, localisés et actionnables par module. |
| Confiance | Les signaux de sécurité sont-ils compréhensibles et vérifiables ? | Aucun statut de sécurité ou de fraîcheur ne doit être seulement décoratif. |

## Invariants fonctionnels à préserver

La future direction graphique ne doit pas altérer les contrats recensés dans l’audit fonctionnel. Elle peut modifier l’ordre visuel, les libellés de surface et les composants, mais ne peut jamais créer une opération locale, dissimuler une limitation de rôle ni transformer une donnée de serveur en simple élément décoratif.

| Invariant | Exigence visuelle associée |
|---|---|
| OTP à six chiffres, temporaire et confidentiel | Code, expiration, renvoi et messages d’échec restent lisibles ; le code n’apparaît jamais dans les aperçus non sécurisés. |
| Rôles `admin`, `agent` et `user` | Les commandes interdites sont absentes ou clairement non disponibles ; les droits ne sont pas suggérés par une simple couleur. |
| Opérations financières et contrôles de carte | Montant, devise, destinataire, frais, statut, conséquence et confirmation gardent une priorité stricte. |
| États et données serveur réels | Chargement, vide, erreur, lecture seule, annulation et reprise sont des composants de premier rang. |
| Journalisation et traçabilité | Références, horodatages, acteurs et statuts restent consultables sans être noyés par les effets visuels. |
| Mouvement réduit, clavier et focus | Le Wallet, le carrousel, les formulaires et la navigation restent complets sans animation et au clavier. |

## Audit Wallet mobile

### Lecture globale de l’accueil

L’accueil mobile porte une direction premium reconnaissable : contraste sombre, lumière colorée, volume de la carte et montant monétaire typographié. Son point faible est la concurrence entre ce décor et les informations financières. Le solde, le produit actif et les actions fréquentes doivent pouvoir être lus indépendamment de tout fond variable, particulièrement dans des conditions de luminosité ou sur un écran compact.

| Constat | Priorité | Incidence de refonte |
|---|---:|---|
| Le fond lumineux diagonal prend plus de place perceptive que le solde et le libellé de carte. | P1 | Créer une zone de lecture financière à contraste constant, détachée des variations du fond. |
| Le produit actif et l’indication de geste sont peu hiérarchisés près des zones sombres. | P0 | Définir des tokens de texte sur image et ne laisser aucun texte critique directement sur un contraste aléatoire. |
| Les trois actions rapides portent un poids visuel proche malgré des risques et fréquences différents. | P1 | Distinguer action principale, raccourci secondaire et action sensible. |
| La navigation basse repose surtout sur des icônes. | P1 | Conserver la sobriété, mais ajouter libellés courts ou un état actif plus explicite. |
| La recherche est isolée du solde et de l’activité. | P2 | L’intégrer à la découverte de transactions, avec résultat, vide, annulation et contexte. |
| La police monospacée de montant est distinctive mais dense à grande valeur. | P2 | Préserver sa personnalité tout en ajustant taille, espacement et format monétaire. |

### Couverture écran par écran

| Groupe | Vues examinées | Risque de design | Décision de refonte |
|---|---|---|---|
| Entrée et identité | Connexion, OTP, succès OTP | La vidéo, les facettes, lueurs et formulaire s’additionnent pendant une tâche de saisie sensible. | Garder une ambiance d’entrée, mais réduire le décor derrière champs, code et erreurs. |
| Vue d’ensemble | Accueil, solde, recherche, activité, objectifs, suggestions | La 3D, les panneaux et sections successives diluent la lecture de la situation financière. | Définir une séquence stricte : solde, action, activité, approfondissement. |
| Cartes et confidentialité | Cartes, réglages, confidentialité, transfert entre cartes | Les commandes de carte peuvent être moins visibles que l’objet carte ou les accents. | Donner la priorité aux conséquences, statuts et confirmations de commande. |
| Lire et recevoir | Banque, recevoir, historique, notifications, reçu | IBAN, activité et reçu sont des objets de confiance que les décorations peuvent affaiblir. | Utiliser une fiche de données lisible, avec état et action liés à une source réelle. |
| Envoyer | Envoyer, partage, choix de virement, instantané, classique, confirmation | Les variantes de virement peuvent devenir seulement des écrans esthétiques. | Concevoir un tunnel explicite : destinataire, montant, informations, récapitulatif, confirmation, résultat. |
| Bénéficiaires | Liste, détail, création/édition | Un formulaire financier doit rendre visible validation, erreur et retour sans perdre le contexte. | Unifier les champs, erreurs de validation, sauvegarde et confirmation de suppression. |
| Profil et assistance | Profil, support, composition e-mail | Ces vues peuvent perdre leurs repères si elles héritent du langage de la transaction. | Employer des patrons conversationnels et documentaires plus calmes, avec retour stable. |

### Entrée, OTP et reçu

| Constat | Priorité | Incidence de refonte |
|---|---:|---|
| Les écrans login et OTP superposent vidéo, voile, motifs SVG et lueurs. | P1 | Garder vidéo, poster et mouvement réduit ; limiter les éléments concurrents autour de la saisie. |
| Le contrôle `Face ID` est déclenché depuis un élément non sémantique. | P0 | Le convertir en bouton accessible avec focus, état indisponible et aide explicite. |
| La validation OTP a une étape de succès, mais erreur, expiration, verrouillage et renvoi doivent avoir des patrons équivalents. | P0 | Construire un état OTP complet, sans traiter le compte à rebours comme une simple décoration. |
| Les affirmations « En direct », biométrie active et notifications doivent être liées à une donnée ou une capacité vérifiable. | P0 | Les afficher depuis une source réelle ou les exprimer comme capacités, jamais comme certitudes décoratives. |
| Le reçu mélange terminal illustré, ticket, stepper et plusieurs CTA. | P1 | Donner au montant, frais, référence et statut la première lecture ; rendre l’illustration secondaire. |

## Audit Wallet desktop

### Preuve disponible et risque de rendu

La capture desktop disponible ne présente que le fond lumineux bleu nuit : ni contenu, ni carte, ni navigation, ni solde, ni action ne sont visibles. Cette image est insuffisante pour accepter un design desktop. Elle révèle un **risque P0 de recette visuelle**, dans lequel le décor peut rendre correctement pendant que le contenu hydraté est absent ou invisible.

La refonte doit donc séparer sans ambiguïté le fond décoratif de la surface produit, fournir un état de chargement distinct et imposer une recette avec session hydratée, contenu non sensible et états de données contrôlés avant toute validation esthétique.

### Shell, carte 3D et navigation

Le Wallet desktop concentre la plupart de ses vues, ses styles responsive, la navigation latérale, les contrôles de carte et les scripts de gestes dans un même document. Cette densité de responsabilités explique l’écart possible entre rendu attendu et rendu observé, tout en freinant l’évolution indépendante des composants.

| Constat | Priorité | Incidence de refonte |
|---|---:|---|
| Shell, vues métier, navigation latérale, carrousel et gestes sont fortement couplés. | P0 | Découper la future UI en shell, vues, primitives de données et contrôleurs d’interaction isolés. |
| Le fond peut persister seul lorsqu’un contenu n’est pas hydraté. | P0 | Poser la surface applicative sur un conteneur opaque ou à contraste garanti. |
| Le carrousel accepte souris, tactile et clavier, mais peut concurrencer montant et tâches financières. | P1 | Conserver l’objet carte comme contexte de compte plutôt que centre permanent de chaque écran. |
| Actions et réglages de carte emploient encore des palettes variées. | P1 | Employer badges, libellés et couleurs sémantiques stables, réservées aux statuts utiles. |
| Plusieurs familles d’icônes et SVG coexistent. | P1 | Normaliser une famille, ses tailles, son épaisseur et ses règles d’alignement. |
| Les gestes de sidebar sont utiles mais peu découvrables. | P2 | Définir zones d’activation, indicateurs visibles, commandes clavier et alternatives sans geste. |

## Audit Dashboard opérateur

### Continuité de service et états de panne

Dans la prévisualisation actuelle, le Dashboard présente un état d’indisponibilité réseau. La carte d’erreur et le bouton de reprise sont lisibles, mais l’écran devient une destination isolée, presque vide, sans shell, repère de session, information d’impact ni alternative. Cette observation concerne l’expérience de continuité, non un défaut fonctionnel dont la cause serait établie.

| Constat | Priorité | Incidence de refonte |
|---|---:|---|
| L’erreur est présentée hors du shell Dashboard. | P1 | Maintenir marque, contexte de session et navigation minimale en chargement, panne et lecture seule. |
| API inaccessible, session expirée et permission refusée ne sont pas assez distinguées. | P0 | Créer trois patrons d’erreur avec cause, impact et action adaptés. |
| Le CTA unique « Réessayer » ne prévoit aucun plan de repli. | P1 | Ajouter retour sûr, aide contextualisée ou référence d’incident non sensible. |
| La densité est trop faible pour une console opérateur. | P2 | Expliquer l’impact sur les données et les modules disponibles, sans remplir artificiellement l’écran. |

### Système de styles et centre de pilotage

Les styles révèlent des générations superposées : socle violet clair, couche indigo dite « AAA », finition monochrome. Les dernières règles gagnent par cascade, tandis que tokens, fonds et composants antérieurs restent présents. La cohérence dépend ainsi de l’ordre des règles plutôt que d’un système de conception documenté.

| Constat | Priorité | Incidence de refonte |
|---|---:|---|
| Les variables de couleur, fonds de page et styles de composants sont redéfinis plusieurs fois. | P0 | Remplacer les surcharges par un unique jeu de tokens sémantiques et des modes de thème explicitement nommés. |
| Panneaux translucides, ombres, motifs et finition monochrome se combinent sans hiérarchie unique. | P1 | Choisir un niveau de matérialité ; réserver textures et décor aux zones de marque, non aux données. |
| Les tableaux ont un défilement horizontal mais pas de patron mobile documenté. | P1 | Concevoir la transformation « table → résumé/carte mobile », pas seulement un scroll. |
| L’écran de connexion desktop est éditorial tandis que la version mobile masque entièrement cette dimension. | P2 | Conserver sur mobile un signal de marque compact et une progression cohérente. |
| Les accents existent dans le code mais sont parfois neutralisés par la finition monochrome. | P1 | Définir des statuts par texte, pictogramme et surface, avec couleur sémantique contrôlée. |

Le centre de pilotage agrège identité, support, leads, notifications, Wallet et analytics. Cette couverture est utile, mais le bandeau de cadence, quatre KPI, journal, interventions et callouts se disputent la priorité avant qu’un opérateur puisse évaluer une anomalie concrète.

| Constat | Priorité | Incidence de refonte |
|---|---:|---|
| Les KPI mélangent volume, file d’attente et contrôle sensible sous le même format. | P1 | Regrouper surveillance, action requise et santé de plateforme. |
| Les raccourcis répètent des destinations déjà présentes dans les KPI et callouts. | P2 | Réduire les redondances et proposer des commandes contextualisées par priorité active. |
| « Données à jour » ne donne ni horodatage ni preuve de fraîcheur. | P1 | Afficher dernière synchronisation réelle et dégradation par source. |
| La vue charge toutes les sources puis bascule globalement sur l’erreur. | P0 | Préserver les modules disponibles et isoler les échecs par bloc. |

### Modules et navigation

| Groupe de modules | Surfaces couvertes | Risque à contrôler | Orientation de refonte |
|---|---|---|---|
| Supervision | Accueil, analytics, journal système | Les signaux sont noyés entre KPI, tendances, activité et audit. | Séparer observation, alerte active et accès au détail. |
| Identité et relation | Utilisateurs, leads, notifications, support | Profils, listes et files ont des rythmes distincts mais peuvent hériter d’une table unique. | Définir des patrons de liste par intention : recherche, qualification, suivi, réponse. |
| Opérations Wallet | Wallets, cartes, transactions, virements, bénéficiaires et contrôles | Données financières et commandes sensibles risquent d’être traitées comme de simples lignes homogènes. | Employer une fiche de détail structurée et séparer consultation, commande et confirmation. |
| Documents et médias | Documents, consultations, remises et téléchargements | Les fichiers peuvent devenir de simples vignettes sans statut ni provenance compréhensibles. | Présenter état, origine, auteur, date et permissions dans un patron unique. |
| Administration | Paramètres, rôles, intégrations, sessions | Les choix irréversibles peuvent être sous-pondérés par une UI décorative. | Utiliser une hiérarchie conservatrice et une confirmation de conséquence. |
| Responsive | Rail desktop, barre mobile, panneau mobile | Le contexte de module et les actions globales se perdent lorsque le rail devient un menu secondaire. | Maintenir nom de module, état actif, session et retour sans demander de mémoriser le menu. |

## Audit de l’e-mail OTP

Le gabarit OTP est techniquement robuste : structure par tableaux de présentation, styles en ligne, texte de repli, six cellules de code, ligne monospace copiable et objet sans code. Son style bleu nuit, rouge, bordures fortes et grands rayons possède une présence qui n’est pas encore reliée au Dashboard monochrome ni au Wallet immersif.

| Constat | Priorité | Incidence de refonte |
|---|---:|---|
| Lire et recopier les six chiffres est correctement priorisé. | À préserver | En faire le patron de référence pour toute confirmation transactionnelle sensible. |
| Le rouge est utilisé pour bandeau et badge OTP sans état d’urgence réel. | P2 | Réserver le rouge aux alertes et actions à risque ; choisir un ton de marque moins anxiogène pour l’information. |
| Les rayons, bordures et contrastes sont plus démonstratifs que les panneaux Dashboard. | P1 | Définir une échelle transversale de radius, bordures et niveaux d’emphase. |
| Le message est dense en mobilité : bandeau, badge, titre, code, expiration, copie, avertissement, footer. | P1 | Préserver le chemin contexte → code → expiration → sécurité ; supprimer tout décor qui le ralentit. |
| L’objet évite d’exposer le code. | À préserver | Étendre cette règle à tout secret éphémère. |

## Diagnostic identitaire transversal

| Dimension | Wallet | Dashboard | E-mail OTP | Décision de système |
|---|---|---|---|---|
| Fonction | Consulter et agir sur les fonds | Surveiller, traiter, administrer | Authentifier et rassurer | La densité suit l’intention, non l’outil technique. |
| Surface | Sombre, immersive, lumineuse | Claire, fonctionnelle, hétérogène | Bleu nuit, très contrastée | Définir un socle de tokens commun et des modes de surface explicites. |
| Accent | Varié selon cartes et réglages | Monochrome final avec traces colorées | Rouge répété | Affecter à chaque couleur une signification unique. |
| Motif | Dégradé, scène, carte 3D | Panneaux, ombres, patterns, tables | Cadres et six cellules | Stabiliser grille, bordure, radius, icônes et élévation. |
| État critique | Décor et contenu peuvent se dissocier | Erreur hors shell | Expiration/anti-fraude explicites | Créer une bibliothèque d’états cohérents et persistants. |

> La cohérence recherchée n’est pas une uniformité plate. Le Wallet peut rester relationnel et immersif, le Dashboard sobre et dense, l’e-mail direct et rassurant, à condition que tous partagent les mêmes règles de sécurité, hiérarchie, espacement et signalisation.

## Principes directeurs de la future direction artistique

La direction recommandée est celle d’une **finance relationnelle et précise** : un socle minéral ou bleu très sombre pour le client et la transaction, des surfaces claires lisibles pour l’opérateur, une typographie de données stable, une échelle d’espacement stricte et un rouge strictement réservé à l’attention ou au risque. La vidéo, les facettes et la carte 3D deviennent des signatures de moment, jamais une condition de lecture.

| Principe | Traduction concrète |
|---|---|
| Le montant avant l’ambiance | Somme, devise, statut et conséquence sont toujours placés sur une surface à contraste mesuré. |
| La couleur porte un sens stable | Une couleur ne peut pas signifier tour à tour marque, navigation, succès et danger. |
| Le système avant l’écran | Bouton, champ, badge, carte, table, toast et erreur sont définis une fois, documentés et testés à chaque breakpoint. |
| Le contenu pilote la densité | Wallet respirant, Dashboard scannable, e-mail concentré sur le code ; aucun remplissage décoratif inutile. |
| La sécurité est visible mais non anxiogène | Expiration, session, permission et statut sont explicites sans employer l’alerte comme simple élément de marque. |

## Roadmap recommandée

Le premier lot doit bâtir les fondations et résoudre les P0 : inventaire de tokens, thèmes de surface, échelle typographique, couleurs sémantiques, focus, états, mouvement réduit, découplage décor/contenu, états Dashboard par source et recette desktop hydratée. Aucun écran final ne doit être accepté avant que ces points soient stabilisés.

Le deuxième lot doit recomposer les patrons critiques : connexion et OTP, accueil Wallet, cartes, transferts, bénéficiaires, reçu, listes/tableaux Dashboard, détails de contrôle, session expirée, panne et reprise. Chaque patron sera validé avec données réelles de démonstration, chargement, vide, erreur, succès, mobile, desktop et clavier.

Le troisième lot peut formaliser les signatures de marque : vidéo d’entrée, carte 3D, rail, motifs et transitions. Il sera strictement encadré par la performance, le mouvement réduit et l’obligation de ne pas modifier les contrats métier.

| Lot | Livrable de conception | Critère de sortie |
|---|---|---|
| 1 — Fondations | Tokens, primitives, états, stratégie responsive et recette d’accessibilité | Chaque écran critique rend contenu et état sans dépendre d’une cascade historique ou d’un décor. |
| 2 — Parcours | Écrans et composants des parcours critiques Wallet/Dashboard/OTP | Un utilisateur identifie en quelques secondes tâche, donnée critique, statut et action suivante. |
| 3 — Signature | Video, 3D, motifs, micro-interactions et finitions | Les signatures renforcent la marque sans modifier le sens, réduire le contraste ni produire de dépendance au mouvement. |

## Checklist d’acceptation avant toute mise en production

| Domaine | Validation exigée |
|---|---|
| Rendu | Captures mobile et desktop de tous les parcours clés avec session hydratée et API disponible. |
| Données | Valeurs non sensibles, montants, devise, destinataires et états provenant uniquement de contrats serveur réels. |
| États | Chargement, vide, erreur, succès, session expirée, permission refusée et lecture seule revus séparément. |
| Accessibilité | Clavier, focus visible, libellés, contraste, réduction de mouvement et contrôles tactiles vérifiés. |
| Sécurité | OTP non exposé dans l’objet de message ni l’interface de production ; rôles et interdictions restitués sans ambiguïté. |
| Cohérence | Une unique bibliothèque de tokens et composants remplace les surcharges de styles historiques. |

## Note de sécurité opérationnelle

Une clé Resend a été exposée dans un fichier de configuration de projet et dans des échanges antérieurs. Elle doit être considérée comme compromise, **tournée immédiatement**, puis supprimée de tout fichier suivi. Aucun secret, mot de passe ou OTP ne doit être inscrit dans ce rapport, dans les captures ou dans les fichiers de démonstration.

## Correctifs P0 appliqués après audit

Les corrections ci-dessous appliquent les recommandations prioritaires sans modifier les contrats tRPC, les rôles, le cycle OTP, les opérations financières ni les mécanismes d’idempotence. Elles ne remplacent pas la future refonte visuelle totale : elles établissent un socle de lisibilité, d’accessibilité et de continuité exploitable dès maintenant.

| Surface | Correction appliquée | Garanties conservées |
|---|---|---|
| Wallet mobile et desktop | Carte d’authentification devenue plus opaque et contrastée, focus visible et fond vidéo maintenu comme décor non bloquant. | Connexion, vidéo, poster de repli et mouvement réduit restent inchangés. |
| Wallet desktop | Correction du calcul de largeur du shell dans le contexte de grille, rétablissant l’affichage du rail, des soldes, actions et surfaces applicatives. | Structure des vues, navigation et carrousel ne sont pas modifiés. |
| Wallet — confidentialité | Contrôle de masquage du solde converti en bouton avec état `aria-pressed` et libellé synchronisé. | Aucune valeur ou règle de solde n’est modifiée. |
| Wallet — biométrie et OTP | Contrôle Face ID rendu sémantique ; états de saisie, vérification, erreur et succès explicités sans révéler de code. | L’OTP reste à six chiffres, temporaire et non divulgué hors environnement autorisé. |
| Wallet — continuité | État global de synchronisation et reprise ajouté, sans rejouer automatiquement une action. | Les mutations financières restent côté serveur et les incidents n’exécutent aucune nouvelle commande. |
| Dashboard — accès | États distincts pour vérification, réseau, service indisponible et droits insuffisants, avec shell de continuité et reprise. | Les sessions invalides restent redirigées vers la connexion et les comptes sans rôle n’accèdent à aucune donnée opérateur. |
| Dashboard — données | Accueil rendu tolérant aux sources partielles ; avertissement visible sans masquer les modules disponibles. | Aucune donnée indisponible n’est simulée et aucune commande n’est relancée automatiquement. |
| Dashboard — retours | États vides annoncés, toasts d’erreur accessibles et fermables, focus renforcé. | Les messages de mutation existants et les commandes métiers restent inchangés. |

La validation ciblée a confirmé la syntaxe du contrôleur Wallet, trois tests de garde-fou UI Wallet, les dix fichiers de tests Dashboard pour 81 assertions, ainsi que le contrôle TypeScript du Dashboard et des tests. Les captures locales ont confirmé l’accueil Wallet desktop, l’entrée mobile et l’OTP mobile. La recette de production avec API hydratée reste une étape séparée.
