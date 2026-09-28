# Audit fonctionnel exhaustif — VTEX Wallet et Dashboard

## Objet et périmètre

Ce document inventorie le fonctionnement observable et implémenté du **Wallet mobile**, du **Wallet desktop** et du **Dashboard opérateur**. Son objectif est de séparer clairement les capacités métier, les interactions, les états d’interface, les données affichées et les dépendances techniques avant toute refonte visuelle.

## Référentiel d’analyse

Chaque élément est décrit selon les axes suivants : **surface** (produit, écran, composant), **acteur et rôle**, **déclencheur**, **résultat visible**, **données manipulées**, **contrat applicatif**, **règles et validations**, **journalisation ou notification**, **dépendances inter-écrans**, **états alternatifs** (chargement, vide, erreur, accès refusé) et **incidence de refonte**.

## Registre de couverture

| Domaine | Surface à inventorier | Interactions et états à vérifier | Source de vérité |
|---|---|---|---|
| Wallet mobile | Connexion, portefeuille, cartes, virements, bénéficiaires, épargne, documents, profil et support | Tap, saisie, navigation, modales, validation, chargement, vide, erreur | Client Wallet, contrats API et services Wallet |
| Wallet desktop | Mêmes capacités métier, avec composition desktop, rail de navigation, carrousel de cartes et interactions clavier/souris | Clic, clavier, mouvement réduit, superpositions, redimensionnement | Client Wallet, styles desktop et contrats API |
| Dashboard | Pilotage, utilisateurs, Wallets, cartes, opérations, documents, leads, notifications, support, analytics, journal et paramètres | Recherche, filtre, création, édition, validation, actions RBAC, états API | Routes Dashboard, procédures tRPC, services Core/Wallet |
| Domaine partagé | Authentification, session, rôles, fichiers, notifications, audit, sécurité et déploiement | Consentement, OTP, expiration, refus d’accès, traçabilité | Core, schéma, migrations, middleware et services |

## Convention de statut

| Statut | Définition |
|---|---|
| **Implémenté et vérifié** | Le comportement est présent dans le code et confirmé par test ou parcours observable. |
| **Implémenté, à vérifier visuellement** | Le code établit le comportement, mais son rendu ou son enchaînement doit encore être observé. |
| **Prévu ou non accessible** | Une surface ou un libellé existe sans capacité complète, ou nécessite des prérequis indisponibles dans cette copie. |
| **Exclu volontairement** | Une opération est absente par règle métier, sécurité ou limitation explicitement documentée. |

## Inventaire détaillé

Les sections suivantes seront enrichies avec la matrice des capacités, des routes, des composants, des contrats, des interrelations et des points de vigilance de refonte.

### Wallet mobile

Le Wallet mobile et le Wallet desktop reposent sur le même client, les mêmes vues et les mêmes contrats. En dessous de 640 px, l’application remplit la surface du terminal ; au-delà, elle devient une surface contenue. Les comportements métier ne divergent pas selon le format, mais le desktop ajoute un rail latéral, une composition plus large et un carrousel 3D.

