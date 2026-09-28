# LEGDAY — Design DNA de VTEX Wallet
### Document maître · Version 1.0 · Extrait de `/home/claude/vtex/apps/wallet/index.html`

> **Ce document n'est pas une proposition. C'est une constitution.**
> Toute valeur ci-dessous a été extraite du code réel du monorepo VTEX (marquée **OBSERVED**), ou déduite directement d'un pattern répété au moins 3 fois dans le code (marquée **INFERRED**). Aucune valeur n'est inventée. Une future instance de Claude qui reprend ce travail doit utiliser LEGDAY comme source de vérité unique, sans re-décider le langage visuel.

---

## 1. PRINCIPE FONDAMENTAL

Si une décision est définie dans LEGDAY, c'est une contrainte, pas une suggestion.
- LEGDAY définit Inter + JetBrains Mono → on n'utilise pas une autre police.
- LEGDAY définit le gradient `158deg` → on n'utilise pas un autre angle.
- LEGDAY définit la grille de radius à 4 valeurs → on n'invente pas de 5e valeur.

Avant de livrer un écran, pose la question de la **RULE 001** (voir Constitution, §30) : *"Est-ce que cet écran semble avoir été conçu par le même designer que les écrans LEGDAY existants ?"* Si non → corriger, pas improviser.

---

## 2. TYPOGRAPHIE

### 2.1 Font families — **OBSERVED**
```css
--f-sans: 'Inter', system-ui, sans-serif;
--f-mono: 'JetBrains Mono', monospace;
```
Aucune troisième famille. Aucun fallback créatif (pas de Bricolage Grotesque, malgré sa présence résiduelle dans un `@import` hérité — non utilisé dans les écrans refondus).

### 2.2 Font weights réellement utilisés — **OBSERVED**
| Poids | Usage |
|---|---|
| 400 | Corps de texte secondaire rare (placeholders) |
| 500 | `switch-sub`, notes, labels discrets |
| 600 | Labels de champ, boutons secondaires, qa-label |
| 700 | Noms de ligne (`switch-name`, `tx-name`), CTA, valeurs de stat |
| 800 | **Tout titre** (section, hero, montant), sans exception |

Il n'existe pas de 900 (Black) dans le système. Ne pas en introduire.

### 2.3 Échelle typographique complète — **OBSERVED**

| Niveau | Font | Size | Weight | Line-height | Letter-spacing | Couleur | Usage |
|---|---|---|---|---|---|---|---|
| **Display / Hero-big** | Inter | 30–34px | 800 | 1.02–1.05 | -.04em | `--c-t1` ou dark ink `#0a0d1e` | Titre de card hero (ex: "Envoyer vers un contact"), montant hero |
| **Section-title** | Inter | **28px exact** | 800 | 1.05 | -.035em | `--c-t1` | Titre de section pleine page (jamais 26px, jamais uppercase) |
| **Card-title** | Inter | 19–20px | 800 | 1.05 | -.025em à -.03em | `#fff` ou `#0a0d1e` selon fond | Titre à l'intérieur d'une tuile colorée |
| **List-title** | Inter | 14–15px | 700 | 1.3 | -.01em à -.02em | `--c-t1` / `#fff` sur fond coloré | `switch-name`, `tx-name`, `env-tile-name` |
| **Body / sub** | Inter | 12–13px | 500–600 | 1.4–1.55 | normal | `--c-t3` / `rgba(255,255,255,.78)` sur fond coloré | `switch-sub`, `tx-meta`, descriptions |
| **Kicker / eyebrow** | Inter | 10–11px | 700 | 1 | .08em à .12em | `--c-t3` uppercase | Labels de card hero ("SCORE", "NOUVEAU TRANSFERT") |
| **Mono / identifiant** | JetBrains Mono | 11–13px | 600–700 | 1.4 | normal | `--c-t2` | **UNIQUEMENT** IBAN, numéro de carte masqué, CVV, référence transaction |
| **Button label** | Inter | 14–15px | 700 | 1 | normal | `#fff` ou `#0a0d1e` | Tout CTA |
| **Nav tab label** | Inter | 12px | 700 | 1 | .01em | contexte | Tabbar actif |

### 2.4 Comportement typographique — **INFERRED du pattern répété**
- **Titres de card hero toujours sur 2-3 lignes courtes**, jamais sur une seule ligne large. Le `<br>` manuel est acceptable et utilisé (`"Solde<br>dispo."`, `"Envoyer<br>vers un<br>contact"`).
- **Rapport d'échelle violent** entre le kicker (11px) et le titre hero (30px) — ratio ~2.7×. C'est ce contraste qui crée la hiérarchie, pas la couleur.
- **Aucun texte n'est en majuscules** sauf les kickers/eyebrows et les anciens labels legacy non retouchés.
- **Règle Mono stricte** : JetBrains Mono ne sert JAMAIS à un montant hero ou une valeur mise en avant — seulement aux identifiants qui doivent être lus caractère par caractère (IBAN, CVV).

---

## 3. COLOR SYSTEM

### 3.1 Fondations — **OBSERVED** (`:root`)

**Backgrounds**
```css
--c-bg:      #100E0D;   /* page */
--c-s1:      #1a1817;   /* card standard */
--c-s2:      #24211f;   /* input, socle neutre */
--c-s3:      #2a2724;   /* card élevée */
--c-s4:      #332f2b;   /* card la plus élevée */
```

**Texte**
```css
--c-t1: #f5f7fc;   /* primaire */
--c-t2: #a8afd0;   /* secondaire */
--c-t3: #6b7396;   /* tertiaire / kicker */
```
Texte inversé (sur fond coloré) : `#fff` (titres) / `rgba(255,255,255,.78)` (sous-titres) sur fond saturé sombre ; `#0a0d1e` (titres) / `#4d5378` (sous-titres) / `#6b7396` (labels) sur fond platinum ou socle clair.

**Brand**
```css
--c-signature: #8ea9ff;  /* indigo primaire, actions & liens */
--c-positive:  #5FB03E;  /* vert VTEX (lime, PAS teal) */
--c-orange:    #E85820;  /* chaud/warm */
--c-gold:      #e6b34e;  /* or authentique — jamais détourné vers l'indigo */
--c-red:       #ef5a67;  /* danger */
--c-platinum:  #DCDAD0;  /* surface hero claire */
```

### 3.2 Tint system — usage LISTE-TRANSACTION uniquement — **OBSERVED**
```css
tint-primary:  rgba(142,169,255,.16)  /* + var(--c-signature) */
tint-positive: rgba(74,222,128,.14)   /* vert vif — DIFFÉRENT de --c-positive */
tint-warm:     rgba(255,107,61,.16)
tint-gold:     rgba(230,179,78,.15)
tint-danger:   rgba(239,90,103,.14)
```
**RÈGLE ABSOLUE** : ce tint translucide ne s'applique QU'AUX icônes de transaction dans une liste-timeline (Accueil, Historique). Il ne s'applique JAMAIS à une icône de section, de navigation ou de réglage — celles-ci suivent le protocole Leg Day (§5).

### 3.3 Palette Kaléidoscope — 12 teintes officielles — **OBSERVED**

| Famille | Teintes (foncée → claire) |
|---|---|
| **Verts** | `#3E8B54` (forêt) → `#4E9B4E` → `#79BC5F` → `#97CE5E` (lime) |
| **Bleus/Teals** | `#62B8B0` (teal) → `#4E93D9` (clair) → `#3D74B8` (moyen) → `#2A5B84` (profond) |
| **Rouges/Chauds** | `#8E3B36` (brique) → `#D0453C` (rouge) → `#E5903F` (orange) → `#F0CF52` (jaune) |

Socles analogues validés (section → socle, principe : socle = version plus claire ET saturée de la teinte de section) :
```
#2A5B84 → #5FA8D8     #3E8B54 → #97CE5E
#8E3B36 → #E5903F     #62B8B0 → #BFE3A8
```
**INTERDIT** : accord complémentaire brutal (ex. bleu profond + jaune). Toujours analogue, jamais complémentaire.

---

## 4. GRADIENT SYSTEM — **OBSERVED, formule unique**

Un seul angle, une seule formule, appliquée à toute surface qui doit avoir de la matière :

```css
background: linear-gradient(158deg,
  [teinte +15% luminosité] 0%,
  [teinte de base]         55%,
  [teinte -15% luminosité] 100%
);
```

**Gradient / Card standard sombre**
```css
Start:  #356E9C  End: #22496A  Stops: 0% / 55% / 100%  Angle: 158deg
Base:   #2A5B84
Usage:  toute card "bleu profond" du kaléidoscope
```

**Gradient / Card platinum (hero claire)**
```css
linear-gradient(158deg, #E5E3DA 0%, #DCDAD0 55%, #CFCCC0 100%)
Usage: goal-card, tête d'affiche Confidentialité, bandeau frais
```

**Gradient / Tuile neutre inactive**
```css
linear-gradient(158deg, #2E3140 0%, #24262F 55%, #1C1E25 100%)
Usage: filter-tile état inactif, avant sélection
```

Aucun gradient radial n'est utilisé pour les surfaces (réservé aux halos décoratifs ponctuels type bloom de carte 3D — hors périmètre Leg Day).

---

## 5. LE PROTOCOLE LEG DAY — spécification du composant central

