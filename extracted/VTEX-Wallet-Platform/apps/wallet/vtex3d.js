/* =============================================================================
   VTEX — Carrousel de cartes en VRAIE 3D (Three.js), intégré au portefeuille réel.
   • Identité VTEX conservée : cartes navy VTEX, puce or, marque VTEX, € — le fond
     split ivoire/navy et le halo de VTEX transparaissent (canvas TRANSPARENT).
   • Mécanique calquée sur la vidéo : cartes posées/raccourcies, rotation coverflow,
     recul + rétrécissement en profondeur, ombre de contact sur la surface.
   • Ressort amorti unique + boucle WebGL -> stable et fluide.
   Dépend de l'app : globales CARDS, fmtEUR, activeCardIndex, goToCard.
   ============================================================================= */
(function(){
  "use strict";
  if (typeof THREE === "undefined"){ console.warn("[vtex3d] Three.js absent"); return; }
  var motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  var reduce = motionQuery.matches;

  /* ------------------------- Texture face carte (VTEX) ------------------------ */
  function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);
    c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

  function eurStr(v){
    try{ if (typeof fmtEUR==="function") return fmtEUR(v); }catch(e){}
    return v.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
  }

  /* Palette kaleidoscope LEGDAY appliquee aux cartes : navy = bleu "Creer une
     facture" (KaleidoTile blueDeep), teal = bleu-vert Voyage. */
  var CARD_THEME = {
    navy:{
      bg:[[0,'#356E9C'],[.32,'#2F638E'],[.6,'#2A5B84'],[1,'#22496A']],
      guilloche:'#a9c8e8', guillocheA:.06, reflet:'255,255,255', reflA:.18,
      bloom:'170,205,240', sheen:'255,255,255', sheenA:.07,
      typeTag:'rgba(230,240,255,.5)', vtexMark:'rgba(236,244,255,.68)', chevron:'rgba(200,222,250,.78)',
      label:'rgba(236,244,255,.94)', embossFill:'#fdfeff', embossShadow:'rgba(0,0,0,.4)',
      num:'rgba(238,246,255,.92)', footLbl:'rgba(222,235,252,.76)', footVal:'rgba(244,249,255,.94)',
      filigrane:'170,205,240', contactless:'rgba(236,244,255,.5)', networkBlend:'screen', visa:'#ffffff',
      side:0x14314a, sideEm:0x2f6fa0, metal:0.46, rough:0.34
    },
    teal:{
      bg:[[0,'#123531'],[.32,'#0f2c29'],[.6,'#0a2320'],[1,'#061615']],
      guilloche:'#7fe0c9', guillocheA:.05, reflet:'255,255,255', reflA:.14,
      bloom:'98,184,176', sheen:'255,255,255', sheenA:.05,
      typeTag:'rgba(224,255,247,.42)', vtexMark:'rgba(220,255,247,.6)', chevron:'rgba(150,225,204,.7)',
      label:'rgba(220,250,242,.92)', embossFill:'#f4fffb', embossShadow:'rgba(0,0,0,.45)',
      num:'rgba(226,250,244,.9)', footLbl:'rgba(206,240,229,.74)', footVal:'rgba(238,252,247,.92)',
      filigrane:'98,184,176', contactless:'rgba(220,255,247,.45)', networkBlend:'screen', visa:'#ffffff',
      side:0x0a1d19, sideEm:0x2f8670, metal:0.42, rough:0.38
    }
  };

  function makeVtexCardTexture(card){
    var th = CARD_THEME[card.theme] || CARD_THEME.navy;
    var W=1792, H=Math.round(W/1.586);
    var cv=document.createElement("canvas"); cv.width=W; cv.height=H;
    var c=cv.getContext("2d");
    var S=W/1024;                                   // facteur d'échelle (base 1024)
    function px(v){ return v*S; }
    // fond dégradé selon le thème de la carte
    var g=c.createLinearGradient(0,0,W*0.9,H);
    th.bg.forEach(function(stop){ g.addColorStop(stop[0], stop[1]); });
    c.fillStyle=g; c.fillRect(0,0,W,H);
    // guilloché de sécurité (fines lignes d'interférence) — bas de carte, très discret
    c.save(); c.globalAlpha=th.guillocheA; c.strokeStyle=th.guilloche; c.lineWidth=1;
    for(var gl=0;gl<26;gl++){ c.beginPath();
      for(var gx=0;gx<=W;gx+=8){ var yy=H*0.60 + gl*px(7) + Math.sin(gx*0.010 + gl*0.5)*px(9) + Math.sin(gx*0.004)*px(15);
        if(gx===0)c.moveTo(gx,yy); else c.lineTo(gx,yy);} c.stroke(); }
    c.restore();
    // reflet doux haut-gauche
    var hl=c.createRadialGradient(W*.2,H*.08,10,W*.2,H*.08,W*.55);
    hl.addColorStop(0,"rgba("+th.reflet+","+th.reflA+")"); hl.addColorStop(.22,"rgba("+th.reflet+",.05)"); hl.addColorStop(.5,"rgba("+th.reflet+",0)");
    c.fillStyle=hl; c.fillRect(0,0,W,H);
    // halos accent VTEX
    function bloom(x,y,r,a){var rg=c.createRadialGradient(x,y,4,x,y,r);rg.addColorStop(0,"rgba("+th.bloom+","+a+")");rg.addColorStop(1,"rgba("+th.bloom+",0)");c.fillStyle=rg;c.fillRect(0,0,W,H);}
    bloom(W*0.92,H*0.04,W*0.5,0.13); bloom(W*-0.04,H*1.04,W*0.5,0.09);
    // bande de brossé (sheen) diagonale
    c.save(); c.translate(W*0.5,H*0.5); c.rotate(-0.52);
    var sh=c.createLinearGradient(0,-px(70),0,px(70)); sh.addColorStop(0,"rgba("+th.sheen+",0)"); sh.addColorStop(.5,"rgba("+th.sheen+","+th.sheenA+")"); sh.addColorStop(1,"rgba("+th.sheen+",0)");
    c.fillStyle=sh; c.fillRect(-W,-px(70),2*W,px(140)); c.restore();

    var pad=px(64);
    function emboss(txt,x,y,font,fill,align){ c.font=font; c.textAlign=align||"left"; c.textBaseline="alphabetic";
      c.fillStyle=th.embossShadow; c.fillText(txt,x,y+px(1.5)); c.fillStyle=fill; c.fillText(txt,x,y); c.textAlign="left"; }

    // type tag (haut-gauche)
    c.textBaseline="top";
    c.fillStyle=th.typeTag; c.font="700 "+px(22)+"px Inter,Arial,sans-serif";
    c.fillText(String(card.type||"").toUpperCase().split("").join("\u2009"), pad, pad-px(8));
    // marque VTEX + chevron (haut-droite)
    c.save(); c.textAlign="right"; c.textBaseline="alphabetic";
    c.fillStyle=th.vtexMark; c.font="700 "+px(27)+"px ui-monospace,'JetBrains Mono',monospace";
    c.fillText("V T E X", W-pad, pad+px(18));
    // petit chevron
    c.strokeStyle=th.chevron; c.lineWidth=px(3); c.lineJoin="round"; c.lineCap="round";
    var cxv=W-pad-px(132), cyv=pad+px(6);
    c.beginPath(); c.moveTo(cxv,cyv); c.lineTo(cxv+px(9),cyv+px(11)); c.lineTo(cxv+px(18),cyv); c.stroke();
    c.restore();

    // libellé + solde (embossé)
    c.textBaseline="top";
    c.fillStyle=th.label; c.font="700 "+px(21)+"px Inter,Arial,sans-serif";
    c.fillText((card.frozen?"CARTE GELÉE":"SOLDE DISPONIBLE · "+(card.label||"")).toUpperCase(), pad, H*0.19);
    emboss(eurStr(card.balance), pad, H*0.245+px(60), "700 "+px(66)+"px ui-monospace,'JetBrains Mono',monospace", th.embossFill);

    // puce EMV or (affinée) + sans-contact
    var chx=pad, chy=H*0.5, chw=px(108), chh=px(84);
    var cg=c.createLinearGradient(chx,chy,chx+chw*0.5,chy+chh);
    cg.addColorStop(0,"#fbeecb"); cg.addColorStop(.4,"#e2c98a"); cg.addColorStop(.72,"#c9a24f"); cg.addColorStop(1,"#9c7a34");
    c.fillStyle=cg; roundRect(c,chx,chy,chw,chh,px(15)); c.fill();
    c.strokeStyle="rgba(120,90,30,.5)"; c.lineWidth=px(2.4);
    c.beginPath(); c.moveTo(chx+chw*.34,chy); c.lineTo(chx+chw*.34,chy+chh);
    c.moveTo(chx+chw*.66,chy); c.lineTo(chx+chw*.66,chy+chh);
    c.moveTo(chx,chy+chh*.5); c.lineTo(chx+chw,chy+chh*.5); c.stroke();
    c.strokeRect(chx+chw*.34,chy+chh*.30,chw*.32,chh*.40);
    // liseré clair sur la puce
    c.strokeStyle="rgba(255,255,255,.5)"; c.lineWidth=px(1); roundRect(c,chx+px(1),chy+px(1),chw-px(2),chh-px(2),px(14)); c.stroke();
    // sans-contact
    c.strokeStyle=th.contactless; c.lineWidth=px(3.4); c.lineCap="round";
    var wx=chx+chw+px(30), wy=chy+chh*0.5;
    for(var wr=0;wr<3;wr++){ c.beginPath(); c.arc(wx, wy, px(12)+wr*px(11), -Math.PI*0.32, Math.PI*0.32); c.stroke(); }

    // réseau
    if(String(card.network)==="visa"){
      c.save(); c.textAlign="right"; c.textBaseline="alphabetic";
      c.fillStyle=th.visa; c.font="italic 800 "+px(56)+"px Inter,Arial,sans-serif";
      c.fillText("VISA", W-pad, chy+chh*0.7); c.restore();
    } else {
      var mx=W-pad-px(150), my=chy+chh*0.5;
      c.fillStyle="#EB001B"; c.beginPath(); c.arc(mx,my,px(40),0,7); c.fill();
      c.globalCompositeOperation=th.networkBlend;
      c.fillStyle="#F79E1B"; c.beginPath(); c.arc(mx+px(46),my,px(40),0,7); c.fill();
      c.globalCompositeOperation="source-over";
    }

    // numéro (embossé)
    emboss(card.num||"", pad, H*0.72+px(30), "600 "+px(41)+"px ui-monospace,'JetBrains Mono',monospace", th.num);

    // footer
    c.textBaseline="top";
    c.fillStyle=th.footLbl; c.font="700 "+px(16)+"px Inter,Arial,sans-serif";
    c.fillText("TITULAIRE", pad, H-px(94)); c.textAlign="right"; c.fillText("EXPIRE", W-pad, H-px(94)); c.textAlign="left";
    emboss(card.holder||"", pad, H-px(40), "600 "+px(27)+"px Inter,Arial,sans-serif", th.footVal);
    c.save(); c.textAlign="right"; emboss(card.expiry||"", W-pad, H-px(40), "600 "+px(27)+"px Inter,Arial,sans-serif", th.footVal,"right"); c.restore();

    // filigrane V
    c.save(); c.translate(W-px(150),H-px(150)); c.rotate(-14*Math.PI/180);
    c.strokeStyle="rgba("+th.filigrane+",.09)"; c.lineWidth=px(10); c.lineJoin="round";
    c.beginPath(); c.moveTo(0,0); c.lineTo(px(70),px(120)); c.lineTo(px(140),0); c.stroke(); c.restore();

    // traitement GIVRÉ pour carte gelée
    if(card.frozen){
      c.fillStyle="rgba(196,218,255,.14)"; c.fillRect(0,0,W,H);
      c.strokeStyle="rgba(232,242,255,.13)"; c.lineWidth=px(1.4);
      for(var fk=0;fk<10;fk++){ var fx=(fk*137)%W, fy=(fk*211)%H;
        c.beginPath(); for(var a=0;a<6;a++){ var an=a*Math.PI/3; c.moveTo(fx,fy); c.lineTo(fx+Math.cos(an)*px(26), fy+Math.sin(an)*px(26)); } c.stroke(); }
      c.fillStyle="rgba(150,178,255,.18)"; roundRect(c,W-px(250),H*0.19,px(186),px(46),px(23)); c.fill();
    }

    // grain film très fin (1-2%) -> casse le banding sur écrans large gamut
    c.save(); c.globalAlpha=0.025;
    for(var gi=0; gi<5200; gi++){ c.fillStyle = (gi%2? "#ffffff":"#000000"); c.fillRect((Math.random()*W)|0,(Math.random()*H)|0,1,1); }
    c.restore();
    var tex=new THREE.CanvasTexture(cv);
    tex.anisotropy=16; if("colorSpace" in tex) tex.colorSpace=THREE.SRGBColorSpace; tex.needsUpdate=true;
    return tex;
  }

  /* ----------------------------- Géométrie carte ------------------------------ */
  var CARD_W=1.586, CARD_H=1.0;
  function shape(w,h,r){var s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);
    s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function makeGeometry(){
    var geo=new THREE.ExtrudeGeometry(shape(CARD_W,CARD_H,0.1),
      {depth:0.06,bevelEnabled:true,bevelThickness:0.026,bevelSize:0.024,bevelSegments:8,curveSegments:32});
    geo.center(); geo.computeBoundingBox();
    var bb=geo.boundingBox,sx=bb.max.x-bb.min.x,sy=bb.max.y-bb.min.y,uv=geo.attributes.uv,pos=geo.attributes.position;
    for(var i=0;i<uv.count;i++) uv.setXY(i,(pos.getX(i)-bb.min.x)/sx,(pos.getY(i)-bb.min.y)/sy);
    uv.needsUpdate=true; return geo;
  }

  /* --------------------------------- Scène ------------------------------------ */
  var canvas=document.getElementById("vtx3d-canvas");
  var host=document.getElementById("vtx-hero3d");
  if(!canvas||!host||typeof CARDS==="undefined"){ console.warn("[vtex3d] cible absente"); return; }

  var renderer;
  try{ renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,powerPreference:"default",stencil:false,depth:true}); }
  catch(e){ console.warn("[vtex3d] WebGL indisponible, carrousel 3D ignoré",e); return; }
  renderer.setClearColor(0x000000,0);                    // TRANSPARENT -> fond VTEX visible
  // Stabilité : perte de contexte WebGL (mobile sous pression mémoire) -> on empêche le comportement
  // par défaut (canvas mort) et on met la boucle en pause ; on relance à la restauration.
  var _ctxLost=false;
  canvas.addEventListener("webglcontextlost", function(ev){ ev.preventDefault(); _ctxLost=true; if(raf){ cancelAnimationFrame(raf); raf=0; } }, false);
  canvas.addEventListener("webglcontextrestored", function(){ _ctxLost=false; try{ resize(); }catch(_){} lastT=performance.now(); acc=0; if(!raf){ raf=requestAnimationFrame(tick); } }, false);
  if("outputColorSpace" in renderer) renderer.outputColorSpace=THREE.SRGBColorSpace;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  var LOOK_Y=1.50;                                       // hauteur visée (position verticale carte)
  camera.position.set(0,1.35,7.5); camera.lookAt(0,LOOK_Y,0);

  // Lumières calées pour cartes navy posées sur l'ivoire : douces, lisibles.
  var key=new THREE.DirectionalLight(0xf3f6ff,1.6);      // clé dominante, fraîche (DA périwinkle)
  key.position.set(1.8,5.4,3.6); scene.add(key);
  scene.add(new THREE.AmbientLight(0xdfe6ff,0.55));      // ambiante = simple débouchage (ratio ~3:1)
  var fill=new THREE.DirectionalLight(0xbcd0ff,0.4); fill.position.set(-3,1.4,2); scene.add(fill);
  var rim=new THREE.DirectionalLight(0x9db2ff,0.5); rim.position.set(0,2.4,-4); scene.add(rim);
  var bevelRim=new THREE.DirectionalLight(0xffffff,0.75); bevelRim.position.set(-2.4,0.9,4.6); scene.add(bevelRim); // accroche le nouveau chanfrein

  // Environnement de reflets (studio dégradé) via PMREM -> vrais reflets métalliques
  // qui glissent sur la carte quand elle tourne. Le gros saut "premium".
  try{
    // HDRI synthétique : plusieurs sources (softbox zénithal, strip droit, rebond chaud, fond neutre)
    var ecv=document.createElement("canvas"); ecv.width=1024; ecv.height=512; var ec=ecv.getContext("2d");
    var eg=ec.createLinearGradient(0,0,0,512);
    eg.addColorStop(0,"#c8d2f0"); eg.addColorStop(.42,"#7f8bbd"); eg.addColorStop(.56,"#2c3360"); eg.addColorStop(1,"#070912");
    ec.fillStyle=eg; ec.fillRect(0,0,1024,512);
    function soft(x,y,rx,ry,col){ ec.save(); ec.translate(x,y); ec.scale(rx,ry);
      var rg=ec.createRadialGradient(0,0,2,0,0,1); rg.addColorStop(0,col); rg.addColorStop(1,"rgba(255,255,255,0)");
      ec.fillStyle=rg; ec.beginPath(); ec.arc(0,0,1,0,7); ec.fill(); ec.restore(); }
    soft(430,120,360,150,"rgba(255,255,255,.95)");     // softbox zénithal large & doux
    soft(900,250,70,240,"rgba(240,246,255,.85)");      // strip vertical fin à droite
    soft(150,470,300,150,"rgba(196,210,255,.5)");      // rebond périwinkle bas-gauche
    soft(560,300,240,120,"rgba(150,170,255,.28)");     // remplissage froid central
    var eqt=new THREE.CanvasTexture(ecv); eqt.mapping=THREE.EquirectangularReflectionMapping; eqt.needsUpdate=true;
    var pmrem=new THREE.PMREMGenerator(renderer); if(pmrem.compileEquirectangularShader) pmrem.compileEquirectangularShader();
    scene.environment=pmrem.fromEquirectangular(eqt).texture;
  }catch(e){ console.warn("[vtex3d] env map indisponible",e); }

  // Ombre de contact "blob" : sprite radial sombre posé à plat sous chaque carte.
  // Sur canvas transparent, il assombrit le fond VTEX (ivoire/navy) -> vrai contact, jamais masqué.
  function makeBlobTexture(){
    var S=256, cv=document.createElement("canvas"); cv.width=cv.height=S; var c=cv.getContext("2d");
    var g=c.createRadialGradient(S/2,S/2,4,S/2,S/2,S/2);
    g.addColorStop(0,"rgba(10,12,24,.62)"); g.addColorStop(.42,"rgba(10,12,24,.28)"); g.addColorStop(.72,"rgba(10,12,24,.08)"); g.addColorStop(1,"rgba(10,12,24,0)");
    c.fillStyle=g; c.fillRect(0,0,S,S);
    var t=new THREE.CanvasTexture(cv); t.needsUpdate=true; return t;
  }
  var BLOB_TEX=makeBlobTexture();

  // Puce EMV : vraie petite géométrie 3D (champ de micro-miroirs) -> scintille indépendamment.
  function makeChipTexture(){
    var W=256,H=200,cv=document.createElement("canvas");cv.width=W;cv.height=H;var c=cv.getContext("2d");
    var g=c.createLinearGradient(0,0,W*0.5,H); g.addColorStop(0,"#fbeecb");g.addColorStop(.4,"#e2c98a");g.addColorStop(.72,"#c9a24f");g.addColorStop(1,"#9c7a34");
    c.fillStyle=g;c.fillRect(0,0,W,H);
    c.strokeStyle="rgba(120,90,30,.5)";c.lineWidth=5;
    c.strokeRect(W*.30,H*.24,W*.40,H*.52);
    c.beginPath();c.moveTo(W*.30,H*.5);c.lineTo(W*.70,H*.5);
    c.moveTo(W*.5,H*.24);c.lineTo(W*.5,H*.76);c.stroke();
    var t=new THREE.CanvasTexture(cv);t.anisotropy=8;if("colorSpace" in t)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
  }
  var CHIP_GEO=(function(){var gg=new THREE.ExtrudeGeometry(shape(0.168,0.132,0.028),
      {depth:0.014,bevelEnabled:true,bevelThickness:0.005,bevelSize:0.005,bevelSegments:3,curveSegments:10});
    gg.center();gg.computeBoundingBox();var bb=gg.boundingBox,sx=bb.max.x-bb.min.x,sy=bb.max.y-bb.min.y,uv=gg.attributes.uv,pos=gg.attributes.position;
    for(var i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)-bb.min.x)/sx,(pos.getY(i)-bb.min.y)/sy);uv.needsUpdate=true;return gg;})();
  var CHIP_MAT=new THREE.MeshPhysicalMaterial({map:makeChipTexture(),color:0xe8c063,emissive:0x5c4415,emissiveIntensity:0.34,metalness:0.78,roughness:0.28,clearcoat:0.45,clearcoatRoughness:0.2,envMapIntensity:0.8});
  var CHIP_SIDE=new THREE.MeshPhysicalMaterial({color:0x8a6a2c,emissive:0x241a08,emissiveIntensity:0.14,metalness:0.9,roughness:0.32});

  // Ombre de contact : blob sombre (visible sur ivoire) + blob clair additif (visible sur navy).
  function makeLightBlob(){
    var S=256,cv=document.createElement("canvas");cv.width=cv.height=S;var c=cv.getContext("2d");
    var g=c.createRadialGradient(S/2,S/2,4,S/2,S/2,S/2);
    g.addColorStop(0,"rgba(150,175,255,.5)");g.addColorStop(.5,"rgba(120,150,255,.16)");g.addColorStop(1,"rgba(120,150,255,0)");
    c.fillStyle=g;c.fillRect(0,0,S,S);var t=new THREE.CanvasTexture(cv);t.needsUpdate=true;return t;
  }
  var LIGHTBLOB_TEX=makeLightBlob();

  // Cartes
  var geo=makeGeometry();
  function buildSceneCard(cd,idx){
    var th = CARD_THEME[cd.theme] || CARD_THEME.navy;
    // Variation subtile de matériaux : chaque carte n'a pas exactement le même traitement.
    var rough = cd.frozen ? 0.5 : (th.rough + idx*0.02);    // corps : la virtuelle gelée plus mate
    var metal = cd.frozen ? 0.25 : (th.metal - idx*0.02);   // corps "carte métal"
    // Double système optique : corps métallique + couche de vernis (clearcoat) -> double reflet.
    var faceMat=new THREE.MeshPhysicalMaterial({map:makeVtexCardTexture(cd),roughness:rough,metalness:metal,
      clearcoat:cd.frozen?0.5:0.85, clearcoatRoughness:cd.frozen?0.35:0.18, envMapIntensity:cd.frozen?0.4:0.7});
    faceMat.transparent=true;
    var sideMat=new THREE.MeshPhysicalMaterial({color:th.side,emissive:th.sideEm,emissiveIntensity:0.3,roughness:0.3,metalness:0.72,clearcoat:0.75,clearcoatRoughness:0.26,envMapIntensity:1.0});
    var mesh=new THREE.Mesh(geo,[faceMat,sideMat]);
    var grp=new THREE.Group(); grp.add(mesh); scene.add(grp);
    // puce 3D, enfant du groupe carte -> suit l'inclinaison et scintille à la rotation
    var chip=new THREE.Mesh(CHIP_GEO,[CHIP_MAT,CHIP_SIDE]);
    chip.position.set(-0.611,-0.062,0.066); grp.add(chip);
    var bmat=new THREE.MeshBasicMaterial({map:BLOB_TEX,transparent:true,depthWrite:false,opacity:0.28});
    var blob=new THREE.Mesh(new THREE.PlaneGeometry(3.1,2.15), bmat);
    blob.rotation.x=-Math.PI/2; scene.add(blob);
    var lbmat=new THREE.MeshBasicMaterial({map:LIGHTBLOB_TEX,transparent:true,depthWrite:false,opacity:0.5,blending:THREE.AdditiveBlending});
    var lblob=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.7), lbmat);
    lblob.rotation.x=-Math.PI/2; scene.add(lblob);
    return {grp:grp,mesh:mesh,face:faceMat,blob:blob,bmat:bmat,lblob:lblob,lbmat:lbmat};
  }
  var cards=CARDS.map(buildSceneCard);

  /* ------------------------------- Carrousel ---------------------------------- */
  var LEAN=-0.85, GAP=1.55, BASE_Y=1.6, GROUND_Y=1.06;
  var scroll=0, target=0, vel=0, dragging=false, tSec=0;
  function clampIdx(i){ return Math.max(0,Math.min(cards.length-1,i)); }

  function layout(t){
    for(var i=0;i<cards.length;i++){
      var p=i-scroll, ap=Math.min(2.4,Math.abs(p)), cl=Math.max(-2,Math.min(2,p));
      // Lévitation : flottement doux et continu, phase propre à chaque carte.
      var fY = reduce ? 0 : Math.sin(t*0.9 + i*1.7)*0.022;
      var fRz= reduce ? 0 : Math.sin(t*0.6 + i*2.1)*0.010;
      var fRx= reduce ? 0 : Math.cos(t*0.7 + i*1.3)*0.008;
      var g=cards[i].grp;
      // easing coverflow : courbe en S sur la position latérale (cartes qui "rentrent" visuellement)
      var easedP = p * (1 + Math.abs(p)*0.08);
      g.position.x = easedP*GAP;
      // z : carte active avance franchement vers l'objectif
      g.position.z = ap===0 ? 0.18 : -ap*1.1;
      g.position.y = BASE_Y + ap*0.04 + fY;
      g.rotation.x = LEAN + fRx;
      // rotation coverflow plus prononcée + amortie sur la carte en cours de swipe
      g.rotation.y = cl*-0.52;
      g.rotation.z = fRz;
      // scale : la carte active est vraiment plus grande
      g.scale.setScalar(1 - ap*0.10);
      cards[i].face.opacity = 1 - Math.min(1, ap*0.50);
      cards[i].mesh.visible = ap<2.35;
      // Ombre de contact : plus diffuse, plus basse, plus large -> lévitation.
      var b=cards[i].blob;
      b.position.set(p*GAP, GROUND_Y+0.002, -ap*1.2);
      b.scale.setScalar((1 - ap*0.09) * (1 + fY*0.5));
      cards[i].bmat.opacity = Math.max(0, 0.28 - ap*0.09);
      b.visible = ap<2.35;
      var lb=cards[i].lblob; lb.position.set(p*GAP, GROUND_Y-0.001, -ap*1.2);
      lb.scale.setScalar((1 - ap*0.09)); cards[i].lbmat.opacity = Math.max(0, 0.5 - ap*0.2); lb.visible = ap<2.35;
    }
  }

  /* --------------------------- Cadrage responsive ----------------------------- */
  function frameToWidth(){
    var W=canvas.clientWidth||360, H=canvas.clientHeight||300;
    camera.aspect=W/H;
    var vfov=camera.fov*Math.PI/180;
    var hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect);
    var dist=(CARD_W/0.94/2)/Math.tan(hfov/2);
    dist=Math.max(3.6,Math.min(12,dist));
    camera.position.set(0,1.35,dist);
    camera.lookAt(0,LOOK_Y,0);
    camera.updateProjectionMatrix();
  }

  /* ---------------------------- UI synchronisée ------------------------------- */
  var elSub=document.getElementById("vtx-hero-sub");
  var elAmt=document.getElementById("vtx-hero-amt");
  var elPillNm=document.getElementById("vtx-pill-nm");
  var dotsWrap=document.getElementById("vtx3d-dots");
  var lastIdx=-1;
  function renderDots(){
    if(!dotsWrap) return;
    dotsWrap.innerHTML=CARDS.map(function(_,i){return '<button type="button" class="vtx3d-dot'+(i===0?' on':'')+'" data-i="'+i+'" aria-label="Afficher la carte '+(i+1)+'" aria-pressed="'+(i===0?'true':'false')+'"></button>';}).join("");
    dotsWrap.querySelectorAll(".vtx3d-dot").forEach(function(d){ d.addEventListener("click",function(){ var i=+d.dataset.i; go(i); if(typeof window.goToCard==="function") window.goToCard(i); }); });
  }
  renderDots();
  function captionFor(cd){ return (cd.frozen?"Carte gelée":"Solde disponible")+" \u00b7 "+(cd.label||""); }
  function syncUI(idx){
    if(idx===lastIdx) return; lastIdx=idx;
    var cd=CARDS[idx]; if(!cd) return;
    // Fondu enchaîné doux via transition CSS d'opacité (aucun reflow forcé, aucun setTimeout).
    if(elSub){ elSub.style.opacity="0"; requestAnimationFrame(function(){ elSub.textContent=captionFor(cd); elSub.style.opacity="1"; }); }
    if(elAmt){ elAmt.style.opacity="0"; requestAnimationFrame(function(){ elAmt.textContent=eurStr(cd.balance); elAmt.style.opacity="1"; }); }
    if(elPillNm){ elPillNm.textContent=cd.label; }
    if(dotsWrap) dotsWrap.querySelectorAll(".vtx3d-dot").forEach(function(d,i){ d.classList.toggle("on",i===idx); d.setAttribute("aria-pressed", i===idx ? "true" : "false"); });
    if(navigator.vibrate) navigator.vibrate(6);
  }

  /* ------------------------------- Interaction -------------------------------- */
  function go(i){
    target=clampIdx(i);
    // Les commandes discrètes (clavier, boutons, points) publient leur état
    // immédiatement. Le ressort continue d’animer le canvas, mais les libellés
    // et états ARIA ne dépendent plus d’une frame WebGL disponible.
    if(!dragging) syncUI(target);
  }
  var hit=document.getElementById("vtx3d-hit");
  /* Les flèches précédente/suivante sont désormais des SVG inline statiques
     dans le HTML (LEGDAY §9.1 — zéro icône de police). Le JS n'a plus besoin
     de basculer une classe RemixIcon selon le breakpoint : .card-stage-controls
     reste caché en CSS sous 1024px, les SVG sont toujours présents dans le DOM. */
  if(motionQuery.addEventListener){ motionQuery.addEventListener("change",function(event){ reduce=event.matches; if(reduce){ scroll=target; vel=0; } }); }
  function stepPx(){ return ((hit&&hit.clientWidth)||360)*0.52; }
  var startX=0,startY=0,startScroll=0,lastMoveT=0,lastMoveScroll=0,moved=false;
  var intentDecided=false,intentHoriz=false; // détection d'intention : horizontal=carrousel, vertical=scroll page
  // Hint CTA : disparaît au premier swipe ou tap sur une autre carte
  var _hint=document.getElementById("vtx-swipe-hint"), _hintGone=false;
  function dismissHint(){ if(_hintGone||!_hint)return; _hintGone=true; _hint.classList.add("gone");
    setTimeout(function(){ if(_hint)_hint.style.display="none"; }, 700); }
  if(hit){
    hit.tabIndex=0; hit.setAttribute("role","region"); hit.setAttribute("aria-label","Carrousel de cartes. Utilisez les flèches gauche et droite pour changer de carte.");
    hit.addEventListener("pointerdown",function(e){
      dragging=true; moved=false; intentDecided=false; intentHoriz=false;
      startX=e.clientX; startY=e.clientY; startScroll=scroll;
      lastMoveT=performance.now(); lastMoveScroll=scroll; vel=0;
      try{ hit.setPointerCapture(e.pointerId); }catch(_){}
    });
    window.addEventListener("pointermove",function(e){ if(!dragging)return;
      var evts=(e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      var ev=evts[evts.length-1];
      var dx=ev.clientX-startX, dy=ev.clientY-startY;
      // Décider l'intention une seule fois (>4px dans une direction)
      if(!intentDecided && (Math.abs(dx)>4 || Math.abs(dy)>4)){
        intentDecided=true;
        intentHoriz=Math.abs(dx)>Math.abs(dy)*0.8; // 0.8 -> bias léger vers horiz
      }
      // Scroll vertical -> on abandonne le drag, la page scrolle normalement
      if(intentDecided && !intentHoriz){ dragging=false; vel=0; scroll=target; return; }
      // Pas encore décidé ou horizontal -> carrousel prend la main
      if(Math.abs(dx)>2){ moved=true; dismissHint(); }
      var n=cards.length-1, p=startScroll - dx/stepPx();
      if(p<0){ var ov=-p; p=-Math.pow(ov,0.68)*0.55; }
      else if(p>n){ var ov2=p-n; p=n+Math.pow(ov2,0.68)*0.55; }
      var now=performance.now(), dtS=Math.max(0.001,(now-lastMoveT)/1000);
      var inst=(p-lastMoveScroll)/dtS;
      vel = vel*0.60 + inst*0.40;
      scroll=p; lastMoveT=now; lastMoveScroll=p;
    },{passive:true});
    var release=function(e){ if(!dragging)return; dragging=false;
      // --- TAP (pas de drag) : clic sur une carte inactive -> y aller directement ---
      if(!moved && e){
        var hitRect=hit.getBoundingClientRect();
        var tapX=e.clientX - hitRect.left - hitRect.width/2; // centré sur le canvas
        var step=stepPx();
        // trouver la carte dont la position projetée est la plus proche du tap
        var best=-1, bestDist=Infinity;
        for(var ci=0;ci<cards.length;ci++){
          var cardScreenX=(ci - scroll)*step;
          var dist=Math.abs(tapX - cardScreenX);
          if(dist<bestDist){ bestDist=dist; best=ci; }
        }
        // si la carte trouvée n'est pas la carte courante -> basculer
        var current=clampIdx(Math.round(scroll));
        if(best>=0 && best!==current){
          dismissHint(); var idx=clampIdx(best); target=idx; vel=0;
          setTimeout(function(){ try{ if(typeof window.goToCard==="function") window.goToCard(idx); }catch(_){} }, 80);
          return;
        }
        // tap sur la carte active : ne rien faire
        scroll=target; vel=0; return;
      }
      // Inertie flick : coeff augmenté + borne dynamique (max ±2 cartes par flick)
      var cur=clampIdx(Math.round(scroll));
      var proj=scroll + vel*0.22;
      var idx=clampIdx(Math.max(cur-2,Math.min(cur+2,Math.round(proj))));
      go(idx); vel*=0.3;                                      // garder un peu de vélocité pour le ressort
      // Haptique : feedback différencié selon le changement
      var changed=(idx!==cur);
      if(navigator.vibrate) navigator.vibrate(changed ? [8] : [3]);
      setTimeout(function(){ try{ if(typeof window.goToCard==="function") window.goToCard(idx); }catch(_){} }, 60);
    };
    window.addEventListener("pointerup",release);
    window.addEventListener("pointercancel",release);
    hit.addEventListener("keydown",function(e){
      var next=Math.round(target);
      if(e.key==="ArrowRight") next+=1;
      else if(e.key==="ArrowLeft") next-=1;
      else if(e.key==="Home") next=0;
      else if(e.key==="End") next=cards.length-1;
      else return;
      e.preventDefault(); dismissHint(); next=clampIdx(next); go(next); if(window.goToCard)window.goToCard(next);
    });
  }

  /* --------------------- Boucle : physique à PAS DE TEMPS FIXE ----------------
     Intégration déterministe (sub-stepping 240 Hz) découplée du framerate :
     lisse à 60 comme à 120 Hz, et insensible aux frames sautées -> zéro saccade. */
  var homeEl=document.getElementById("view-accueil");
  function homeActive(){ return homeEl && homeEl.classList.contains("active"); }
  function resize(){
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    frameToWidth();
  }
  window.addEventListener("resize",resize);
  var raf=null, lastT=performance.now(), acc=0;
  // Ressort proche du critique : la carte atteint sa cible sans rebond sec,
  // y compris après un flick de souris ou une commande clavier répétée.
  var FIXED=1/360, STIFF=178, DAMP=28;
  function integrate(dt){
    acc+=dt; var n=0;
    while(acc>=FIXED && n<20){
      if(!dragging){ var a=STIFF*(target-scroll) - DAMP*vel; vel+=a*FIXED; scroll+=vel*FIXED; }
      acc-=FIXED; n++;
    }
    if(acc>FIXED*3) acc=0;                                    // anti-spirale après une pause
    if(!dragging && Math.abs(target-scroll)<0.0002 && Math.abs(vel)<0.0003){ scroll=target; vel=0; }
  }
  function tick(now){
    var dt=Math.min(0.033,(now-lastT)/1000); lastT=now; tSec+=dt;
    if(reduce){ scroll=target; vel=0; } else integrate(dt);
    layout(tSec);
    if(host) host.classList.toggle("is-transitioning", !reduce && (dragging || Math.abs(target-scroll)>0.002 || Math.abs(vel)>0.008));
    if(homeActive()){ renderer.render(scene,camera); syncUI(clampIdx(Math.round(scroll))); }
    raf=requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange",function(){
    if(document.hidden){ if(raf){cancelAnimationFrame(raf);raf=null;} }
    else if(!raf){ lastT=performance.now(); acc=0; raf=requestAnimationFrame(tick); } });

  /* ------------------------- Synchro avec l'app VTEX -------------------------- */
  // enrobe goToCard : dots app + écran Cartes restent synchronisés
  var _goto=window.goToCard;
  window.vtexRefreshCardFaces=function(){ try{ for(var i=0;i<cards.length;i++){ if(cards[i]&&cards[i].face){ var old=cards[i].face.map; cards[i].face.map=makeVtexCardTexture(CARDS[i]); cards[i].face.needsUpdate=true; if(old&&old.dispose)old.dispose(); } }
    // La légende (solde de la carte active) suit aussi la devise affichée (€ ou ₣) sans attendre un changement de carte.
    var cur=CARDS[clampIdx(Math.round(target))]; if(cur){ if(elAmt) elAmt.textContent=eurStr(cur.balance); if(elSub) elSub.textContent=captionFor(cur); } }catch(e){} };
  window.goToCard=function(i){ var max=(typeof CARDS!=="undefined"?CARDS.length:1)-1; i=Math.max(0,Math.min(max,i));
    if(typeof _goto==="function") _goto(i);
    go(typeof activeCardIndex!=="undefined"?activeCardIndex:i);
  };
  // relayout en revenant à l'accueil
  var _show=window.showView;
  window.showView=function(name){ if(typeof _show==="function") _show(name);
    if(name==="accueil") requestAnimationFrame(function(){ resize(); }); };

  // API
  function refreshCards(){
    cards.forEach(function(item){
      scene.remove(item.grp); scene.remove(item.blob); scene.remove(item.lblob);
      if(item.face.map) item.face.map.dispose(); item.mesh.geometry.dispose();
  });
    cards=CARDS.map(buildSceneCard);
    target=scroll=clampIdx(typeof activeCardIndex!=="undefined" ? activeCardIndex : 0); vel=0; lastIdx=-1;
    renderDots(); resize(); layout(tSec); syncUI(target);
  }
  function select(i){ i=clampIdx(i); go(i); if(window.goToCard)window.goToCard(i); }
  window.vtx3d={ setActive:function(i){ go(i); }, previous:function(){ select(Math.round(target)-1); }, next:function(){ select(Math.round(target)+1); }, refresh:resize, refreshCards:refreshCards };

  resize(); layout(0);
  raf=requestAnimationFrame(tick);
})();
