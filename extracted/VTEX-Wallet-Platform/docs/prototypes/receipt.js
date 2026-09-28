/* Recharge par carte du Wallet Pro — page « reçu » plein cadre (même parcours que apps/business/src/app/topup/page.tsx),
 * branchée sur le moteur de démonstration VtexCore. */
(function (global) {
  "use strict";
  var C = global.VtexCore;

  var P = {
    back: '<path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    bolt: '<path d="M13.2 2.5 5 13.5h5.6l-.8 8 8.2-11h-5.6z" fill="currentColor"/>',
    check: '<path d="m5.5 12.5 4.3 4.3L18.5 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="3.2" fill="currentColor"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    shield: '<path d="M12 3.2 5 6v5.6c0 4.1 2.8 7.4 7 9.2 4.2-1.8 7-5.1 7-9.2V6z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="m9 12 2.2 2.2 3.9-4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
    card: '<rect x="3.2" y="5.8" width="17.6" height="12.4" rx="3.4" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M3.6 10.4h16.8" stroke="currentColor" stroke-width="2.3"/>',
    wallet: '<rect x="3.2" y="6.4" width="17.6" height="12.8" rx="3.4" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M15.6 12.8h2.4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    inn: '<path d="M17 7 7 17M7 9v8h8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    out: '<path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    arrow: '<path d="M6 12h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    alert: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M12 7.6v5.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="currentColor"/>',
    tag: '<path d="M4.5 4.5h7.6l7.4 7.4-7.6 7.6-7.4-7.4z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><circle cx="8.8" cy="8.8" r="1.4" fill="currentColor"/>',
    hash: '<path d="M9.5 4 7.5 20M16.5 4l-2 16M4 9h16M3.5 15h16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M12 7v5.4l3.4 2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
    bank: '<path d="M3.5 9.5 12 4l8.5 5.5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 11v7M12 11v7M18 11v7M4 20h16" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
    cut: '<circle cx="6.5" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="6.5" cy="17" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m8.6 8.6 11 8.4M8.6 15.4l11-8.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  };
  function icon(name, size) { return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' + P[name] + "</svg>"; }
  function coins(n, size) {
    var d = ""; for (var i = 0; i < n; i++) d += '<ellipse cx="12" cy="' + (19 - i * 4.6) + '" rx="7.6" ry="3.1" fill="currentColor" stroke="#000" stroke-opacity=".18" stroke-width="1"/>';
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' + d + "</svg>";
  }
  function dashes() { return '<div class="dash" aria-hidden="true">' + new Array(80).join("- ") + "</div>"; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function barcode(reference) {
    var x = 0, bars = "";
    for (var i = 0; i < 52; i++) {
      var w = 1 + ((reference.charCodeAt(i % reference.length) * 7 + i * 13) % 4);
      if (i % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + w + '" height="44" fill="#0a0d1e"/>';
      x += w + (i % 2 === 0 ? 0 : 1.5);
    }
    return '<div class="barcode"><svg viewBox="0 0 ' + Math.ceil(x) + ' 44" preserveAspectRatio="none" role="img" aria-label="Code-barres de la référence">' + bars + "</svg><span>" + esc(reference) + "</span></div>";
  }
  function stamp(kind, text) {
    return '<svg class="stamp ' + kind + '" viewBox="0 0 160 64" width="136" aria-hidden="true"><rect x="3" y="3" width="154" height="58" rx="14" fill="none" stroke="currentColor" stroke-width="4"/><text x="80" y="43" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="28" letter-spacing="3" fill="currentColor">' + text + "</text></svg>";
  }
  var divisor = C.divisor, fmt = C.fmt;
  function numOnly(cents, cur) { var d = cur === "XPF" ? 0 : 2; return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(cents / divisor(cur)); }
  var SYMBOL = { EUR: "€", USD: "$", XPF: "₣" };
  /* Préréglages : le plafond par recharge du Wallet Pro (5 000 €) en dernier ; équivalents ronds en francs Pacifique (596 000 ₣ < 596 658 ₣). */
  var PRESETS = { EUR: [10000, 25000, 100000, 500000], XPF: [12000, 30000, 120000, 596000], USD: [10000, 25000, 100000, 500000] };
  /* Montant d'un compte / d'une opération présenté dans la devise de paiement choisie, à la parité fixe. */
  function inCur(cents, from, to) { return C.canConvert(from, to) ? C.convert(Math.round(cents), from, to) : Math.round(cents); }
  var BRANDS = { visa: "Visa", mastercard: "Mastercard", amex: "Amex" };
  function brandLabel(b) { return b ? (BRANDS[String(b).toLowerCase()] || b) : "Carte"; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function clock() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function relative(v) {
    var m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if (m < 1) return "à l’instant"; if (m < 60) return "il y a " + m + " min";
    var h = Math.round(m / 60); if (h < 24) return "il y a " + h + " h";
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(v));
  }
  function uuid() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }); }
  var sleep = C.wait;
  var STEPS = [
    { title: "Paiement initialisé", text: "La recharge est enregistrée et sécurisée.", icon: "card" },
    { title: "Validation par ta banque", text: "Ta banque peut afficher une fenêtre de confirmation (3D Secure).", icon: "bank" },
    { title: "Paiement confirmé par Stripe", text: "Les fonds sont sécurisés sur le compte de VTEX.", icon: "shield" },
    { title: "Wallet crédité", text: "Ton solde et ton activité se mettent à jour.", icon: "wallet" }
  ];

  /** options : { ownerKey, kicker, titleLines[2], lede, who, detail, actor, defaultName, badge, onBack, onHistory, onChange, preselect:{accountId,cardId} } */
  function mount(root, options) {
    var O = options || {};
    var S = { cfg: null, accounts: [], cards: [], txs: [], acctId: null, amount: 0, custom: "", name: O.defaultName || "", view: "input", stage: 0, stamps: [], reference: null, settled: null, paidAt: "", failure: null, bank: false, formError: null, busy: false, idem: null, shownBalance: null, simNum: "4000 0027 6000 3184", simExp: "12 / 28", simCvc: "123", cardId: null };
    var countTimer = 0;

    function acct() { return S.accounts.filter(function (a) { return a.id === S.acctId; })[0] || null; }
    function accCur() { var a = acct(); return a ? a.currency : "EUR"; }
    function payable() { var a = acct(); return a ? (a.payableCurrencies || [a.currency]) : ["EUR"]; }
    /* Devise de paiement : la devise d'affichage si le compte l'accepte (EUR ↔ XPF converti à la parité fixe au crédit), sinon celle du compte. */
    function cur() { var d = O.getDisplay ? O.getDisplay() : "EUR"; return payable().indexOf(d) >= 0 ? d : accCur(); }
    function other() { return cur() === "XPF" ? "EUR" : "XPF"; }
    function lim() { var by = S.cfg && S.cfg.limitsByCurrency; var l = by && by[cur()]; if (l) return l; var b = C.limits(cur(), "business"); return Object.assign({}, b, { dailyRemainingCents: b.dailyMaxCents, effectiveMaxCents: b.maxCents }); }
    /* Plafond effectif : 5 000 € par recharge (Wallet Pro), dans la limite de ce qui reste des 5 000 € par 24 h. */
    function eff() { return lim().effectiveMaxCents; }
    function valid() { return S.amount > 0 && S.amount >= lim().minCents && S.amount <= eff(); }
    function presets() { return PRESETS[cur()] || PRESETS.EUR; }
    function defaultAmount() { var p = presets(), max = eff(), min = lim().minCents; if (!max || p[1] <= max) return p[1]; var fit = p.filter(function (x) { return x <= max; }); return fit.length ? fit[fit.length - 1] : Math.max(min, max); }
    function balNow() { var a = acct(); return a ? inCur(a.availableBalanceCents, a.currency, cur()) : 0; }
    function balAfter() { return balNow() + (valid() ? S.amount : 0); }
    function ctaLabel() { return S.busy ? "Paiement en cours…" : valid() ? "Recharger " + fmt(S.amount, cur()) : "Choisis un montant"; }

    function load() {
      return Promise.all([C.config("business", { ownerKey: O.ownerKey }), C.transactions(O.ownerKey, 6)]).then(function (r) {
        S.cfg = r[0]; S.accounts = r[0].accounts; S.cards = r[0].cards; S.txs = r[1];
        if (S.acctId == null || !acct()) S.acctId = S.accounts[0] ? S.accounts[0].id : null;
      });
    }
    function reload() { return Promise.all([C.config("business", { ownerKey: O.ownerKey }), C.transactions(O.ownerKey, 6)]).then(function (r) { S.cfg = r[0]; S.accounts = r[0].accounts; S.cards = r[0].cards; S.txs = r[1]; }); }

    function hint() {
      var l = lim(), c = cur(), o = other(), by = S.cfg && S.cfg.limitsByCurrency, lo = by && by[o];
      /* Équivalent dans l'autre devise : le plafond arrondi vers le bas par le serveur (jamais 596 659 ₣ pour 5 000 €) ; le dollar n'a pas d'équivalent. */
      var eq = c === "USD" ? "" : " (≈ " + fmt(lo ? lo.maxCents : inCur(l.maxCents, c, o), o) + ")";
      if (S.amount > 0 && S.amount < l.minCents) return '<p class="hint err" data-b="hint">Montant minimum : ' + fmt(l.minCents, c) + ".</p>";
      if (S.amount > eff()) return '<p class="hint err" data-b="hint">' + (eff() < l.maxCents ? (eff() <= 0 ? "Plafond quotidien atteint : " + fmt(l.dailyMaxCents, c) + " de recharges par 24 h pour cette entreprise." : "Plafond quotidien : il reste " + fmt(eff(), c) + " à recharger sur 24 h pour cette entreprise.") : "Montant maximum par recharge : " + fmt(l.maxCents, c) + eq + ".") + "</p>";
      if (S.custom !== "" && S.amount <= 0) return '<p class="hint err" data-b="hint">Saisis un montant valide.</p>';
      return '<p class="hint" data-b="hint">Entre ' + fmt(l.minCents, c) + " et " + fmt(l.maxCents, c) + eq + " par recharge · " + fmt(l.dailyMaxCents, c) + " max par 24 h.</p>";
    }
    function quotaLine() {
      return '<p class="hint" data-b="quota">Il te reste <b>' + fmt(lim().dailyRemainingCents, cur()) + "</b> de plafond sur 24 h, tous comptes de l’entreprise confondus.</p>";
    }
    function ccyBlock() {
      var opts = ["EUR", "XPF"].filter(function (x) { return payable().indexOf(x) >= 0; });
      if (opts.length < 2) return "";
      return '<div class="ccy" role="radiogroup" aria-label="Devise du paiement">' + opts.map(function (x) { return '<button type="button" role="radio" aria-checked="' + (cur() === x) + '" data-act="ccy" data-ccy="' + x + '"><b>' + SYMBOL[x] + "</b> " + (x === "XPF" ? "Franc Pacifique" : "Euro") + "</button>"; }).join("") + "</div>" +
        (cur() === "XPF" && accCur() !== "XPF" ? '<p class="hint" data-parity>Parité fixe : 1 € = 119,3317 ₣. Le compte reste en euros : le montant est converti au crédit.</p>' : "");
    }
    function accountBlock() {
      var rows = S.accounts.map(function (a, i) {
        var linked = S.cards.filter(function (c) { return c.businessWalletAccountId === a.id; });
        var chips = linked.length ? '<span class="chips">' + linked.map(function (c) { return '<span class="' + (S.cardId === c.id ? "on" : "") + '">Carte •••• ' + esc(c.lastFour) + "</span>"; }).join("") + "</span>" : "";
        return '<button type="button" class="acct ' + ["blue", "teal", "brick"][i % 3] + '" role="radio" aria-checked="' + (S.acctId === a.id) + '" data-act="acct" data-id="' + a.id + '"><span class="socle md">' + icon("wallet", 22) + '</span><span class="acct-body"><span class="acct-name">' + esc(a.label) + '</span><span class="acct-sub">Solde ' + (function () { var d = O.getDisplay ? O.getDisplay() : "EUR", to = (a.payableCurrencies || [a.currency]).indexOf(d) >= 0 ? d : a.currency; return fmt(inCur(a.availableBalanceCents, a.currency, to), to); })() + "</span>" + chips + '</span><span class="radio">' + icon("check", 16) + "</span></button>";
      }).join("");
      return '<div class="blk"><h2 class="blk-t">Compte ou carte à charger</h2><div class="acct-list" role="radiogroup" aria-label="Compte ou carte à charger">' + rows + '</div><p class="hint">Les cartes d’un compte se rechargent en créditant ce compte. Réservé aux rôles Owner, Admin et Finance.</p></div>';
    }
    function cardBlock() {
      return '<div class="blk"><h2 class="blk-t">Carte de l’entreprise</h2>' +
        '<p class="notice"><b>Simulation.</b> Aucune vraie carte, aucun débit : ce prototype n’appelle jamais Stripe. Essaie <b>4242 4242 4242 4242</b> (direct), <b>4000 0027 6000 3184</b> (3D Secure), <b>4000 0000 0000 0002</b> (refus) ou <b>4000 0000 0000 9995</b> (fonds insuffisants).</p>' +
        '<label class="field"><span>Numéro de carte</span><span class="inwrap"><input class="inp mono" id="tp-sim-num" data-in="simNum" inputmode="numeric" autocomplete="off" value="' + esc(S.simNum) + '" placeholder="1234 1234 1234 1234"></span></label>' +
        '<div class="two"><label class="field"><span>Expiration</span><input class="inp mono" id="tp-sim-exp" data-in="simExp" inputmode="numeric" autocomplete="off" value="' + esc(S.simExp) + '" placeholder="MM / AA"></label>' +
        '<label class="field"><span>Code CVC</span><input class="inp mono" id="tp-sim-cvc" data-in="simCvc" inputmode="numeric" autocomplete="off" value="' + esc(S.simCvc) + '" placeholder="•••"></label></div>' +
        '<label class="field"><span>Raison sociale sur le reçu</span><input class="inp" id="tp-name" data-in="name" autocomplete="organization" value="' + esc(S.name) + '"></label>' +
        '<p class="secure">' + icon("shield", 20) + "<span>Paiement chiffré par Stripe. VTEX ne voit ni ne stocke le numéro de carte.</span></p></div>";
    }
    function inputView() {
      var c = cur(), t = O.titleLines || ["Recharger", "le wallet Pro."];
      var out = '<div class="blk" style="gap:12px"><p class="kicker">' + esc(O.kicker || "Wallet Pro") + '</p><h1 class="title">' + t[0] + "<br>" + t[1] + '</h1><p class="lede">' + esc(O.lede || "Ajoute des fonds avec la carte bancaire de l’entreprise. Ils sont disponibles dès la confirmation de la banque.") + "</p></div>";
      out += accountBlock();
      var tiles = presets().map(function (p, i) {
        return '<button type="button" class="tile" role="radio" aria-checked="' + (S.custom === "" && S.amount === p) + '" data-act="preset" data-amt="' + p + '"' + (p > eff() || p < lim().minCents ? " disabled" : "") + '><span class="socle t52">' + coins(i + 1, 26) + '</span><span class="tile-val">' + fmt(p, c).replace(/[,.]00(?=\D*$)/, "") + "</span>" + (i === 1 ? '<span class="tile-badge">Populaire</span>' : "") + "</button>";
      }).join("");
      out += '<div class="blk"><h2 class="blk-t">Montant</h2>' + ccyBlock() + '<p class="big num"><span data-b="big">' + numOnly(S.amount, c) + "</span><small>" + (SYMBOL[c] || c) + "</small></p>" +
        '<div class="tiles" role="radiogroup" aria-label="Montant de la recharge">' + tiles + "</div>" +
        '<label class="field"><span>Autre montant</span><span class="inwrap"><input class="inp amount-input" id="tp-custom" data-in="custom" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(S.custom) + '"><span class="suffix">' + (SYMBOL[c] || c) + "</span></span></label>" + hint() + quotaLine() + "</div>";
      var a = acct();
      out += cardBlock() + dashes() +
        '<div class="lines"><div class="ln"><span class="l">Recharge par carte</span><span class="d"></span><span class="v" data-b="lnAmt">' + fmt(Math.max(S.amount, 0), c) + "</span></div>" +
        '<div class="ln"><span class="l">Frais de recharge</span><span class="d"></span><span class="v free">Offerts</span></div>' +
        '<div class="ln"><span class="l">Crédité sur</span><span class="d"></span><span class="v">' + esc(a ? a.label : "—") + "</span></div>" +
        '<div class="ln"><span class="l">Solde après recharge</span><span class="d"></span><span class="v" data-b="lnAfter">' + fmt(balAfter(), c) + '</span></div><div class="ln"><span class="l">Plafond restant (24 h)</span><span class="d"></span><span class="v" data-b="lnQuota">' + fmt(Math.max(0, lim().dailyRemainingCents - (valid() ? S.amount : 0)), c) + "</span></div></div>" + dashes() +
        '<div class="tot"><p class="kicker">À débiter sur la carte</p><b data-b="tot">' + fmt(Math.max(S.amount, 0), c) + "</b></div>" +
        '<div class="blk" style="gap:12px"><div data-b="err">' + (S.formError ? '<p class="hint err" role="alert">' + esc(S.formError) + "</p>" : "") + "</div>" +
        '<button type="button" class="cta" data-act="pay"' + (!valid() || S.busy ? " disabled" : "") + '><span data-b="cta">' + ctaLabel() + '</span><span class="past">' + icon("lock", 18) + "</span></button>" +
        '<p class="legal">En rechargeant, tu autorises VTEX à débiter la carte. Le reçu est conservé dans tes transactions.</p></div>';
      return out;
    }
    function procView() {
      var feed = STEPS.map(function (s, i) {
        var state = i < S.stage ? "done" : i === S.stage ? "now" : "";
        return '<div class="fl ' + state + '" role="listitem"><span class="socle md' + (state === "now" && !S.bank ? " pulse" : "") + '">' + icon(i < S.stage ? "check" : s.icon, 20) + '</span><div class="fl-b"><div class="fl-t"><span>' + s.title + "</span>" + (state && S.stamps[i] ? "<i>" + S.stamps[i] + "</i>" : "") + "</div>" +
          (state ? '<div class="fl-s">' + s.text + "</div>" : "") +
          (i === 1 && S.bank ? '<div class="slip"><p><b>Ta banque te demande de confirmer.</b> Valide le paiement dans son application ou saisis le code reçu par SMS.</p><div class="codes" aria-hidden="true"><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i></div><p style="font-size:12px;color:var(--ink3)">Fenêtre gérée par la banque — VTEX n’y a pas accès.</p><button type="button" class="mini" data-act="bank"' + (S.busy ? " disabled" : "") + ">Confirmer avec ma banque</button></div>" : "") + "</div></div>";
      }).join("");
      var c = cur();
      return '<div class="blk" style="gap:12px"><p class="kicker">Impression du reçu</p><h1 class="title">Recharge<br>en cours…</h1><p class="big num" style="font-size:44px">' + numOnly(S.amount, c) + "<small>" + (SYMBOL[c] || c) + "</small></p><p class=\"lede\">Ne ferme pas cette page : chaque étape est horodatée sur ton reçu.</p></div>" +
        '<div class="feedbar" aria-hidden="true"><i style="width:' + ((S.stage + 1) / 4) * 100 + '%"></i></div><div class="feed" role="list">' + feed + "</div>" +
        (S.formError ? '<p class="notice">' + esc(S.formError) + "</p>" : "") + (S.formError && S.reference ? '<button type="button" class="ghost" data-act="retry">Vérifier maintenant</button>' : "");
    }
    function okView() {
      var st = S.settled, a = acct();
      var rows = [["f", "Montant rechargé", "bolt", fmt(st.amountCents, st.currency), false], ["b", "Frais de recharge", "tag", fmt(0, st.currency), false], ["r", "Moyen de paiement", "card", brandLabel(st.cardBrand) + " •••• " + (st.cardLast4 || "----"), false], ["t", "Référence", "hash", st.reference, true], ["f", "Date", "clock", S.paidAt, false], ["b", "Compte crédité", "wallet", a ? a.label : "—", false]].map(function (r) {
        return '<div class="rc-row ' + r[0] + '"><span class="socle xs">' + icon(r[2], 16) + '</span><span class="lbl">' + r[1] + '</span><span class="val' + (r[4] ? " id" : "") + '">' + esc(r[3]) + "</span></div>";
      }).join("");
      return '<div class="blk" style="gap:12px"><p class="kicker">' + esc(O.kicker || "Wallet Pro") + '</p><h1 class="title">Recharge<br>confirmée.</h1><p class="lede">' + fmt(st.amountCents, st.currency) + " ont été crédités sur <b>" + esc(a ? a.label : "ton compte") + "</b>. Ton solde est à jour.</p></div>" +
        '<div class="lines">' + rows + "</div>" + dashes() + '<div class="tot"><p class="kicker">Crédité sur le wallet</p><b class="pos">+' + fmt(st.amountCents, st.currency) + "</b></div>" +
        '<div class="btns"><button type="button" class="cta blue" data-act="history"><span>Voir mes transactions</span><span class="past">' + icon("arrow", 18) + '</span></button><button type="button" class="ghost" data-act="again">Recharger encore</button></div>' + barcode(st.reference);
    }
    function koView() {
      var why = [["Plafond atteint", "La banque limite peut-être les paiements en ligne."], ["Fonds insuffisants", "Le compte lié à la carte n’a pas assez de solde."], ["Carte non activée", "Le paiement sur internet doit être activé chez la banque."]].map(function (w) {
        return '<div class="why-row"><span class="socle sm">' + icon("alert", 16) + "</span><span><b>" + w[0] + "</b>" + w[1] + "</span></div>";
      }).join("");
      var c = cur();
      return '<div class="blk" style="gap:12px"><p class="kicker">' + esc(O.kicker || "Wallet Pro") + '</p><h1 class="title">Paiement<br>refusé.</h1><p class="lede">' + esc(S.failure || "Ta banque a décliné la transaction.") + ' <b style="color:var(--ink)">Aucun montant n’a été débité.</b></p></div>' +
        '<div class="lines"><div class="ln"><span class="l">Recharge par carte</span><span class="d"></span><span class="v">' + fmt(S.amount, c) + "</span></div></div>" + dashes() + '<div class="tot"><p class="kicker">Débité</p><b class="void">' + fmt(S.amount, c) + "</b></div>" +
        '<div class="why"><p class="kicker">Ce qui peut l’expliquer</p>' + why + '</div><div class="btns"><button type="button" class="cta blue" data-act="again"><span>Essayer une autre carte</span><span class="past">' + icon("arrow", 18) + '</span></button><button type="button" class="ghost" data-act="again">Modifier le montant</button></div>';
    }
    function stub() {
      var a = acct(), c = cur();
      var shown = S.shownBalance != null ? S.shownBalance : balNow();
      var pill;
      if (S.view === "ok" && S.settled) pill = '<span class="pill">' + icon("inn", 14) + "+" + fmt(S.settled.amountCents, S.settled.currency) + " crédités à l’instant</span>";
      else if (S.view === "input" && valid()) pill = '<span class="pill">' + icon("inn", 14) + "+" + fmt(S.amount, c) + " → " + fmt(balAfter(), c) + "</span>";
      else pill = '<span class="delta-idle">Le solde se met à jour dès la confirmation.</span>';
      var ids = a ? [a.id] : [];
      var tx = S.txs.length === 0 ? '<p class="hint">Aucune opération pour le moment.</p>' : S.txs.map(function (t) {
        var kind = t.type === "topup" ? "tpu" : t.direction === "credit" ? "in" : "out";
        var fresh = S.view === "ok" && S.settled && S.settled.reference === t.reference;
        return '<div class="tx ' + kind + (fresh ? " fresh" : "") + '"><span class="socle md">' + icon(kind === "out" ? "out" : kind === "tpu" ? "card" : "inn", 20) + '</span><div class="tx-b"><div class="tx-n">' + esc(t.description) + '</div><div class="tx-m">' + relative(t.createdAt) + '</div></div><div class="tx-a">' + (t.direction === "credit" ? "+" : "−") + fmt(inCur(t.amountCents, t.currency, cur()), C.canConvert(t.currency, cur()) ? cur() : t.currency) + "</div></div>";
      }).join("");
      return '<div class="stub"><div class="perf" aria-hidden="true">' + icon("cut", 18) + '<div class="dash">' + new Array(60).join("- ") + '</div></div><div class="sheet-wrap"><div class="sheet"><div class="bal-top"><span class="socle sm" style="background:var(--s-blue)">' + icon("wallet", 18) + '</span><p class="kicker">Solde · ' + esc(a ? a.label : "Wallet Pro") + '</p></div>' +
        '<p class="bal-num num" aria-live="polite"><span data-b="bal">' + numOnly(shown, c) + "</span><small>" + (SYMBOL[c] || c) + "</small></p><div class=\"delta\">" + pill + "</div>" + dashes() +
        '<div><p class="kicker" style="margin-bottom:12px">Dernières opérations</p>' + tx + "</div></div></div></div>";
    }
    function render() {
      var head = '<div class="head"><b>VTEX · Reçu de recharge</b><span style="display:inline-flex;align-items:center;gap:8px"><span class="mode">Simulation</span><span class="ref">' + (S.reference ? "N° " + esc(S.reference) : "N° en attente") + "</span></span></div>" + dashes();
      var body = S.view === "proc" ? procView() : S.view === "ok" && S.settled ? okView() : S.view === "ko" ? koView() : inputView();
      var stampSvg = S.view === "ok" ? stamp("ok", "PAYÉ") : S.view === "ko" ? stamp("ko", "REFUSÉ") : "";
      var scroll = root.scrollTop;
      root.innerHTML = '<div class="tp"><div class="page"><header class="bar"><button type="button" class="back" data-act="back" aria-label="' + (S.view === "input" ? "Retour au tableau de bord" : "Retour à la saisie") + '">' + icon("back", 24) + "</button>" +
        '<div class="wm"><div class="wm-tile" aria-hidden="true">VTEX</div><div><b>VTEX Business</b><small>Recharge par carte</small></div></div><span class="sec-pill">' + icon("lock", 14) + "Paiement sécurisé</span></header>" +
        '<div class="stage"><section aria-live="polite"><div class="sheet-wrap"><div class="sheet">' + stampSvg + head + body + '</div></div></section><aside class="stub-wrap">' + stub() + "</aside></div></div></div>";
      root.scrollTop = scroll;
    }
    function set(key, text) { var el = root.querySelector('[data-b="' + key + '"]'); if (el) el.textContent = text; }
    function updateLive() {
      var c = cur();
      set("big", numOnly(S.amount, c)); set("lnAmt", fmt(Math.max(S.amount, 0), c)); set("lnAfter", fmt(balAfter(), c)); set("tot", fmt(Math.max(S.amount, 0), c)); set("cta", ctaLabel()); set("lnQuota", fmt(Math.max(0, lim().dailyRemainingCents - (valid() ? S.amount : 0)), c));
      var h = root.querySelector('[data-b="hint"]'); if (h) h.outerHTML = hint();
      var cta = root.querySelector('[data-act="pay"]'); if (cta) cta.disabled = !valid() || S.busy;
      var d = root.querySelector(".delta"); if (d) d.innerHTML = valid() ? '<span class="pill">' + icon("inn", 14) + "+" + fmt(S.amount, c) + " → " + fmt(balAfter(), c) + "</span>" : '<span class="delta-idle">Le solde se met à jour dès la confirmation.</span>';
    }
    function showError(m) { S.formError = m || null; var b = root.querySelector('[data-b="err"]'); if (b) b.innerHTML = m ? '<p class="hint err" role="alert">' + esc(m) + "</p>" : ""; }
    function stampStage(i) { S.stamps[i] = clock(); }
    function failView(m) { S.failure = m; S.bank = false; S.idem = null; S.busy = false; S.view = "ko"; render(); root.scrollTop = 0; }
    function countUp(from, to) {
      var node = function () { return root.querySelector('[data-b="bal"]'); };
      if (from === to) { S.shownBalance = to; return; }
      var t0 = performance.now(), c = cur();
      cancelAnimationFrame(countTimer);
      (function step(t) {
        var p = Math.min(1, (t - t0) / 1100), v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        S.shownBalance = v; if (node()) node().textContent = numOnly(v, c);
        if (p < 1) countTimer = requestAnimationFrame(step);
      })(t0);
      setTimeout(function () { if (S.shownBalance !== to) { cancelAnimationFrame(countTimer); S.shownBalance = to; if (node()) node().textContent = numOnly(to, c); } }, 1400);
    }
    function finish(result) {
      S.settled = result; S.stage = 3; stampStage(3);
      S.paidAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
      S.idem = null; render();
      return sleep(700).then(function () {
        var before = balNow();
        S.view = "ok"; S.busy = false;
        return reload().then(function () {
          S.shownBalance = before; render(); root.scrollTop = 0; countUp(before, balNow());
          if (O.onChange) O.onChange();
        });
      });
    }
    function settleLoop(ref) {
      var i = 0;
      function once() {
        return C.confirm(ref).then(function (r) {
          if (r.status === "succeeded") { S.stage = 2; stampStage(2); return finish(r); }
          if (r.status === "failed" || r.status === "canceled") return failView(r.failureMessage || "Le paiement n’a pas abouti. Aucun montant n’a été débité.");
          if (++i >= 15) { S.formError = "Le paiement est encore en cours de vérification. Ton wallet sera crédité automatiquement dès sa confirmation."; render(); return null; }
          return sleep(2000).then(once);
        }, function (e) { failView(e.message || "Impossible de vérifier le paiement."); });
      }
      return once();
    }
    function pay() {
      if (!valid() || S.busy) return;
      S.busy = true; S.failure = null; S.stamps = []; S.bank = false; showError(null); updateLive();
      S.stage = 0; stampStage(0); S.view = "proc"; render(); root.scrollTop = 0;
      S.idem = S.idem || "business-topup:" + uuid();
      C.create({ accountId: S.acctId, amountCents: S.amount, currency: cur(), idempotencyKey: S.idem, who: O.who, detail: O.detail, actor: O.actor, billingName: S.name.trim() || null }).then(function (created) {
        S.reference = created.reference; S.stage = 1; stampStage(1); render();
        return C.simPay(created.reference, S.simNum).then(function (o) {
          if (o.status === "succeeded") { S.stage = 2; stampStage(2); return finish(o); }
          if (o.status === "requires_action") { S.bank = true; S.busy = false; render(); return null; }
          failView(o.failureMessage || "Ta banque a décliné la transaction.");
        });
      }).catch(function (e) { failView(e.message || "Le paiement n’a pas pu être lancé."); });
    }
    function confirmBank() {
      if (!S.reference || S.busy) return;
      S.busy = true; render();
      C.simAuthenticate(S.reference).then(function (r) {
        S.bank = false; S.stage = 2; stampStage(2);
        if (r.status === "succeeded") return finish(r);
        S.busy = false; return settleLoop(S.reference);
      }).catch(function (e) { failView(e.message || "La validation bancaire a échoué."); });
    }
    function reset() {
      S.view = "input"; S.stage = 0; S.failure = null; S.bank = false; S.settled = null; S.reference = null; S.formError = null; S.idem = null; S.busy = false; S.shownBalance = null; S.stamps = [];
      render(); reload().then(render);
    }

    root.onclick = function (event) {
      var t = event.target.closest("[data-act]"); if (!t || !root.contains(t)) return;
      var act = t.getAttribute("data-act");
      if (act === "back") { if (S.view === "input") { if (O.onBack) O.onBack(); } else reset(); }
      else if (act === "acct") { S.acctId = Number(t.getAttribute("data-id")); S.cardId = null; S.custom = ""; S.amount = defaultAmount(); S.shownBalance = null; render(); }
      else if (act === "ccy") { if (O.setDisplay) O.setDisplay(t.getAttribute("data-ccy")); S.custom = ""; S.shownBalance = null; S.amount = defaultAmount(); render(); }
      else if (act === "preset") {
        S.amount = Number(t.getAttribute("data-amt")); S.custom = ""; var ci = root.querySelector("#tp-custom"); if (ci) ci.value = "";
        root.querySelectorAll(".tile").forEach(function (x) { x.setAttribute("aria-checked", String(x === t)); }); updateLive();
      } else if (act === "pay") pay();
      else if (act === "bank") confirmBank();
      else if (act === "retry") { S.formError = null; render(); settleLoop(S.reference); }
      else if (act === "again") reset();
      else if (act === "history") { if (O.onHistory) O.onHistory(); }
    };
    root.oninput = function (event) {
      var key = event.target && event.target.getAttribute && event.target.getAttribute("data-in"); if (!key) return;
      var v = event.target.value;
      if (key === "custom") {
        S.custom = v; var p = Number(v.replace(/\s/g, "").replace(",", ".")); S.amount = v.trim() !== "" && isFinite(p) && p > 0 ? Math.round(p * divisor(cur())) : 0;
        root.querySelectorAll('.tile[aria-checked="true"]').forEach(function (x) { x.setAttribute("aria-checked", "false"); }); updateLive();
      } else if (key === "name") S.name = v;
      else if (key === "simNum") { S.simNum = v.replace(/[^\d ]/g, "").slice(0, 23); if (event.target.value !== S.simNum) event.target.value = S.simNum; }
      else if (key === "simExp") S.simExp = v;
      else if (key === "simCvc") { S.simCvc = v.replace(/\D/g, "").slice(0, 4); if (event.target.value !== S.simCvc) event.target.value = S.simCvc; }
    };

    return {
      open: function (pre) {
        pre = pre || {};
        S.view = "input"; S.stage = 0; S.failure = null; S.bank = false; S.settled = null; S.reference = null; S.formError = null; S.idem = null; S.busy = false; S.shownBalance = null; S.stamps = [];
        root.scrollTop = 0; render();
        return load().then(function () {
          var fromCard = pre.cardId ? S.cards.filter(function (c) { return c.id === pre.cardId; })[0] : null;
          if (fromCard) { S.acctId = fromCard.businessWalletAccountId; S.cardId = fromCard.id; }
          else if (pre.accountId && S.accounts.some(function (a) { return a.id === pre.accountId; })) S.acctId = pre.accountId;
          S.amount = defaultAmount(); S.custom = ""; render();
        });
      },
      /* La devise d'affichage a changé ailleurs (barre du haut) : on repart d'un montant valide dans la nouvelle unité. */
      refresh: function () { if (!S.cfg) return; S.custom = ""; S.shownBalance = null; S.amount = defaultAmount(); render(); }
    };
  }
  global.VtexReceipt = { mount: mount };
})(window);
