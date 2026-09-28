# LEGDAY-QUICKSTART

Tu reprends un travail de refonte visuelle sur le wallet VTEX. Voici comment appliquer LEGDAY sans perdre de cohérence, en 6 étapes.

## 1. Lis `LEGDAY.md` en entier avant de coder quoi que ce soit
C'est la constitution. Pas une suggestion.

## 2. Avant de toucher un écran : audite ses vraies classes
```bash
grep -oE '<[a-z]+[^>]*class="[^"]+"[^>]*onclick=' index.html
```
Chaque écran peut utiliser des noms différents (`switch-row`, `env-tile`, `send-card`, `vchoice-card`...). Ne suppose jamais par analogie avec un autre écran — vérifie.

## 3. Applique les 2 registres, jamais mélangés
- **Élément cliquable de réglage/action** → Protocole Leg Day complet (LEGDAY.md §5) : couleur pleine + socle analogue + glyphe + matière.
- **Icône de transaction en liste-timeline** → Tint translucide (LEGDAY.md §3.2). Jamais l'inverse.

## 4. Construis chaque icône comme un asset SVG inline
Jamais de `ph-fill`, `ph`, `ri-*`, `data-lucide`. Style Solar Bold : fill-first ou stroke 2.1-2.6px, 2-3 formes max, rounded terminals.

## 5. Respecte les grilles strictes sans exception
```
Radius:  14 · 20 · 32 · 999px  (+ 44px hero uniquement)
Spacing: 4 · 8 · 12 · 16 · 20 · 24 · 32px
Titre section: 28px Inter 800 exactement
```

## 6. Vérifie TOUJOURS par capture d'écran réelle — jamais en lisant le code
```bash
python3 -m http.server 8791 --directory apps/wallet &
# Playwright screenshot à 430×932 (mobile) ET 1440×900 (desktop)
```
Le desktop est une couche CSS séparée qui peut silencieusement réintroduire tout ce que tu as corrigé en mobile. Vérifie les deux, systématiquement, à chaque écran.

---

**Si une valeur ne figure pas dans LEGDAY.md** : cherche-la dans le code existant avant d'en inventer une. Si elle est légitimement nouvelle, documente-la dans LEGDAY.md avec la mention `OBSERVED` avant de l'utiliser ailleurs.

**Le test ultime** : est-ce que cet écran semble avoir été conçu par le même designer que le reste de l'application ? Si non → corrige, ne propose pas une alternative "plus moderne".
