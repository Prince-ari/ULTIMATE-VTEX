# Direction de référence — Wallet et Dashboard VTEX

## Sources analysées

| Référence | Ce qui est retenu pour VTEX | Ce qui est volontairement écarté |
|---|---|---|
| Awwwards — *Banking app, Refresh animation, Dashboard and more…Interactions roundup!* | Une interface financière peut être expressive lorsque le mouvement reste subordonné à la compréhension de l’état, aux décisions et aux actions. Les transitions doivent rendre les changements d’état plus lisibles plutôt que produire une animation décorative. | Les effets de vitrine, les animations permanentes et toute surcharge qui ralentirait une opération financière. |
| UXDA — *Designing the User Experience of Online Banking* | Personnalisation, transparence, self-service, simplicité et esthétique forment une grille de décision pertinente. La navigation doit réduire le nombre de chemins et rendre les tâches critiques immédiatement accessibles. | Les structures historiques à forte densité de menus et les tableaux illisibles qui mélangent pilotage, assistance et opérations. |
| Qonto — *Product Tour* | La séparation stricte des domaines (compte, dépenses, factures, paiements, accès) sert de modèle au Dashboard : un espace ne doit pas concurrencer le travail d’un autre. La valeur affichée par le tableau de bord doit rester immédiatement actionnable. | Le modèle de banque professionnelle en blocs homogènes : VTEX gardera une expression de marque plus éditoriale et plus personnelle. |
| Wise Design | Une marque financière peut être mémorisable grâce à des fondations systématiques et des motifs visuels cohérents déployés sur les cartes, les campagnes et les surfaces produit. | L’importation de codes couleur, de styles de carte ou de langage visuel propres à Wise. |

## Direction appliquée à VTEX

Le Wallet desktop adoptera une composition éditoriale financière : une identité sombre et minérale, un rail de navigation stable, un espace principal très respirant et une zone de décision qui hiérarchise le solde, la carte active et les actions monétaires. Les actions restent compactes, proches de l’information qui les justifie, et les surfaces ne s’élèvent que lorsqu’elles représentent une unité financière distincte.

Le Dashboard adoptera une console opérateur de niveau institutionnel : la navigation système reste immédiatement repérable, les signaux de risque ou d’activité sont priorisés avant les données secondaires et les listes métier s’appuient sur une grille dense mais respirante. Le logo VTEX fourni sera traité comme une marque de plateforme, avec une présence nette sur le rail et les points de contexte sans se substituer aux repères de navigation.

La palette ressortira du logo fourni : bleu nuit presque noir pour l’infrastructure, indigo VTEX pour l’accent d’interaction et ivoire lumineux pour préserver une lecture longue confortable. Les grandes surfaces conserveront une faible texture de facettes et de halos, tandis que les actions critiques utiliseront un seul accent bleu net afin de protéger la compréhension.

## Références

1. [Awwwards — Banking app, Refresh animation, Dashboard and more…Interactions roundup!](https://www.awwwards.com/inspiration/banking-app-refresh-animation-dashboard-and-more-interactions-roundup)
2. [UXDA — UX Case Study: Designing the User Experience of Online Banking](https://theuxda.com/blog/digital-banking-case-study-ux-design-of-future-online-banking)
3. [Qonto — Product Tour](https://qonto.com/en/product-tour)
4. [Wise Design — Building a System for a Borderless World](https://wise.design/)

## Vérification de prévisualisation

Les premiers rendus desktop confirment l’application de la nouvelle grille, du rail sombre, des surfaces financières et de la hiérarchie de données. La prévisualisation locale autonome utilisée pour le Wallet et le Dashboard ne fournit pas la route `/manus-storage/` gérée par l’hébergement ; les captures finales seront donc produites avec l’actif de marque explicitement chargé dans le navigateur de recette. Le code client conserve exclusivement le chemin de stockage géré retourné pour le logo.

Les rendus de recette montrent désormais le logo VTEX transmis dans le rail du Wallet desktop et dans le rail du Dashboard. Le Wallet maintient une lecture sombre, éditoriale et personnelle ; le Dashboard conserve un canevas clair, dense et opérable, porté par un rail institutionnel sombre. Les deux formats restent alignés par les mêmes motifs radiaux, l’indigo de navigation et le lockup de marque.

L’écran Cartes conserve son état vide réel quand aucune carte n’est renvoyée par l’API : aucun support fictif n’a été ajouté pour les visuels. Le module Dashboard Wallet conserve de la même façon ses comptes, cartes, virements et transactions vides réels, avec la nouvelle densité de KPI, de surfaces et de tableaux.

La vérification étendue couvre également les choix de virement et le support : les cartes décisionnelles, les lignes de contexte, les formulaires et les appels à l’action suivent désormais le même système de contraste, de surfaces et d’indigo VTEX. Les captures `wallet-desktop-envoyer`, `wallet-desktop-beneficiaires`, `wallet-desktop-virement-choix`, `wallet-desktop-historique`, `wallet-desktop-profil` et `wallet-desktop-support` complètent cette validation.

Le Dashboard a été vérifié à la connexion ainsi que dans le module Analytics. Le lockup VTEX fourni est présent dès l’authentification puis persiste dans le rail système. Le canevas clair, les panneaux translucides, les KPI et les états vides restent cohérents entre le Dashboard général, Wallet et Analytics.