| Surface | Déclencheurs et interactions | Données, règles et dépendances | Statut d’audit |
|---|---|---|---|
| Chargement | Animation de télémétrie, progression, transition vers l’application ; le mode d’aperçu l’écourte. | Prépare uniquement l’entrée visuelle ; il ne charge pas de données métier. | Implémenté et vérifié |
| Connexion | E-mail, mot de passe, soumission ou accès biométrique visuel. | `auth.login` renvoie un utilisateur à confirmer ; la vue métier reste masquée tant qu’aucune session n’est validée. | Implémenté et vérifié |
| OTP | Pavé à six chiffres, effacement, état de réussite et retour vers l’accueil. | Vérification via `/api/auth/verify-otp`; le code de développement est visible seulement hors production. | Implémenté et vérifié |
| Accueil | Accès au profil, alertes, recherche de transactions, solde masquable, actions Envoyer/Recevoir/Cartes, objectifs et suggestions. | `wallets.bootstrap` hydrate compte, cartes, opérations, bénéficiaires et objectifs ; les totaux dérivent de ces données. | Implémenté et vérifié |
| Cartes | Sélection de carte, gel/dégel, contrôles paiement en ligne/sans contact/retrait, détails, copie, renommage, déclaration perte/vol, PIN, plafonds, Apple Pay et Google Pay. | Le gel et les contrôles passent par `cards.setFrozen` et `cards.updateControls`; le retrait DAB est désactivé pour une carte virtuelle. Les actions PIN, renommage, portefeuilles mobiles et perte/vol exigent une vérification de persistance spécifique. | Implémenté, à distinguer entre opérations serveur et interactions locales |
| Objectifs d’épargne | Créer, alimenter, modifier, clôturer ou restituer un objectif. | `savingsGoals.create`, `fund`, `update`, `close`; les alimentations et clôtures utilisent une clé d’idempotence. | Implémenté et vérifié |
| Historique | Recherche locale par libellé, date, montant ou type ; regroupement par mois ; accès depuis l’accueil, profil et cartes. | Les lignes proviennent de `wallets.bootstrap`; les états vides distinguent absence d’activité et recherche sans résultat. | Implémenté et vérifié |
| Notifications | Consultation et marquage de lecture. | `notifications.listMine` et `notifications.markRead`; rechargement temps réel par `EventSource` lors d’une notification ou d’un document assigné. | Implémenté et vérifié |
| Profil, sécurité et documents | Identité, avatar par URL HTTPS ou fichier, documents attribués, indicateurs KYC, sessions, clés de sécurité, préférences et déconnexion. | `users.updateMe`, téléversement média, `documents.listMine`, `auth.listSessions`, `auth.webauthnListCredentials`, `settings.get`. Les documents sont ouverts via une URL média protégée. | Implémenté et vérifié |
| Réception et banque | Affichage du titulaire, devise, IBAN/BIC, QR de réception, partage/copie et envoi d’un justificatif de virement. | Les coordonnées sont hydratées depuis le compte quand elles existent ; le justificatif est téléversé puis déclaré par `documents.submitTransferProof`. | Implémenté et vérifié |
| Bénéficiaires | Recherche, ajout, détail, modification, suppression et raccourci de virement. | `beneficiaries.create`, `update`, `delete`; IBAN requis, banque et compte Wallet interne facultatifs. | Implémenté et vérifié |
| Envoi instantané | Saisie titulaire, IBAN, référence obligatoire, montant, prévisualisation du destinataire et validation. | Crée au besoin le bénéficiaire, puis appelle `transactions.transferExternal` avec une clé d’idempotence ; l’ordre est enregistré en attente de validation. | Implémenté et vérifié |
| Virement classique | Saisie destinataire, source, montant, référence, choix immédiat/programmé/récurrent. | Seul l’ordre immédiat est activé côté serveur ; programmation et récurrence affichent une limite explicite. Le client crée au besoin le bénéficiaire avant `transactions.transferExternal`. | Implémenté et vérifié |
| Partage de fonds | Montant total, sélection de bénéficiaires, répartition égale ou personnalisée, envoi des demandes. | Seuls les bénéficiaires reliés à un compte Wallet interne sont recevables ; `transactions.shareFunds` répartit les centimes restants et applique une clé d’idempotence. | Implémenté et vérifié |
| Transfert entre cartes | Choix source/destination, inversion et montant. | Exclu volontairement : les cartes d’un même Wallet partagent un solde ; le client affiche une explication sans mutation. | Exclu volontairement |
| Confirmation et reçu | Accusé d’opération, détails, référence, bénéficiaire, statut, retour à l’accueil, écran de reçu. | Reçoit le contexte de la mutation précédente ; les fonctions de renvoi/téléchargement de reçu doivent être distinguées de la disponibilité serveur effective. | Implémenté, à vérifier visuellement |
| Support et confidentialité | FAQ accordéon, composition/copie d’e-mail vers le gestionnaire, information sur demandes RGPD. | La demande de confidentialité est orientée vers le gestionnaire ; aucune action automatique de portabilité, rectification ou suppression n’est exécutée dans le client. | Implémenté et vérifié |

### Wallet desktop

Le desktop reprend l’intégralité du registre mobile ci-dessus et conserve les mêmes mutations, validations et états de données. Les différences sont donc principalement des **modes d’interaction et de présentation**, à préserver dans la future architecture visuelle.

