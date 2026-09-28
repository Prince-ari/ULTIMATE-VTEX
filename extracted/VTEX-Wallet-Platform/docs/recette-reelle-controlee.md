# Recette réelle contrôlée — Wallet et Dashboard

## Objectif

Cette recette valide la chaîne réellement déployée — DNS, HTTPS, API, e-mail OTP, rôles, stockage privé et interfaces — sans utiliser de fonds, de pièces d’identité réelles non nécessaires, ni de codes OTP dans les journaux. Elle complète les tests automatisés déjà réussis ; elle ne les remplace pas.

> Les environnements de prévisualisation et les parcours `?preview=` ou `?demo=1` restent exclus de cette recette. Ils affichent des états contrôlés mais ne prouvent pas la persistance, l’envoi e-mail ni les autorisations sur la cible réelle.

## Prérequis de go/no-go

| Contrôle | Critère d’acceptation | Responsable |
|---|---|---|
| Secrets | Clé Resend tournée et valeurs injectées via le gestionnaire sécurisé, jamais dans le dépôt ni un échange. | Propriétaire de l’infrastructure |
| Domaines | Deux URL HTTPS définitives : une pour le Wallet et une pour le Dashboard. | Propriétaire DNS |
| API et stockage | API, MySQL et stockage privé démarrés ; migrations Core puis Wallet terminées sans erreur. | Exploitation |
| CORS et WebAuthn | Origines HTTPS exactes ; domaine WebAuthn correspondant au domaine Wallet. | Exploitation |
| Comptes de recette | Un administrateur, un agent et un utilisateur de recette dédiés, avec mots de passe uniques. | Administrateur métier |
| Données | Aucun client réel ni montant réel ; les écritures de test sont identifiées et réconciliables. | Administrateur métier |

La recette s’arrête immédiatement si l’un de ces contrôles échoue. Il ne faut pas contourner l’OTP, relâcher les origines CORS, désactiver TLS ni substituer un rôle dans le navigateur.

## Parcours Wallet

| Étape | Action contrôlée | Résultat attendu | Preuve à conserver |
|---:|---|---|---|
| W-01 | Ouvrir l’URL HTTPS Wallet dans un navigateur sans session. | Écran de connexion ; aucune donnée financière rendue. | Capture sans donnée sensible. |
| W-02 | Se connecter avec le compte utilisateur de recette. | Réception d’un OTP transactionnel dynamique ; le code n’apparaît ni dans l’objet du courriel ni dans les logs. | Horodatage de réception, sans copier le code. |
| W-03 | Saisir un code erroné puis le code reçu. | Message d’échec clair, puis création de session seulement après succès. | Capture des états, code masqué. |
| W-04 | Vérifier accueil, masquage de solde, cartes, historique, objectifs, profil et notifications. | Lecture cohérente des données de recette ; bouton de confidentialité accessible au clavier. | Checklist signée. |
| W-05 | Téléverser un document de recette autorisé puis le consulter/télécharger. | Objet privé accessible uniquement par la route autorisée et le bon compte. | Nom technique du fichier non sensible. |
| W-06 | Créer un bénéficiaire et préparer un transfert de faible valeur de recette, sans valider de réseau de paiement externe. | Validation de formulaire et état métier cohérents ; aucune double écriture. | Identifiant de transaction de recette. |
| W-07 | Se déconnecter puis actualiser la page. | Session supprimée ; retour à la connexion sans donnée résiduelle. | Capture ou journal d’audit. |

## Parcours Dashboard et rôles

| Étape | Action contrôlée | Résultat attendu | Preuve à conserver |
|---:|---|---|---|
| D-01 | Ouvrir le Dashboard sans session puis avec un utilisateur standard. | Redirection à la connexion, puis refus explicite pour le rôle non opérateur. | Capture sans identifiant. |
| D-02 | Se connecter avec le compte administrateur de recette. | Accès aux modules autorisés : pilotage, utilisateurs, Wallets, documents, leads, notifications, analytics, support, journal et paramètres. | Liste de modules visible. |
| D-03 | Se connecter avec le compte agent de recette. | Accès limité aux modules et commandes autorisés ; aucun ajustement administrateur non permis. | Comparatif admin/agent. |
| D-04 | Rechercher un utilisateur, ouvrir son Wallet et consulter le journal. | Les filtres, liens et dates correspondent aux données de recette. | Référence d’utilisateur non personnel. |
| D-05 | Attribuer puis retirer un document de recette. | L’autorisation est mise à jour ; le Wallet utilisateur reflète le changement après actualisation. | Identifiant du document. |
| D-06 | Créer une notification de recette puis l’archiver. | Le Wallet la reçoit, le Dashboard trace l’action et l’archivage ne supprime pas l’audit. | Identifiant de notification. |
| D-07 | Simuler une indisponibilité d’API uniquement dans l’environnement de recette. | États distincts réseau/service, bouton de reprise, aucune commande rejouée automatiquement. | Capture de l’état dégradé. |

## Contrôles financiers et sécurité

Les opérations monétaires sont testées uniquement avec un jeu de données de recette isolé. Un administrateur effectue au plus une écriture d’ajustement documentée, avec justification et clé d’idempotence ; l’équipe vérifie ensuite une seule transaction, une écriture de ledger correspondante et l’absence de double mouvement après rafraîchissement ou reprise réseau. Les virements externes restent en attente tant qu’aucun prestataire réglementé n’est connecté.

| Contrôle | Attendu | Interdit |
|---|---|---|
| Idempotence | Le même identifiant de commande restitue le même résultat sans nouvelle écriture. | Cliquer plusieurs fois, relancer aveuglément ou réutiliser une clé pour une autre opération. |
| Permissions | Seul l’administrateur peut effectuer l’ajustement prévu. | Promouvoir temporairement un compte ou modifier un rôle via le navigateur. |
| Données | Soldes en centimes, ledger atomique, journal d’audit présent. | Manipuler un solde localement ou utiliser un montant réel. |
| OTP et session | Code à usage limité, cookie `HttpOnly` sécurisé, déconnexion effective. | Partager un code, l’inscrire dans une capture ou laisser une session de recette ouverte. |

## Clôture

La recette est acceptée lorsque chaque étape applicable est validée, les anomalies sont enregistrées avec leur impact et les comptes/documents/notifications de recette sont supprimés ou archivés selon la politique de conservation. Toute anomalie concernant l’OTP, les rôles, les montants, l’idempotence, le stockage privé ou TLS est bloquante et exige une nouvelle recette ciblée après correction.