> Source de vérité visuelle : capture Figma fitness app référence + card "Leg Day" (icône avion sur socle orange plein, glyphe blanc, card crème).

### 5.1 Règle d'or
Toute **card colorée** ou **ligne cliquable de réglage** applique ces 4 couches, dans cet ordre :
1. **Couleur pleine analogue** (gradient 158deg, §4) — jamais de transparence sur le fond de la card
2. **Socle d'icône** = couleur différente de la section, plus claire et saturée (§3.3)
3. **Glyphe unique simple**, fill blanc `#fff` sur socle foncé, dark ink `#0a0d1e` sur socle clair
4. **Matière** = ombre externe + liseré interne (§6)

### 5.2 Ce que Leg Day n'est PAS
- Ce n'est PAS un fond translucide `rgba(...,.14)` avec glyphe coloré — ça, c'est le tint system (§3.2), réservé aux transactions.
- Ce n'est PAS un aplat de couleur sans gradient directionnel — sans le §4, la card semble "déposée", pas "vivante".
- Ce n'est PAS un glyphe détaillé avec découpes internes complexes — max 2-3 formes simples.

### 5.3 Maelström chromatique — cycle par ligne
Dans une LISTE de lignes cliquables (switch-row, env-tile), chaque ligne prend une famille chromatique différente de sa voisine, via `nth-child`/`nth-of-type` :
```css
:nth-child(4n+1) → vert forêt / socle lime
:nth-child(4n+2) → bleu profond / socle bleu clair
:nth-child(4n+3) → brique / socle orange
:nth-child(4n+4) → teal / socle vert pâle
```
Un groupe suivant doit être **décalé** (commencer sur une autre famille) pour éviter la répétition verticale entre deux groupes consécutifs.

### 5.4 Exception sémantique
Une action destructive (ex. "Supprimer") reste **rouge en toute circonstance**, peu importe sa position dans le cycle. La sémantique de danger prime sur la cascade décorative.

### 5.5 Élément non-cliquable
Un élément d'affichage pur (ex. `.tc-picker` montrant une carte sélectionnée, sans `onclick`) NE reçoit PAS le maelström — seulement une surface propre `--c-s2`, sans glass, sans bordure résiduelle. Le protocole Leg Day complet est réservé à ce qui est **actionnable**.

---

## 6. SHADOW SYSTEM — **OBSERVED, 2 formules fixes**

**Shadow / Card matière** (portée externe + liseré interne haut)
```css
box-shadow:
  0 10px 28px -10px rgba(0,0,0,.55),
  inset 0 1px 0 rgba(255,255,255,.16);
```
Variante sur fond clair (platinum) : `rgba(0,0,0,.45)` + `inset ...,.3` ou `.6`.

