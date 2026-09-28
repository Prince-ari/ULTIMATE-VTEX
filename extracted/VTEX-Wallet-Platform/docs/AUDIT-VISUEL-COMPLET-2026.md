# VANTEX — Audit visuel complet
## Wallet & Dashboard · Août 2026

---

## 1. WALLET — Vue d'ensemble

**Architecture :** Monolithe HTML unique de 6 443 lignes (452 Ko), contenant 3 399 lignes de CSS inline, 23 écrans en `<div class="view">`, et ~3 000 lignes de JavaScript.

**23 écrans identifiés :** login, otp, accueil, reçu, cartes, profil, confidentialité, support, email-compose, banque, recevoir, historique, notifications, envoyer, bénéficiaires, bénéficiaire-detail, bénéficiaire-form, partage-fonds, virement-choix, virement-instantané, virement-classique, transfert-cartes, confirmation.

---

## 2. WALLET — Diagnostic typographique

### Problème critique : échelle de taille anarchique

Le fichier utilise **29 tailles de police différentes** en px absolu. Voici le top 20 :

| Taille       | Occurrences | Usage type                |
|-------------|------------|---------------------------|
| 13px        | 37         | Body principal            |
| 12.5px      | 27         | Body alternatif           |
| 11px        | 27         | Labels secondaires        |
| 10px        | 25         | Micro-labels              |
| 12px        | 24         | Body tertiaire            |
| 10.5px      | 24         | Micro-labels bis          |
| 15px        | 19         | Sous-titres               |
| 9.5px       | 17         | Télémétrie / pied         |
| 14px        | 16         | Titres de section         |
| 9px         | 15         | Micro-texte               |
| 11.5px      | 15         | Entre-deux                |
| 18px        | 12         | Titres d'écran            |
| 16px        | 11         | Titres secondaires        |
| 19px        | 9          | Titres moyens             |
| 17px        | 8          | Titres intermédiaires     |
| 13.5px      | 8          | Body ambigu               |
| 22px        | 7          | Titres page               |
| 8.5px       | 5          | Ultra-micro               |
| 14.5px      | 5          | Taille orpheline          |
| 20px        | 4          | Titre accueil             |

**Verdict :** La moitié de ces tailles sont des « entre-deux » sans raison (12 vs 12.5, 10 vs 10.5, 13 vs 13.5, 14 vs 14.5). L'œil ne perçoit aucune hiérarchie — tout se noie. Un design system fintech professionnel utilise **6 à 8 étapes typographiques** maximum.