| Capacité spécifique desktop | Interaction | Interrelation à préserver | Statut d’audit |
|---|---|---|---|
| Rail latéral | Accès direct à l’accueil, cartes, envoi, historique, notifications, banque et profil ; état actif synchronisé avec la vue. | Reprend les mêmes destinations que la barre d’onglets mobile, sans créer de route métier parallèle. | Implémenté et vérifié |
| Carrousel 3D de cartes | Boutons précédent/suivant, points, clic sur carte inactive, glisser-déposer, inertie, haptique lorsque disponible. | Synchronise la carte active avec les vues Cartes et les données `CARDS`; les textures utilisent le solde, le statut de gel, le titulaire, l’échéance et le réseau. | Implémenté et vérifié |
| Accessibilité du carrousel | Focus du carrousel, flèches gauche/droite, Home, End, états `aria-pressed`, libellé régional. | L’état textuel et ARIA est mis à jour indépendamment d’une frame WebGL afin de rester utilisable si le rendu graphique ralentit. | Implémenté et vérifié |
| Mouvement réduit et résilience WebGL | Écoute de `prefers-reduced-motion`, arrêt des mouvements flottants, suspension/reprise lorsque l’onglet est masqué ou le contexte WebGL est perdu. | Aucun comportement financier ne dépend de WebGL ; un échec graphique ne doit pas bloquer les données ni les actions Wallet. | Implémenté et vérifié |
| Contrôles desktop | Les icônes et certains libellés se normalisent au breakpoint large ; la surface est centrée et étendue. | Conserver une séparation entre tokens visuels desktop et comportement métier partagé. | Implémenté, à vérifier visuellement |

### Dashboard

Le Dashboard est une console interne Next.js protégée par une garde de session. Il propose une barre latérale sur large écran et une barre mobile avec panneau de navigation sous `lg`. Les modules restent les mêmes quelle que soit la taille d’écran ; seule la structure de navigation change.

