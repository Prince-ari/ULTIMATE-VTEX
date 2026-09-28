# Refonte de l'administration — Coffre de cartes (numéro, CVV, PIN) + kit visuel Leg Day du Dashboard

## Décision produit
L'administration **fournit elle-même, à la main, le numéro, le CVV et le PIN** des cartes, et veut les **voir clairement** (avec masquage / démasquage). Cette décision remplace la lecture prudente du cahier des charges (« jamais de PAN/CVV/PIN ») : les valeurs sont donc **stockées, chiffrées**, et lisibles par un seul rôle, de façon tracée.

> Rappel conformité : PCI-DSS interdit de conserver le CVV après autorisation et impose des contrôles stricts sur le numéro. Ce choix est celui du propriétaire de la plateforme ; le code le rend le moins risqué possible (chiffrement, moindre privilège, traçabilité, purge) et `VTEX_VAULT_STORE_CVV=false` désactive la conservation du CVV d'un seul réglage.

## Modèle
- Table unique **`card_vault`** (core, migration `0009_card_vault`, retour arrière `down/0009_card_vault.down.sql`) : `(wallet_type, card_id)` désigne `cards.id` (PERSONAL) ou `business_cards.id` (PROFESSIONAL). Pas de clé étrangère (deux paquets, deux historiques) : la cohérence est portée par le service.
- Colonnes chiffrées : `pan_enc`, `cvv_enc`, `pin_enc` — chacune un **AES-256-GCM** auto-décrit `keyId.base64url(iv ‖ tag ‖ chiffré)`. Le contexte authentifié (AAD) lie chaque chiffré à **sa carte et son champ** : recopier un chiffré sur une autre ligne fait échouer le déchiffrement.
- `pan_fingerprint` = **index aveugle** (HMAC-SHA256, sous-clé HKDF) : un même numéro ne peut être rattaché à deux cartes, sans jamais stocker le numéro en clair. La clé d'index est indépendante de la rotation (`VTEX_VAULT_INDEX_KEY`, à défaut la plus ancienne clé du trousseau).
- Compteurs de traçabilité : `set_by`, `last_revealed_at`, `last_revealed_by`, `reveal_count`.
- La ligne de carte reste cohérente : la saisie met à jour les quatre derniers chiffres, l'expiration (dernier jour du mois), le titulaire, le réseau (Visa/Mastercard détectés, jamais une carte CB) et, pour une carte personnelle, l'empreinte scrypt du PIN (`pinHash`).

## Clés
| Variable | Rôle |
|---|---|
| `VTEX_VAULT_KEYS` | `v2:<base64 32 o>,v1:<base64 32 o>` — trousseau. **Obligatoire en production** (le serveur refuse de démarrer sans, `assertProductionEnv`). |
| `VTEX_VAULT_KEY` | Raccourci : une seule clé (`v1`). |
| `VTEX_VAULT_ACTIVE_KEY` | Clé qui chiffre (défaut : la première). Les autres restent lisibles. |
| `VTEX_VAULT_INDEX_KEY` | Clé de l'index aveugle (stable à travers les rotations). |
| `VTEX_VAULT_STORE_CVV` | `false` : refuse toute conservation du CVV. |

Hors production sans clé : une clé de développement est dérivée de `JWT_SECRET` (identifiant `dev`). Production sans clé : **échec fermé**, jamais de clé de repli. **Sauvegardez la clé séparément de la base** : sans elle, les données chiffrées sont définitivement illisibles.

Rotation : ajouter `v2:…` **en tête**, `VTEX_VAULT_ACTIVE_KEY=v2`, garder `v1`. Les nouvelles écritures utilisent `v2`, les anciennes restent lisibles (`card_vault.key_id` permet de repérer les lignes à ré-écrire).

## Droits (RBAC, vérifiés côté serveur)
| Permission | SUPER_ADMIN | ADMIN | SUPPORT | Autres |
|---|---|---|---|---|
| `cards.read` (liste, fiche masquée, statut du coffre) | oui | oui | oui | non |
| `cards.vault.write` (saisir / modifier / effacer) | oui | **non** | non | non |
| `cards.reveal` (afficher numéro, CVV, PIN) | oui | **non** | non | non |

Donner l'accès à un ADMIN = retirer la permission de `SUPER_ADMIN_ONLY` dans `packages/core/src/auth/rbac.ts` (une ligne, testée).

