# Fond vidéo des écrans d’entrée Wallet

## Actif retenu

La vidéo fournie par l’utilisateur est publiée par **Tima Miroshnichenko** sur Pexels, sous l’identifiant `5197677`. La page Pexels présente l’actif comme libre d’utilisation et fournit une version MP4 verticale UHD de 1440 × 2560 à 25 images par seconde. La source de référence est la page Pexels communiquée par l’utilisateur ; l’URL binaire est uniquement utilisée pour obtenir un fichier local, puis servir l’actif depuis le stockage du projet.

## Périmètre

Le fond vidéo remplacera l’ancien fond split sur les vues Wallet antérieures à l’accueil : chargement, connexion et saisie/validation OTP. Les surfaces métier authentifiées — accueil, cartes, transferts, objectifs, documents, profil et historique — ne seront pas recouvertes afin de préserver leur lisibilité et leur statut fonctionnel.

## Garde-fous d’implémentation

La vidéo sera lue sans son, en boucle et sans interaction, derrière un voile sombre et une couche de dégradé. Le chargement utilisera une image de repli issue de l’actif ; `prefers-reduced-motion` et l’économiseur de données afficheront ce repli statique. Aucun texte, champ, code OTP ou indicateur de sécurité ne doit s’appuyer sur l’image seule pour rester lisible.

## Source

- Page de l’actif : https://www.pexels.com/fr-fr/video/homme-smartphone-internet-technologie-5197677/
- Crédit : Tima Miroshnichenko via Pexels

## Recette d’intégration

Les deux actifs sont servis avec succès depuis la prévisualisation Wallet. Sur la vue de connexion, le navigateur confirme un média de 1440 × 2560, en état prêt à lire et effectivement en lecture. Les aperçus `?preview=login` et `?preview=otp` ont été contrôlés à 375 px : les champs, la carte de connexion, le pavé OTP et le retour restent accessibles au-dessus de leur voile de contraste. Les outils de capture figent les vidéos à une image non représentative ; la disponibilité du média est donc vérifiée par son état de lecture plutôt que par cette image figée.
