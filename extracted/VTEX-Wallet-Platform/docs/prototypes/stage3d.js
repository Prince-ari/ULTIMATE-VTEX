/* Moteur 3D des cartes Wallet Pro — extrait de apps/business/src/components/dashboard/CardStage3D.tsx (Three.js r160), transpilé sans React. */
let CARDS = [];
const THEME = {
    navy: {
        bg: [[0, "#356E9C"], [0.32, "#2F638E"], [0.6, "#2A5B84"], [1, "#22496A"]],
        guilloche: "#a9c8e8", guillocheA: 0.06, reflet: "255,255,255", reflA: 0.18,
        bloom: "170,205,240", sheen: "255,255,255", sheenA: 0.07,
        typeTag: "rgba(230,240,255,.5)", vtexMark: "rgba(236,244,255,.68)", chevron: "rgba(200,222,250,.78)",
        label: "rgba(236,244,255,.94)", embossFill: "#fdfeff", embossShadow: "rgba(0,0,0,.4)",
        num: "rgba(238,246,255,.92)", footLbl: "rgba(222,235,252,.76)", footVal: "rgba(244,249,255,.94)",
        filigrane: "170,205,240", contactless: "rgba(236,244,255,.5)", networkBlend: "screen", visa: "#ffffff",
        side: 0x14314a, sideEm: 0x2f6fa0, metal: 0.46, rough: 0.34,
    },
    teal: {
        bg: [[0, "#123531"], [0.32, "#0f2c29"], [0.6, "#0a2320"], [1, "#061615"]],
        guilloche: "#7fe0c9", guillocheA: 0.05, reflet: "255,255,255", reflA: 0.14,
        bloom: "98,184,176", sheen: "255,255,255", sheenA: 0.05,
        typeTag: "rgba(224,255,247,.42)", vtexMark: "rgba(220,255,247,.6)", chevron: "rgba(150,225,204,.7)",
        label: "rgba(220,250,242,.92)", embossFill: "#f4fffb", embossShadow: "rgba(0,0,0,.45)",
        num: "rgba(226,250,244,.9)", footLbl: "rgba(206,240,229,.74)", footVal: "rgba(238,252,247,.92)",
        filigrane: "98,184,176", contactless: "rgba(220,255,247,.45)", networkBlend: "screen", visa: "#ffffff",
        side: 0x0a1d19, sideEm: 0x2f8670, metal: 0.42, rough: 0.38,
    },
    brick: {
        bg: [[0, "#A04841"], [0.32, "#973F39"], [0.6, "#8E3B36"], [1, "#73302C"]],
        guilloche: "#f0b6ac", guillocheA: 0.05, reflet: "255,255,255", reflA: 0.16,
        bloom: "240,160,148", sheen: "255,255,255", sheenA: 0.06,
        typeTag: "rgba(255,236,232,.46)", vtexMark: "rgba(255,240,236,.62)", chevron: "rgba(250,196,186,.72)",
        label: "rgba(255,240,236,.92)", embossFill: "#fff8f6", embossShadow: "rgba(0,0,0,.42)",
        num: "rgba(255,242,238,.9)", footLbl: "rgba(250,222,216,.74)", footVal: "rgba(255,246,244,.92)",
        filigrane: "240,160,148", contactless: "rgba(255,240,236,.45)", networkBlend: "screen", visa: "#ffffff",
        side: 0x3a1512, sideEm: 0x8e453c, metal: 0.44, rough: 0.36,
    },
};
/** Solde affiché dans la devise d'affichage choisie (€ ou ₣, parité fixe 1 € = 119,3317 ₣). */
function balanceStr(v, display) {
    return window.VtexCore.fmt(window.VtexCore.convert(Math.round(v * 100), "EUR", display), display);
}
function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}
function makeCardTexture(card, display) {
    const th = THEME[card.theme];
    const W = 1792, H = Math.round(W / 1.586);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d");
    const S = W / 1024;
    const px = (v) => v * S;
    const g = c.createLinearGradient(0, 0, W * 0.9, H);
    th.bg.forEach(([stop, color]) => g.addColorStop(stop, color));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.save();
    c.globalAlpha = th.guillocheA;
    c.strokeStyle = th.guilloche;
    c.lineWidth = 1;
    for (let gl = 0; gl < 26; gl++) {
        c.beginPath();
        for (let gx = 0; gx <= W; gx += 8) {
            const yy = H * 0.6 + gl * px(7) + Math.sin(gx * 0.01 + gl * 0.5) * px(9) + Math.sin(gx * 0.004) * px(15);
            if (gx === 0)
                c.moveTo(gx, yy);
            else
                c.lineTo(gx, yy);
        }
        c.stroke();
    }
    c.restore();
    const hl = c.createRadialGradient(W * 0.2, H * 0.08, 10, W * 0.2, H * 0.08, W * 0.55);
    hl.addColorStop(0, `rgba(${th.reflet},${th.reflA})`);
    hl.addColorStop(0.22, `rgba(${th.reflet},.05)`);
    hl.addColorStop(0.5, `rgba(${th.reflet},0)`);
    c.fillStyle = hl;
    c.fillRect(0, 0, W, H);
    const bloom = (x, y, r, a) => {
        const rg = c.createRadialGradient(x, y, 4, x, y, r);
        rg.addColorStop(0, `rgba(${th.bloom},${a})`);
        rg.addColorStop(1, `rgba(${th.bloom},0)`);
        c.fillStyle = rg;
        c.fillRect(0, 0, W, H);
    };
    bloom(W * 0.92, H * 0.04, W * 0.5, 0.13);
    bloom(W * -0.04, H * 1.04, W * 0.5, 0.09);
    c.save();
    c.translate(W * 0.5, H * 0.5);
    c.rotate(-0.52);
    const sh = c.createLinearGradient(0, -px(70), 0, px(70));
    sh.addColorStop(0, `rgba(${th.sheen},0)`);
    sh.addColorStop(0.5, `rgba(${th.sheen},${th.sheenA})`);
    sh.addColorStop(1, `rgba(${th.sheen},0)`);
    c.fillStyle = sh;
    c.fillRect(-W, -px(70), 2 * W, px(140));
    c.restore();
    const pad = px(64);
    const emboss = (txt, x, y, font, fill, align = "left") => {
        c.font = font;
        c.textAlign = align;
        c.textBaseline = "alphabetic";
        c.fillStyle = th.embossShadow;
        c.fillText(txt, x, y + px(1.5));
        c.fillStyle = fill;
        c.fillText(txt, x, y);
        c.textAlign = "left";
    };
    c.textBaseline = "top";
    c.fillStyle = th.typeTag;
    c.font = `700 ${px(22)}px Inter,Arial,sans-serif`;
    c.fillText(card.type.toUpperCase().split("").join(" "), pad, pad - px(8));
    c.save();
    c.textAlign = "right";
    c.textBaseline = "alphabetic";
    c.fillStyle = th.vtexMark;
    c.font = `700 ${px(27)}px ui-monospace,'JetBrains Mono',monospace`;
    c.fillText("V T E X", W - pad, pad + px(18));
    c.strokeStyle = th.chevron;
    c.lineWidth = px(3);
    c.lineJoin = "round";
    c.lineCap = "round";
    const cxv = W - pad - px(132), cyv = pad + px(6);
    c.beginPath();
    c.moveTo(cxv, cyv);
    c.lineTo(cxv + px(9), cyv + px(11));
    c.lineTo(cxv + px(18), cyv);
    c.stroke();
    c.restore();
    c.textBaseline = "top";
    c.fillStyle = th.label;
    c.font = `700 ${px(21)}px Inter,Arial,sans-serif`;
    c.fillText((card.frozen ? "CARTE GELÉE" : "SOLDE DISPONIBLE · " + card.label).toUpperCase(), pad, H * 0.19);
    emboss(balanceStr(card.balance, display), pad, H * 0.245 + px(60), `700 ${px(66)}px ui-monospace,'JetBrains Mono',monospace`, th.embossFill);
    const chx = pad, chy = H * 0.5, chw = px(108), chh = px(84);
    const cg = c.createLinearGradient(chx, chy, chx + chw * 0.5, chy + chh);
    cg.addColorStop(0, "#fbeecb");
    cg.addColorStop(0.4, "#e2c98a");
    cg.addColorStop(0.72, "#c9a24f");
    cg.addColorStop(1, "#9c7a34");
    c.fillStyle = cg;
    roundRect(c, chx, chy, chw, chh, px(15));
    c.fill();
    c.strokeStyle = "rgba(120,90,30,.5)";
    c.lineWidth = px(2.4);
    c.beginPath();
    c.moveTo(chx + chw * 0.34, chy);
    c.lineTo(chx + chw * 0.34, chy + chh);
    c.moveTo(chx + chw * 0.66, chy);
    c.lineTo(chx + chw * 0.66, chy + chh);
    c.moveTo(chx, chy + chh * 0.5);
    c.lineTo(chx + chw, chy + chh * 0.5);
    c.stroke();
    c.strokeRect(chx + chw * 0.34, chy + chh * 0.3, chw * 0.32, chh * 0.4);
    c.strokeStyle = "rgba(255,255,255,.5)";
    c.lineWidth = px(1);
    roundRect(c, chx + px(1), chy + px(1), chw - px(2), chh - px(2), px(14));
    c.stroke();
    c.strokeStyle = th.contactless;
    c.lineWidth = px(3.4);
    c.lineCap = "round";
    const wx = chx + chw + px(30), wy = chy + chh * 0.5;
    for (let wr = 0; wr < 3; wr++) {
        c.beginPath();
        c.arc(wx, wy, px(12) + wr * px(11), -Math.PI * 0.32, Math.PI * 0.32);
        c.stroke();
    }
    if (card.network === "visa") {
        c.save();
        c.textAlign = "right";
        c.textBaseline = "alphabetic";
        c.fillStyle = th.visa;
        c.font = `italic 800 ${px(56)}px Inter,Arial,sans-serif`;
        c.fillText("VISA", W - pad, chy + chh * 0.7);
        c.restore();
    }
    else {
        const mx = W - pad - px(150), my = chy + chh * 0.5;
        c.fillStyle = "#EB001B";
        c.beginPath();
        c.arc(mx, my, px(40), 0, 7);
        c.fill();
        c.globalCompositeOperation = th.networkBlend;
        c.fillStyle = "#F79E1B";
        c.beginPath();
        c.arc(mx + px(46), my, px(40), 0, 7);
        c.fill();
        c.globalCompositeOperation = "source-over";
    }
    emboss(card.num, pad, H * 0.72 + px(30), `600 ${px(41)}px ui-monospace,'JetBrains Mono',monospace`, th.num);
    c.textBaseline = "top";
    c.fillStyle = th.footLbl;
    c.font = `700 ${px(16)}px Inter,Arial,sans-serif`;
    c.fillText("TITULAIRE", pad, H - px(94));
    c.textAlign = "right";
    c.fillText("EXPIRE", W - pad, H - px(94));
    c.textAlign = "left";
    emboss(card.holder, pad, H - px(40), `600 ${px(27)}px Inter,Arial,sans-serif`, th.footVal);
    emboss(card.expiry, W - pad, H - px(40), `600 ${px(27)}px Inter,Arial,sans-serif`, th.footVal, "right");
    c.save();
    c.translate(W - px(150), H - px(150));
    c.rotate((-14 * Math.PI) / 180);
    c.strokeStyle = `rgba(${th.filigrane},.09)`;
    c.lineWidth = px(10);
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(px(70), px(120));
    c.lineTo(px(140), 0);
    c.stroke();
    c.restore();
    c.save();
    c.globalAlpha = 0.025;
    for (let gi = 0; gi < 5200; gi++) {
        c.fillStyle = gi % 2 ? "#ffffff" : "#000000";
        c.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1);
    }
    c.restore();
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}
const CARD_W = 1.586, CARD_H = 1.0;
function cardShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
}
function makeCardGeometry() {
    const geo = new THREE.ExtrudeGeometry(cardShape(CARD_W, CARD_H, 0.1), {
        depth: 0.06, bevelEnabled: true, bevelThickness: 0.026, bevelSize: 0.024, bevelSegments: 8, curveSegments: 32,
    });
    geo.center();
    geo.computeBoundingBox();
    const bb = geo.boundingBox, sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y;
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (pos.getX(i) - bb.min.x) / sx, (pos.getY(i) - bb.min.y) / sy);
    uv.needsUpdate = true;
    return geo;
}
function mountStage(root, display, cardsInput) {
    CARDS = cardsInput;
    const elSub = root.querySelector(".vs-sub"), elAmt = root.querySelector(".vs-amt"), elCount = root.querySelector(".vs-count"), elDots = root.querySelector(".vs-dots");
    const elPrev = root.querySelector(".vs-prev"), elNext = root.querySelector(".vs-next");
    let api = null;
    const cleanup = (() => {
        var _a;
        const canvas = root.querySelector("canvas.vs-canvas"), hit = root.querySelector(".vs-hit");
        if (!canvas || !hit)
            return;
        let disposed = false;
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        let reduce = motionQuery.matches;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "default", stencil: false, depth: true });
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
        const LOOK_Y = 1.5;
        camera.position.set(0, 1.35, 7.5);
        camera.lookAt(0, LOOK_Y, 0);
        const key = new THREE.DirectionalLight(0xf3f6ff, 1.6);
        key.position.set(1.8, 5.4, 3.6);
        scene.add(key);
        scene.add(new THREE.AmbientLight(0xdfe6ff, 0.55));
        const fill = new THREE.DirectionalLight(0xbcd0ff, 0.4);
        fill.position.set(-3, 1.4, 2);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0x9db2ff, 0.5);
        rim.position.set(0, 2.4, -4);
        scene.add(rim);
        const bevelRim = new THREE.DirectionalLight(0xffffff, 0.75);
        bevelRim.position.set(-2.4, 0.9, 4.6);
        scene.add(bevelRim);
        try {
            const ecv = document.createElement("canvas");
            ecv.width = 1024;
            ecv.height = 512;
            const ec = ecv.getContext("2d");
            const eg = ec.createLinearGradient(0, 0, 0, 512);
            eg.addColorStop(0, "#c8d2f0");
            eg.addColorStop(0.42, "#7f8bbd");
            eg.addColorStop(0.56, "#2c3360");
            eg.addColorStop(1, "#070912");
            ec.fillStyle = eg;
            ec.fillRect(0, 0, 1024, 512);
            const soft = (x, y, rx, ry, col) => {
                ec.save();
                ec.translate(x, y);
                ec.scale(rx, ry);
                const rg = ec.createRadialGradient(0, 0, 2, 0, 0, 1);
                rg.addColorStop(0, col);
                rg.addColorStop(1, "rgba(255,255,255,0)");
                ec.fillStyle = rg;
                ec.beginPath();
                ec.arc(0, 0, 1, 0, 7);
                ec.fill();
                ec.restore();
            };
            soft(430, 120, 360, 150, "rgba(255,255,255,.95)");
            soft(900, 250, 70, 240, "rgba(240,246,255,.85)");
            soft(150, 470, 300, 150, "rgba(196,210,255,.5)");
            soft(560, 300, 240, 120, "rgba(150,170,255,.28)");
            const eqt = new THREE.CanvasTexture(ecv);
            eqt.mapping = THREE.EquirectangularReflectionMapping;
            eqt.needsUpdate = true;
            const pmrem = new THREE.PMREMGenerator(renderer);
            scene.environment = pmrem.fromEquirectangular(eqt).texture;
        }
        catch { /* env map best-effort */ }
        const makeBlobTexture = (light) => {
            const S = 256, cv = document.createElement("canvas");
            cv.width = cv.height = S;
            const c = cv.getContext("2d");
            const g = c.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
            if (light) {
                g.addColorStop(0, "rgba(150,175,255,.5)");
                g.addColorStop(0.5, "rgba(120,150,255,.16)");
                g.addColorStop(1, "rgba(120,150,255,0)");
            }
            else {
                g.addColorStop(0, "rgba(10,12,24,.62)");
                g.addColorStop(0.42, "rgba(10,12,24,.28)");
                g.addColorStop(0.72, "rgba(10,12,24,.08)");
                g.addColorStop(1, "rgba(10,12,24,0)");
            }
            c.fillStyle = g;
            c.fillRect(0, 0, S, S);
            const t = new THREE.CanvasTexture(cv);
            t.needsUpdate = true;
            return t;
        };
        const BLOB_TEX = makeBlobTexture(false);
        const LIGHTBLOB_TEX = makeBlobTexture(true);
        const makeChipTexture = () => {
            const W = 256, H = 200, cv = document.createElement("canvas");
            cv.width = W;
            cv.height = H;
            const c = cv.getContext("2d");
            const g = c.createLinearGradient(0, 0, W * 0.5, H);
            g.addColorStop(0, "#fbeecb");
            g.addColorStop(0.4, "#e2c98a");
            g.addColorStop(0.72, "#c9a24f");
            g.addColorStop(1, "#9c7a34");
            c.fillStyle = g;
            c.fillRect(0, 0, W, H);
            c.strokeStyle = "rgba(120,90,30,.5)";
            c.lineWidth = 5;
            c.strokeRect(W * 0.3, H * 0.24, W * 0.4, H * 0.52);
            c.beginPath();
            c.moveTo(W * 0.3, H * 0.5);
            c.lineTo(W * 0.7, H * 0.5);
            c.moveTo(W * 0.5, H * 0.24);
            c.lineTo(W * 0.5, H * 0.76);
            c.stroke();
            const t = new THREE.CanvasTexture(cv);
            t.anisotropy = 8;
            t.colorSpace = THREE.SRGBColorSpace;
            t.needsUpdate = true;
            return t;
        };
        const CHIP_GEO = (() => {
            const gg = new THREE.ExtrudeGeometry(cardShape(0.168, 0.132, 0.028), { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 3, curveSegments: 10 });
            gg.center();
            gg.computeBoundingBox();
            const bb = gg.boundingBox, sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y;
            const uv = gg.attributes.uv, pos = gg.attributes.position;
            for (let i = 0; i < uv.count; i++)
                uv.setXY(i, (pos.getX(i) - bb.min.x) / sx, (pos.getY(i) - bb.min.y) / sy);
            uv.needsUpdate = true;
            return gg;
        })();
        const CHIP_MAT = new THREE.MeshPhysicalMaterial({ map: makeChipTexture(), color: 0xe8c063, emissive: 0x5c4415, emissiveIntensity: 0.34, metalness: 0.78, roughness: 0.28, clearcoat: 0.45, clearcoatRoughness: 0.2, envMapIntensity: 0.8 });
        const CHIP_SIDE = new THREE.MeshPhysicalMaterial({ color: 0x8a6a2c, emissive: 0x241a08, emissiveIntensity: 0.14, metalness: 0.9, roughness: 0.32 });
        const geo = makeCardGeometry();
        const cards = CARDS.map((cd, idx) => {
            const th = THEME[cd.theme];
            const rough = cd.frozen ? 0.5 : th.rough + idx * 0.02;
            const metal = cd.frozen ? 0.25 : th.metal - idx * 0.02;
            const faceMat = new THREE.MeshPhysicalMaterial({ map: makeCardTexture(cd, display), roughness: rough, metalness: metal, clearcoat: cd.frozen ? 0.5 : 0.85, clearcoatRoughness: cd.frozen ? 0.35 : 0.18, envMapIntensity: cd.frozen ? 0.4 : 0.7, transparent: true });
            const sideMat = new THREE.MeshPhysicalMaterial({ color: th.side, emissive: th.sideEm, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.72, clearcoat: 0.75, clearcoatRoughness: 0.26, envMapIntensity: 1.0 });
            const mesh = new THREE.Mesh(geo, [faceMat, sideMat]);
            const grp = new THREE.Group();
            grp.add(mesh);
            scene.add(grp);
            const chip = new THREE.Mesh(CHIP_GEO, [CHIP_MAT, CHIP_SIDE]);
            chip.position.set(-0.611, -0.062, 0.066);
            grp.add(chip);
            const bmat = new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, opacity: 0.28 });
            const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.15), bmat);
            blob.rotation.x = -Math.PI / 2;
            scene.add(blob);
            const lbmat = new THREE.MeshBasicMaterial({ map: LIGHTBLOB_TEX, transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending });
            const lblob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), lbmat);
            lblob.rotation.x = -Math.PI / 2;
            scene.add(lblob);
            return { grp, mesh, face: faceMat, blob, bmat, lblob, lbmat };
        });
        const LEAN = -0.85, GAP = 1.55, BASE_Y = 1.6, GROUND_Y = 1.06;
        let scroll = 0, target = 0, vel = 0, dragging = false, tSec = 0;
        const clampIdx = (i) => Math.max(0, Math.min(cards.length - 1, i));
        function layout(t) {
            for (let i = 0; i < cards.length; i++) {
                const p = i - scroll, ap = Math.min(2.4, Math.abs(p)), cl = Math.max(-2, Math.min(2, p));
                const fY = reduce ? 0 : Math.sin(t * 0.9 + i * 1.7) * 0.022;
                const fRz = reduce ? 0 : Math.sin(t * 0.6 + i * 2.1) * 0.01;
                const fRx = reduce ? 0 : Math.cos(t * 0.7 + i * 1.3) * 0.008;
                const g = cards[i].grp;
                const easedP = p * (1 + Math.abs(p) * 0.08);
                g.position.x = easedP * GAP;
                g.position.z = ap === 0 ? 0.18 : -ap * 1.1;
                g.position.y = BASE_Y + ap * 0.04 + fY;
                g.rotation.x = LEAN + fRx;
                g.rotation.y = cl * -0.52;
                g.rotation.z = fRz;
                g.scale.setScalar(1 - ap * 0.1);
                cards[i].face.opacity = 1 - Math.min(1, ap * 0.5);
                cards[i].mesh.visible = ap < 2.35;
                const b = cards[i].blob;
                b.position.set(p * GAP, GROUND_Y + 0.002, -ap * 1.2);
                b.scale.setScalar((1 - ap * 0.09) * (1 + fY * 0.5));
                cards[i].bmat.opacity = Math.max(0, 0.28 - ap * 0.09);
                b.visible = ap < 2.35;
                const lb = cards[i].lblob;
                lb.position.set(p * GAP, GROUND_Y - 0.001, -ap * 1.2);
                lb.scale.setScalar(1 - ap * 0.09);
                cards[i].lbmat.opacity = Math.max(0, 0.5 - ap * 0.2);
                lb.visible = ap < 2.35;
            }
        }
        function frameToWidth() {
            const W = canvas.clientWidth || 360, H = canvas.clientHeight || 300;
            camera.aspect = W / H;
            const vfov = (camera.fov * Math.PI) / 180;
            const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
            let dist = (CARD_W / 0.94 / 2) / Math.tan(hfov / 2);
            dist = Math.max(3.6, Math.min(12, dist));
            camera.position.set(0, 1.35, dist);
            camera.lookAt(0, LOOK_Y, 0);
            camera.updateProjectionMatrix();
        }
        let lastIdx = -1;
        function renderDots() {
            const wrap = elDots;
            if (!wrap)
                return;
            wrap.innerHTML = CARDS.map((_, i) => `<button type="button" class="vtx3d-dot${i === 0 ? " on" : ""}" data-i="${i}" aria-label="Afficher la carte ${i + 1}" aria-pressed="${i === 0 ? "true" : "false"}"></button>`).join("");
            wrap.querySelectorAll(".vtx3d-dot").forEach((d) => d.addEventListener("click", () => { const i = Number(d.dataset.i); go(i); }));
        }
        renderDots();
        const captionFor = (cd) => (cd.frozen ? "Carte gelée" : "Solde disponible") + " · " + cd.label;
        function syncUI(idx) {
            if (idx === lastIdx)
                return;
            lastIdx = idx;
            const cd = CARDS[idx];
            if (!cd)
                return;
            const subEl = elSub, amtEl = elAmt;
            if (subEl) {
                subEl.style.opacity = "0";
                requestAnimationFrame(() => { subEl.textContent = captionFor(cd); subEl.style.opacity = "1"; });
            }
            if (amtEl) {
                amtEl.style.opacity = "0";
                requestAnimationFrame(() => { amtEl.textContent = balanceStr(cd.balance, display); amtEl.style.opacity = "1"; });
            }
            if (elCount)
                elCount.textContent = String(idx + 1).padStart(2, "0") + " / " + String(CARDS.length).padStart(2, "0");
            elDots === null || elDots === void 0 ? void 0 : elDots.querySelectorAll(".vtx3d-dot").forEach((d, i) => { d.classList.toggle("on", i === idx); d.setAttribute("aria-pressed", i === idx ? "true" : "false"); });
            if (elPrev) {
                elPrev.disabled = idx === 0;
                elPrev.style.opacity = idx === 0 ? ".35" : "1";
            }
            if (elNext) {
                elNext.disabled = idx === CARDS.length - 1;
                elNext.style.opacity = idx === CARDS.length - 1 ? ".35" : "1";
            }
        }
        function go(i) {
            target = clampIdx(i);
            if (!dragging)
                syncUI(target);
        }
        api = { previous: () => go(Math.round(target) - 1), next: () => go(Math.round(target) + 1) };
        const onMotionChange = (event) => { reduce = event.matches; if (reduce) {
            scroll = target;
            vel = 0;
        } };
        (_a = motionQuery.addEventListener) === null || _a === void 0 ? void 0 : _a.call(motionQuery, "change", onMotionChange);
        const stepPx = () => (hit.clientWidth || 360) * 0.52;
        let startX = 0, startY = 0, startScroll = 0, lastMoveT = 0, lastMoveScroll = 0, moved = false;
        let intentDecided = false, intentHoriz = false;
        hit.tabIndex = 0;
        const onPointerDown = (e) => {
            dragging = true;
            moved = false;
            intentDecided = false;
            intentHoriz = false;
            startX = e.clientX;
            startY = e.clientY;
            startScroll = scroll;
            lastMoveT = performance.now();
            lastMoveScroll = scroll;
            vel = 0;
            try {
                hit.setPointerCapture(e.pointerId);
            }
            catch { /* noop */ }
        };
        const onPointerMove = (e) => {
            if (!dragging)
                return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!intentDecided && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
                intentDecided = true;
                intentHoriz = Math.abs(dx) > Math.abs(dy) * 0.8;
            }
            if (intentDecided && !intentHoriz) {
                dragging = false;
                vel = 0;
                scroll = target;
                return;
            }
            if (Math.abs(dx) > 2)
                moved = true;
            const n = cards.length - 1;
            let p = startScroll - dx / stepPx();
            if (p < 0) {
                const ov = -p;
                p = -Math.pow(ov, 0.68) * 0.55;
            }
            else if (p > n) {
                const ov2 = p - n;
                p = n + Math.pow(ov2, 0.68) * 0.55;
            }
            const now = performance.now(), dtS = Math.max(0.001, (now - lastMoveT) / 1000);
            const inst = (p - lastMoveScroll) / dtS;
            vel = vel * 0.6 + inst * 0.4;
            scroll = p;
            lastMoveT = now;
            lastMoveScroll = p;
        };
        const onPointerUp = (e) => {
            if (!dragging)
                return;
            dragging = false;
            if (!moved) {
                const hitRect = hit.getBoundingClientRect();
                const tapX = e.clientX - hitRect.left - hitRect.width / 2;
                const step = stepPx();
                let best = -1, bestDist = Infinity;
                for (let ci = 0; ci < cards.length; ci++) {
                    const dist = Math.abs(tapX - (ci - scroll) * step);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = ci;
                    }
                }
                const current = clampIdx(Math.round(scroll));
                if (best >= 0 && best !== current) {
                    target = clampIdx(best);
                    vel = 0;
                    setTimeout(() => syncUI(target), 80);
                    return;
                }
                scroll = target;
                vel = 0;
                return;
            }
            const cur = clampIdx(Math.round(scroll));
            const proj = scroll + vel * 0.22;
            const idx = clampIdx(Math.max(cur - 2, Math.min(cur + 2, Math.round(proj))));
            go(idx);
            vel *= 0.3;
            setTimeout(() => syncUI(idx), 60);
        };
        const onKeyDown = (e) => {
            let next = Math.round(target);
            if (e.key === "ArrowRight")
                next += 1;
            else if (e.key === "ArrowLeft")
                next -= 1;
            else if (e.key === "Home")
                next = 0;
            else if (e.key === "End")
                next = cards.length - 1;
            else
                return;
            e.preventDefault();
            go(clampIdx(next));
        };
        hit.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        hit.addEventListener("keydown", onKeyDown);
        function resize() {
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
            frameToWidth();
        }
        window.addEventListener("resize", resize);
        const FIXED = 1 / 360, STIFF = 178, DAMP = 28;
        let acc = 0;
        function integrate(dt) {
            acc += dt;
            let n = 0;
            while (acc >= FIXED && n < 20) {
                if (!dragging) {
                    const a = STIFF * (target - scroll) - DAMP * vel;
                    vel += a * FIXED;
                    scroll += vel * FIXED;
                }
                acc -= FIXED;
                n++;
            }
            if (acc > FIXED * 3)
                acc = 0;
            if (!dragging && Math.abs(target - scroll) < 0.0002 && Math.abs(vel) < 0.0003) {
                scroll = target;
                vel = 0;
            }
        }
        let raf = 0, lastT = performance.now();
        function tick(now) {
            const dt = Math.min(0.033, (now - lastT) / 1000);
            lastT = now;
            tSec += dt;
            if (reduce) {
                scroll = target;
                vel = 0;
            }
            else
                integrate(dt);
            layout(tSec);
            renderer.render(scene, camera);
            syncUI(clampIdx(Math.round(scroll)));
            raf = requestAnimationFrame(tick);
        }
        resize();
        layout(0);
        syncUI(0);
        raf = requestAnimationFrame(tick);
        return () => {
            var _a;
            disposed = true;
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
            hit.removeEventListener("pointerdown", onPointerDown);
            hit.removeEventListener("keydown", onKeyDown);
            (_a = motionQuery.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(motionQuery, "change", onMotionChange);
            renderer.dispose();
            void disposed;
        };
    })();
    if (elPrev)
        elPrev.onclick = () => api && api.previous();
    if (elNext)
        elNext.onclick = () => api && api.next();
    return cleanup;
}

window.VtexStage3D = { mount: mountStage };
