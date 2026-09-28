# `@vtex/core`

`@vtex/core` est le noyau transverse de VTEX. Il fournit l’identité, les utilisateurs, les sessions, l’authentification par mot de passe + OTP, les Passkeys/WebAuthn, les rôles et permissions, les notifications, les leads, l’analytics générique, les paramètres, le support, le journal d’audit, les documents génériques et les protections HTTP communes.

> Le Core ne contient aucun compte financier, aucune carte, aucun solde, aucun RIB et aucune transaction. Ces capacités appartiennent à un domaine produit qui doit composer son propre routeur et son propre schéma avec `coreRouter`.

## Organisation

Le code métier est séparé du transport. Les services résident sous `src/modules`, le schéma Drizzle sous `src/db`, l’authentification sous `src/auth`, et les contrats tRPC sous `src/api`. La surface publique du package réexporte uniquement `coreRouter` et `CoreRouter`.

| Domaine | Contrat exposé |
| --- | --- |
| Authentification et sessions | `auth` |
| Utilisateurs et permissions | `users` |
| Notifications | `notifications` |
| Leads et conversion générique | `leads` |
| Analytics transverse | `analytics` |
| Paramètres publics et administration | `settings` |
| Support et tickets | `support` |
| Journal d’audit | `journal` |
| Documents utilisateur | `documents` |

## Frontière d’intégration produit

Un produit peut composer le routeur du Core avec ses propres procédures sans importer de logique métier dans `@vtex/core` :

```ts
import { coreRouter } from "@vtex/core"
import { router } from "@vtex/core/src/api/trpc"

export const appRouter = router({
  core: coreRouter,
  product: productRouter,
})
```

La fonction `createUserInternal` et le paramètre injectable `createUserFn` de la conversion des leads permettent à un domaine produit d’orchestrer ses propres effets de bord, tout en gardant le Core générique et testable.

## Authentification et sécurité

Le flux standard est `auth.login`, puis `auth.verifyOtp`. Le premier vérifie l’identifiant et le mot de passe, génère un code OTP à six chiffres et retourne l’identifiant utilisateur. Le second vérifie le code et retourne un token de session révocable. Les appels protégés transmettent ce token dans l’en-tête `Authorization: Bearer …`.

Les codes OTP, les sessions, les challenges WebAuthn et les buckets de rate limiting sont persistés en base. `auth.devPeekOtp` est strictement réservé au développement et refuse toute requête lorsque `NODE_ENV=production`. En production, l’envoi du code utilise `RESEND_API_KEY`.

Le serveur HTTP et le Route Handler Next.js appliquent CORS à partir de `ALLOWED_ORIGINS`. Une interface servie sur une origine différente doit être déclarée explicitement en production. Le token ne doit pas être stocké dans `localStorage`; l’intégration web recommandée est un cookie `httpOnly` posé par une couche serveur ou un proxy de même origine.

## Base de données et migrations

Le schéma utilise Drizzle avec le dialecte MySQL. Les migrations versionnées sont sous `src/db/migrations` et utilisent la table de suivi `__drizzle_migrations_core`. Le modèle `documents` conserve provisoirement le nom physique historique `wallet_documents` pour éviter une migration destructive de données existantes; cette compatibilité ne constitue pas une dépendance métier du Core.

Les tables Core sont `users`, `sessions`, `notifications`, `notification_reads`, `leads`, `settings`, `support_tickets`, `logs`, `rate_limit_buckets`, `otp_codes`, `webauthn_credentials`, `webauthn_challenges` et `wallet_documents`. Aucun runner de migration d’un autre domaine produit n’est exécuté par ce package.

Commandes principales :

```bash
pnpm --filter @vtex/core db:generate
pnpm --filter @vtex/core db:migrate
pnpm --filter @vtex/core typecheck
pnpm --filter @vtex/core build
pnpm --filter @vtex/core test
```

`db:push` reste réservé au développement. Les tests de services et les tests HTTP qui touchent Drizzle nécessitent une `DATABASE_URL` joignable et une base initialisée avec les migrations Core.

## Intégration de `vtex_final_v4`

Le dossier `vtex_final_v4` fourni avec l’archive est une application statique autonome. Il doit être transformé en client web de l’API Core pour les vues d’identité, de session, de notifications, de support, de documents et de paramètres. Ses données financières — cartes, soldes, virements, bénéficiaires et transactions — ne doivent pas être conservées dans le navigateur : elles nécessitent un routeur métier séparé, une base de données dédiée et des mutations atomiques côté serveur.

La scène Three.js et le rendu visuel peuvent rester côté client. Elle doit recevoir un modèle de carte obtenu par API, sans connaître les secrets de carte et sans devenir une source de vérité pour les soldes.
