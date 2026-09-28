# API publique VTEX `/api/v1` (Wallet Pro)

API serveur-à-serveur pour les entreprises. Base : `https://<votre-api>/api/v1`. Tout est en JSON UTF-8.

## Authentification

Une clé par en-tête : `Authorization: Bearer vtx_test_…` (ou `vtx_live_…`). Les clés se créent dans **Wallet Pro › Développeurs › Clés d'API** ; le secret n'est affiché qu'une fois.

| Clé | Utilisable quand… |
|---|---|
| `vtx_test_…` (test) | la plateforme est en simulation ou en mode test : aucun paiement réel n'est encaissé |
| `vtx_live_…` (production) | la plateforme encaisse en réel |

Une clé de l'autre environnement est refusée (`403 wrong_environment`). **N'utilisez jamais une clé dans un navigateur ou une application mobile** : l'API n'envoie aucun en-tête CORS, un navigateur ne peut donc pas l'appeler depuis un site tiers.

## Droits (scopes)

| Droit | Donne accès à |
|---|---|
| `wallet:read` | `GET /wallet` |
| `transactions:read` | `GET /transactions` |
| `payment_links:read` | `GET /payment_links`, `GET /payment_links/{id}` |
| `payment_links:write` | `POST /payment_links` |

Sans le droit requis : `403 insufficient_scope`. Une clé n'accède qu'aux données de **son** entreprise.

## Conventions

- Montants : **entiers en unités mineures** (centimes ; le franc Pacifique n'a pas de subdivision). `12500` = 125,00 €.
- Dates : ISO 8601 UTC (`2026-09-26T12:00:00.000Z`).
- Listes : `{ "object": "list", "data": [...], "has_more": true, "next_cursor": "…" }` ; `limit` de 1 à 100 (25 par défaut), `cursor` opaque à renvoyer tel quel.
- Erreurs : `{ "error": { "code": "…", "message": "…", "request_id": "…" } }` ; le même `request_id` est dans l'en-tête `X-Request-Id` — communiquez-le au support.
- Limites : 300 requêtes/minute et par clé ; 600/minute et par adresse ; 30 échecs d'authentification/minute et par adresse. Au-delà : `429 rate_limited` avec `Retry-After`.
- Aucune réponse n'est mise en cache (`Cache-Control: no-store`).

## Routes

### `GET /me`
La clé et ses droits : `{ object: "api_key", business, key_prefix, environment, scopes, livemode }`. Aucun droit requis.

### `GET /wallet` — `wallet:read`
Comptes de l'entreprise : `id`, `label`, `currency`, `status`, `available`, `reserved`.

### `GET /transactions` — `transactions:read`
Paramètres : `limit`, `cursor`, `account_id`. Plus récentes d'abord. Chaque transaction : `id` (référence), `type`, `direction` (`credit`/`debit`), `status`, `amount`, `fee`, `currency`, `description`, `account_id`, `created_at`, `completed_at`.

### `GET /payment_links` — `payment_links:read`
Paramètres : `limit`, `cursor`, `status` (`active`, `expired`, `draft`, `disabled`).

### `GET /payment_links/{id}` — `payment_links:read`
Le lien, ses compteurs (`visits`, `payments_count`, `collected`) et ses 20 derniers paiements (`id`, `status`, `amount`, `payer_name`, `payer_email`, `card_brand`, `card_last4`, `created_at`, `credited_at`). `{id}` est l'identifiant du lien (celui de l'adresse `/pay/{id}`).

### `POST /payment_links` — `payment_links:write`
Corps (`Content-Type: application/json`, 16 Ko max, **aucun champ inconnu** n'est toléré) :

| Champ | Type | |
|---|---|---|
| `name` | texte 2–160 | requis |
| `amount` | entier > 0 | requis, dans les plafonds de la plateforme |
| `currency` | `EUR`, `USD`, `XPF` | devise du compte crédité par défaut |
| `usage` | `single_use` ou `reusable` | `reusable` par défaut |
| `description` | texte ≤ 250 | |
| `expires_at` | date ISO future | |
| `account_id` | entier | compte crédité (premier compte actif par défaut) |

Réponse `201` : le lien, avec `url` (page publique de paiement, si `VTEX_PAY_BASE_URL` est configurée). Le payeur n'a besoin d'aucun compte ; le compte n'est crédité qu'après vérification du paiement auprès du prestataire.

**Idempotence** : envoyez `Idempotency-Key` (8–100 caractères parmi `A-Z a-z 0-9 _ . : -`). Rejouer la même requête renvoie `200` et le même lien (`Idempotent-Replayed: true`) ; la même clé avec un autre contenu renvoie `409 idempotency_conflict`.

## Codes d'erreur

| HTTP | `code` | Sens |
|---|---|---|
| 400 | `invalid_request`, `invalid_json` | paramètre ou corps invalide (le message dit lequel) |
| 401 | `missing_api_key`, `invalid_api_key`, `api_key_revoked`, `api_key_expired` | authentification |
| 403 | `insufficient_scope`, `wrong_environment`, `business_inactive` | droit ou environnement |
| 404 | `not_found` | route ou ressource inconnue (y compris ressource d'une autre entreprise) |
| 405 | `method_not_allowed` | méthode non permise (en-tête `Allow`) |
| 409 | `idempotency_conflict` | clé d'idempotence déjà utilisée pour un autre contenu |
| 413 / 415 | `payload_too_large`, `unsupported_media_type` | corps |
| 429 | `rate_limited` | trop de requêtes |
| 500 | `internal_error` | communiquez le `request_id` |

## Exemple

```bash
curl https://api.example.com/api/v1/payment_links \
  -H "Authorization: Bearer vtx_test_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042" \
  -d '{"name":"Commande 1042","amount":12500,"usage":"single_use","description":"Commande n° 1042"}'
```
