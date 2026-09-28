# Portefeuille Pro → Dashboard — matrice fonctionnelle préalable

## Objet

Cette matrice recense les capacités actuellement visibles dans le Portefeuille Pro, les capacités déjà administrables dans le Dashboard et les commandes à ajouter pour obtenir une gestion complète depuis le Dashboard. Aucun code fonctionnel n’est modifié dans cette phase d’inventaire.

## Principes d’implémentation — protocole Legday

La réalisation suivra quatre règles : le Dashboard ne contournE jamais les services Wallet ; toute mutation reste serveur-authoritative, protégée par rôle et inscrite dans le journal d’audit ; toute opération monétaire utilise l’idempotence et un rafraîchissement de la donnée source ; l’interface reprend les composants, densités, états, couleurs, confirmations et toasts déjà utilisés par le Dashboard, sans introduire une seconde direction artistique.

## Matrice exhaustive

| Domaine Portefeuille Pro | Fonctionnalité observée | Dashboard actuel | Commande Dashboard cible | Permission / audit | Priorité |
|---|---|---|---|---|---|
| Compte | Consulter compte, devise, solde disponible, réservé et total | Présent dans Wallets | Maintenir la fiche compte avec rafraîchissement | admin/agent lecture ; journal des mutations | P0 |
| Compte | Créer un compte dans une devise | Présent | Conserver « Ouvrir un compte » et ajouter contrôles doublon/devise | admin ; audit création | P0 |
| Compte | Activer, geler, clôturer | Présent | Maintenir le contrôle de cycle de vie avec confirmation forte | admin ; audit statut | P0 |
| Compte | Gel d’urgence du compte et des cartes | Présent | Maintenir le panneau d’urgence et afficher le résultat détaillé | admin ; motif obligatoire ; audit | P0 |
| Compte | Ajustement crédit/débit | Présent | Maintenir l’ajustement avec justification, idempotence et aperçu | admin/agent selon politique ; ledger + audit | P0 |
| Compte | IBAN/BIC, RIB | Partiellement présent | Ajouter une section Coordonnées bancaires : provisionner, régénérer si autorisé, copier, télécharger le RIB, afficher le statut | admin ; audit ; aucune donnée bancaire inventée en production | P0 |
| Compte | Comptes multi-devises | Partiellement présent | Ajouter vue consolidée par titulaire et création depuis la fiche utilisateur | admin ; audit | P1 |
| Compte | Rapprochement ledger | Présent en lecture | Ajouter détail des écarts, export et action « marquer analysé » sans modifier le ledger | admin ; audit de résolution | P1 |
| Cartes | Lister cartes, réseau, quatre derniers chiffres, statut, expiration | Présent | Maintenir la liste filtrable par statut/réseau/titulaire | admin/agent lecture | P0 |
| Cartes | Émettre une carte | Présent | Enrichir émission : type, réseau, libellé, expiration, titulaire, justification, récapitulatif avant confirmation | admin/agent ; audit | P0 |
| Cartes | Geler / dégeler | Présent | Maintenir avec confirmation et historique du changement | admin/agent ; audit | P0 |
| Cartes | Annuler définitivement | Présent | Maintenir confirmation destructive et afficher motif | admin ; audit | P0 |
| Cartes | Renouveler | Présent depuis la dernière itération | Ajouter confirmation, motif facultatif, lien carte remplacée/nouvelle carte | admin/agent ; audit | P0 |
| Cartes | Remplacer carte perdue/volée/endommagée | Présent depuis la dernière itération | Ajouter choix de motif contrôlé, gel immédiat, nouvelle carte et trace | admin/agent ; audit | P0 |
| Cartes | PIN | Backend présent, commande Dashboard manquante | Ajouter réinitialiser/définir PIN sans jamais afficher ni stocker le PIN en clair | admin avec permission dédiée ; audit | P0 |
| Cartes | Canaux de paiement : en ligne, sans contact, retrait | Présent | Maintenir édition groupée avec aperçu des impacts | admin/agent ; audit | P0 |
| Cartes | Plafond par opération, quotidien, mensuel | Présent | Ajouter validation croisée, presets et historique des valeurs | admin/agent ; audit | P0 |
| Cartes | Renouvellement automatique | Visuel uniquement côté Wallet | Ajouter politique de renouvellement : activé, délai, carte cible, journal des exécutions | admin ; audit | P1 |
| Cartes | Nom de carte / détails / copie | Partiellement local au Wallet | Ajouter édition du libellé serveur et affichage des métadonnées non sensibles | admin/agent ; audit | P1 |
| Paiements | Autoriser un paiement carte | Backend présent, Dashboard manquant | Ajouter console de test/opération seulement pour workflow autorisé, avec canal, montant, commerçant et idempotence | admin/agent selon rôle ; audit + ledger | P1 |
| Paiements | Contrôler les paiements refusés par règles carte | Backend présent | Ajouter vue de diagnostic : statut compte, statut carte, canal, plafonds, dépenses jour/mois | admin/agent lecture | P1 |
| Virements | Virement interne Wallet → Wallet | Présent dans console | Ajouter recherche titulaire/compte, aperçu débit/crédit et confirmation | admin/agent ; idempotence + ledger + audit | P0 |
| Virements | Virement externe vers bénéficiaire | Présent dans console | Ajouter workflow « brouillon → en attente → approuvé/refusé » et validation de conformité | admin/agent ; idempotence + audit | P0 |
| Virements | Partage de fonds multi-destinataires | Présent dans console | Ajouter tableau de répartition, somme contrôlée, aperçu complet avant exécution | admin/agent ; idempotence + ledger | P0 |
| Virements | Transactions en attente | Présent | Ajouter détail, approuver, refuser, justification et historique | admin/agent ; audit | P0 |
| Virements | Historique | Présent | Ajouter filtres avancés, détail transaction, ledger associé et export | admin/agent lecture ; audit export | P0 |
| Bénéficiaires | Créer un bénéficiaire | Présent | Maintenir avec validation IBAN/BIC, doublon et lien Wallet interne | admin/agent | P0 |
| Bénéficiaires | Modifier identité, IBAN, BIC, statut | Présent | Maintenir formulaire complet avec confirmation si IBAN change | admin/agent ; audit | P0 |
| Bénéficiaires | Supprimer/désactiver | Partiellement présent | Ajouter suppression protégée ou désactivation, avec contrôle des ordres en cours | admin/agent ; audit | P0 |
| Bénéficiaires | Historique des modifications | Backend audit existant, UI absente | Ajouter timeline dans la fiche bénéficiaire | admin/agent lecture | P1 |
| Épargne | Créer un objectif | Présent | Maintenir formulaire nom, cible, échéance, compte source | admin/agent | P0 |
| Épargne | Modifier nom/cible/échéance | Présent | Maintenir avec contrôle de cohérence et aperçu | admin/agent ; audit | P0 |
| Épargne | Alimenter un objectif | Présent | Maintenir avec idempotence et aperçu du nouveau solde | admin/agent ; ledger + audit | P0 |
| Épargne | Clôturer et restituer | Présent | Maintenir confirmation destructive et détail de restitution | admin/agent ; idempotence + audit | P0 |
| Épargne | Vue consolidée des objectifs | Partiellement présente dans fiche compte | Ajouter filtres titulaire/statut/échéance et export | admin/agent lecture | P1 |
| Utilisateur | Voir titulaire, email, rôle | Présent dans détail Wallet | Ajouter lien direct vers la fiche Utilisateur et ses comptes/cartes | selon permission | P1 |
| Utilisateur | Bloquer compte et cartes depuis incident | Présent pour un compte | Ajouter recherche globale par utilisateur et action groupée | admin ; motif + audit | P1 |
| Notifications | Notifications Wallet de création, carte, virement, PIN | Créées côté service, consultation séparée | Ajouter centre Wallet filtrable par compte, type, statut et marquage lu | admin/agent ; audit des actions | P1 |
| Support | FAQ, support, composition email | Visuel côté Wallet | Ajouter suivi de demandes support liées à un compte | support/admin ; audit | P2 |
| Profil | Avatar, nom, profil | Partiellement visuel / Core séparé | Ajouter édition depuis Dashboard et propagation contrôlée au Wallet | admin selon politique ; audit | P1 |
| Paramètres | Nom plateforme, logo, thème, maintenance, support | Présent | Maintenir dans la DA Dashboard et ajouter validation/aperçu | admin ; audit | P0 |
| Paramètres | Overrides statistiques | Présent côté Core et UI récemment ajoutée | Maintenir avec distinction « calculé » / « override » | admin ; audit | P1 |
| Reporting | KPIs Wallet | Présent | Ajouter détail par devise, compte, période et export | admin/agent lecture | P1 |
| Reporting | Réconciliation | Présent | Ajouter drill-down par compte/écriture et export | admin/agent lecture ; audit | P1 |
| Sécurité | Journal des actions | Page Journal existante | Ajouter filtres domaine Wallet et lien vers objet mutationné | admin/agent lecture | P0 |
| Sécurité | Permissions fines | Rôles admin/agent existants | Introduire permissions Wallet dédiées : lecture, opérations, cartes, PIN, ajustement, clôture | admin ; journal des changements | P0 |
| Déploiement | Migrations et configuration | Partiellement documenté | Ajouter checklist migration, healthcheck DB, variables et smoke tests Dashboard | ops/admin | P0 |