**Échelle recommandée :**
- `--text-xs: 10px` (monospace / badges)
- `--text-sm: 12px` (labels, metadata)
- `--text-base: 14px` (body principal)
- `--text-md: 16px` (sous-sections)
- `--text-lg: 20px` (titres de section)
- `--text-xl: 26px` (titres d'écran)
- `--text-2xl: 34px` (solde principal / hero)

### Familles de polices

3 familles déclarées, usage correct :
- **Inter** (`--f-sans`) : corps — OK
- **JetBrains Mono** (`--f-mono`) : montants, données — OK
- **Bricolage Grotesque** : utilisée en `!important` sur quelques éléments seulement — **rôle mal défini**

**Diagnostic :** Bricolage Grotesque est importée mais son rôle de "display" n'est ni systématique ni documenté. Elle apparaît de façon ponctuelle sans logique visible.

---

## 3. WALLET — Diagnostic palette et couleurs

### Variables CSS bien structurées (84 tokens)

La palette est cohérente dans sa structure :
- Navy core : `#252B5B` (accent), `#171b3d` (deep), `#3a4278` (soft)
- Surfaces : `#0d1020` → `#2c3457` (gradient de profondeur, 5 étapes)
- Texte : `#f2f2f6` (t1), `#b9bdd6` (t2), `#7c81a6` (t3) — hiérarchie claire
- Signature : `#8ea9ff` — couleur de marque correctement isolée
- Sémantiques : green `#2fbf8c`, red `#ef5a67`, amber `#e0a75e`, gold `#d9b579`

### Problème : prolifération de couleurs hardcodées

**30+ couleurs codées en dur** dans les styles inline et CSS, contournant les variables :
- `#fff`, `#f5f7fc`, `#fdfeff`, `#f6f8ff` — 4 blancs différents au lieu d'utiliser `var(--white)`
- `#7aa2ff`, `#9db2ff`, `#9fb5ef`, `#8ea9ff` — 4 bleus signature différents
- `#43e28a`, `#7cffb2`, `#6ee7a8` — 3 verts différents hors du token `--c-green`
- `#aab0e0` — orphelin, aucune raison d'exister

### Problème : 256 attributs `style=""` inline

Le HTML contient **256 styles inline**, rendant toute mise à jour de thème impossible sans modifier le markup. Exemples :
```html
style="color:#fdfeff"     ← devrait être var(--c-t1)
style="background:#43e28a" ← devrait être var(--c-positive)
style="font-size:13.5px"  ← n'existe dans aucune échelle
```

### Prolifération des rgba()

**23 occurrences** de `rgba(255,255,255,.06)` et des dizaines de variations manuelles d'opacité (`.04`, `.05`, `.06`, `.07`, `.08`, `.09`, `.10`, `.12`, `.13`, `.14`, `.16`). Chaque valeur est écrite en dur au lieu d'utiliser un système `--c-glass-XX` paramétrique.

---

## 4. WALLET — Diagnostic border-radius

**15 valeurs de rayon différentes** observées :

| Rayon   | Occurrences | Commentaire                     |
|---------|------------|----------------------------------|
| 20px    | 18         | Cards                            |
| 22px    | 17         | Cards variante — pourquoi ?      |
| 14px    | 15         | Inputs, sous-cartes              |
| 12px    | 14         | Sous-cartes variante             |
| 16px    | 13         | Boutons action                   |
| 999px   | 11         | Pills / badges                   |
| 9px     | 10         | Petit élément A                  |
| 8px     | 10         | Petit élément B — pourquoi 2 ?   |
| 100px   | 9          | Pills alias — doublon de 999px   |
| 5px     | 7          | Micro-radius                     |
| 28px    | 7          | Grandes cards                    |
| 24px    | 7          | Cards intermédiaires             |
| 2px     | 6          | Éléments plats                   |
| 18px    | 6          | Cards intermédiaires bis         |
| 10px    | 5          | Boutons secondaires              |

**Verdict :** 20px vs 22px, 8px vs 9px, 24px vs 28px, 999px vs 100px — aucune distinction visuelle perceptible. Les rayons dérivent au fil des itérations sans système.

**Échelle recommandée :**
- `--r-sm: 8px` (badges, tags)
- `--r-md: 14px` (inputs, boutons)
- `--r-lg: 20px` (cards)
- `--r-xl: 28px` (modales, hero)
- `--r-pill: 999px` (pills)

---

## 5. WALLET — Diagnostic iconographie

### 3 librairies d'icônes chargées simultanément

1. **Phosphor Icons** (`@phosphor-icons/web`) — 71+ usages (principal)
2. **Lucide** (`lucide@latest`) — 46+ usages (secondaire)
3. **Remix Icon** (`remixicon@4.6.0`) — chargé mais quasi-inutilisé dans le wallet

**Poids CDN cumulé estimé :** ~150–200 Ko de CSS/fonts pour 3 librairies dont une seule domine.

**Incohérence visuelle :** Phosphor utilise un trait de 1.5px, Lucide un trait de 2px, Remix un style rempli/outlined variable. Sur un même écran, 2 icônes adjacentes n'ont pas le même "poids" visuel — c'est le signe le plus visible d'un design non-système.

**Recommandation :** Standardiser sur **Phosphor uniquement** (déjà dominant). Supprimer Lucide et Remix Icon du wallet. Pour les ~46 icônes Lucide, trouver l'équivalent Phosphor (couverture quasi-totale).

---

## 6. WALLET — Diagnostic spacing

### Pas de grille de spacing

Les valeurs de padding/margin observées couvrent **15 valeurs** irrégulières : 2px, 4px, 6px, 8px, 10px, 12px, 13px, 14px, 16px, 18px, 20px, 22px, 24px, 26px, 28px.

La valeur `13px` (15 occurrences) casse la grille de 4 ou 8px. Les valeurs impaires (13, 17, 22, 26) fragmentent la cohérence verticale.

**Grille recommandée (base 4px) :**
`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`

---

## 7. WALLET — Diagnostic animations

**25 @keyframes** déclarées. C'est beaucoup pour un wallet mobile. Audit de pertinence :

| Animation           | Rôle                    | Verdict        |
|---------------------|-------------------------|----------------|
| crystalBreathe      | Halo/bloom pulsant      | ✅ Signature     |
| rotate              | Halo conic              | ✅ Loader        |
| sonar               | Pulses loader           | ✅ Loader        |
| spinCW / spinCCW    | Gyroscope loader        | ✅ Loader        |
| comet2              | Trait lumineux loader   | ✅ Loader        |
| orbit               | Satellite loader        | ⚠️ Redondant    |
| blink               | Curseur terminal        | ✅ Petite touche |
| regIn               | Réticules d'angle       | ⚠️ Faible impact|
| loaderFlash         | Flash de transition     | ✅ Finition      |
| facetDrift          | Motif SVG dérive        | ⚠️ CPU inutile  |
| nodePulse           | Points SVG pulsent      | ⚠️ CPU inutile  |

**Problème de performance :** `facetDrift` et `nodePulse` animent des SVG en continu sur CHAQUE écran (via `.vtx-field`), même quand la vue n'est pas active. Sur mobile bas-de-gamme, ça consomme du GPU pour rien.

---

## 8. WALLET — Diagnostic du split-background

Le concept de fond diagonal "split" (ivoire 60% / navy 40%) est la signature visuelle forte du wallet. **Bien exécuté** dans son principe. Points d'attention :

- Le biseau est répété 3 fois (`.phone`, `#loader-screen`, `.phone::after`) avec des angles légèrement différents (128°, 135°) — **harmoniser à 135° partout**
- Le masque pour confiner le grain à la zone sombre (`mask-image`) est copié 4 fois identiquement — **extraire en classe utilitaire `.dark-zone-mask`**
- Le `contain: layout style` sur `.phone` est correct pour les performances

---

## 9. WALLET — Diagnostic z-index

| z-index | Occurrences | Usage                            |
|---------|------------|----------------------------------|
| 0       | 18         | Fond, motifs                     |
| 1       | 52         | Contenu par défaut               |
| 2       | 18         | Vue active                       |
| 3       | 10         | Back button, overlays            |
| 4       | 5          | Modales                          |
| 5       | 3          | Tabbar                           |
| 9999    | 3          | Toast / urgence                  |
| 50      | 1          | Loader screen                    |

Relativement propre. Le saut de 5 à 9999 est brutal mais conventionnel pour les toasts.

---

## 10. DASHBOARD — Vue d'ensemble

**Architecture :** Next.js App Router + Tailwind CSS + CSS custom classes dans `globals.css` (485 lignes).

**10 pages :** Accueil, Utilisateurs, Wallets, Documents, Leads, Notifications, Analytics, Support, Journal, Paramètres + Login.

**Composants réutilisables :** 16 dans `/components/` + 7 dans `/components/admin/` + 5 dans `/components/ui/`. Architecture modulaire correcte.

---

## 11. DASHBOARD — Diagnostic palette

### 3 systèmes de couleurs qui s'écrasent mutuellement

Dans `globals.css`, les variables `--dashboard-*` sont **redéfinies 3 fois** sur `:root` :

**Système 1 — "Violet" (lignes ~1–100) :**
```css
--dashboard-violet: #554bdc;  /* violet vif */
--dashboard-muted: #7c8ba0;
--dashboard-bg: #f6f8fc;
```

**Système 2 — "VTEX AAA" (lignes ~230–300) :**
```css
--vtex-indigo: #4651a8;        /* indigo foncé */
--vtex-indigo-bright: #6879e6;
```

**Système 3 — "Monochrome Operator" (lignes ~310+) — GAGNE car dernier :**
```css
--dashboard-violet: #243247;  /* plus du tout violet ! */
--dashboard-muted: #697789;
--dashboard-bg: #f6f7f9;
```

**Verdict :** Le système 3 écrase le 1 par cascade CSS. Le `--dashboard-violet` est passé de `#554bdc` (violet réel) à `#243247` (bleu-gris foncé) — **le nom de la variable ment.** Les classes `.violet`, `.green`, `.amber` dans le HTML sont toutes rendues en gris monochrome par les overrides. Le code sémantique ne correspond plus au rendu réel.

C'est le **problème visuel le plus grave du Dashboard** : 3 couches de design empilées, avec un résultat qui n'est ni l'un ni l'autre.

---

## 12. DASHBOARD — Diagnostic typographique

### Polices

Le dashboard utilise exclusivement la stack system :
```css
ui-monospace, SFMono-Regular, Menlo, monospace  /* kickers, données */
```
Plus la stack par défaut de Tailwind pour le body.

**Aucune police custom n'est importée.** Pas d'Inter, pas de JetBrains Mono. Résultat : **aucune cohérence de marque** entre le Wallet (Inter/JetBrains) et le Dashboard.

### Échelle de taille

Plus disciplinée que le wallet grâce à Tailwind, mais les classes CSS custom réintroduisent des tailles arbitraires : `9px`, `10px`, `11px`, `12px`, `13px`, `14px`, `15px`, `17px`, `18px`, `21px`, `25px`, `30px`, `34px`, `46px`. **14 tailles** — mieux que le wallet mais encore trop.

---

## 13. DASHBOARD — Diagnostic iconographie

Le dashboard utilise **Remix Icon** via `@remixicon/react` — une seule librairie, cohérente.

Problème : c'est **différent du Wallet** qui est dominé par Phosphor. La même plateforme VANTEX montre deux familles d'icônes distinctes à ses utilisateurs.

---

## 14. DASHBOARD — Diagnostic sidebar

La sidebar est bien structurée (composant React isolé), mais :

- Le fond sombre (`#202b3b → #101826 → #080e17`) n'utilise **aucun des tokens navy du Wallet** (`#252B5B`, `#171b3d`)
- Le wordmark est chargé comme `<img>` depuis `/brand/vtex-logo.png` — pas de SVG inline, pas de contrôle couleur
- L'état actif utilise `box-shadow: inset 3px 0 #dbe2ea` — un indicateur gauche blanc sur fond sombre, correct ergonomiquement mais **aucun rapport avec la signature VANTEX** (pas de bleu signature, pas de gradient)

---

## 15. DASHBOARD — Diagnostic login

La page login est **la mieux designée du dashboard** : layout split (aside sombre / formulaire clair), responsive pensé, proportions justes. Mais :

- La palette de l'aside (`#26384e → #0d1725 → #060c14`) est du bleu-ardoise, pas du navy VANTEX
- Aucune des textures/motifs du Wallet (vtx-field, grain, halos) n'est présente — le login Dashboard et le login Wallet semblent appartenir à **deux produits différents**

---

## 16. SYNTHÈSE — Problèmes transversaux Wallet ↔ Dashboard

| Axe                | Wallet                       | Dashboard                     | Cohérence |
|-------------------|------------------------------|-------------------------------|-----------|
| **Police body**    | Inter                        | System stack / Tailwind       | ❌ Aucune  |
| **Police mono**    | JetBrains Mono               | System mono (SFMono/Menlo)    | ❌ Aucune  |
| **Icônes**         | Phosphor + Lucide + Remix    | Remix uniquement              | ⚠️ Partiel|
| **Navy de marque** | `#252B5B` / `#171b3d`        | `#243247` / `#101826`         | ❌ Différent|
| **Accent**         | `#5a6bd8` / `#8ea9ff`        | `#243247` (se dit "violet")   | ❌ Aucune  |
| **Border-radius**  | 8–28px, 15 valeurs           | 10–20px, plus contrôlé        | ⚠️ Faible |
| **Textures**       | Split, grain, halos, vtx-field| Rien — flat / clean           | ❌ Aucune  |
| **Architecture CSS** | Monolithe inline 3400 lignes | Tailwind + globals.css 485 l. | ❌ Aucune  |

---

## 17. PLAN D'ACTION — Priorisation par impact visuel

### Phase 1 — Fondations (impact maximal, effort modéré)

1. **Unifier la palette navy** : aligner Dashboard sur les tokens du Wallet (`#252B5B` comme accent, `#171b3d` comme deep). Renommer `--dashboard-violet` en `--dashboard-accent`.
2. **Supprimer les couches CSS mortes** du Dashboard (systèmes 1 et 2 dans globals.css) — ne garder qu'un seul système.
3. **Importer Inter + JetBrains Mono** dans le Dashboard pour aligner la typo.
4. **Consolider les tailles de police** du Wallet sur 7 étapes.

### Phase 2 — Iconographie et radius

5. **Standardiser sur Phosphor** dans le Wallet — éliminer Lucide et Remix.
6. **Migrer le Dashboard de Remix vers Phosphor**, ou au minimum aligner le style de trait.
7. **Consolider les border-radius** sur 5 tokens dans le Wallet.

### Phase 3 — Cohérence de marque

8. **Porter les textures VANTEX** (vtx-field, grain subtil, biseau) dans le Dashboard — au minimum sur la sidebar et le login.
9. **Éliminer les 256 inline styles** du Wallet — migrer vers des classes.
10. **Créer un package `@vtex/design-tokens`** partagé entre Wallet et Dashboard : palette, typo, spacing, radius.

### Phase 4 — Finitions

11. Harmoniser les animations (supprimer les redondantes, optimiser les SVG).
12. Ajouter `prefers-reduced-motion` globalement.
13. Audit d'accessibilité (contraste WCAG AA sur toutes les combinaisons texte/fond).