| Module ou état | Actions et interactions | Données, rôles et interrelations | Statut d’audit |
|---|---|---|---|
| Connexion opérateur | Saisie e-mail/mot de passe, étape OTP, message d’erreur, indicateur de chargement et redirection après validation. | `auth.login`, `auth.devPeekOtp` hors production et `/api/auth/verify-otp`; une session valide est indispensable hors aperçu. | Implémenté et vérifié |
| Garde de session | État de vérification, erreur réseau avec réessai, redirection des sessions invalides ou du rôle utilisateur vers la connexion. | Les seuls rôles admis sont `admin` et `agent`. Le mode aperçu nécessite explicitement `?demo=1`, est limité aux hôtes autorisés et persiste seulement pendant la session du navigateur. | Implémenté et vérifié |
| Navigation responsive | Barre latérale fixe avec profil opérateur en desktop ; barre haute et panneau mobile sur petits écrans ; indication de destination active. | Les destinations couvrent Accueil, Utilisateurs, Wallets, Documents, Leads, Notifications, Analytics, Support, Journal système et Paramètres. | Implémenté et vérifié |
| Accueil opérateur | KPI consolidés, flux récents et accès aux modules. | Agrège utilisateurs, tickets, leads, notifications, entonnoir de leads et KPI Wallet ; c’est la vue de synthèse inter-domaines. | Implémenté et vérifié |
| Utilisateurs | Recherche, filtre statut/KYC, création, fiche détail, modification identité et téléphone, suspension, réactivation, suppression et envoi de réinitialisation du mot de passe. | `users.list`, `create`, `update`, `suspend`, `reactivate`, `delete`, `resetPassword`. La création ou conversion affiche actuellement un mot de passe temporaire dans une notification : point de sécurité à revoir avant production. | Implémenté et vérifié |
| Pilotage Wallet — synthèse | KPI disponibles/réservés/volumes, alertes, virements en attente, listes de comptes, cartes, transactions et rapprochement ledger. | Lecture via `walletAdmin.kpis`, `wallets`, `cards`, `transactions`, `reconciliation`; les alertes dérivent d’ordres en attente, cartes gelées, expirations proches et écarts de ledger. | Implémenté et vérifié |
| Pilotage Wallet — décisions | Valider ou refuser un virement externe en attente via une confirmation explicite. | `transactions.resolvePending`; valider exécute la réservation, refuser la restitue. L’action est annoncée comme journalisée. Rôles `agent` et `admin`. | Implémenté et vérifié |
| Compte Wallet — cycle de vie | Créer un premier compte, ouvrir un compte dans une autre devise, activer, geler ou clôturer un compte, avec confirmations. | Création réservée à `admin`. La clôture impose des soldes disponible et réservé nuls ; EUR, USD et XPF sont proposés à l’administration. | Implémenté et vérifié |
| Compte Wallet — intervention et comptabilité | Gel d’urgence compte + cartes avec justification, ajustement positif/négatif avec motif, détail IBAN/BIC/solde. | `walletAdmin.emergencyLockdown` et `adjustBalance`, avec justification d’au moins huit caractères et clé d’idempotence. Réservé à `admin`. | Implémenté et vérifié |
| Cartes opérateur | Émettre, geler/dégeler, annuler, régler canaux et plafonds. | `cards.create`, `setFrozen`, `updateControls`, `walletAdmin.cancelCard`. Les numéros complets et références de token sont délibérément indisponibles au Dashboard. Les opérateurs gèrent le gel, les administrateurs les canaux, plafonds, émission et annulation. | Implémenté et vérifié |
| Bénéficiaires et objectifs | Créer ou modifier un bénéficiaire ; créer, modifier, alimenter ou clôturer un objectif. | Bénéficiaire désactivable plutôt que supprimable pour préserver le journal. Objectifs reliés aux mêmes contrats `savingsGoals` que le Wallet ; alimentation et clôture utilisent une clé d’idempotence. | Implémenté et vérifié |
| Console d’opérations Wallet | Virement interne, création d’un ordre externe et partage de fonds entre comptes. | `transactions.transferInternal`, `transferExternal`, `shareFunds`; actions réservées à `admin` depuis le Dashboard. L’ordre externe rejoint le circuit de validation en attente. | Implémenté et vérifié |
| Documents et justificatifs | Tableau, téléchargement, retrait, dépôt/attribution d’un PDF à un utilisateur, réception de preuve de virement. | Téléversement média puis `documents.assignPdf` ; PDF uniquement, 8 Mo maximum. Écoute de `transfer_proof.submitted` et `document.assigned` par EventSource. L’attribution notifie le Wallet. | Implémenté et vérifié |
| Leads | Affichage liste ou Kanban, recherche, filtre, changement de statut, notes et conversion en utilisateur. | `leads.list`, `update`, `convertToUser`. Le pipeline contient nouveau, contacté, qualifié, converti et perdu ; conversion soumise à la présence d’un e-mail. | Implémenté et vérifié |
| Notifications | Liste, statistiques, création immédiate ou programmée, ciblage global ou individuel, actualisation temps réel. | `notifications.list`, `create`, `users.list`; un événement `notification.created` actualise la vue et alimente le module Notifications du Wallet. | Implémenté et vérifié |
| Analytics | KPI et entonnoir des leads, avec lien vers le module commercial. | `analytics.leadsFunnel`. Cette page est analytique ; elle ne manipule ni les transactions ni les données Wallet sensibles. | Implémenté et vérifié |
| Support | Recherche/filtre de tickets, KPI, tiroir de conversation, changement de statut/priorité et réponse. | `support.list`, `reply`, `updateStatus`, `updatePriority`, avec mise en relation à l’utilisateur concerné. | Implémenté et vérifié |
| Journal système | Recherche texte, filtre par cible Wallet/carte/utilisateur/transaction et consultation JSON des détails. | `journal.list` en lecture seule ; il constitue la surface de traçabilité des opérations sensibles. | Implémenté et vérifié |
| Paramètres | Identité de plateforme, thème par défaut, devise visible, maintenance et e-mail de support. | `settings.getAdmin` et `settings.update`; c’est une configuration applicative, distincte des secrets et de l’infrastructure. | Implémenté et vérifié |