## Écrans Dashboard à créer ou enrichir

### 1. Wallets — vue portefeuille

La page existante devient le centre de contrôle : KPIs, comptes, cartes, transactions en attente, rapprochement et recherche globale. La fiche compte conservera son tiroir actuel et recevra des sous-sections standardisées : Compte, Coordonnées bancaires, Cartes, Opérations, Bénéficiaires, Objectifs, Historique et Audit.

### 2. Wallets — commandes sécurisées

Les mutations monétaires et cartes seront regroupées dans des panneaux réutilisant `Button`, `Input`, `Badge`, `ConfirmDialog`, `DrawerSection`, les toasts et les états de chargement existants. Aucun modal spécifique au Wallet ne devra introduire une nouvelle grammaire visuelle.

### 3. Wallets — gestion globale

Une vue de recherche par titulaire permettra d’agréger comptes, cartes, RIB, bénéficiaires, objectifs, transactions, notifications et incidents. Les actions groupées seront limitées aux opérations explicitement autorisées et demanderont une justification.

### 4. Paramètres et sécurité

Les paramètres existants seront complétés par la matrice de permissions Wallet, les politiques de renouvellement et les options d’affichage. Les changements de permissions, maintenance et configuration bancaire seront tous journalisés.

## Ordre recommandé