**Shadow / Socle d'icône (relief pastille physique)**
```css
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.4),
  inset 0 -2px 4px rgba(0,0,0,.12),
  0 3px 8px -2px rgba(0,0,0,.28);
```
Variante "pressed"/accent (ex. bouton d'échange actif) :
```css
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.4),
  0 0 0 6px rgba(90,107,216,.16),
  0 6px 16px -6px rgba(90,107,216,.6);
```

Aucune autre formule d'ombre n'existe dans le système. Ne pas inventer de `box-shadow: subtle`.

---

## 7. BORDER SYSTEM — **OBSERVED**

**Règle dominante : ZÉRO bordure visible sur les cards.** Le système Leg Day sépare les surfaces par contraste de fond + ombre, jamais par un trait.
```css
border: none !important;
```
Seule exception : séparateur intérieur fin entre deux blocs d'une même card claire :
```css
border-top: 1px solid rgba(10,13,30,.12);   /* sur fond platinum */
border-top: 1px solid rgba(168,175,208,.08); /* sur fond sombre */
```
Radius : voir §8. Aucun style de bordure autre que `solid` fin de 1px pour les séparateurs internes. Aucune bordure `dashed`/`dotted` sauf la timeline (§10).

---

## 8. GEOMETRY SYSTEM

### 8.1 Grille de radius — **OBSERVED, exactement 4 valeurs**
```css
--r-pill: 999px;   /* boutons, tuiles de tri, badges */
--r-sm:   14px;    /* rare, éléments compacts */
--r-md:   20px;    /* quick-action, input */
--r-lg:   32px;    /* card standard — LA valeur par défaut */
```
Radius hero exceptionnel : **44px**, réservé aux têtes d'affiche platinum (goal-card, Confidentialité, bandeau frais) — plus arrondi que le standard pour signaler "ceci est le point d'ancrage visuel".

**Interdit** : toute valeur intermédiaire (18px, 22px, 24px, 26px, 28px sur un radius de card). Vérifier systématiquement.

### 8.2 Grille de spacing — **OBSERVED**
```
4 · 8 · 12 · 16 · 20 · 24 · 32 px
```
Aucune valeur hors grille (22px, 18px, 14px sont bannis, même s'ils "semblent proches"). Rythme vertical entre deux sections : **32px**. Padding intérieur standard d'une card : **20px**, hero : **24px**.

### 8.3 Socles — **OBSERVED**
```
--socle-xs: 28px  icône 14px
--socle-sm: 32px  icône 18px
--socle-md: 44px  icône 24px   ← standard liste
--socle-lg: 56px  icône 30px   ← standard hero/section
```

### 8.4 Dimensions composants
| Composant | Dimension |
|---|---|
| Quick-action tile (accueil) | hauteur ~110px, padding 22px 8px |
| Switch-row (liste réglages) | padding 16px 18px, radius 28px |
| Filter-tile (tuile de tri) | padding 20px, socle 52px |
| Bouton pill CTA | padding 6px 6px 6px 18-20px, pastille interne 36px |
| Header button rond | 44px |
| Avatar contact | 56px (hero) / 32-40px (compact liste) |

---

## 9. ICONOGRAPHY

### 9.1 Règle absolue — **OBSERVED, zéro exception**
**AUCUNE icône de police** (`ph-fill`, `ph`, `ri-*`, `data-lucide`) nulle part dans l'application — ni dans le HTML statique, ni dans les templates générés par JS (`render*()`). Toutes les bibliothèques d'icônes externes (Phosphor, RemixIcon, Lucide) sont chargées via CDN et **invisibles** dans tout environnement sans accès réseau — donc bannies par principe, pas seulement par contrainte technique.

### 9.2 Construction d'un asset — style "Solar Bold"
```
- SVG inline, viewBox 0 0 24 24 (ou 0 0 100 100 pour les marks)
- fill-first pour les silhouettes pleines, stroke 2.1-2.6px pour les tracés
- rounded terminals (stroke-linecap:round, stroke-linejoin:round)
- 2-3 formes maximum par icône — jamais de découpe interne compliquée
- occupation ~75-85% du viewBox
- taille de rendu : 18-20px dans un socle 44px ; 26-30px dans un socle 56px
```

### 9.3 Couleur du glyphe — règle de contraste
```
Glyphe blanc (#fff)     → quand le socle est une couleur SOMBRE saturée
Glyphe dark ink (#0a0d1e) → quand le socle est une couleur CLAIRE (jaune, lime, orange pâle, teal clair)
```
**Piège identifié** : ne jamais utiliser `var(--tx-bg)` (teinte translucide) comme couleur de contraste interne d'une icône — invisible par construction. Toujours `var(--c-s1)` (couleur de surface solide) ou une valeur hex fixe pour tout détail interne nécessitant du contraste.

**Piège identifié 2** : ne jamais forcer `fill:#0a0d1e` globalement sur tous les SVG d'un écran — ça remplit les formes prévues en outline. Cibler précisément par attribut : `svg[fill="currentColor"]`, `svg[stroke="#fff"]`.

---

## 10. TIMELINE / SÉPARATEURS

**Timeline verticale (Accueil, Historique — liste de transactions)**
```css
.item + .item::before{
  content:'';
  position:absolute;
  top: -[padding-vertical];
  left: 21px;                          /* demi-largeur icône 44px, moins 1px */
  height: [2 × padding-vertical];       /* comble exactement le gap */
  border-left: 2px dotted rgba(168,175,208,.32);
}
```

**Signal horizontal court (Notifications — dans la ligne elle-même)**
```css
.switch-row-signal{
  width:16px; height:2px;
  background-image: repeating-linear-gradient(90deg,
    rgba(168,175,208,.4) 0 3px, transparent 3px 6px);
}
```
Positionné ENTRE l'icône et le texte, sur la même ligne — effet "signal entrant", pas une timeline qui relie deux items différents.

---

## 11. COMPONENT DNA

### COMPONENT: Goal-card / Card hero d'objectif
```
Background: linear-gradient(158deg, #E5E3DA, #DCDAD0, #CFCCC0)
Radius: 44px
Padding: 24px
Icon socle: 56px, couleur pleine (--c-orange), glyphe blanc
Structure: flex [icône | nom+sous-titre | ring SVG 52px]
Ring: r=22, circumference=138.23, stroke-dasharray=138.23,
      stroke-dashoffset=circumference×(1-pct/100),
      stroke-linecap round, transform="rotate(-90 26 26)"
Interaction: tap = alimenter l'objectif (état actif) / ouvrir composer (état vide)
```

### COMPONENT: Quick-action tile
```
Height: ~110px | Padding: 22px 8px | Gap: 10px
Radius: 20px | Background: --c-s1
Socle icône: 44px, tint translucide (primary/positive/gold)
Label: 11.5px/600
```

### COMPONENT: Filter-tile (tuile de tri)
```
Grid: 1fr 1fr, gap 12px
Padding: 20px | Radius: 32px
État inactif: gradient neutre #2E3140→#1C1E25, socle #8A91B8
État actif: gradient Leg Day de la famille sémantique + socle analogue
Socle: 52px | Valeur/compteur: 22px Inter 800
Toggle: re-clic sur tuile active → désactive (retour "tout afficher")
```

### COMPONENT: Switch-row (ligne de réglage)
```
Padding: 16px 18px | Radius: 28px | Margin-bottom: 10px
Maelström: voir §5.3
Socle: 44px (liste standard) ou 56px (registre "référence" type Profil)
Nom: 15-16px/700/blanc | Sous-titre: 12-13px/rgba(255,255,255,.78)
```

### COMPONENT: Hero-grid 2 colonnes asymétrique
```
grid-template-columns: 1fr 1.15fr; gap: 12px
Colonne gauche: card portrait couleur pleine, min-height 210-220px,
  structure verticale [kicker/titre en haut | icône outline coin | valeur hero en bas]
  via justify-content:space-between
Colonne droite: card platinum, kicker + titre 28-30px Inter 800 + CTA en bas
CTA pill: fond platinum, radius 999px, padding 6px 6px 6px 18-20px,
  pastille 36px de couleur analogue contenant un glyphe directionnel blanc
Piège: TOUJOURS min-width:0; overflow:hidden sur les colonnes (sinon débordement)
```

### COMPONENT: Pill CTA (bouton principal)
```
Radius: 999px | Padding: 14-16px (pleine largeur) ou 6px 6px 6px 18-20px (avec pastille)
Background: gradient Leg Day 158deg (jamais un aplat)
Texte: 14-15px/700/blanc
Shadow: formule §6 "card matière"
```

### COMPONENT: Bouton d'échange / action unique isolée
```
Taille: 44px, cercle
Couleur: pleine saturée (ex. #5A6BD8), pas de maelström (élément unique, pas une liste)
Glyphe: blanc, stroke 2.4px
Interaction: transform scale(.9) [+ rotate(180deg) si sémantique d'inversion]
```

---

### COMPONENT: Hero-grid variante "options à niveaux" (vitesse, tarif, tier)
```
Même grille 1fr 1.1fr que le hero-grid standard, mais réutilisée pour distinguer
DEUX écrans jumeaux représentant deux niveaux d'une même famille d'action
(ex. Virement instantané vs classique).
Codage couleur = codage sémantique du niveau, pas décoratif :
  Tier rapide/premium → bleu profond + teal (énergique)
  Tier standard/économique → brique + platinum (posé, patient)
Colonne gauche : kicker "MÉTHODE" + icône ronde 36px coin haut-droit + titre 22px + sous-titre
Colonne droite : soit un second bloc informatif (kicker + valeur 22px centrée),
  soit un visuel relationnel (ex. avatars "Vous → Destinataire" avec flèche 18px entre eux)
```

### COMPONENT: Champ de saisie (protocole unifié)
```
Background: --c-s2 | Border: none (zéro bordure, comme toute surface LEGDAY)
Radius: 20px (--r-md) | Padding: 14px 16px
Font: Inter 14px/500 pour texte libre
Focus: box-shadow ring 0 0 0 3px rgba(94,124,226,.28), pas de changement de bordure
Classe .mono: JetBrains Mono !important — obligatoire sur TOUT champ identifiant
  (IBAN, numéro de carte, CVV, référence, code OTP)
.amount-input: JetBrains Mono !important, 19px/700/-.01em — jamais Inter
.send-btn: gradient 158deg bleu profond (formule §4), radius 999px, jamais un
  gradient ad-hoc par écran — jamais de bordure visible
```
Avant cette normalisation, la règle de base `.input` portait une bordure visible
`1px solid` (violant §7) et aucune garantie de police Mono sur `.amount-input`.
Trois écrans (Envoyer, Bénéficiaire-form/Transfert-cartes/Recevoir) avaient en plus
leurs propres surcharges `!important` avec bordure translucide de type glass —
toutes retirées au profit de la base unifiée.

## 12. LAYOUT DNA


- **Container mobile** : `.phone`, max-width 480px, padding horizontal implicite via les cards (pas de padding global sur `.view`)
- **Une seule colonne** en mobile, sauf le pattern hero-grid explicite (§11) qui introduit 2 colonnes en tête d'écran
- **Densité** : une card = un sujet. Pas plus de 4-6 lignes visibles sans scroll dans une liste de réglages avant rupture visuelle
- **Rythme de lecture** : header (44px boutons ronds) → recherche éventuelle (pill --c-s1) → contenu hero → sections secondaires → liste
- **Desktop** (`@media min-width:1024px`) : sidebar fixe 292px + contenu principal. **Le layout desktop DOIT recevoir exactement les mêmes tokens que le mobile** — c'est une couche séparée dans le code qui nécessite sa propre vérification systématique après chaque écran (voir §14 Pièges).

---

## 13. VISUAL HIERARCHY

**Niveau 1 — vu immédiatement** : titre de section 28px Inter 800, ou titre hero 30-34px sur card colorée. Obtenu par : taille + poids 800 + tracking négatif serré.

**Niveau 2 — vu ensuite** : la couleur pleine de la card elle-même (le kaléidoscope). Obtenu par : saturation + contraste avec le fond `--c-bg` environnant.

**Niveau 3 — secondaire** : sous-titres, métadonnées, kickers. Obtenu par : taille réduite (11-13px) + couleur atténuée (`--c-t3` ou blanc à 78% d'opacité) + poids 500-600.

Il n'existe pas de niveau 4 — au-delà, l'information doit être masquée derrière un clic (accordéon FAQ) plutôt que densifiée sur l'écran.

---

## 14. RULES VS EXCEPTIONS

### GLOBAL RULES (s'appliquent partout, sans exception)
- Zéro icône de police (§9.1)
- Zéro split diagonal navy/ivoire — fond uni `--c-bg` partout, y compris desktop
- Zéro bordure visible sur une card (§7)
- Radius uniquement dans la grille à 4 valeurs + le radius hero 44px (§8.1)
- Spacing uniquement dans la grille 4/8/12/16/20/24/32 (§8.2)
- Titres de section = 28px exactement (§2.3)
- JetBrains Mono réservé aux identifiants, jamais aux montants hero (§2.4)

### COMPONENT RULES (spécifiques à un composant, voir §11)

### SCREEN RULES (spécifiques à un écran)
- Login/OTP : écrans d'atmosphère (vidéo, particules) — NE reçoivent PAS le maelström arc-en-ciel sur leurs éléments (clavier OTP, formulaire). Traitement en couleur unique cohérente avec matière, pas en cascade multicolore. *Justification : un pavé de code de sécurité en arc-en-ciel nuit à la lisibilité et détonne avec le contexte "confiance/sécurité".*
- Reçu / Email-compose : le concept créatif du "reçu papier imprimé" (fond ivoire, séparateurs en tirets ASCII, languette de papier) est **conservé** comme registre visuel distinct et intentionnel — mais tout le CHROME autour suit le protocole Leg Day complet : icônes de la liste en kaléidoscope (socle coloré + glyphe dark ink), boutons en gradient 158deg + matière, crest/avatar en socle plein. La distinction est : le "papier" lui-même reste un artefact visuel unique, mais aucun élément fonctionnel (icône, bouton, avatar) ne doit paraître "moins fini" que le reste de l'application.
- Cartes (écran) : le design de la carte bancaire physique/virtuelle elle-même (3D, gradient navy, puce EMV) est **conservé tel quel**, hors périmètre Leg Day — c'est un artefact à part, pas une card de réglage.
- **Recharge par carte (Wallet perso `#view-recharger` + Wallet Pro `/topup`) — OBSERVED** : toute la page est un reçu papier plein cadre, sur fond platine `#E5E3DA → #CFCCC0` (gradient 158deg, §4). Le « ticket » est le formulaire lui-même, écrit en direct : lignes à points de conduite, séparateurs en tirets ASCII (Mono), référence `TOP-…` en Mono, code-barres dérivé de la référence, étapes du paiement horodatées à la seconde, tampon **PAYÉ** (encre verte) ou **REFUSÉ** (encre rouge), et une **souche** détachable (perforation + ciseaux) qui montre le solde en direct (compte à rebours vers la nouvelle valeur) et les dernières opérations. Le CTA « argent qui entre » reste le gradient forest (§4). Trois valeurs nouvelles, hors des 12 teintes Kaléidoscope, propres à ce registre :
  - papier du ticket : `#F0EEE6` ;
  - encre verte (montants crédités, tampon PAYÉ) : `#2F6E41` ;
  - encre rouge (erreurs, tampon REFUSÉ, badge « Réel ») : `#B23A32`.
  Bord inférieur en dents de scie (`conic-gradient` en masque, 16 px), ombre `drop-shadow` chaude `rgba(70,60,40,.26)`. Sur desktop, la mise en page passe en deux colonnes (ticket 560 px + souche 340 px) via une *container query* (`@container tp (min-width:920px)`), pas une media query : la vue vit aussi dans le cadre `.phone`. Le Payment Element Stripe est thémé pour ce papier (Appearance API : fond `#DCDAD0`, rayon 20 px, libellés 11 px majuscules).

### EXCEPTIONS
- `.tc-picker` (Transfert entre cartes) : élément d'affichage, pas cliquable → pas de maelström, juste surface propre (§5.5)
- Tuile "Supprimer"/danger : toujours rouge, ignore le cycle du maelström (§5.4)
- Cartes 3D de l'accueil : hors système Leg Day par décision produit explicite

---

## 15. ABSOLUTE VALUES VS DERIVED VALUES

Toutes les valeurs de ce document sont **OBSERVED** (extraites directement du code source `index.html`/`vtex-api.js` du monorepo VTEX au moment de la rédaction), sauf :
- Les tailles de composants au §8.4 marquées par une fourchette (~) sont **INFERRED** d'un pattern répété, pas d'une valeur unique figée.
- Le tableau §2.3 "Échelle typographique" agrège des valeurs OBSERVED dispersées dans le code en une échelle nommée — la structure du tableau est une reconstruction, les valeurs numériques sont réelles.

Aucune valeur de ce document n'est **APPROXIMATED** (estimée sans base dans le code).

---

## 16. PIÈGES OPÉRATIONNELS — mémoire de session critique

Ces pièges ont été rencontrés et corrigés pendant la construction de LEGDAY. Toute future instance DOIT les vérifier systématiquement, car ils sont invisibles à la simple lecture du code :

1. **Un fond translucide `.tx-av, .switch-ic{background:rgba(...)!important}` peut aplatir tout style inline posé par du JS.** Solution : passer les couleurs via custom properties inline (`style="--tx-bg:X;--tx-col:Y"`) puis les lire dans une règle scopée `!important` — jamais de `style="background:X"` direct sur un élément visé par une règle globale `!important`.

2. **La proximité textuelle d'un `@media` n'indique PAS son scope réel.** Un bloc peut se refermer plus tôt que sa position dans le fichier ne le suggère. Toujours vérifier via `getComputedStyle()` + `rule.parentRule` dans le CSSOM, jamais par lecture visuelle du fichier.

3. **Le layout desktop est une couche CSS entièrement séparée** (`@media min-width:1024px`) qui peut réintroduire silencieusement tout ce qui a été corrigé en mobile (split, couleurs grisées, pseudo-éléments réactivés). Toujours capturer en 1440×900 en plus du mobile après chaque écran.

4. **Les pseudo-éléments `::before`/`::after` portent parfois leur propre couche décorative indépendante** du `background` du conteneur. Un split ou un halo qui persiste après correction du `background` doit être cherché dans `getComputedStyle(el, '::before')`.

5. **Une règle CSS écrite pour un nom de classe (ex. `.switch-row`) ne s'applique qu'aux écrans qui utilisent réellement cette classe.** Chaque écran a pu être codé avec des noms différents (`env-tile`, `send-card`, `rcv-btn`, `vchoice-card`, `tc-picker`...). Toujours **auditer les classes réelles** (grep sur les éléments portant un `onclick`) avant d'écrire une règle de maelström — ne jamais supposer par analogie avec un autre écran.

6. **`:nth-of-type()` compte les enfants du même type de balise dans le DOM réel**, pas une position logique supposée. Vérifier le rendu, pas seulement la règle écrite.

7. **Certaines fonctions JS injectent un style inline dynamique** (ex. `avatarStyle()` avec dégradé aléatoire par hash de nom) qui écrasera toute règle CSS non-`!important`. Pour un élément qui doit avoir une couleur FIXE Leg Day, il faut modifier la fonction JS elle-même, pas seulement le CSS.

8. **Un script de conversion en masse (icône-police → SVG) peut introduire un bug de syntaxe silencieux** : concaténer deux déclarations CSS inline sans point-virgule (`color:#fffdisplay:inline-flex`) fait perdre la première déclaration sans erreur visible ni crash — le navigateur ignore juste la propriété malformée. Ce pattern précis (`[valeur]pxdisplay:inline-flex` / `[valeur]fffdisplay:inline-flex`) a été trouvé à 12 endroits distincts dans le fichier. Après tout script de remplacement en masse touchant des attributs `style=`, grep systématiquement les patterns `[a-z0-9]+display:` sans point-virgule avant pour détecter ce type de fusion accidentelle.

9. **Une couleur héritée du split ivoire abandonné peut se cacher dans des dizaines de règles CSS non liées entre elles**, y compris deux copies du même sélecteur à des endroits différents du fichier (la seconde gagnant silencieusement sur la première correction). Une couleur sombre `!important` non scopée à un contexte clair rend illisible tout texte ET tout SVG utilisant `currentColor`/`color:inherit` qui en hérite — pas seulement les titres. Après toute correction de couleur legacy, `grep -c` la valeur exacte sur l'ensemble du fichier pour confirmer zéro occurrence restante, jamais se satisfaire d'une correction unique.

10. **Ne jamais fusionner deux paires label/valeur de contextes différents dans une même règle CSS par commodité.** `.bank-lbl`/`.bank-val` (question atténuée / réponse prononcée) et `.benef-name`/`.benef-iban` (nom prononcé / identifiant Mono) ont des sémantiques OPPOSÉES malgré des noms de classe qui semblent analogues — les regrouper dans un même sélecteur partagé (`#view-beneficiaires .benef-name, #view-banque .bank-lbl{font-weight:700}`) inverse la hiérarchie visuelle d'un des deux écrans. Vérifier le sens réel de chaque paire label/valeur avant de réutiliser une règle existante.

11. **Quand un écran migre d'un traitement générique par lot vers un traitement dédié**, chercher et retirer son ancien nom de vue (`#view-X`) de TOUTES les listes de sélecteurs partagés `nth-of-type`/`nth-child` écrites dans les passes précédentes — sinon l'ancienne règle, plus bas dans le fichier, continue de gagner silencieusement sur la nouvelle par ordre de cascade. `grep -n '#view-X \.classe'` avant de considérer la migration terminée.

12. **MÉTHODE D'AUDIT INTER-ÉCRANS** : Historique sert de référence canonique (titre 20px/800/-0.02em, header margin-bottom 20px, section radius 32px). Après toute série de retouches, exécuter un script Playwright qui boucle sur les 23 `showView()` et compare `getComputedStyle()` du titre/header/radius de chaque écran contre ces valeurs de référence — jamais vérifier "à l'œil" écran par écran. Cette méthode a trouvé des dérives invisibles autrement : Profil à 19px au lieu de 20px, Cartes à 16px de marge au lieu de 20px, un groupe de 5 écrans (Bénéficiaires/Partage/Virement-choix) partageant une classe `.top-row` legacy à 18px, Reçu à 16px/700 au lieu de 20px/800, et `.receipt-card` à 22px de radius au lieu du token `--r-xl` (32px) à cause d'une seconde définition plus bas dans le fichier qui codait la valeur en dur. Une différence de radius sur un conteneur `background:transparent` est un faux positif sans impact visuel — vérifier le fond avant de corriger un radius.

13. **`.vi-header`/`.vx-page-title` n'avaient JAMAIS de règle de base non scopée** — seulement des copies dupliquées `#view-X .vi-header{...}` pour chaque écran migré individuellement. Résultat : Profil, migré vers ce pattern, n'avait été ajouté à AUCUNE des listes existantes → `display:flex` ne s'appliquait jamais → bouton retour et titre s'empilaient verticalement au lieu d'être côte à côte. Corrigé en ajoutant une règle de base unique `.vi-header, .vx-header{display:flex;...}` / `.vx-page-title{font-family:...}` non scopée, dont héritent automatiquement tous les écrans qui utilisent ces classes — plus besoin de dupliquer par écran, plus de risque d'en oublier un. Chaque fois qu'un pattern se répète identique sur 3+ écrans via des copies scopées, le remplacer par UNE règle de base non scopée.

14. **Accueil — l'écran le plus travaillé n'était pourtant pas le plus "riche" visuellement** : ses cards principales (solde, actions rapides, entrées/sorties, Today's Activity, Suggestions) étaient toutes en `background:var(--c-s1)` PLAT, sans la formule matière (§6) que tous les écrans secondaires avaient reçue depuis. Un écran peut avoir la bonne typographie et les bonnes couleurs partout et sembler malgré tout "plus terne" que le reste si la matière (ombre portée + liseré interne) n'est appliquée qu'aux nouvelles cards colorées et jamais aux surfaces neutres `--c-s1` d'origine. Le réflexe : toute card visible, colorée OU neutre, reçoit `box-shadow:0 10px 28px -12px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)` a minima — la variante neutre de la formule matière (§6), pas seulement les cards Leg Day saturées. Repéré aussi 3 valeurs de padding hors-grille (22px, 18px) sur les containers les plus anciens du fichier, jamais réaudités depuis leur création initiale.

15. **Le kaléidoscope d'icônes de Reçu (§10 "asset language") ne se propage jamais automatiquement à un autre écran qui a une liste de lignes label/valeur visuellement identique.** Recevoir (`.rcv-details`/`.bank-row`), Banque (`.bank-row` ×2 sections) et Confirmation (`.receipt-row`) utilisaient chacun leur PROPRE nom de classe pour un pattern quasi identique à celui de Reçu (`.rcp-tx-row`) — et aucun n'avait hérité des icônes, malgré la ressemblance structurelle. Chaque écran "lecture seule" à base de lignes label/valeur doit être vérifié individuellement pour la présence d'icônes kaléidoscope — la similarité de structure HTML ne garantit jamais l'héritage du traitement visuel, seule la classe CSS réellement stylée compte.

16. **En éditant ce document même, `str_replace` avec un `old_str` se terminant par un titre `## N. SECTION` supprime ce titre s'il n'est pas explicitement réinclus dans le `new_str`.** Erreur commise deux fois dans cette session (§11 LAYOUT DNA les deux fois). Toujours relire le `new_str` avant envoi quand l'ancre de fin d'un remplacement est une ligne de titre — inclure le titre dans les deux chaînes, ou couper l'ancre juste avant lui.

17. **PIÈGE LE PLUS GRAVE DE LA SESSION — une fonction `normalizeDesktopIcons()` détruisait silencieusement TOUS les SVG dessinés à la main sur desktop.** Héritée d'une époque antérieure (shim de compatibilité Phosphor/Lucide → RemixIcon), elle s'exécutait sans condition à chaque `DOMContentLoaded` et exécutait `document.querySelectorAll(".view svg").forEach(svg => svg.replaceWith(iconFontPlaceholder))` — remplaçant CHAQUE SVG de TOUTES les 23 vues (elles coexistent dans le DOM, seule une classe CSS `.active` les distingue) par une icône RemixIcon vide, elle-même bloquée par le même CDN inaccessible. Un second foyer identique existait dans `toggleFinBalance()`, qui bifurquait vers `ph-eye`/`ph-eye-slash` (police) uniquement quand `window.matchMedia("(min-width:1024px)").matches`. Résultat concret : toute icône statique présente dans le HTML au chargement (donc la quasi-totalité) disparaissait sur desktop — mobile y échappait car les tests de vérification y injectaient systématiquement du contenu dynamique APRÈS ce chargement initial, masquant le problème pendant toute la session. LEÇON CENTRALE : une règle CSS scopée par écran peut être auditée un par un, mais un SCRIPT JS non scopé qui manipule le DOM au chargement peut invalider silencieusement des dizaines d'écrans en un seul point de défaillance — chercher spécifiquement `replaceWith`, `createElement("i")`, et toute logique conditionnée par `matchMedia("(min-width` dans le JS, pas seulement auditer le CSS.

18. **Largeur de contenu desktop — aucun écran n'avait de plafond de largeur raisonnable, malgré une règle `!important` qui semblait en poser un.** `.view:not(#view-accueil)>*{max-width:1180px!important}` existait bien, mais 1180px est trop généreux pour une lecture "calme et confiante" (référence 2026 : dashboards fintech, cards 200-280px, contenu principal 900-1000px — voir Stripe/Mercury). Resserré à 960px, cohérent avec les contraintes déjà posées ponctuellement ailleurs (Recevoir 980px, Reçu 760px). Effet en cascade : une grille à 3 colonnes DANS un conteneur trop large produit des tuiles disproportionnées (300×91px, ratio 3,3:1) même si chaque tuile individuelle semble correctement définie en CSS — le vrai coupable est souvent la largeur du PARENT, pas la tuile elle-même. Sur Cartes spécifiquement, le Centre de contrôle (`.cc-quick-row`) a en plus reçu son propre plafond (`max-width:640px`) et un `min-height:132px` pour retrouver une proportion de card (1,5:1) au lieu d'un bandeau plat. Toujours vérifier `getComputedStyle(el).width` ET `.height` ensemble sur un élément suspect — un ratio anormal révèle presque toujours une contrainte manquante sur un ancêtre, pas sur l'élément lui-même.

18. **Desktop — CSS Grid étire silencieusement les tuiles vers la hauteur du plus grand voisin de ligne.** `#view-accueil{grid-template-columns:...}!important` transforme la vue racine en grille 2 colonnes ; sans `align-items:start` explicite, les tuiles Envoyer/Recevoir/RIB héritaient du comportement par défaut `stretch` et s'étiraient verticalement (~160×330px, ratio 1:2) pour matcher la hauteur de la carte 3D voisine — un rectangle disgracieux, jamais intentionnel. Recherche de référence (dashboards fintech 2026 : Mercury, Stripe, Payhawk) confirme le standard : tuiles d'action compactes proche du carré, jamais allongées, hiérarchie par variation de taille raisonnée façon bento — pas par élongation. Corrigé avec `align-self:start!important` sur le container ET les tuiles, plus `aspect-ratio:1/1` et `max-height` explicite pour garantir des proportions stables quel que soit le contenu du voisin de grille.

19. **PIÈGE RÉCURRENT CONFIRMÉ — le duo `.tx-ic-desktop`/`.tx-ic-mobile` de la
    liste de transactions Accueil reproduisait EXACTEMENT le piège n°17**,
    dans un composant que ce piège n'avait pourtant pas couvert à l'époque
    (`txRowHTML()`, distinct de `normalizeDesktopIcons()`). Le mécanisme :
    une règle `@media(min-width:1024px){ .tx-ic-mobile{display:none!important} }`
    tentait de réafficher `.tx-ic-desktop` (icône RemixIcon `ri-*`), mais une
    règle non scopée `.tx-ic-desktop{display:none}` placée QUELQUES LIGNES
    PLUS BAS dans le fichier — donc plus tard dans la cascade, même
    spécificité, aucun `!important` côté desktop — regagnait la main.
    Résultat net : sur desktop, le SVG était masqué par le `!important` ET
    l'icône de police restait masquée par la règle suivante — AUCUNE icône
    de transaction ne s'affichait sur "Activité du jour", alors que le CSS
    calculé de chaque règle prise isolément semblait cohérent. Corrigé en
    supprimant tout le bloc de bascule desktop et en figeant
    `.tx-ic-desktop{display:none!important}` de façon inconditionnelle — le
    SVG dessiné à la main est désormais la seule icône, sur tous les écrans.
    Leçon : une classe `ri-*`/`ph-*` peut survivre dans un template JS
    (`txRowHTML`) longtemps après la suppression du shim global qui les
    injectait ailleurs — grep `ri-`/`ph-`/`data-lucide` sur les TEMPLATES JS,
    pas seulement sur le HTML statique et les fonctions de shim connues.

20. **`.goal-card` et `.sugg-card` (Accueil) portaient encore le glassmorphism
    de l'ancien thème "liquid glass"** — `backdrop-filter:blur()`, fond
    dégradé navy translucide et bordure `rgba(255,255,255,.09-.14)` — sur au
    moins 8 couches successives jamais nettoyées (`.fin-panel`, `#goals-section`,
    `.sugg-card`, `.accueil-tx-list`, `.goal-card`, `.fin-card`, `.insight-card`
    apparaissent ensemble dans presque toutes). Violation directe de la RULE 009
    et de la checklist finale ("aucun résidu de glassmorphism"). `.sugg-card`
    avait en plus un second foyer à spécificité plus élevée
    (`#view-accueil>#suggestions-section .sugg-card`, 2 ID + 1 classe) qui
    survivait à une première correction scopée à une spécificité plus faible —
    toujours vérifier la spécificité du sélecteur fautif avant d'écrire le
    correctif, pas seulement son `!important`. Corrigé en matière opaque
    standard (§6), appliqué globalement (mobile ET desktop, car le glass est
    une RULE GLOBALE, pas une exception desktop).

21. **La tuile "Envoyer" (quick-action qa-1) utilisait un bleu inventé**
    (`#4A85C6/#3D74B8/#325E95`, socle `#7FB6E5`) plutôt qu'une des 4 paires
    kaléidoscope validées. qa-2 (vert forêt) et qa-3 (brique) correspondaient
    déjà exactement aux tokens `LEGDAY-TOKENS.css` — seul qa-1 dérivait,
    invisible à l'œil nu tant qu'on ne compare pas aux valeurs hex exactes.
    Réaligné sur `--legday-kaleido-blue-deep` (`#356E9C/#2A5B84/#22496A`,
    socle `#5FA8D8`), qui est aussi la teinte du nouveau bloc "Solde total"
    (cohérent : les deux représentent une action/donnée "argent principal").

29. **Solde total — unification stricte mobile/desktop LEGDAY** ([apps/wallet/index.html:3291-3306](../apps/wallet/index.html:3291)).
    La tuile mobile utilisait `.vx-balance-card` avec `background:var(--c-s1)`
    (surface neutre grise) tandis que le desktop portait le gradient blue-deep
    canonique (§4). Bizarrement, `.wallet-total-glass` (autre wrapper) portait
    5 règles concurrentes qui se battaient (CHANTIER 6, 7, 14, media 1024+) —
    chacune écrasait la précédente avec `background:none !important` ou lensing
    radial ad-hoc. Vraie classe active dans le DOM mobile confirmée par walk :
    **`.vx-balance-card`**, PAS `.wallet-total-glass`. Fix : unifier
    `.vx-balance-card` mobile sur le gradient blue-deep canonique (identique à
    la règle desktop `#view-accueil .vx-balance-card` du bloc `@media(min-width:
    1024px)`) + shadow-card LEGDAY, + `.wtg-val` repassé en Inter (RULE 006),
    + `.vx-balance-lbl` en Inter kicker 11px, + `.vx-eye-btn` en socle Leg Day
    circulaire (#5FA8D8 socle bleu clair analogique). Aussi neutralisé les 3
    règles `#view-accueil .wallet-total-glass{background:none...}` héritées
    (chantiers 6/7/14) qui géraient la version legacy. Icônes de transactions
    (§9.1) : `.tx-ic-desktop` (RemixIcon font, ri-*) et `.tx-ic-mobile` (SVG)
    étaient deux classes concurrentes. Fusionnées en une seule `.tx-ic` (SVG
    inline uniquement) rendue sur tous les breakpoints — plus jamais de font
    d'icône dans le DOM du wallet.

28. **Dashboard light-mode — adaptation LEGDAY** ([apps/dashboard/src/app/globals.css](../apps/dashboard/src/app/globals.css)).
    Le mockup fourni (VTEX-Dashboard-Preview.html) est un cadre light qui suit
    déjà la charte wallet (sidebar navy, palette accent, radius 32/20/14/999).
    L'implémentation Next.js existante appliquait des fonds pastel PLATS
    (#eaedff / #fef7ea / #ecfaf0) sans le procédé Leg Day (gradient + matière
    + socle avec liseré). Refonte : 6 tokens `--legday-*` ajoutés en light-mode
    (`--legday-grad-violet-light` / `-amber-light` / `-green-light` /
    `-teal-light` avec formule 158deg 3 stops +15%/base/-15% en teintes claires ;
    `--legday-grad-navy-callout` et `--legday-grad-violet-callout` canoniques
    pour les callouts ; `--legday-shadow-card-on-light`, `-socle-light`,
    `-callout-dark` avec alphas réduits pour ne pas assombrir un fond clair).
    Appliqué aux `.dashboard-metric-card` (KPI grid), `.dashboard-action-card`
    (grid Interventions), `.dashboard-callout` (Analytics + Identité),
    `.dashboard-goal-card` (Leads qualifiés) et sockets Leg Day sur toutes les
    `.dashboard-metric-icon` / `.dashboard-action-icon`. Panel + hero-strip
    reçoivent la matière shadow `0 2px 12px -6px rgba(15,18,48,.06)` +
    liseré interne blanc `.6`, aussi léger que ce que light-mode admet.

27. **Audit responsive complet — 3 écrans avec violations LEGDAY** :
    (a) `#view-cartes` sans empty state — quand `CARDS.length===0`, `renderCardsScreen`
    faisait `body.innerHTML = ""` et laissait la vue quasi-vide (juste "Fais défiler
    pour gérer ta carte" au milieu, sans contexte). Fix : injection d'un composant
    `.acc-empty-state.acc-empty-cards` (icône carte socle bleu + titre "Aucune
    carte" + explication) et masquage explicite de `.cartes-scroll-hint` quand
    aucune carte. (b) `#view-historique` tuile Sorties (`.filter-tile.out`) était
    en gris neutre en état non-active — la sémantique "sortie" n'était pas
    communiquée. Idem `#view-notifications` tuile Suggestions. Fix : LEGDAY §3.3 —
    le socle d'icône porte TOUJOURS sa teinte kaléido, même en état non-active :
    `.filter-tile.in .filter-tile-ic{background:#97CE5E}` et
    `.filter-tile.out .filter-tile-ic{background:#E5903F}` sans requérir `.active`.
    Ajouté aussi une variante `.filter-tile.sugg` (gold #F0CF52) pour Suggestions.
    (c) `#vtex-notification-list` empty state "Connecte-toi pour charger tes
    notifications." (une simple `.switch-sub` pâle) → composant unifié
    `.acc-empty-state.acc-empty-notif` (icône cloche + titre "Aucune notification"
    + explication).

26. **Audit chirurgical Accueil desktop — 6 violations trouvées** :
    (a) `.fin-stat-val.out` (Sorties) était `color:var(--c-t1)` (blanc) au lieu
    d'une teinte sémantique — perte totale de sémantique "sortie" alors que
    "+/-" seul ne suffit pas à créer la distinction visuelle. Fix : `#E5903F`
    (LEGDAY orange chaud), moins agressif qu'un rouge --c-danger et cohérent
    avec la palette kaléidoscope. (b) `.acc-split-legend b` (montants Entrées/
    Sorties de la Répartition) en `var(--f-mono)` : **RULE 006 violée** — Mono
    réservé aux identifiants IBAN/CVV, pas aux montants affichés. Fix : Inter
    700 + `font-variant-numeric:tabular-nums` pour aligner les chiffres.
    (c) `.qa-label` (labels Envoyer/Recevoir/RIB) à 11.5px/600 : sous le palier
    List-title LEGDAY (14-15px/700). Fix : 13px/700. Aussi une deuxième règle
    plus tardive écrasait le weight:700 de la première, consolidé en une seule
    règle. (d) `.wtg-currency` (le `€` du Solde total) avec `margin-left:2px`
    invisible : le `€` collait au montant. Fix : margin-left:6px + word-spacing:
    .14em sur `.wtg-val` pour rendre l'espace-milliers réellement visible
    malgré le letter-spacing serré à -.03em. (e) Le kicker "SYSTÈME DE CARTE ·
    VTEX" était injecté via `::after` mais **une deuxième règle CSS ciblait le
    même ::after** (barre lumineuse `top:0; height:1px`) → conflit cascade :
    top:0 gagnait et le texte s'affichait EN HAUT au lieu de bas-droite.
    Fix : remplacé le `::after`-label par un vrai `<span.vtx3d-brand-eyebrow>`
    HTML, laissé le `::after` au liseré lumineux uniquement (règle 2954 seule).
    Aussi passé le texte de Mono 9px à Inter 10px/700 (RULE 006 — c'est un
    label brand, pas un identifiant). (f) Empty states `#goals-list`,
    `#wallet-suggestions`, `#accueil-tx-list` étaient des `<div class="switch-sub">
    Chargement...</div>` bâclés — passés à un composant unifié `.acc-empty-state`
    (icône socle bleu + titre 800 + sous-titre) réutilisé sur les 3 sections,
    cohérent avec l'empty state Documents ajouté sur Profil.

24. **Logo VTEX cassé** — `.vtx-sb-wordmark` (sidebar) et 5 autres emplacements
    pointaient vers `/manus-storage/vtex-wordmark-provided_2df10a2c.jpeg`, un
    chemin absolu d'un environnement Manus qui n'existe pas localement (server
    renvoyait 404, `<img>` affichait le placeholder cassé). Fix : copié
    `apps/dashboard/public/brand/vtex-logo-white.png` → `apps/wallet/assets/vtex-wordmark.png`
    et remplacé toutes les occurrences du chemin. Aussi présent dans :
    `.vtx-hero3d` background-image (mobile), poster de `.entry-video`, source de
    `.entry-video`, et `.card-brand-mark` (carte bancaire). Vérifier régulièrement
    avec `grep -n '/manus-storage/' apps/wallet/index.html` — si un asset y
    apparaît, c'est un chemin cassé à rapatrier.

25. **La section "Photo de profil" (#view-profil) violait plusieurs règles LEGDAY** :
    (a) titre "Photo de profil" à 15px/800 au lieu de Card-title 19-20px/800/-.025em
    (§2.3) ; (b) champ "Choisir une image" en `color:var(--c-t2)` (tertiaire) alors
    qu'il porte de l'information active, doit être `--c-t1` ; (c) bouton "Importer"
    en `var(--c-signature)` plat au lieu du gradient blue-deep canonique (§4) ;
    (d) bouton "URL" idem ; (e) placeholder de l'input URL en `--c-t3` (à peine
    lisible) alors que c'est la seule indication du format attendu, remonté à
    `--c-t2` ; (f) card container sans matière (pas de box-shadow, aucun contraste
    avec le fond) — passé à `--c-s1` + shadow-card LEGDAY. Aussi refonte du
    empty state "Mes documents" : `<div class="switch-sub">Chargement...</div>`
    (un simple `<div>` en gris pâle) remplacé par un vrai empty state à 2 lignes
    (icône socle bleu + titre `--c-t1` + sous-titre `--c-t2`), matché sur la
    matière de la card Photo de profil.

22. **Grille bento Accueil desktop non-uniforme à cause de `.quick-actions{width:max-content}`**.
    La grille était `repeat(12, 1fr)` mais `.quick-actions` en col 1/5 forçait
    `width:max-content` (368px = 3×112 QA + 2×16 gaps). CSS Grid propage cette
    contrainte de largeur : les 4 tracks de col 1/5 étaient étirées à 82px chacune
    (contenu 368px), tandis que les 8 autres tracks (cols 5-13) s'écrasaient à
    ~36px chacune. Résultat : carte 3D à **260px** au lieu des 458px prévus,
    Sécurité à **148px** au lieu des 267px prévus. Pire, la row 5 forcée à 130px
    créait un trou vertical énorme quand `goals-section` était en état vide.
    Fix simultané : (1) grille en `repeat(12, minmax(0,1fr))` pour découpler
    tracks du contenu, (2) `.quick-actions` passée de `display:flex; width:max-content`
    à `display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); width:100%`
    pour que les 3 boutons se répartissent dans la largeur de la piste, (3) row 5
    passée de 130px à `auto` pour que goal-card / subs 3D / split-panel se
    dimensionnent selon leur contenu réel. Après fix : hero3d 328×280, sec 189×280,
    solde 259×156 (tracks quasi-uniformes à ~49.7px chacune, cohérent avec le
    espace utile de 816px du grid une fois retiré le padding sidebar).

23. **La tuile Sécurité (Accueil desktop) violait RULE 006** : le chiffre
    `.acc-sec-num` ("84%") était en `--f-mono` (JetBrains Mono) alors que ce
    n'est pas un identifiant (IBAN/CVV/n° carte) mais une valeur mise en
    avant — Mono y est explicitement interdit (§2.4). Corrigé en `--f-sans`
    800/-.01em. `.acc-sec-title` ("Compte protégé") était à 15px, sous le
    palier **Card-title** (19-20px, §2.3) réservé aux titres à l'intérieur
    d'une tuile colorée — corrigé à 19px/-.025em/lh:1.05 (tient sur 2 lignes
    courtes dans les 148px de largeur du panneau, cf. §2.4 "toujours 2-3
    lignes courtes"). Le box-shadow dérivait aussi (-12px/.5 au lieu de la
    formule canonique -10px/.55, §6) — même drift que pitfall 21 sur les
    quick-actions, corrigé. En revanche `.acc-sec-cta` ("Voir les détails",
    11px) n'était PAS une violation malgré son écart avec "Button label
    14-15px" : ce spec ne s'applique qu'aux CTA en forme de bouton (pill,
    fond plein, ex. `.env-cta`/`.send-btn`) — un lien-ligne avec chevron
    dans une tuile suit plutôt le précédent `.vchoice-cta` (11.5px/700,
    déjà en prod sur virement-choix), donc juste aligné à 11.5px pour
    coller exactement à ce précédent, pas remonté à 14px.

### COMPONENT: Quick-action tile (Accueil) — mise à niveau Leg Day complète
```
AVANT : card plate --c-s1 + icône dans un socle teinté translucide (rgba .14-.16)
         = "bouton cliquable sur fond noir", en retrait par rapport au reste du wallet
APRÈS : card en couleur PLEINE gradient 158deg (une famille par tuile, cycle bleu
         clair/vert forêt/brique) + socle analogue plus clair + matière complète —
         identique au traitement des tuiles de Virement/Envoyer.
Socle icône : 40px, couleur analogue à la card (ex. card bleu #3D74B8 → socle #7FB6E5)
Label : blanc plein, 700, jamais atténué sur une tuile de navigation principale
```

---

## 17. DESKTOP DNA — blueprint dimensionnel (Mercury/Stripe/Wise/Atlassian)

Référence de recherche : dashboards fintech 2026 (Mercury, Stripe, Wise, Revolut) +
grille Atlassian. Frame de référence **1440×900**.

```
Sidebar          248px
Contenu max      1128px (1296px en plafond absolu sur très grands écrans)
Marges           32px
Gouttières       16-24px (32px entre colonnes du grid Accueil)
Radius desktop   16px (DISTINCT du 32px mobile — proportions plus posées)
Spacing          8 / 16 / 24 / 32px
Header           64-72px
Inputs           40-44px de hauteur (padding 11px 16px)
KPI / Solde      ~140-180px de hauteur, jamais stretché plus haut
Action tiles     112×104px, jamais étirées pour remplir la colonne
Carte bancaire   400×252px fixe, ratio 1,586:1 — la largeur ne doit JAMAIS
                 dépendre de la largeur du parent, toujours une taille propre
```

**Règle absolue** : aucun container primaire n'est étiré verticalement ou
horizontalement pour "remplir" l'écran. La hauteur/largeur d'une section est
dictée par son contenu, jamais par l'espace disponible. Une card qui s'étire
en bandeau plat (ratio > 2,5:1 environ) est toujours un défaut à corriger —
soit en lui donnant une largeur de colonne propre, soit une hauteur minimale.

**Implémentation Accueil** : grille CSS `grid-template-areas` nommée sur
`#view-accueil` lui-même (pas de wrapper `.hero-scene` — ce nom de classe est
un résidu d'une itération antérieure, absent du DOM actuel). Colonnes
`1fr 400px` (colonne gauche flexible, colonne carte fixe). Plusieurs éléments
DOM peuvent partager le même nom de `grid-area` — ils s'empilent alors en flux
normal dans cette cellule (utilisé pour vtx3d-sub/dots/hint sous la carte 3D).

**Sidebar desktop** : même mal que la grille Accueil — 4 définitions
concurrentes de `.vtx-sb-item.active` accumulées au fil des itérations, dont
une théorique "sidebar blanche" jamais utilisée en pratique (écrasée par un
gradient navy `rgba(9,13,36,...)` plus tardif dans le fichier). Toute la
sidebar a été reconstruite en un bloc unique final : fond `--c-bg` pur (zéro
navy), et surtout — chaque lien de navigation porte son PROPRE socle
d'icône coloré en kaléidoscope (30px, cycle vert/bleu/orange/menthe/or/rouge/
indigo, un par item), directement inspiré du traitement des icônes de Reçu.
L'item actif se distingue par un liseré indigo à gauche (`inset 3px 0 0`) et
un fond `--c-s1`, jamais par un remplissage violet générique hérité.

**Composition bento (Accueil) — inspirée du die-shot d'une puce Apple** :
zones rectangulaires de tailles variées, serrées, chacune sa fonction précise,
aucune étendue vide non voulue. Grille `repeat(12,1fr)`, placement par lignes
explicites (`grid-column:X/Y`) plutôt que `grid-template-areas` — trop rigide
pour des spans inégaux avec des hauteurs de ligne variables. Nouveau bloc
desktop-exclusif "Sécurité" (2FA, score) ajouté à droite de la carte 3D,
même hauteur que Solde+Actions combinés — la permission explicite de détailler
des sections absentes du mobile a été utilisée avec parcimonie : un seul
nouveau panneau, plus une 3e statistique "Net ce mois" calculée à partir des
mêmes `credits`/`debits` déjà calculés pour Entrées/Sorties (jamais de donnée
fabriquée). Navy strictement confiné à la face de la carte 3D elle-même —
tout le reste du canvas repose sur `--c-bg` noir pur.

**Piège rencontré** : un conteneur flex à largeur de contenu fixe (3 tuiles
112px + gaps) peut se faire compresser par la piste de grille CSS qui
l'héberge si la largeur réelle du parent grid ne correspond pas au calcul
attendu (ici 328px obtenus au lieu de 458px théoriques, cause exacte non
élucidée). Solution robuste : `width:max-content!important` sur le conteneur
flex plutôt que de chercher à corriger le calcul de piste sous-jacent —
force le conteneur à respecter la taille de son propre contenu, indépendamment
de l'espace que la grille parente lui accorde.

**Compensation mutuelle des tuiles (die-shot véritable)** : la clé n'est PAS
de fixer une hauteur individuelle sur chaque tuile (`height:156px` etc.) —
c'est l'inverse qui fonctionne. `grid-template-rows` avec des valeurs FIXES
en pixels (`156px 104px 130px`, jamais `auto`) sur le CONTENEUR PARENT,
combiné à `align-items:stretch` (comportement par défaut de CSS Grid, à ne
pas neutraliser), fait que CHAQUE tuile partageant une piste s'étire
automatiquement pour occuper l'intégralité de cette piste — c'est ainsi
qu'une tuile compense l'espace laissé libre par sa voisine plus courte,
sans jamais laisser de vide. Retirer toute hauteur fixe individuelle une
fois la piste posée ; la hauteur vient de la ligne, jamais de l'élément.

**Piège de chevauchement colonnes** : deux blocs peuvent revendiquer la
même `grid-row` avec des `grid-column` qui se chevauchent partiellement
(ex. légende de carte en cols 6-10 et un panneau Répartition en cols 6-13
à la même ligne) — CSS Grid ne détecte ni ne prévient cette collision,
les deux éléments se superposent silencieusement à l'écran. Toujours
dessiner le plan de grille colonne par colonne avant d'assigner les
`grid-column`, pas seulement ligne par ligne.

**Typographie des kickers, unifiée** : trois classes différentes
(`.vx-balance-lbl` 10px/.12em, `.acc-sec-kicker` 10.5px/.1em,
`.fin-stat-lbl` 9.5px/.06em) produisaient un rendu perçu comme "brouillon"
malgré des valeurs individuellement raisonnables — c'est l'INCOHÉRENCE
entre elles, pas une valeur isolée, qui trahissait le manque de rigueur.
Unifiées à une seule spécification (`11px/700/.08em/uppercase`) appliquée
aux trois classes existantes dans le contexte desktop, sans renommage HTML
(pour ne rien casser ailleurs) — la cohérence importe plus que la valeur
absolue choisie.

**Audit visuel poussé — 5 bugs trouvés UNIQUEMENT par inspection du rendu,
invisibles depuis le code ou le CSS calculé isolé :**

1. **Débordement de piste par `min-height` legacy** : `#goals-section`
   portait un `min-height:270px!important` vestige d'un ancien thème,
   débordant de 140px au-delà de sa piste de grille (130px) et recouvrant
   silencieusement la ligne Entrées/Sorties/Net en dessous. Le CSS calculé
   des tuiles recouvertes était pourtant parfait (`color`, `text-shadow`
   corrects) — seul le rendu pixel a révélé le chevauchement.

2. **`text-align` sans effet sur un conteneur flex** : `.section-lbl` est
   `display:flex` (pour accueillir icône+texte ailleurs dans l'app).
   `text-align:center` en style inline n'a AUCUN effet sur le contenu d'un
   flex container — il fallait `justify-content:center`. Deux occurrences
   (Banque, Recevoir), corrigées.

3. **Navy systémique sur 22 écrans** : une règle héritée du thème desktop
   abandonné imposait `background:linear-gradient(145deg,rgba(28,34,73,...))`
   à TOUTE `.card`/`.send-card`/`.goal-card`/`.settings-group` hors Accueil,
   plus un `.send-btn{background:#334155!important}` gris ardoise plat sur
   les CTA. Neutralisés en un bloc unique final : surface `--c-s1` partout,
   gradient `158deg` sur les boutons — navy réservé à la seule face de
   carte 3D.

4. **Sélecteur cassé par une virgule manquante** : `#view-beneficiaires,
   #view-beneficiaire-detail .env-tile:nth-of-type(4n+4)` — un espace
   manquant après `#view-beneficiaires` en a fait un sélecteur AUTONOME,
   appliquant le fond teal/brique de la tuile directement à LA VUE ENTIÈRE
   (fond de page complet turquoise). Bug présent en double (2 familles de
   couleur), jamais détecté avant cette passe visuelle malgré de nombreuses
   vérifications antérieures de cet écran — preuve qu'un audit du rendu
   doit être répété après CHAQUE lot de modifications touchant les mêmes
   sélecteurs, pas une seule fois en début de session.

5. **Composition mobile figée étirée sur desktop** : le visuel "reçu papier
   thermique" (Reçu) utilise des positions relative/absolute calculées pour
   ~380px de large. L'étirer à 1128px (largeur desktop standard) cassait
   l'alignement interne — les labels ("Montant envoyé", "Référence"...)
   se retrouvaient positionnés hors du cadre visible, ne laissant que les
   valeurs visibles. Corrigé en contenant ce composant à sa largeur de
   conception (`max-width:420px`), centré — pas en essayant de le rendre
   fluide, ce qui aurait exigé de refondre toute sa logique de positionnement.

30. **`?preview=X` silencieusement cassé par `router.js` sur pathname "/"** ([apps/wallet/router.js:48-55](../apps/wallet/router.js:48)).
    `updateUrl()` tamponne l'état d'historique au boot via `history.replaceState({view:name}, "", path)` — mais quand `window.location.pathname` égale déjà `path` (cas de "/" → accueil, le cas le plus courant), l'appel réécrivait quand même l'URL avec le seul `path`, effaçant silencieusement toute query string déjà présente (`?preview=support`). Résultat : `demoPreviewTarget()` (vtex-api.js), qui lit `window.location.search` au `DOMContentLoaded` suivant, ne voyait plus jamais le paramètre — la prévisualisation retombait systématiquement sur `accueil` quel que soit le `?preview=` demandé, sans erreur JS visible. Piège perfide : invisible en lisant le code de `demoPreviewTarget()` seul (il est correct), la cause réelle est dans un fichier chargé après (`router.js`) qui s'exécute AVANT le `DOMContentLoaded` qui déclenche la lecture. Fix : dans la branche "pathname déjà bon", réécrire l'URL avec `window.location.pathname + window.location.search + window.location.hash` au lieu du seul `path`, puisque cette branche ne sert qu'à associer un `history.state`, jamais à changer l'URL visible. Leçon : après toute modification touchant au boot (routeur, chargement, auth), rejouer explicitly `?preview=<vue>` pour CHAQUE vue testée et vérifier `window.location.search` avant de faire confiance à une capture — un piège de ce type ne casse rien visuellement une fois la bonne vue affichée manuellement, seul le chemin *naturel* du boot est atteint.

31. **Liste de sélecteurs partagée `input/textarea/select` (§7, ligne ~2939) : une vue absente de la liste régresse silencieusement en desktop seulement** ([apps/wallet/index.html:2939](../apps/wallet/index.html:2939)).
    Le même mécanisme que le piège n°11 (§16), mais sur une liste de champs de saisie plutôt que sur un maelström de lignes. `#view-support` n'y figurait pas : sur mobile, les champs restaient lisibles par une règle plus générique et rien ne semblait cassé — mais dans `@media(min-width:1024px)` (ligne ~2188), une règle globale `.view:not(#view-accueil) input{border-color:rgba(170,185,255,.16)!important}` s'applique à TOUTES les vues (y compris celles absentes de la liste ligne 2939) et **recolore** une bordure par défaut du navigateur qu'aucune règle `border:none!important` plus spécifique n'annule pour cette vue précise — d'où une bordure bleutée visible uniquement en desktop, invisible en mobile, sur un champ par ailleurs correctement stylé (fond, radius). Détecté uniquement par capture d'écran desktop réelle (RULE 010) : le code source des deux règles semblait cohérent pris séparément. Fix : ajouter `#view-support input, #view-support textarea, #view-support select` à la liste partagée ligne 2939. Leçon : pour tout nouveau champ de saisie ajouté à une vue existante, `grep` cette liste de sélecteurs AVANT de supposer que le style s'applique — la présence de `#view-recevoir` ou `#view-banque` dans la liste ne garantit RIEN pour une vue voisine non listée.

## LEGDAY CONSTITUTION


```
RULE 001 — Toute card colorée doit se demander : "ai-je le gradient 158deg,
           le socle analogue, le glyphe simple et la matière (ombre+liseré) ?"
           Les 4 réponses doivent être oui.

RULE 002 — Zéro icône de police. Toujours un SVG inline dessiné à la main.

RULE 003 — Radius uniquement 14 / 20 / 32 / 999px, plus l'exception hero 44px.
           Aucune autre valeur, jamais.

RULE 004 — Spacing uniquement 4·8·12·16·20·24·32px.

RULE 005 — Titre de section = 28px Inter 800 exactement. Jamais 26, jamais 30.

RULE 006 — JetBrains Mono = identifiants uniquement (IBAN, CVV, n° carte).
           Jamais un montant hero, jamais un titre.

RULE 007 — Le tint translucide (rgba .14-.16) est réservé aux icônes de
           TRANSACTION en liste-timeline. Toute icône de section/réglage
           est en couleur PLEINE (protocole Leg Day).

RULE 008 — Le maelström chromatique cycle sur 4 familles par groupe de lignes,
           décalé d'un groupe à l'autre. Une action destructive reste rouge
           en toute circonstance.

RULE 009 — Zéro bordure visible sur une card. Séparation par contraste de
           fond + ombre portée, jamais par un trait.

RULE 010 — Le desktop reçoit exactement les mêmes tokens que le mobile.
           Vérifier systématiquement en 1440×900 après chaque écran.

RULE 011 — Avant tout écran nouveau : auditer les classes CSS réellement
           utilisées sur cet écran. Ne jamais supposer par analogie.

RULE 012 — Un élément non-cliquable (affichage pur) ne reçoit jamais le
           maelström — seulement une surface propre --c-s2 ou --c-s1.
```

---

## FINAL FIDELITY CHECKLIST

**Typography**
- [ ] Inter + JetBrains Mono uniquement, aucune autre famille
- [ ] Titre de section = 28px/800/-.035em exactement
- [ ] Mono réservé aux identifiants, jamais aux montants hero

**Color**
- [ ] Fond de page = `--c-bg` (#100E0D), aucun gradient de split
- [ ] Card colorée = gradient 158deg d'une des 12 teintes officielles
- [ ] Socle d'icône = teinte analogue plus claire, jamais la même couleur que la section
- [ ] Tint translucide uniquement sur transaction-liste, jamais sur réglage/section

**Geometry**
- [ ] Radius ∈ {14, 20, 32, 999} + exception 44 sur hero
- [ ] Spacing ∈ {4, 8, 12, 16, 20, 24, 32}
- [ ] Socle ∈ {28, 32, 44, 56}

**Components**
- [ ] Chaque ligne cliquable a : couleur pleine + socle analogue + glyphe simple + matière
- [ ] Chaque icône est un SVG inline, jamais une classe de police
- [ ] Chaque écran vérifié en mobile (430px) ET desktop (1440px)

**Overall**
- [ ] L'écran semble conçu par le même designer que le reste de LEGDAY
- [ ] Aucun résidu de glassmorphism, de bordure translucide ou de split
- [ ] Aucune classe CSS supposée par analogie sans vérification

---

## QUICKSTART — pour une nouvelle instance

1. Lis ce document en entier avant de toucher au code.
2. Pour tout nouvel écran : audite d'abord les classes CSS réelles (`grep onclick`), n'écris aucune règle avant.
3. Applique le protocole Leg Day (§5) à tout ce qui est cliquable, le tint system (§3.2) à tout ce qui est transaction.
4. Vérifie via capture d'écran réelle (Playwright), jamais "en lisant le code".
5. Vérifie en mobile ET desktop, systématiquement.
6. Si une valeur n'est pas dans ce document, cherche-la dans le code existant (`grep`) avant d'en inventer une — LEGDAY est extractible, pas statique : si un nouveau pattern légitime apparaît, documente-le ici avec la mention OBSERVED.