> **Frontière d’autorisation à conserver pendant la refonte.** Les rôles `agent` et `admin` ne possèdent pas les mêmes pouvoirs : un agent peut opérer les éléments courants tels que les décisions de virement, le gel de carte et la mise à jour d’un bénéficiaire ; les opérations structurelles et comptables restent réservées à l’administrateur.

### Interrelations et flux de données

Les deux interfaces s’appuient sur un unique domaine métier. Le routeur Core porte l’identité, les utilisateurs, les notifications, les leads, l’analytics, les paramètres, le support, le journal et les documents. Le routeur Wallet porte les comptes, cartes, bénéficiaires, transactions et objectifs d’épargne. La refonte ne doit introduire aucune copie concurrente de ces règles dans les interfaces.

| Flux transversal | Origine | Consommation et effets observables | Règles confirmées |
|---|---|---|---|
| Session et identité | Authentification e-mail/mot de passe puis OTP. | Le Wallet protège toutes les vues métier ; le Dashboard protège le shell et refuse le rôle `user`. | Les sessions transitent avec les requêtes authentifiées. Le Dashboard admet seulement `admin` et `agent`. |
| Hydratation Wallet | `wallets.bootstrap`. | Alimente simultanément compte, cartes, transactions, bénéficiaires et objectifs, puis actualise l’accueil, les cartes, l’historique et les transferts. | Une seule charge métier reste la source de vérité de la surface Wallet. |
| Notifications | Le Dashboard crée une notification ; le Wallet liste et marque sa lecture. | Le Wallet actualise ses données sur `notification.created`; le Dashboard actualise sa liste via le même événement. | Le ciblage, le statut lu/non lu et l’horodatage doivent survivre à la refonte. |
| Documents et justificatifs | Le Dashboard attribue un PDF ; le Wallet consulte les documents. Le Wallet dépose une preuve de virement ; le Dashboard la reçoit. | Les surfaces se synchronisent par `document.assigned` et `transfer_proof.submitted`. | Les fichiers passent par l’API média ; les documents attribués sont distincts des preuves de transfert. |
| Bénéficiaires | Le Wallet crée, modifie ou supprime son bénéficiaire ; le Dashboard peut créer ou modifier le bénéficiaire du compte sélectionné. | Un bénéficiaire interne peut porter un identifiant de compte Wallet et devenir éligible au partage de fonds. | Nom de 2 à 160 caractères, IBAN de 15 à 64 caractères, BIC facultatif ; le Dashboard préfère la désactivation à la suppression pour préserver les références. |
| Virement externe | Le Wallet ou le Dashboard crée un ordre externe. | L’ordre rejoint l’état `pending`; le Dashboard peut le valider ou le refuser, puis le Wallet reçoit l’état actualisé dans son historique. | Toute mutation monétaire utilise une clé d’idempotence ; les plafonds de requêtes sont plus stricts pour l’argent que pour les écritures ordinaires. |
| Virement interne et partage | Le Wallet et le Dashboard soumettent une opération entre comptes VTEX. | Les soldes et l’historique des comptes concernés évoluent dans le même domaine Wallet. | Un partage comporte de 1 à 20 destinataires avec des montants strictement positifs. |
| Cartes | Le Wallet donne au titulaire les contrôles usuels ; le Dashboard expose les contrôles administratifs. | Le gel et les canaux sont reflétés sur les deux surfaces après réhydratation. | Les numéros complets et les tokens restent exclus du Dashboard ; chaque montant de plafond est strictement positif. |
| Objectifs d’épargne | Le Wallet et le Dashboard manipulent le même objectif. | Création, alimentation, modification et clôture mettent à jour le solde réservé/disponible ainsi que l’activité. | Les alimentations et clôtures exigent une clé d’idempotence ; nom de 2 à 100 caractères et cible positive. |
| Intervention administrative | Le Dashboard déclenche un changement de statut, un gel d’urgence ou un ajustement motivé. | Ces opérations impactent directement les comptes et cartes vus dans le Wallet et sont conçues pour être journalisées. | Justification minimale de huit caractères pour gel d’urgence et ajustement ; clôture permise seulement lorsque les soldes sont nuls. |

