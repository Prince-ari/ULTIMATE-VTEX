# Preuve de résilience Dashboard

Date de recette : 14 août 2026. La recette a été exécutée avec le Dashboard local, une session administrateur réelle et une interruption réseau temporaire limitée au transport tRPC. Aucune donnée métier n’a été créée, modifiée ou supprimée par cette recette.

| Écran | Chargement observé | État vide observé | État d’erreur observé | Retour normal |
|---|---|---|---|---|
| Analytics | `Vérification sécurisée de la session…` | Funnel à zéro et « Aucun lead enregistré » | Message global « Connexion au Dashboard indisponible » et action `Réessayer` | KPI à zéro après restauration et reconnexion administrateur |
| Leads | `Vérification sécurisée de la session…` | KPI à zéro et « Aucun résultat » | Message global « Connexion au Dashboard indisponible » et action `Réessayer` | Liste vide confirmée après la purge des leads de recette |
| Journal système | `Vérification sécurisée de la session…` | Non applicable : les journaux administratifs de préparation sont conservés volontairement | Message global « Connexion au Dashboard indisponible » et action `Réessayer` | Journal en lecture seule, filtres et lignes réelles visibles après reconnexion |

## Artefacts de preuve hors dépôt

Les artefacts de test sont conservés hors du contexte Docker afin de ne pas alourdir le déploiement Hostinger :

- `/home/ubuntu/vtex-wallet-final-evidence/dashboard-state-audit/audit.json` : sorties des états chargement et erreur pour les trois routes.
- `/home/ubuntu/vtex-wallet-final-evidence/dashboard-state-audit/analytics-blocked.png`
- `/home/ubuntu/vtex-wallet-final-evidence/dashboard-state-audit/leads-blocked.png`
- `/home/ubuntu/vtex-wallet-final-evidence/dashboard-state-audit/journal-blocked.png`

La garde `AuthGuard` couvre maintenant deux chemins distincts : une panne réseau conserve la session et propose une reprise ; un refus d’authentification `401` efface la session puis redirige vers `/login`. Ces deux comportements sont testés par `AuthGuard.test.tsx`.