## Règles de fuite (testées)
- `admin.cards.list`, `admin.cards.get`, `admin.users.file`, `walletAdmin.*` et les réponses du titulaire **ne renvoient jamais** numéro, CVV ni PIN — uniquement leur présence (`hasPan/hasCvv/hasPin`). Le titulaire ne reçoit plus non plus l'empreinte de son PIN (`pinConfigured`) : un PIN à 4 chiffres se retrouve en quelques millisecondes à partir de son empreinte.
- `admin.cards.reveal` est une **mutation** (POST, jamais mise en cache), limitée à 30 appels/min/acteur. La réponse porte `maskAfterSeconds: 30`.
- Journal : `card.vault.set`, `card.vault.reveal`, `card.vault.reveal_failed`, `card.vault.clear` avec acteur, rôle, session, IP, identifiant de requête et titulaire (`wallet_type/holder_id`). Le détail ne contient que les **noms** des champs et les quatre derniers chiffres — jamais une valeur.
- Minimisation : annuler / renouveler / remplacer une carte **purge** son coffre ; un PIN changé par le titulaire **invalide** le PIN du coffre.
- Saisie refusée = rien d'écrit (transaction). Donnée altérée ou clé absente = erreur claire + journal, jamais une valeur fausse.

## Interface (Dashboard › Cartes)
- Nouvelle page **Cartes** : galerie de vraies faces de carte ou liste, indicateurs cliquables, recherche, filtres (type, statut, coffre).
- **Fiche carte** (tiroir) : face masquée par défaut → « Afficher les données » (révélation journalisée) → chiffres qui « retombent » un à un, copie par champ, **remasquage automatique après 30 s**, à la fermeture, ou si l'onglet passe en arrière-plan ; les valeurs ne vivent que dans l'état du composant.
- **Saisie** : aperçu en direct sur la face, réseau détecté, clé de Luhn (indication, non bloquante), masque MM/AA, CVV/PIN masqués avec bascule, « champs vides = inchangés ».
- Liens directs : `/cartes?card=PERSONAL-12`, depuis la fiche utilisateur, Wallets et Wallet Pro.
- Un ADMIN ou SUPPORT voit la carte masquée avec une mention explicite (aucun bouton d'affichage).

## Kit visuel Leg Day (Dashboard, mode clair)
Tout ce qui est nouveau ou retouché suit `docs/LEGDAY.md` : radius 14/20/32/999, espacements 4·8·12·16·20·24·32, aucune bordure de carte, gradients 158° à trois paliers, matière (liseré + ombre), socles pleins (jamais de teinte translucide hors transactions), Mono réservé aux identifiants (n° de carte, CVV, PIN, IBAN), icônes SVG inline dessinées (`LegIcon`), destructif toujours rouge, cycle chromatique par ligne cliquable, éléments non cliquables sur surface propre.
- `apps/dashboard/src/app/legday.css` — classes `lg-*` (tiroir, dialogue, bouton pilule, socle, pastille, champs, segments, panneaux), `cf-*` (face de carte en unités de conteneur : ratio 1,586 conservé de la galerie à la fiche), `cv-*` (fiche carte), `cards-*` (page).
- `components/ui/legkit.tsx` (`LegDrawer`, `LegModal`, `LegConfirm`, `LegButton`, `LegSocle`, `LegPill`, `LegTabs`, `LegSection`, `LegRow`) et `components/ui/LegIcon.tsx`.
- Primitives existantes rhabillées (Button, Input, NativeSelect, Badge, Dialog, Drawer, Dropdown, ModuleDrawer, KpiRow, FilterBar) : toutes les pages en profitent sans changer de logique.
- Le Dashboard est **forcé en thème clair** (c'est le seul mode dessiné) ; le sélecteur de thème hérité du gabarit et ses liens factices (« Join Slack community », `emma.stone@acme.com`) ont été retirés ; **« Se déconnecter » fonctionne** et le menu affiche l'identité réelle.
- La fiche utilisateur, la création d'utilisateur et le mot de passe temporaire du Sprint 1 ont été refaits sur ce kit.

## Vérifications
- Tests : core 212 (dont crypto 8, coffre 11, rbac, env), router 27 (dont `admin.cards` 11), wallet 24, dashboard 104 ; **8 échecs préexistants inchangés** (limiteur de débit/fuseau horaire, clés Resend).
- `scripts/card-vault-e2e.mjs` (API réelle, 23 contrôles) : permissions par rôle, saisie chiffrée, aucune fuite (liste/fiche/journal), révélation, unicité, PIN du titulaire, effacement.
- Contrôle visuel réel (Browser pane) : galerie, fiche, révélation + remasquage automatique, saisie avec aperçu, mobile 430×932, desktop 1440×900.

## Limites connues / suite
- La révélation ne demande pas de ré-authentification récente (rôle SUPER_ADMIN + journal + limite de débit + remasquage). Une **authentification renforcée** (mot de passe ou Passkey de moins de 15 min) est prévue au Sprint 9.
- Le titulaire ne voit pas ses propres données de carte dans le Wallet (numéro, CVV) : à décider (affichage sur action explicite après ré-authentification).
- Ré-écriture des lignes après rotation : à outiller (script) si le trousseau change.