| Famille de contrat | Opérations disponibles | Niveau d’accès à préserver |
|---|---|---|
| Comptes Wallet | Consulter le compte personnel, garantir un compte, charger le bootstrap, créer un compte administratif, changer son statut et rapprocher le ledger. | Titulaire authentifié pour son espace ; opérateur ou administrateur pour les vues de pilotage ; opérations structurelles réservées à l’administrateur dans l’interface. |
| Cartes | Lister, geler, modifier les canaux et plafonds, émettre, annuler, autoriser un paiement. | Le titulaire agit sur ses propres cartes ; opérateur/admin interviennent selon la granularité décrite plus haut. |
| Bénéficiaires | Lister, créer, modifier, supprimer ou désactiver. | Le titulaire agit sur les siens ; le Dashboard opère dans le contexte du compte ouvert. |
| Transactions | Consulter, transférer interne/externe, partager et résoudre un ordre en attente. | Les montants sont des centimes entiers positifs ; l’approbation est un circuit distinct de la création. |
| Objectifs | Lister, créer, modifier, alimenter et clôturer. | Un objectif est attaché à un compte Wallet et ne peut pas devenir une simple décoration indépendante du solde. |
| Core non financier | Utilisateurs, tickets, documents, notifications, leads, settings, journal et analytics. | Ces modules ne doivent pas contourner le domaine Wallet lorsqu’ils déclenchent une conséquence financière. |

> **Règle de conception pour la refonte.** Les états « chargement », « vide », « en attente », « refusé », « gelé », « clôturé », « indisponible », « lecture seule » et « action confirmée » sont fonctionnels. Ils devront obtenir des représentations visuelles explicites et cohérentes dans les trois surfaces, sans être remplacés par un simple changement de couleur.

### Vérification visuelle menée en aperçu

La page d’accueil Dashboard a été observée en aperçu local sur grand écran et à 375 px de large. Le bandeau de session simulée reste visible dans les deux formats. Le desktop expose la composition à deux colonnes de l’accueil ; le mobile empile les KPI, les accès d’intervention et les cartes analytiques tout en remplaçant le rail par une barre haute et un menu. Les compteurs sont correctement présentés à zéro dans cette copie sans données, ce qui confirme l’importance d’un état vide conçu comme une surface à part entière. L’icône de mot-symbole renvoie toutefois une erreur de ressource dans l’aperçu : il s’agit d’un défaut d’actif à corriger séparément de la refonte fonctionnelle.

### Matrice de préparation à la refonte

La future refonte doit partir des parcours et contrats recensés ci-dessus, non de la liste des composants existants. La matrice suivante définit ce qui peut changer visuellement et ce qui doit être traité comme un invariant de produit.

