# Catalogue exhaustif des fonctionnalités — VTEX Aurora Wallet

**Date :** 21 septembre 2026  
**Périmètre :** `apps/wallet` et ses contrats API existants  
**Objectif :** remplacer entièrement la présentation sans supprimer les capacités métier.

## 1. Résumé quantitatif

| Élément | Volume constaté |
|---|---:|
| Vues applicatives | 23 |
| Formulaires HTML | 3 |
| Contrôles `<button>` | 115 |
| Champs `<input>` | 29 |
| Mutations RPC appelées par le client | 16 |
| Requêtes RPC appelées par le client | 6 |
| Flux temps réel | 1 (`/api/events`) |
| Flux d’authentification | Identifiants + OTP à 6 chiffres |

## 2. Vues applicatives

| Vue | Fonctionnalités conservées |
|---|---|
| `login` | Connexion email/mot de passe, aperçu local, états de chargement et d’erreur, Face ID visuel |
| `otp` | Saisie OTP à six chiffres, clavier numérique, effacement, renvoi visuel, succès et erreur |
| `accueil` | Solde total, masquage du solde, cartes, carrousel 3D, sécurité, répartition mensuelle, actions rapides, objectifs, statistiques et activité |
| `recu` | Reçu de virement, montant, frais, référence, date, émetteur, IBAN, méthode et motif |
| `cartes` | Liste/carrousel de cartes, changement de carte, gel/dégel, limites, contrôles en ligne/contactless/DAB, portefeuille Apple/Google, détails carte, renommage |
| `profil` | Identité, email, photo/avatar, sécurité, sessions, clés WebAuthn, résumé notifications/objectifs, préférences |
| `confidentialite` | Informations et réglages liés à la confidentialité |
| `support` | Contact/support, justificatif de virement, import média et état d’envoi |
| `email-compose` | Composition d’un message/email de support ou de contact |
| `banque` | RIB/IBAN, BIC/SWIFT, titulaire, devise, informations du compte et copie |
| `recevoir` | Coordonnées de réception, QR/partage et informations du bénéficiaire du compte |
| `historique` | Recherche, filtres entrées/sorties, totaux, groupement mensuel, états vides et détail des mouvements |
| `notifications` | Liste, recherche/filtres, distinction notifications/suggestions, marquage lu et marquage global |
| `envoyer` | Hub d’envoi, bénéficiaires récents, virement instantané, virement classique et partage de fonds |
| `beneficiaires` | Liste, recherche, ajout, détail, modification et suppression de bénéficiaire |
| `beneficiaire-detail` | Détail identité/IBAN/banque, envoi, édition et suppression |
| `beneficiaire-form` | Création/modification, validation IBAN, nom, banque et compte Wallet interne |
| `partage-fonds` | Sélection de personnes, répartition égale/personnalisée, prévisualisation, envoi des demandes |
| `virement-choix` | Choix entre virement instantané et classique |
| `virement-instantane` | Destinataire, IBAN, montant, référence et transfert immédiat via API |
| `virement-classique` | Destinataire, IBAN, source, carte, montant, date, programmation et récurrence |
| `transfert-cartes` | Sélection de cartes, inversion, montant ; garde métier indiquant que le solde est partagé |
| `confirmation` | Confirmation, retour accueil et ouverture du reçu |

## 3. Capacités financières

Le Wallet gère l’affichage du solde disponible, la devise EUR/XPF, les cartes physiques ou virtuelles, le gel/dégel, les contrôles de carte, les virements externes, le partage de fonds, les bénéficiaires, les objectifs d’épargne, les mouvements entrants/sortants, les statuts pending/completed/rejected/instant et les reçus.

Les montants sont convertis entre unités majeures et centimes avec les helpers existants. Les mutations financières utilisent des clés d’idempotence quand le contrat le prévoit. Le design Aurora ne remplace aucune de ces règles.

## 4. Contrats API utilisés

| Appel | Usage |
|---|---|
| `wallets.bootstrap` | Chargement atomique du compte, cartes, transactions, bénéficiaires et objectifs |
| `auth.login` | Vérification initiale des identifiants |
| `/api/auth/verify-otp` | Validation OTP et session |
| `cards.setFrozen` | Geler/dégeler une carte |
| `cards.updateControls` | Modifier les contrôles de carte |
| `beneficiaries.create` | Créer un bénéficiaire |
| `beneficiaries.update` | Modifier un bénéficiaire |
| `beneficiaries.delete` | Supprimer un bénéficiaire |
| `transactions.transferExternal` | Virement classique/instantané |
| `transactions.shareFunds` | Partage de fonds entre comptes Wallet |
| `savingsGoals.create` | Créer un objectif |
| `savingsGoals.fund` | Alimenter un objectif |
| `savingsGoals.update` | Modifier un objectif |
| `savingsGoals.close` | Clôturer un objectif |
| `users.updateMe` | Modifier ou supprimer l’avatar |
| `notifications.markRead` | Marquer une notification comme lue |
| `documents.submitTransferProof` | Envoyer un justificatif de virement |
| `/api/media/upload` | Téléverser avatar ou justificatif |
| `/api/events` | Rechargement temps réel sur événements Wallet |

Les requêtes complémentaires de session, notifications, paramètres, documents et WebAuthn restent utilisées par `vtex-api.js`.

## 5. Interactions globales

Le shell conserve la navigation `showView`, le routeur History API, les previews par query string, le menu latéral responsive, la tabbar, les toasts, les états de service (chargement/erreur/retry), l’accessibilité de base, les préférences de devise, les actions clavier/tactiles, les états `prefers-reduced-motion` et les garde-fous de session.

## 6. Décision de remplacement

Le remplacement est **présentationnel** : la feuille Aurora globale est chargée en dernier et reprend le contrôle de la surface, des couleurs, des cartes, de la navigation, des formulaires et des états. Les identifiants HTML et les fonctions JavaScript sont conservés afin que le backend, les mutations et les tests continuent à fonctionner. Un snapshot complet de `apps/wallet` a été créé avant cette opération dans `backups/`.
