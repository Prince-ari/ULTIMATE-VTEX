# Revue finale d’interface — 14 août 2026

## Wallet desktop authentifié

La session de recette a été ouverte sur le Wallet hydraté par l’API locale. L’accueil affiche correctement le rail latéral, l’identité authentifiée, la recherche, les actions principales, le carrousel de cartes 3D et les états vides provenant du serveur. La grille desktop conserve deux colonnes principales sans chevauchement visible à 1280 px ; les contrôles de cartes et les libellés restent dans leurs zones respectives.

| Surface | Constat initial |
|---|---|
| En-tête et rail | Alignement stable, identité et navigation lisibles |
| Carte de solde | Hiérarchie lisible, action masquer contenue dans la surface |
| Carrousel 3D | Commandes précédent/suivant distinctes et carte visible |
| Actions rapides | Envoyer, Recevoir et Ajouter alignés sans collision |
| États serveur | Aucun objectif et aucune opération affichés sans valeur financière fictive |

Les vues Recevoir, Profil, Cartes, Historique, Notifications et Documents Dashboard font l’objet de contrôles complémentaires dans la suite de la revue.

## Parcours Recevoir et Cartes desktop

La vue **Recevoir** présente une carte principale correctement dimensionnée, une grille de quatre informations de compte, des coordonnées bancaires et le module de justificatif sans débordement à 1280 px. L’IBAN et les valeurs bancaires sont rendus en blanc neutre, et non en bleu. La vue **Cartes** sépare clairement la carte active, le centre de contrôle, les actions de sécurité, les détails et les bascules de paiement. Les étiquettes et leurs valeurs restent dans leur colonne sans collision observée.

| Surface | Constat |
|---|---|
| Recevoir — IBAN | Valeur blanche neutre dans le bloc de coordonnées |
| Recevoir — justificatif | Champ fichier, référence et bouton présents, hiérarchie lisible |
| Cartes — action urgente | Commande Geler la carte identifiable et visuellement isolée |
| Cartes — commandes secondaires | PIN, modification, perte/volée disposés dans une grille régulière |

## Version mobile et Dashboard

Une capture authentifiée a été contrôlée au breakpoint 390 × 844 px : le parcours **Recevoir** conserve sa grille de compte, le libellé de l’IBAN et sa valeur blanche sans chevauchement ni teinte bleue. Le Dashboard **Documents** a été examiné avec les données de recette : les indicateurs, colonnes de tableau, badges de nature, références et actions téléchargement/retrait restent alignés sur une largeur desktop standard.

| Surface | Constat |
|---|---|
| Mobile 390 px — Recevoir | IBAN blanc neutre, alignement à droite, libellé distinct et respirations conservées |
| Mobile 390 px — coordonnées | Valeurs longues autorisées à se couper sans dépasser leur colonne |
| Dashboard — indicateurs | Quatre KPI lisibles, espacés et cohérents avec le tableau |
| Dashboard — documents | Colonnes stables ; référence, date et actions restent dans leur rangée |

## Notifications et propreté de recette

La page **Notifications** conserve une structure desktop lisible : titres, cibles, statuts et dates sont alignés et le bouton de création reste accessible. La revue a toutefois révélé de nombreuses entrées générées par les tests locaux (utilisateurs `Test …`, notifications et documents associés). Ces données sont strictement locales, ne font pas partie du monorepo ni du déploiement Hostinger, et doivent être supprimées de la base de recette avant la clôture de la session afin que l’environnement reste propre.

La purge transactionnelle a supprimé ces artefacts sans affecter l’administrateur. Une seconde vérification du Dashboard confirme un état de notifications propre. La fiche **Profil** Wallet a également été corrigée : les compteurs d’alertes et d’objectifs, la date d’adhésion et l’état de session sont maintenant hydratés depuis l’API ; les textes fixes « 2 objectifs actifs », « 3 alertes récentes » et l’heure de dernière connexion ont été éliminés.

## Revue complète des vues Wallet

Les vues Accueil, reçu, Cartes, Profil, Confidentialité, Support, email, Informations bancaires, Recevoir, Historique, Notifications, Envoyer, Bénéficiaires, détail/formulaire bénéficiaire, partage, virements instantané/classique, transfert entre cartes et confirmation ont été activées l’une après l’autre dans la session navigateur. La vérification DOM n’a détecté aucun débordement horizontal de contenu sur les surfaces formulaires, listes, historiques ou coordonnées. Les seuls dépassements calculés concernent les cartes 3D défilables et les glyphes de chevron, deux éléments qui sont volontairement positionnés dans des conteneurs à masque et ne produisent pas de coupure visuelle dans la revue écran.

La fiche Profil affiche désormais le statut de vérification, les clés de sécurité enregistrées et les appareils actifs depuis les réponses `users`, `auth.webauthnListCredentials` et `auth.listSessions` ; aucun compte, score, appareil ou état d’authentification n’est plus présenté comme une valeur inventée.

## Pilotage Wallet Dashboard