**P0 — sécurité et exploitation immédiate :** coordonnées bancaires, PIN Dashboard, bénéficiaires complets, transactions en attente, permissions fines, journal Wallet, contrôles carte, workflow de remplacement/renouvellement, checklist migration.

**P1 — pilotage et productivité :** vue consolidée multi-devises, renouvellement automatique, recherche globale titulaire, reporting avancé, notifications Wallet, historique détaillé, drill-down ledger et exports.

**P2 — expérience complémentaire :** support lié au compte, profil/avatar administrable, FAQ pilotable et fonctions de personnalisation non financières.

## Hors périmètre explicite

La génération de numéros de carte complets, la récupération d’un PIN en clair, la création d’un véritable IBAN bancaire et l’exécution d’un paiement réel ne doivent pas être simulées dans le Dashboard. Ces capacités nécessitent respectivement un processeur de cartes, un stockage sécurisé HSM/équivalent, un établissement bancaire ou PSP et des intégrations réglementées.

## Validation prévue avant livraison

Chaque commande sera couverte par un test de permission, un test de validation d’entrée, un test d’idempotence pour les opérations financières, un test d’audit et un test d’interface Dashboard. Une recette finale vérifiera que les vues Wallet existantes restent inchangées et que toutes les actions nouvellement exposées utilisent les services backend officiels.
