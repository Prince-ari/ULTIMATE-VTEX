/* VTEX Wallet — recharge par carte (Stripe), registre « reçu » plein cadre.
 *
 * Toute la vue #view-recharger est rendue ici : le crédit du wallet n'est JAMAIS décidé par ce fichier.
 * Le navigateur crée une intention de paiement côté serveur (topups.create), fait payer la carte
 * (Stripe Payment Element en mode test/réel, formulaire de simulation en mode simulateur) puis demande
 * au serveur de relire l'état auprès de Stripe (topups.confirm). Le solde affiché vient du serveur.
 * Doit être chargé APRÈS vtex-api.js (il enveloppe showView) et AVANT router.js. */
(function () {
  "use strict";

  var root = document.getElementById("view-recharger");
  if (!root) return;

  /* ── icônes SVG inline (Solar Bold : fill-first ou stroke 2.1-2.6) ── */
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
  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' + P[name] + "</svg>";
  }
  function coins(n, size) {
    var discs = "";
    for (var i = 0; i < n; i++) discs += '<ellipse cx="12" cy="' + (19 - i * 4.6) + '" rx="7.6" ry="3.1" fill="currentColor" stroke="#000" stroke-opacity=".18" stroke-width="1"/>';
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' + discs + "</svg>";
  }
  function dashes() { return '<div class="dash" aria-hidden="true">' + new Array(80).join("- ") + "</div>"; }
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

  /* ── utilitaires ── */
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function divisor(currency) { return currency === "XPF" ? 1 : 100; }
  /* « 1 234,56 € » / « 119 000 ₣ » : le franc Pacifique s'écrit toujours avec son signe ₣ (jamais « XPF » ni « F CFP »). */
  function fmt(cents, currency) { return numOnly(cents, currency) + " " + (SYMBOL[currency] || currency); }
  function numOnly(cents, currency) {
    var digits = currency === "XPF" ? 0 : 2;
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / divisor(currency));
  }
  var SYMBOL = { EUR: "€", USD: "$", XPF: "₣" };
  var EUR_XPF_RATE = 119.3317; /* parité fixe : 1 000 XPF = 8,38 EUR */
  var BRANDS = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", cartes_bancaires: "CB" };
  function brandLabel(brand) { return brand ? (BRANDS[String(brand).toLowerCase()] || brand) : "Carte"; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function clock() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function relative(value) {
    var mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (mins < 1) return "à l’instant";
    if (mins < 60) return "il y a " + mins + " min";
    var hours = Math.round(mins / 60);
    if (hours < 24) return "il y a " + hours + " h";
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(value));
  }
  function errMsg(error, fallback) { return error && error.message ? String(error.message) : fallback; }
  function uuid() {
    return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  /* ── API tRPC (mêmes conventions que vtex-api.js : cookie de session, superjson-compatible) ── */
  async function rpc(path, input) {
    var response = await fetch("/api/trpc/" + path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input === undefined ? null : input }) });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.error) throw new Error((payload && payload.error && payload.error.json && payload.error.json.message) || "La requête a échoué.");
    return payload.result && payload.result.data ? payload.result.data.json : payload;
  }
  async function query(path, input) {
    var response = await fetch("/api/trpc/" + path + "?input=" + encodeURIComponent(JSON.stringify({ json: input === undefined ? null : input })), { method: "GET", credentials: "include" });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.error) throw new Error((payload && payload.error && payload.error.json && payload.error.json.message) || "La requête a échoué.");
    return payload.result && payload.result.data ? payload.result.data.json : payload;
  }

  var STEPS = [
    { title: "Paiement initialisé", text: "La recharge est enregistrée et sécurisée.", icon: "card" },
    { title: "Validation par ta banque", text: "Ta banque peut afficher une fenêtre de confirmation (3D Secure).", icon: "bank" },
    { title: "Paiement confirmé par Stripe", text: "Les fonds sont sécurisés sur le compte de VTEX.", icon: "shield" },
    { title: "Wallet crédité", text: "Ton solde et ton activité se mettent à jour.", icon: "wallet" }
  ];

  var S = {
    active: false, from: "accueil", currency: "EUR", cfg: null, loadError: null, txs: [], name: "", cardId: null,
    amount: 0, custom: "", view: "input", stage: 0, stamps: [], reference: null, settled: null, paidAt: "", failure: null,
    bank: false, formError: null, busy: false, idem: null, shownBalance: null,
    simNum: "4000 0027 6000 3184", simExp: "12 / 28", simCvc: "123",
    stripe: null, elements: null, pe: null, peKey: "", initToken: 0
  };
  var returnRef = new URLSearchParams(window.location.search).get("ref");

  /* Préréglages : 50 €, 100 €, 500 € et 2 000 € (le plafond par recharge) — et leurs équivalents en francs Pacifique. */
  function presets() { return S.currency === "XPF" ? [6000, 12000, 60000, 238000] : [5000, 10000, 50000, 200000]; }
  /* Plafond effectif : 2 000 € par recharge, dans la limite de ce qui reste des 5 000 € par 24 h (recalculé par le serveur pour la devise choisie). */
  function effMax() { return S.cfg ? (typeof S.cfg.effectiveMaxCents === "number" ? S.cfg.effectiveMaxCents : S.cfg.maxCents) : 0; }
  function valid() { return !!S.cfg && S.amount > 0 && S.amount >= S.cfg.minCents && S.amount <= effMax(); }
  function otherCurrency() { return S.currency === "XPF" ? "EUR" : "XPF"; }
  function appCurrency() { try { return currentCurrency === "xpf" ? "XPF" : "EUR"; } catch (_) { return "EUR"; } }
  /* Montant proposé par défaut : le préréglage « populaire », ramené sous le plafond si besoin. */
  function defaultAmount() {
    var max = effMax(), wanted = presets()[1];
    if (!max) return wanted;
    if (wanted <= max) return wanted;
    var fitting = presets().filter(function (p) { return p <= max; });
    return fitting.length ? fitting[fitting.length - 1] : Math.max(S.cfg ? S.cfg.minCents : 0, max);
  }
  function ctaLabel() { return S.busy ? "Paiement en cours…" : valid() ? "Recharger " + fmt(S.amount, S.currency) : "Choisis un montant"; }
  /* Opération du compte (en euros) présentée dans la devise choisie pour la recharge, à la parité fixe. */
  function txFmt(t) {
    var from = String(t.currency || "EUR").toUpperCase(), cents = Number(t.amountCents) || 0;
    if (from === S.currency) return fmt(cents, from);
    if (from === "EUR" && S.currency === "XPF") return fmt(Math.round((cents / 100) * EUR_XPF_RATE), "XPF");
    if (from === "XPF" && S.currency === "EUR") return fmt(Math.round((cents / EUR_XPF_RATE) * 100), "EUR");
    return fmt(cents, from);
  }
  function balanceNow() { return S.cfg ? S.cfg.balanceCents : 0; }
  function balAfter() { return balanceNow() + (valid() ? S.amount : 0); }
  function mode() { return S.cfg ? S.cfg.mode : null; }

  /* ── chargement ── */
  async function loadConfig() {
    var cfg = await query("topups.config", { currency: S.currency });
    S.cfg = cfg;
    return cfg;
  }
  async function loadActivity() {
    try {
      var list = await query("transactions.listMine", { limit: 6 });
      S.txs = (list && list.items) || [];
    } catch (_) { S.txs = []; }
  }
  async function loadName() {
    if (S.name) return;
    try {
      var me = await query("users.getMe");
      S.name = [me.firstName, me.lastName].filter(Boolean).join(" ").trim();
    } catch (_) { /* le nom sur le reçu reste facultatif */ }
  }
  async function enter() {
    S.active = true;
    S.loadError = null;
    if (returnRef) {
      var ref = returnRef; returnRef = null;
      S.reference = ref; S.view = "proc"; S.stage = 2; S.bank = false;
      render();
      try { await loadConfig(); } catch (_) { /* affiché via le reçu */ }
      settleLoop(ref);
      return;
    }
    if (S.view === "ok" || S.view === "ko") resetState();
    /* La devise de la recharge suit celle de l'application (Profil › Devise) : on la relit à chaque ouverture. */
    var app = appCurrency();
    if (app !== S.currency) { S.currency = app; S.amount = 0; S.custom = ""; S.cfg = null; }
    render();
    try {
      await Promise.all([loadConfig(), loadActivity(), loadName()]);
      if (!S.amount || S.amount > effMax()) S.amount = defaultAmount();
    } catch (error) {
      S.loadError = errMsg(error, "Impossible de charger la recharge.");
    }
    render();
  }
  function leave() { S.active = false; destroyPe(); }

  /* ── Payment Element Stripe (modes test / réel uniquement) ── */
  function loadStripeJs() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-stripe-js]');
      if (existing) { existing.addEventListener("load", function () { resolve(window.Stripe); }); return; }
      var script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.setAttribute("data-stripe-js", "1");
      script.onload = function () { resolve(window.Stripe); };
      script.onerror = function () { reject(new Error("Stripe.js n’a pas pu être chargé.")); };
      document.head.appendChild(script);
    });
  }
  /* Le Payment Element est un iframe : le déplacer ou reconstruire son parent le recharge et efface la saisie.
     On ne le monte donc qu'une fois par rendu de l'écran de saisie, et les interactions de cet écran
     (montant, préréglages, erreurs) mettent le DOM à jour sur place au lieu de le reconstruire. */
  function destroyPe() {
    S.initToken++;
    if (S.pe) { try { S.pe.destroy(); } catch (_) { /* déjà démonté */ } }
    S.pe = null; S.elements = null; S.peKey = "";
  }
  async function initStripe() {
    var cfg = S.cfg;
    if (!cfg || !cfg.enabled || cfg.mode === "sim" || !cfg.publishableKey || S.view !== "input" || S.pe) return;
    var token = S.initToken;
    try {
      var StripeCtor = await loadStripeJs();
      var slot = root.querySelector("#tp-pe-slot");
      if (token !== S.initToken || !slot) return;
      S.stripe = StripeCtor(cfg.publishableKey);
      S.elements = S.stripe.elements({
        mode: "payment", amount: Math.max(S.amount, 50), currency: S.currency.toLowerCase(), paymentMethodTypes: ["card"],
        fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" }],
        appearance: {
          theme: "flat",
          variables: { colorPrimary: "#2A5B84", colorBackground: "#DCDAD0", colorText: "#0a0d1e", colorTextSecondary: "#4d5378", colorDanger: "#B23A32", fontFamily: "Inter, system-ui, sans-serif", borderRadius: "20px", spacingUnit: "4px", fontSizeBase: "14px" },
          rules: {
            ".Input": { padding: "14px 16px", boxShadow: "none", border: "none" },
            ".Input:focus": { boxShadow: "0 0 0 3px rgba(94,124,226,.28)", border: "none" },
            ".Label": { fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#4d5378" },
            ".Error": { color: "#B23A32", fontWeight: "600" }
          }
        }
      });
      S.pe = S.elements.create("payment", { layout: "tabs", fields: { billingDetails: { name: "never" } } });
      S.pe.mount(slot);
    } catch (error) {
      showError(errMsg(error, "Le formulaire de paiement n’a pas pu être chargé."));
    }
  }
  function showError(message) {
    S.formError = message || null;
    var box = root.querySelector('[data-b="err"]');
    if (box) box.innerHTML = message ? '<p class="hint err" role="alert">' + esc(message) + "</p>" : "";
  }

  /* ── flux de paiement ── */
  function stampStage(index) { S.stamps[index] = clock(); }
  function fail(message) {
    S.failure = message; S.bank = false; S.idem = null; S.busy = false; S.view = "ko";
    render();
    root.scrollTop = 0;
  }
  async function finish(result) {
    S.settled = result;
    S.stage = 3; stampStage(3);
    S.paidAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
    S.idem = null;
    render();
    await sleep(700);
    var before = balanceNow();
    S.view = "ok"; S.busy = false;
    try { await Promise.all([loadConfig(), loadActivity()]); } catch (_) { /* le reçu reste valable */ }
    S.shownBalance = before;
    render();
    root.scrollTop = 0;
    countUp(before, balanceNow());
    if (typeof window.retryWalletConnection === "function") window.retryWalletConnection();
  }
  async function settleLoop(ref) {
    for (var i = 0; i < 15; i++) {
      try {
        var result = await rpc("topups.confirm", { reference: ref });
        if (!S.amount && result.amountCents) { S.amount = result.amountCents; S.currency = result.currency || S.currency; }
        if (result.status === "succeeded") { S.stage = 2; stampStage(2); await finish(result); return; }
        if (result.status === "failed" || result.status === "canceled") { fail(result.failureMessage || "Le paiement n’a pas abouti. Aucun montant n’a été débité."); return; }
      } catch (error) { fail(errMsg(error, "Impossible de vérifier le paiement.")); return; }
      await sleep(2000);
    }
    S.formError = "Le paiement est encore en cours de vérification. Ton wallet sera crédité automatiquement dès sa confirmation.";
    render();
  }
  async function pay() {
    if (!valid() || S.busy || !S.cfg.enabled) return;
    S.busy = true; S.failure = null; S.stamps = []; S.bank = false; showError(null); updateLive();
    try {
      if (mode() !== "sim") {
        var submitted = S.elements ? await S.elements.submit() : { error: { message: "Le formulaire de paiement n’est pas prêt." } };
        if (submitted.error) { S.busy = false; showError(submitted.error.message || "Vérifie les informations de ta carte."); updateLive(); return; }
      }
      /* En mode réel le Payment Element doit rester monté jusqu'à confirmPayment : le reçu « en cours » ne s'affiche qu'ensuite. */
      S.stage = 0; stampStage(0);
      if (mode() === "sim") { S.view = "proc"; render(); root.scrollTop = 0; }
      S.idem = S.idem || "wallet-topup:" + uuid();
      var created = await rpc("topups.create", { currency: S.currency, amountCents: S.amount, idempotencyKey: S.idem });
      S.reference = created.reference;
      S.stage = 1; stampStage(1);
      if (mode() === "sim") render();

      if (mode() === "sim") {
        var outcome = await rpc("topups.simPay", { reference: created.reference, cardNumber: S.simNum });
        if (outcome.status === "succeeded") { S.stage = 2; stampStage(2); await finish(outcome); return; }
        if (outcome.status === "requires_action") { S.bank = true; S.busy = false; render(); return; }
        fail(outcome.failureMessage || "Ta banque a décliné la transaction.");
        return;
      }

      if (!S.stripe || !S.elements || !created.clientSecret) throw new Error("Le formulaire de paiement n’est pas prêt. Recharge la page puis réessaie.");
      var result = await S.stripe.confirmPayment({
        elements: S.elements, clientSecret: created.clientSecret,
        confirmParams: { return_url: window.location.origin + "/recharger?ref=" + created.reference, payment_method_data: { billing_details: { name: S.name || "Titulaire du wallet" } } },
        redirect: "if_required"
      });
      if (result.error) {
        await rpc("topups.confirm", { reference: created.reference }).catch(function () { return null; });
        fail(result.error.message || "Ta banque a décliné la transaction.");
        return;
      }
      S.view = "proc"; S.stage = 2; stampStage(2); render(); root.scrollTop = 0;
      await settleLoop(created.reference);
    } catch (error) {
      fail(errMsg(error, "Le paiement n’a pas pu être lancé."));
    }
  }
  async function confirmBank() {
    if (!S.reference || S.busy) return;
    S.busy = true; render();
    try {
      var result = await rpc("topups.simAuthenticate", { reference: S.reference });
      S.bank = false; S.stage = 2; stampStage(2);
      if (result.status === "succeeded") await finish(result);
      else { S.busy = false; await settleLoop(S.reference); }
    } catch (error) { fail(errMsg(error, "La validation bancaire a échoué.")); }
  }
  function resetState() {
    S.view = "input"; S.stage = 0; S.failure = null; S.bank = false; S.settled = null; S.reference = null; S.formError = null; S.idem = null; S.busy = false; S.shownBalance = null; S.stamps = [];
  }
  function reset() {
    resetState();
    render();
    loadConfig().then(function () { if (!S.amount || S.amount > effMax()) S.amount = defaultAmount(); render(); }).catch(function () { /* on garde l'écran affiché */ });
  }

  var countTimer = 0;
  function countUp(from, to) {
    var el = root.querySelector('[data-b="bal"]');
    if (!el || from === to || (window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches)) { S.shownBalance = to; if (el) el.textContent = numOnly(to, S.currency); return; }
    cancelAnimationFrame(countTimer);
    var t0 = performance.now();
    function step(t) {
      var p = Math.min(1, (t - t0) / 1100);
      var value = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      S.shownBalance = value;
      var node = root.querySelector('[data-b="bal"]');
      if (node) node.textContent = numOnly(value, S.currency);
      if (p < 1) countTimer = requestAnimationFrame(step);
    }
    countTimer = requestAnimationFrame(step);
    /* Filet de sécurité : si le navigateur suspend les animations (onglet en arrière-plan), la valeur finale s'affiche quand même. */
    setTimeout(function () {
      if (S.shownBalance === to) return;
      cancelAnimationFrame(countTimer);
      S.shownBalance = to;
      var node = root.querySelector('[data-b="bal"]');
      if (node) node.textContent = numOnly(to, S.currency);
    }, 1400);
  }

  /* ── rendu ── */
  function hint() {
    var c = S.cfg;
    if (!c) return "";
    var other = otherCurrency(), otherLimits = c.limitsByCurrency && c.limitsByCurrency[other];
    var equivalent = otherLimits ? " (≈ " + fmt(otherLimits.maxCents, other) + ")" : "";
    if (S.amount > 0 && S.amount < c.minCents) return '<p class="hint err" data-b="hint">Montant minimum : ' + fmt(c.minCents, S.currency) + ".</p>";
    if (S.amount > c.maxCents) return '<p class="hint err" data-b="hint">Montant maximum par recharge : ' + fmt(c.maxCents, S.currency) + equivalent + ".</p>";
    if (S.amount > effMax()) return '<p class="hint err" data-b="hint">Plafond quotidien : il te reste ' + fmt(c.dailyRemainingCents || 0, S.currency) + " de recharge sur 24 h (" + fmt(c.dailyMaxCents, S.currency) + " maximum par jour).</p>";
    if (S.custom !== "" && S.amount <= 0) return '<p class="hint err" data-b="hint">Saisis un montant valide.</p>';
    return '<p class="hint" data-b="hint">Entre ' + fmt(c.minCents, S.currency) + " et " + fmt(c.maxCents, S.currency) + equivalent + " par recharge · " + fmt(c.dailyMaxCents, S.currency) + " max par 24 h.</p>";
  }
  function accountBlock() {
    var c = S.cfg;
    var linked = (c.cards || []).filter(function (card) { return card.status !== "cancelled" && card.status !== "expired"; });
    var chips = linked.length ? '<span class="chips">' + linked.map(function (card) {
      return '<span class="' + (S.cardId && String(S.cardId) === String(card.id) ? "on" : "") + '">' + esc(card.label || "Carte") + " •••• " + esc(card.lastFour) + "</span>";
    }).join("") + "</span>" : "";
    var ccy = [["EUR", "€ Euro"], ["XPF", "₣ Franc Pacifique"]].map(function (item) {
      return '<button type="button" role="radio" aria-checked="' + (S.currency === item[0]) + '" data-act="ccy" data-ccy="' + item[0] + '">' + item[1] + "</button>";
    }).join("");
    var parity = S.currency === "XPF" ? '<p class="hint" data-b="parity">Parité fixe : 1 € = ' + new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(EUR_XPF_RATE) + " ₣. Le solde et les montants s’affichent en francs Pacifique.</p>" : "";
    return '<div class="blk"><h2 class="blk-t">Compte ou carte à charger</h2>' +
      '<div class="acct-list" role="radiogroup" aria-label="Compte ou carte à charger"><button type="button" class="acct blue" role="radio" aria-checked="true">' +
      '<span class="socle md">' + icon("wallet", 22) + "</span><span class=\"acct-body\"><span class=\"acct-name\">Mon compte Wallet</span>" +
      '<span class="acct-sub">Solde ' + fmt(c.balanceCents, S.currency) + "</span>" + chips + "</span>" +
      '<span class="radio">' + icon("check", 16) + "</span></button></div>" +
      '<div class="ccy" role="radiogroup" aria-label="Devise de la recharge">' + ccy + "</div>" + parity +
      '<p class="hint">Les cartes du compte se rechargent en créditant ce compte : leur solde suit immédiatement.</p></div>';
  }
  function cardBlock() {
    var c = S.cfg;
    var body = "";
    if (mode() === "sim") {
      body = '<p class="notice"><b>Simulation locale.</b> ' + (c.fallback && c.reason ? esc(c.reason) + " " : "") + "Aucune vraie carte, aucun débit. Essaie <b>4242 4242 4242 4242</b> (direct), <b>4000 0027 6000 3184</b> (3D Secure) ou <b>4000 0000 0000 0002</b> (refus).</p>" +
        '<label class="field"><span>Numéro de carte</span><span class="inwrap"><input class="inp mono" id="tp-sim-num" data-in="simNum" inputmode="numeric" autocomplete="off" value="' + esc(S.simNum) + '" placeholder="1234 1234 1234 1234"></span></label>' +
        '<div class="two"><label class="field"><span>Expiration</span><input class="inp mono" id="tp-sim-exp" data-in="simExp" inputmode="numeric" autocomplete="off" value="' + esc(S.simExp) + '" placeholder="MM / AA"></label>' +
        '<label class="field"><span>Code CVC</span><input class="inp mono" id="tp-sim-cvc" data-in="simCvc" inputmode="numeric" autocomplete="off" value="' + esc(S.simCvc) + '" placeholder="•••"></label></div>';
    } else if (c.enabled) {
      body = '<div id="tp-pe-slot" class="pe"></div>';
    }
    return '<div class="blk"><h2 class="blk-t">Carte de paiement</h2>' + body +
      '<label class="field"><span>Nom sur le reçu</span><input class="inp" id="tp-name" data-in="name" autocomplete="name" value="' + esc(S.name) + '"></label>' +
      '<p class="secure">' + icon("shield", 20) + "<span>Paiement chiffré par Stripe. VTEX ne voit ni ne stocke le numéro de carte.</span></p></div>";
  }
  function inputView() {
    var c = S.cfg;
    var out = '<div class="blk" style="gap:12px"><p class="kicker">Wallet personnel</p><h1 class="title">Recharger<br>mon wallet.</h1>' +
      '<p class="lede">Ajoute des fonds avec ta carte bancaire depuis un compte ou une carte extérieure. Ils sont disponibles dès la confirmation de ta banque.</p></div>';
    if (!c) return out + '<p class="notice">Chargement de la recharge…</p>';
    if (!c.enabled) out += '<p class="notice"><b>Les recharges par carte ne sont pas encore activées.</b> ' + esc(c.reason || "") + "</p>";
    out += accountBlock();
    var tiles = presets().map(function (p, i) {
      var over = p > effMax();
      return '<button type="button" class="tile" role="radio" aria-checked="' + (S.custom === "" && S.amount === p) + '"' + (over ? ' aria-disabled="true" disabled' : "") + ' data-act="preset" data-amt="' + p + '"><span class="socle t52">' + coins(i + 1, 26) + '</span><span class="tile-val">' + fmt(p, S.currency).replace(/[,.]00(?=\D*$)/, "") + "</span>" + (i === 1 ? '<span class="tile-badge">Populaire</span>' : i === 3 ? '<span class="tile-badge">Maximum</span>' : "") + "</button>";
    }).join("");
    out += '<div class="blk"><h2 class="blk-t">Montant</h2><p class="big num"><span data-b="big">' + numOnly(S.amount, S.currency) + "</span><small>" + (SYMBOL[S.currency] || S.currency) + "</small></p>" +
      '<div class="tiles" role="radiogroup" aria-label="Montant de la recharge">' + tiles + "</div>" +
      '<label class="field"><span>Autre montant</span><span class="inwrap"><input class="inp amount-input" id="tp-custom" data-in="custom" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(S.custom) + '"><span class="suffix">' + (SYMBOL[S.currency] || S.currency) + "</span></span></label>" + hint() + "</div>";
    out += cardBlock() + dashes() +
      '<div class="lines"><div class="ln"><span class="l">Recharge par carte</span><span class="d"></span><span class="v" data-b="lnAmt">' + fmt(Math.max(S.amount, 0), S.currency) + "</span></div>" +
      '<div class="ln"><span class="l">Frais de recharge</span><span class="d"></span><span class="v free">Offerts</span></div>' +
      '<div class="ln"><span class="l">Crédité sur</span><span class="d"></span><span class="v">Mon compte Wallet</span></div>' +
      '<div class="ln"><span class="l">Solde après recharge</span><span class="d"></span><span class="v" data-b="lnAfter">' + fmt(balAfter(), S.currency) + "</span></div>" +
      '<div class="ln"><span class="l">Plafond restant (24 h)</span><span class="d"></span><span class="v" data-b="lnQuota">' + fmt(Math.max(0, (c.dailyRemainingCents || 0) - (valid() ? S.amount : 0)), S.currency) + "</span></div></div>" + dashes() +
      '<div class="tot"><p class="kicker">À débiter sur la carte</p><b data-b="tot">' + fmt(Math.max(S.amount, 0), S.currency) + "</b></div>" +
      '<div class="blk" style="gap:12px"><div data-b="err">' + (S.formError ? '<p class="hint err" role="alert">' + esc(S.formError) + "</p>" : "") + "</div>" +
      '<button type="button" class="cta" data-act="pay"' + (!valid() || S.busy || !c.enabled ? " disabled" : "") + '><span data-b="cta">' + ctaLabel() + '</span><span class="past">' + icon("lock", 18) + "</span></button>" +
      '<p class="legal">En rechargeant, tu autorises VTEX à débiter la carte. Le reçu est conservé dans ton historique.</p></div>';
    return out;
  }
  function procView() {
    var feed = STEPS.map(function (s, i) {
      var state = i < S.stage ? "done" : i === S.stage ? "now" : "";
      return '<div class="fl ' + state + '" role="listitem"><span class="socle md' + (state === "now" && !S.bank ? " pulse" : "") + '">' + icon(i < S.stage ? "check" : s.icon, 20) + '</span><div class="fl-b"><div class="fl-t"><span>' + s.title + "</span>" + (state && S.stamps[i] ? "<i>" + S.stamps[i] + "</i>" : "") + "</div>" +
        (state ? '<div class="fl-s">' + s.text + "</div>" : "") +
        (i === 1 && S.bank ? '<div class="slip"><p><b>Ta banque te demande de confirmer.</b> Valide le paiement dans son application ou saisis le code reçu par SMS.</p><div class="codes" aria-hidden="true"><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i><i>•</i></div><p style="font-size:12px;color:var(--ink3)">Fenêtre gérée par la banque — VTEX n’y a pas accès.</p><button type="button" class="mini" data-act="bank"' + (S.busy ? " disabled" : "") + ">Confirmer avec ma banque</button></div>" : "") +
        "</div></div>";
    }).join("");
    return '<div class="blk" style="gap:12px"><p class="kicker">Impression du reçu</p><h1 class="title">Recharge<br>en cours…</h1><p class="big num" style="font-size:44px">' + numOnly(S.amount, S.currency) + "<small>" + (SYMBOL[S.currency] || S.currency) + "</small></p>" +
      '<p class="lede">Ne ferme pas cette page : chaque étape est horodatée sur ton reçu.</p></div>' +
      '<div class="feedbar" aria-hidden="true"><i style="width:' + ((S.stage + 1) / 4) * 100 + '%"></i></div><div class="feed" role="list">' + feed + "</div>" +
      (S.formError ? '<p class="notice">' + esc(S.formError) + "</p>" : "") +
      (S.formError && S.reference ? '<button type="button" class="ghost" data-act="retry">Vérifier maintenant</button>' : "");
  }
  function okView() {
    var st = S.settled;
    var rows = [
      ["f", "Montant rechargé", "bolt", fmt(st.amountCents, st.currency), false],
      ["b", "Frais de recharge", "tag", fmt(0, st.currency), false],
      ["r", "Moyen de paiement", "card", brandLabel(st.cardBrand) + " •••• " + (st.cardLast4 || "----"), false],
      ["t", "Référence", "hash", st.reference, true],
      ["f", "Date", "clock", S.paidAt, false],
      ["b", "Compte crédité", "wallet", "Mon compte Wallet", false]
    ].map(function (r) {
      return '<div class="rc-row ' + r[0] + '"><span class="socle xs">' + icon(r[2], 16) + '</span><span class="lbl">' + r[1] + '</span><span class="val' + (r[4] ? " id" : "") + '">' + esc(r[3]) + "</span></div>";
    }).join("");
    return '<div class="blk" style="gap:12px"><p class="kicker">Wallet personnel</p><h1 class="title">Recharge<br>confirmée.</h1><p class="lede">' + fmt(st.amountCents, st.currency) + " ont été crédités sur <b>ton compte Wallet</b>. Ton solde est à jour.</p></div>" +
      '<div class="lines">' + rows + "</div>" + dashes() +
      '<div class="tot"><p class="kicker">Crédité sur le wallet</p><b class="pos">+' + fmt(st.amountCents, st.currency) + "</b></div>" +
      '<div class="btns"><button type="button" class="cta blue" data-act="history"><span>Voir mon historique</span><span class="past">' + icon("arrow", 18) + '</span></button><button type="button" class="ghost" data-act="again">Recharger encore</button></div>' +
      barcode(st.reference);
  }
  function koView() {
    var why = [["Plafond atteint", "La banque limite peut-être les paiements en ligne."], ["Fonds insuffisants", "Le compte lié à la carte n’a pas assez de solde."], ["Carte non activée", "Le paiement sur internet doit être activé chez la banque."]].map(function (w) {
      return '<div class="why-row"><span class="socle sm">' + icon("alert", 16) + "</span><span><b>" + w[0] + "</b>" + w[1] + "</span></div>";
    }).join("");
    return '<div class="blk" style="gap:12px"><p class="kicker">Wallet personnel</p><h1 class="title">Paiement<br>refusé.</h1><p class="lede">' + esc(S.failure || "Ta banque a décliné la transaction.") + ' <b style="color:var(--ink)">Aucun montant n’a été débité.</b></p></div>' +
      '<div class="lines"><div class="ln"><span class="l">Recharge par carte</span><span class="d"></span><span class="v">' + fmt(S.amount, S.currency) + "</span></div></div>" + dashes() +
      '<div class="tot"><p class="kicker">Débité</p><b class="void">' + fmt(S.amount, S.currency) + "</b></div>" +
      '<div class="why"><p class="kicker">Ce qui peut l’expliquer</p>' + why + "</div>" +
      '<div class="btns"><button type="button" class="cta blue" data-act="again"><span>Essayer une autre carte</span><span class="past">' + icon("arrow", 18) + '</span></button><button type="button" class="ghost" data-act="again">Modifier le montant</button></div>';
  }
  function stub() {
    var shown = S.shownBalance != null ? S.shownBalance : balanceNow();
    var pill;
    if (S.view === "ok" && S.settled) pill = '<span class="pill">' + icon("inn", 14) + "+" + fmt(S.settled.amountCents, S.settled.currency) + " crédités à l’instant</span>";
    else if (S.view === "input" && valid()) pill = '<span class="pill" data-b="pill">' + icon("inn", 14) + "+" + fmt(S.amount, S.currency) + " → " + fmt(balAfter(), S.currency) + "</span>";
    else pill = '<span class="delta-idle">Le solde se met à jour dès la confirmation.</span>';
    var tx = S.txs.length === 0 ? '<p class="hint">Aucune opération pour le moment.</p>' : S.txs.map(function (t) {
      var kind = t.type === "topup" ? "tpu" : t.direction === "credit" ? "in" : "out";
      var fresh = S.view === "ok" && S.settled && S.settled.reference === t.reference;
      return '<div class="tx ' + kind + (fresh ? " fresh" : "") + '"><span class="socle md">' + icon(kind === "out" ? "out" : kind === "tpu" ? "card" : "inn", 20) + '</span><div class="tx-b"><div class="tx-n">' + esc(t.description || String(t.type).replace(/_/g, " ")) + '</div><div class="tx-m">' + relative(t.createdAt) + '</div></div><div class="tx-a">' + (t.direction === "credit" ? "+" : "−") + txFmt(t) + "</div></div>";
    }).join("");
    return '<div class="stub"><div class="perf" aria-hidden="true">' + icon("cut", 18) + '<div class="dash">' + new Array(60).join("- ") + '</div></div><div class="sheet-wrap"><div class="sheet">' +
      '<div class="bal-top"><span class="socle sm" style="background:var(--s-blue)">' + icon("wallet", 18) + '</span><p class="kicker">Solde · Mon compte Wallet</p></div>' +
      '<p class="bal-num num" aria-live="polite"><span data-b="bal">' + numOnly(shown, S.currency) + "</span><small>" + (SYMBOL[S.currency] || S.currency) + "</small></p>" +
      '<div class="delta">' + pill + "</div>" + dashes() +
      '<div><p class="kicker" style="margin-bottom:12px">Dernières opérations</p>' + tx + "</div></div></div></div>";
  }
  function render() {
    if (!S.active) return;
    var mk = mode();
    var head = '<div class="head"><b>VTEX · Reçu de recharge</b><span style="display:inline-flex;align-items:center;gap:8px">' +
      (mk ? '<span class="mode' + (mk === "live" ? " live" : "") + '">' + (mk === "live" ? "Réel" : mk === "sim" ? "Simulation" : "Test") + "</span>" : "") +
      '<span class="ref">' + (S.reference ? "N° " + esc(S.reference) : "N° en attente") + "</span></span></div>" + dashes();
    var body;
    if (S.loadError) body = '<h1 class="title">Recharge<br>indisponible.</h1><p class="notice">' + esc(S.loadError) + '</p><button type="button" class="ghost" data-act="home">Retour à l’accueil</button>';
    else if (S.view === "proc") body = procView();
    else if (S.view === "ok" && S.settled) body = okView();
    else if (S.view === "ko") body = koView();
    else body = inputView();
    var stampSvg = S.view === "ok" ? stamp("ok", "PAYÉ") : S.view === "ko" ? stamp("ko", "REFUSÉ") : "";
    var scroll = root.scrollTop;
    destroyPe();
    root.innerHTML ='<div class="tp"><div class="page"><header class="bar"><button type="button" class="back" data-act="back" aria-label="' + (S.view === "input" ? "Retour" : "Retour à la saisie") + '">' + icon("back", 24) + "</button>" +
      '<div class="wm"><div class="wm-tile" aria-hidden="true">VTEX</div><div><b>VTEX Wallet</b><small>Recharge par carte</small></div></div><span class="sec-pill">' + icon("lock", 14) + "Paiement sécurisé</span></header>" +
      '<div class="stage"><section aria-live="polite"><div class="sheet-wrap"><div class="sheet">' + stampSvg + head + body + '</div></div></section><aside class="stub-wrap">' + (S.loadError ? "" : stub()) + "</aside></div></div></div>";
    root.scrollTop = scroll;
    if (S.view === "input") initStripe();
  }
  /* Mise à jour sans reconstruire le DOM (la saisie garde son focus, le Payment Element reste monté). */
  function updateLive() {
    var set = function (key, text) { var el = root.querySelector('[data-b="' + key + '"]'); if (el) el.textContent = text; };
    set("big", numOnly(S.amount, S.currency));
    set("lnAmt", fmt(Math.max(S.amount, 0), S.currency));
    set("lnAfter", fmt(balAfter(), S.currency));
    set("lnQuota", fmt(Math.max(0, ((S.cfg && S.cfg.dailyRemainingCents) || 0) - (valid() ? S.amount : 0)), S.currency));
    set("tot", fmt(Math.max(S.amount, 0), S.currency));
    set("cta", ctaLabel());
    var hintEl = root.querySelector('[data-b="hint"]');
    if (hintEl) hintEl.outerHTML = hint();
    var cta = root.querySelector('[data-act="pay"]');
    if (cta) cta.disabled = !valid() || S.busy || !(S.cfg && S.cfg.enabled);
    var delta = root.querySelector(".delta");
    if (delta) delta.innerHTML = valid() ? '<span class="pill" data-b="pill">' + icon("inn", 14) + "+" + fmt(S.amount, S.currency) + " → " + fmt(balAfter(), S.currency) + "</span>" : '<span class="delta-idle">Le solde se met à jour dès la confirmation.</span>';
    if (S.elements && S.amount >= 50) S.elements.update({ amount: S.amount });
  }

  /* ── événements ── */
  root.addEventListener("click", function (event) {
    var target = event.target.closest("[data-act]");
    if (!target || !root.contains(target)) return;
    var act = target.getAttribute("data-act");
    if (act === "back") {
      if (S.view === "input" || S.loadError) window.showView(S.from || "accueil");
      else reset();
    } else if (act === "home") window.showView("accueil");
    else if (act === "preset") {
      S.amount = Number(target.getAttribute("data-amt")); S.custom = "";
      var input = root.querySelector("#tp-custom"); if (input) input.value = "";
      root.querySelectorAll(".tile").forEach(function (tile) { tile.setAttribute("aria-checked", String(tile === target)); });
      updateLive();
    }
    else if (act === "ccy") {
      var next = target.getAttribute("data-ccy");
      if (next === S.currency) return;
      /* Changer de devise : l'application entière suit (soldes, historique, objectifs) et les plafonds sont revérifiés
         par le serveur pour la nouvelle devise (2 000 € ≈ 238 663 ₣ par recharge, 5 000 € par 24 h). */
      S.currency = next; S.custom = ""; S.amount = 0; S.cfg = null; S.formError = null; render();
      if (typeof window.selectCurrency === "function") { try { window.selectCurrency(next === "XPF" ? "xpf" : "eur"); } catch (_) { /* la devise de l'écran reste cohérente */ } }
      loadConfig().then(function () { S.amount = defaultAmount(); render(); }).catch(function (error) { S.loadError = errMsg(error, "Impossible de charger cette devise."); render(); });
    } else if (act === "pay") pay();
    else if (act === "bank") confirmBank();
    else if (act === "retry") { S.formError = null; render(); settleLoop(S.reference); }
    else if (act === "again") reset();
    else if (act === "history") window.showView("historique");
  });
  root.addEventListener("input", function (event) {
    var key = event.target && event.target.getAttribute && event.target.getAttribute("data-in");
    if (!key) return;
    var value = event.target.value;
    if (key === "custom") {
      S.custom = value;
      var parsed = Number(value.replace(/\s/g, "").replace(",", "."));
      S.amount = value.trim() !== "" && isFinite(parsed) && parsed > 0 ? Math.round(parsed * divisor(S.currency)) : 0;
      root.querySelectorAll('.tile[aria-checked="true"]').forEach(function (tile) { tile.setAttribute("aria-checked", "false"); });
      updateLive();
    } else if (key === "name") S.name = value;
    else if (key === "simNum") { S.simNum = value.replace(/[^\d ]/g, "").slice(0, 23); if (event.target.value !== S.simNum) event.target.value = S.simNum; }
    else if (key === "simExp") S.simExp = value;
    else if (key === "simCvc") { S.simCvc = value.replace(/\D/g, "").slice(0, 4); if (event.target.value !== S.simCvc) event.target.value = S.simCvc; }
  });

  /* ── intégration à la navigation ── */
  var previousShowView = window.showView;
  window.showView = function (name) {
    if (name === "recharger") {
      var current = document.querySelector(".view.active");
      var from = current ? current.id.replace(/^view-/, "") : "accueil";
      if (from && from !== "recharger" && from !== "login" && from !== "otp") S.from = from;
    }
    var result = previousShowView.apply(this, arguments);
    if (name === "recharger") { if (document.getElementById("view-recharger").classList.contains("active")) enter(); }
    else if (S.active) leave();
    return result;
  };

  /* Point d'entrée public : window.openTopup({ currency, cardId }). Les cartes se rechargent via leur compte. */
  window.openTopup = function (options) {
    options = options || {};
    if (options.currency && ["EUR", "XPF"].indexOf(options.currency) >= 0 && options.currency !== S.currency) { S.currency = options.currency; S.cfg = null; S.amount = 0; S.custom = ""; }
    S.cardId = options.cardId || null;
    window.showView("recharger");
  };
})();
