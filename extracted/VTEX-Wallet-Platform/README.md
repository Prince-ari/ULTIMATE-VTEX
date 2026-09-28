# VTEX Core

Ce dépôt contient le **socle VTEX Core** : identité, sessions, authentification par mot de passe + OTP, Passkeys/WebAuthn, utilisateurs, RBAC, permissions, notifications, support, journal d’audit, paramètres, leads, analytics générique, documents, email, sécurité, rate limiting, CORS, validation, API tRPC et persistance MySQL.

Le Core est indépendant des domaines produit. Il ne contient pas de comptes financiers, de cartes, de soldes, de RIB, de virements ou de transactions. Un produit qui fournit ces fonctions doit ajouter son propre package métier, son schéma et ses procédures, puis composer le routeur final sans réintroduire ces dépendances dans `@vtex/core`.

## Structure

```text
apps/
├── api/        API Next.js/tRPC sur le port 4000
└── dashboard/  Dashboard d’administration du Core sur le port 3001
packages/
├── core/       auth, users, sessions, RBAC, notifications, support,
│               journal, settings, leads, analytics, documents et DB
├── router/     façade tRPC du Core, prête à être composée par un produit
├── money/      montants entiers et formatage monétaire générique
└── ui/         tokens CSS partagés
deployment/
├── docker-compose.hostinger.yml
├── Dockerfile.api
├── Dockerfile.dashboard
├── Dockerfile.wallet
├── Dockerfile.nginx
├── deploy-hostinger.sh
├── nginx.vtex.conf.template
└── VARIABLES-HOSTINGER.md
docs/
└── archive/legacy-extraction/  rapports historiques conservés hors runtime
```

## Contrat public

Le routeur final actuel est le routeur Core seul. Il expose les branches `auth`, `users`, `notifications`, `leads`, `analytics`, `settings`, `support`, `journal` et `documents`.

```ts
import { coreRouter } from "@vtex/core"

export const appRouter = coreRouter
```

Pour un produit composé, la frontière recommandée est :

```ts
export const appRouter = router({
  core: coreRouter,
  product: productRouter,
})
```

Le nouveau client VTEX final v4 pourra consommer le contrat Core pour l’identité, l’authentification, les notifications, le support, les paramètres et les documents. Ses fonctions financières devront être branchées sur un routeur produit distinct, côté serveur.

## Développement et validations

```bash
pnpm install
pnpm --filter @vtex/core db:migrate
pnpm --filter @vtex/api dev
pnpm --filter @vtex/dashboard dev
```

Les validations statiques et de production sont :

```bash
pnpm typecheck
pnpm build
pnpm test
```

Les tests qui touchent MySQL nécessitent une `DATABASE_URL` joignable. Le token de session ne doit jamais être stocké dans `localStorage`; une interface web séparée doit utiliser un proxy ou une couche serveur pour poser un cookie `httpOnly`, ou envoyer explicitement le Bearer token selon l’architecture retenue.

## Base de données et migrations

Les tables Core sont gérées par `packages/core/src/db/migrations`, avec la table de suivi `__drizzle_migrations_core`. Le module Documents utilise provisoirement le nom physique historique `wallet_documents` pour permettre une migration non destructive des données existantes. Ce nom est une compatibilité de stockage et ne constitue pas une dépendance métier.

Les anciennes notes, inventaires et rapports d’extraction ont été conservés dans `docs/archive/legacy-extraction/` pour traçabilité, mais ne sont pas chargés par le runtime et ne doivent pas être utilisés comme description de l’état courant sans vérification contre les sources.

## Déploiement

Pour un VPS Hostinger avec Docker, consulter `README-HOSTINGER.md`. Aucun fichier `.env` n’est livré : Hostinger injecte les valeurs nécessaires en s’appuyant sur [`deployment/VARIABLES-HOSTINGER.md`](./deployment/VARIABLES-HOSTINGER.md), qui ne contient aucune valeur sensible.