La vue administrative Wallet a été vérifiée pendant son chargement puis après hydratation. Les surfaces de chargement sont remplacées par des états métier explicites : aucune alerte, aucun virement externe en attente et aucune transaction lorsque ces collections sont vides. Les KPI, le compte réel, les cartes masquées, le rapprochement ledger et le formulaire d’ouverture restent alignés sans collision ; la saisie d’identifiant technique est correctement reléguée dans un élément de secours.

## Nettoyage de recette et Utilisateurs

La purge locale a été étendue à toutes les adresses `@test.local`, puis exécutée dans une transaction en préservant l’administrateur. Le contrôle SQL confirme zéro utilisateur de test restant et un administrateur conservé. La page **Utilisateurs** du Dashboard confirme visuellement les mêmes compteurs : un compte, un actif, zéro suspendu et zéro KYC en attente ; la table ne contient plus que l’administrateur réel de recette.

Les vues **Support** et **Paramètres** ont été contrôlées sur leurs états vides et leurs contrôles administratifs. Support présente des compteurs nuls et un état vide explicite. La mise en page Paramètres est alignée, mais la revue a relevé des références historiques aux « Sprints » et un texte de logo en attente devenus incompatibles avec l’identité VTEX fournie ; ils sont traités comme reliquats à supprimer avant livraison.

Après correction et rechargement, Paramètres affiche une configuration produit journalisée, confirme la synchronisation du logo VTEX, explique l’administration des devises par compte et ne contient plus de référence au plan de développement historique. Le typecheck Dashboard a validé ce nettoyage.

## Parcours Wallet complémentaires

Les formulaires Envoyer et Virement classique ont été invoqués sans donnée afin de vérifier leurs garde-fous sans créer d’ordre : Envoyer renvoie son message explicite de champs requis et Virement classique n’émet aucune mutation lorsqu’aucun destinataire, IBAN ou montant n’est renseigné. Les vues Bénéficiaires, Historique, Notifications, Coordonnées et Support ont été activées sur les données propres. Le registre Bénéficiaires rend son état vide ; les coordonnées non provisionnées restent explicitement libellées et utilisent la teinte neutre `rgb(244, 246, 255)`, sans bleu résiduel ni information fabriquée.

La recette mobile 390 px a parcouru Accueil, Cartes, Recevoir, Envoyer, Historique, Notifications, Coordonnées, Bénéficiaires, Support et Profil. Chaque page ne présente aucun débordement horizontal global ; les seuls dépassements internes attendus relèvent du masque des cartes 3D et des chevrons. La vérification visuelle de Recevoir confirme l’IBAN/BIC neutre et lisible. La vérification Profil confirme la lisibilité des contrôles d’avatar, documents, sécurité et navigation mobile. Une localisation géographique affichée dans Recevoir a toutefois été identifiée comme non confirmée par la réponse compte et sera neutralisée avant livraison.

Après neutralisation, la capture Recevoir mobile affiche le titulaire et la devise hydratés, le type **Compte Wallet**, ainsi que « Non renseignée » ou « À confirmer » pour les données qui ne sont pas encore provisionnées. Le sous-titre de réception a été aligné sur cette même terminologie ; aucune adresse, ville, pays ou éligibilité bancaire non sourcée n’est conservée.

La capture finale confirme ce rendu à 390 px, sans débordement horizontal : le sous-titre indique « Compte Wallet · données serveur », l’IBAN et le BIC non provisionnés sont neutres, et l’espace reste équilibré entre l’en-tête, le QR de réception, les tuiles et les coordonnées.

## Modules Dashboard complémentaires

Après purge, **Leads** affiche des KPI à zéro et un état vide net ; **Analytics** affiche le même funnel vide sans donnée de recette. Le **Journal système** conserve uniquement les actions administratives réelles de préparation du compte et des cartes, en lecture seule, avec filtres et détail JSON visibles. La revue a relevé une dernière référence de sprint dans le texte descriptif du Journal : elle sera retirée sans supprimer les journaux métier conservés.

La purge ciblée des leads `@test.local` a été confirmée par SQL, par Leads (zéro KPI et « Aucun résultat ») et par Analytics (funnel vide). Journal conserve son état de lecture seule et ne contient plus la référence de sprint. Enfin, Historique Wallet affiche désormais un champ de recherche local, l’état vide « Aucun mouvement pour le moment », puis « Aucun mouvement correspondant » pour une recherche inexistante, sans débordement horizontal.

## États de résilience Dashboard

Analytics a été observé pendant son chargement puis avec son état vide réel. Une recette réseau isolée a ensuite temporairement bloqué le transport tRPC de Leads et Journal, sans modifier de donnée : les deux vues affichent d’abord « Vérification sécurisée de la session… », puis l’état explicite « Connexion au Dashboard indisponible » avec un bouton **Réessayer**. La garde ne révoque plus la session pour une indisponibilité réseau. La reprise est couverte par un test React unitaire réussi ; le typecheck Dashboard est également réussi.

Le relevé séparé et les chemins d’artefacts sont consignés dans [la preuve de résilience Dashboard](./dashboard-resilience-proof.md). La session administrateur a ensuite été recréée par le flux OTP de recette et le Dashboard est revenu à son état normal : navigation, indicateurs à zéro et journal réel sont accessibles.
