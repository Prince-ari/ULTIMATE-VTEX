# Gabarit OTP transactionnel VTEX

## Périmètre

Le modèle visuel fourni est désormais adapté au backend dans `packages/core/src/email/otpTemplate.ts`. Le service Resend l’utilise à chaque demande de connexion via `sendOtpEmail()`. Le code affiché dans l’e-mail vient exclusivement du code OTP unique généré par `requestOtp()` puis stocké avec une durée de vie de cinq minutes.

| Élément | Comportement |
|---|---|
| Code OTP | Six chiffres uniques générés pour chaque demande ; le dernier code remplace le précédent. |
| Rendu HTML | Palette VTEX bleu nuit, carte claire, badge rouge, six boîtes de chiffres et avertissement antifraude. |
| Copie | Les six chiffres apparaissent dans les boîtes visuelles et dans une ligne monospace sélectionnable. |
| Repli | Une version texte reprend le code en clair pour les clients qui simplifient l’HTML. |
| Confidentialité | Le code ne figure plus dans l’objet de l’e-mail et n’est pas journalisé par le service d’envoi. |

## Règles de stabilité

Le gabarit n’utilise pas de JavaScript, de feuille CSS externe ni d’image embarquée volumineuse. Les styles de structure sont appliqués en ligne avec des tableaux de présentation, ce qui limite les divergences de rendu entre les principaux clients e-mail. Le délai affiché de cinq minutes est aligné sur le délai réellement appliqué par le backend.

## Test de réception contrôlé

Pour une recette réelle, utilisez un compte de test actif, demandez une connexion, puis vérifiez que l’e-mail contient les six chiffres visuels et la ligne copiable. Collez le code dans l’écran OTP avant son expiration. Répétez avec une seconde demande : le nouveau code doit être différent et le premier doit être refusé.

> Ne transmettez jamais un OTP reçu à un tiers. Un conseiller VTEX ne doit jamais demander ce code.

## Envoi de recette réalisé

Un e-mail de recette a été accepté par Resend le 26 août 2026 vers la boîte de réception choisie par l’utilisateur. Le code unique n’a été ni affiché dans cette documentation ni conservé dans les sorties de recette. La vérification restante consiste à ouvrir cet e-mail dans l’application mobile, puis à confirmer le rendu des six boîtes, de la ligne de copie et du pied de page.