| Priorité | Domaine | Invariant fonctionnel à protéger | Liberté visuelle recommandée | Critère d’acceptation avant livraison |
|---|---|---|---|---|
| P0 | Authentification et session | Connexion, OTP, refus d’accès, rôles, reprise de session et erreurs réseau. | Repenser totalement la mise en scène, la hiérarchie, le formulaire et les états de vérification. | Aucun accès métier hors session ; chaque état de chargement, d’erreur et d’OTP reste atteignable au clavier. |
| P0 | Argent et confirmations | Montants en centimes, devise, solde disponible/réservé, idempotence, validation explicite et historique. | Moderniser les formulaires, reçus, aperçus et confirmations sans cacher les informations de décision. | Aucune mutation ne part deux fois ; statut final, référence et retour d’erreur sont compris sans dépendre d’une couleur seule. |
| P0 | Rôles et administration | Distinction utilisateur, agent et administrateur ; limites d’action et journalisation. | Réorganiser le Dashboard par contexte de travail, densité et hiérarchie des décisions. | Une action structurante n’est jamais proposée à un rôle non autorisé et les zones lecture seule restent explicites. |
| P0 | Documents et données sensibles | Fichiers protégés, avatar, IBAN, carte, preuve de virement et secret de session. | Revoir les listes, aperçus, métadonnées et messages sans exposer davantage de données. | Les masquages, permissions, contraintes de fichier et téléchargements protégés restent inchangés. |
| P1 | Architecture responsive Wallet | Mobile et desktop partagent les mêmes données et mutations ; le desktop ajoute un carrousel et un rail. | Construire deux compositions intentionnelles au lieu d’un simple redimensionnement : mobile orienté tâche, desktop orienté contexte financier. | Chaque flux principal est parcourable sur 375 px et sur grand écran sans perte d’action ni contenu tronqué. |
| P1 | Navigation et repérage | Tous les écrans actuels restent accessibles : accueil, cartes, réception, envoi, bénéficiaires, objectifs, historique, profil, support et confidentialité. | Définir une IA de navigation plus simple, avec une profondeur mesurable et des retours cohérents. | Aucun écran n’est un cul-de-sac ; le retour, le changement de compte/carte et l’accès aux alertes sont prévisibles. |
| P1 | États de données | Chargement, données vides, synchronisation, attente de validation, erreur et indisponibilité. | Créer une grammaire d’états unifiée entre Wallet et Dashboard, avec messages concis et actions de reprise. | Les écrans restent utiles sans données, comme le Dashboard vide observé en aperçu. |
| P2 | Cartes et identité visuelle | Une carte sélectionnée pilote les contrôles, l’affichage et les données contextuelles. | Le carrousel 3D peut être redessiné, simplifié ou remplacé si les commandes, l’accessibilité, le mouvement réduit et la résilience sans WebGL sont conservés. | Sélection de carte possible à la souris, au toucher et au clavier ; aucune opération dépend d’une animation. |
| P2 | Dashboard de pilotage | Les KPI, alertes, tables, filtres, tiroirs et confirmations restent les outils de décision. | Introduire une lecture par priorité, une densité adaptable et des tableaux plus lisibles sur mobile. | Les actions critiques exigent la même confirmation et les informations nécessaires restent visibles au moment de décider. |
| P2 | Micro-interactions | Haptique, toasts, accordéons, animations de solde et indices de gestes. | Recomposer avec une durée courte, un mouvement réduit et une sémantique d’état plus forte. | Le mouvement n’est jamais le seul signal de succès, d’échec ou de changement de statut. |

### Points d’attention techniques à résoudre avant une diffusion publique

| Sujet constaté | Impact sur la refonte | Décision recommandée |
|---|---|---|
| Gestion de carte partiellement locale | Certains contrôles visuels tels que PIN, renommage, portefeuilles mobiles, perte/vol et détails complets sont présents dans le client alors que les contrats serveur audités ne couvrent pas tous ces changements. | Distinguer explicitement les capacités réellement persistées, les prototypes et les capacités à développer avant de les mettre en avant visuellement. |
| Virements programmés et récurrents | L’interface les présente, mais le client annonce que le serveur ne les active pas encore. | Les présenter comme indisponibles ou masquer les options tant que le métier et la planification ne sont pas implémentés. |
| Coordonnées bancaires | Plusieurs écrans signalent encore un RIB, BIC ou QR en cours de provisionnement. | Concevoir un état de provisionnement clair, non une maquette de coordonnées prête à être utilisée. |
| Mot de passe temporaire dans une notification | La création d’utilisateur et la conversion de lead affichent un secret temporaire à l’écran. | Remplacer avant production par un lien d’activation à usage unique ou un mécanisme de transmission sécurisé. |
| Actif de marque manquant en aperçu | Le mot-symbole chargé depuis le stockage retourne une erreur dans l’aperçu observé. | Corriger la référence d’actif avant la phase de direction artistique pour ne pas fausser les revues visuelles. |
| Prévisualisation sans OTP | Le mode aperçu est nécessaire aux revues mais ne représente pas une session de production ni des données métier réelles. | Le conserver strictement limité aux hôtes de développement et exclure toute capture d’aperçu d’une démonstration client finale. |

### Ordre conseillé de la refonte visuelle

La première étape doit définir un système de design partagé — typographies, couleurs sémantiques, surfaces, densité, composants de statut, formulaires, tables, tiroirs, confirmations et navigation. La deuxième doit refaire le Wallet autour de ses cinq moments majeurs : entrée sécurisée, lecture du solde, choix de carte, mouvement d’argent et preuve de l’opération. La troisième doit restructurer le Dashboard autour des files de décision : intervention urgente, ordre à valider, compte à administrer, ticket à résoudre et information à diffuser. Chaque tranche doit être validée contre la matrice ci-dessus avant de remplacer l’écran suivant.
