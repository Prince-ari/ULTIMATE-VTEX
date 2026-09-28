/* VTEX — moteur de démonstration partagé (recharge par carte, ledger, journal).
 *
 * Reproduit en mémoire la logique du vrai backend (packages/wallet/src/topups.ts, packages/business/src/topups.ts,
 * packages/core/src/stripe/gateway.ts) pour que les prototypes publiés se comportent comme l'application réelle :
 *  - une recharge n'est créditée QU'après relecture de l'état du paiement (jamais sur la foi du navigateur) ;
 *  - un crédit ne s'applique qu'une fois (garde de statut) ;
 *  - un remboursement débite le solde et est refusé si le solde ne le couvre plus ;
 *  - chaque action écrit dans le journal système.
 * Aucune requête réseau, aucune clé : la carte n'est jamais lue par Stripe, ce sont des numéros de test. */
(function (global) {
  "use strict";

  /* ───────── utilitaires ───────── */
  function randHex(n) { var s = ""; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s.toUpperCase(); }
  function makeRef(prefix) { return prefix + "-" + randHex(16); }
  function iso(minutesAgo) { return new Date(Date.now() - (minutesAgo || 0) * 60000).toISOString(); }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function jitter(min, max) { return min + Math.random() * (max - min); }
  function divisor(currency) { return currency === "XPF" ? 1 : 100; }
  /* Parité FIXE du franc Pacifique : 1 000 XPF = 8,38 EUR ⇒ 1 EUR = 119,3317 XPF. Le dollar n'est jamais converti. */
  var EUR_XPF_RATE = 119.3317;
  var SYMBOLS = { EUR: "€", USD: "$", XPF: "₣" };
  function canConvert(from, to) { return from === to || (from !== "USD" && to !== "USD"); }
  function convert(minor, from, to) {
    if (from === to) return minor;
    if (!canConvert(from, to)) throw new Error("Conversion " + from + " → " + to + " indisponible : ces devises n’ont pas de parité fixe.");
    var major = minor / divisor(from);
    return Math.round((from === "EUR" ? major * EUR_XPF_RATE : major / EUR_XPF_RATE) * divisor(to));
  }
  /* Comme convert mais arrondi VERS LE BAS : pour les plafonds, jamais dépassés par l'arrondi. */
  function floorConvert(minor, from, to) {
    if (from === to) return minor;
    var major = minor / divisor(from);
    return Math.floor((from === "EUR" ? major * EUR_XPF_RATE : major / EUR_XPF_RATE) * divisor(to) + 1e-6);
  }
  function eurEq(minor, currency) { return currency === "XPF" ? convert(minor, "XPF", "EUR") : minor; }
  /* « 1 234,56 € » / « 119 000 ₣ » : le franc Pacifique s'écrit toujours avec son signe. */
  function fmt(cents, currency) {
    var cur = currency || "EUR", digits = cur === "XPF" ? 0 : 2;
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / divisor(cur)) + " " + (SYMBOLS[cur] || cur);
  }
  function luhn(digits) {
    var sum = 0;
    for (var i = 0; i < digits.length; i++) {
      var d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  }
  function brandOf(digits) {
    if (/^4/.test(digits)) return "visa";
    if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
    if (/^3[47]/.test(digits)) return "amex";
    return "unknown";
  }
  function fail(message) { return Promise.reject(new Error(message)); }

  /* ───────── IBAN / BIC (mêmes contrôles que packages/core/src/iban.ts) ───────── */
  function mod97(digits) { var r = 0; for (var i = 0; i < digits.length; i++) r = (r * 10 + Number(digits[i])) % 97; return r; }
  function validateIban(value) {
    var iban = String(value || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban) || iban.length > 34) throw new Error("IBAN invalide.");
    var re = iban.slice(4) + iban.slice(0, 4), enc = "";
    for (var i = 0; i < re.length; i++) { var ch = re.charAt(i); enc += ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch; }
    if (mod97(enc) !== 1) throw new Error("La clé de contrôle de l’IBAN est invalide.");
    return iban;
  }
  function validateBic(value) {
    var bic = String(value || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) throw new Error("BIC invalide.");
    return bic;
  }
  /** IBAN français valide (clé MOD 97) dérivé de l'identifiant du compte — provisionnement automatique. */
  function generatedIban(accountId, scope) {
    var bank = scope === "business" ? "30005" : "30004";
    var bban = bank + String(accountId).padStart(5, "0") + String(accountId * 7919).padStart(14, "0").slice(-14);
    return "FR" + String(98 - mod97(bban + "152700")).padStart(2, "0") + bban;
  }
  function groupIban(iban) { return String(iban || "").replace(/(.{4})/g, "$1 ").trim(); }

  var DECLINES = {
    "4000000000000002": { code: "card_declined", message: "Ta banque a décliné la transaction." },
    "4000000000009995": { code: "insufficient_funds", message: "Fonds insuffisants sur la carte." },
    "4000000000000069": { code: "expired_card", message: "La carte est expirée." }
  };
  var THREE_DS = { "4000002760003184": true, "4000002500003155": true };

  /** Plafonds identiques au serveur, par portefeuille : 2 000 € par recharge (wallet perso), 5 000 € par recharge (Wallet Pro),
   *  et 5 000 € cumulés par 24 h pour les deux. C'est ici (comme TOPUP_MAX_EUR_CENTS côté serveur) qu'on les règle.
   *  Le franc Pacifique reçoit l'équivalent exact à la parité fixe, arrondi vers le bas (jamais au-dessus du plafond en euros). */
  var MAX_EUR = { wallet: 200000, business: 500000 }, DAILY_MAX_EUR = 500000;
  function scopeOf(scope) { return scope === "business" ? "business" : "wallet"; }
  function wholeEur(cents) { return new Intl.NumberFormat("fr-FR").format(Math.round(cents / 100)) + " €"; }
  function capIn(eurCents, cur) { return cur === "XPF" ? floorConvert(eurCents, "EUR", "XPF") : eurCents; }
  function limits(currency, scope) {
    var cur = String(currency || "EUR").toUpperCase();
    var minCents = cur === "XPF" ? (scope === "business" ? 1200 : 600) : (scope === "business" ? 1000 : 500);
    return { minCents: minCents, maxCents: capIn(MAX_EUR[scopeOf(scope)], cur), dailyMaxCents: capIn(DAILY_MAX_EUR, cur) };
  }
  function dailyRemaining(currency, usedEur) { return capIn(Math.max(0, DAILY_MAX_EUR - usedEur), String(currency).toUpperCase()); }
  function limitsByCurrency(scope, usedEur, currencies) {
    var out = {};
    (currencies || ["EUR", "XPF"]).forEach(function (cur) {
      var l = limits(cur, scope), rem = dailyRemaining(cur, usedEur);
      out[cur] = { minCents: l.minCents, maxCents: l.maxCents, dailyMaxCents: l.dailyMaxCents, dailyRemainingCents: rem, effectiveMaxCents: Math.min(l.maxCents, rem) };
    });
    return out;
  }

  /* ───────── état ───────── */
  var S = { accounts: {}, cards: [], topups: [], ledger: [], journal: [], notifications: [], intents: {}, keys: {}, seq: 1000 };
  var listeners = [];
  function emit(kind) { listeners.forEach(function (fn) { try { fn(kind); } catch (_) { /* un abonné défaillant ne casse pas le moteur */ } }); }

  function account(id) { var a = S.accounts[id]; if (!a) throw new Error("Compte introuvable."); return a; }
  function topupByRef(reference) { var t = S.topups.filter(function (x) { return x.reference === reference; })[0]; if (!t) throw new Error("Recharge introuvable."); return t; }
  function logAction(actor, action, targetType, targetId, detail) {
    S.journal.unshift({ id: ++S.seq, createdAt: iso(0), actor: actor || "Système", action: action, targetType: targetType, targetId: targetId, detail: detail || null });
  }
  function ledgerAdd(entry) {
    var row = Object.assign({ id: ++S.seq, createdAt: iso(0), status: "completed", feeCents: 0 }, entry);
    S.ledger.unshift(row);
    return row;
  }
  function notify(scopeKey, title, body) {
    S.notifications.unshift({ id: ++S.seq, scopeKey: scopeKey, title: title, body: body, createdAt: iso(0), readAt: null });
  }
  function present(t, balance) {
    return {
      reference: t.reference, status: t.status, amountCents: t.amountCents, currency: t.currency, mode: "sim",
      cardBrand: t.cardBrand, cardLast4: t.cardLast4, failureCode: t.failureCode, failureMessage: t.failureMessage,
      creditedAt: t.creditedAt, refundedAt: t.refundedAt, createdAt: t.createdAt,
      // solde exprimé dans la devise de paiement (le solde affiché suit la devise choisie)
      balanceCents: balance == null ? (S.accounts[t.accountId] ? convert(S.accounts[t.accountId].availableCents, S.accounts[t.accountId].currency, t.currency) : null) : balance,
      businessWalletAccountId: t.scope === "business" ? t.accountId : undefined
    };
  }

  /* — plafond quotidien : recharges des 24 dernières heures d'un même portefeuille, en centimes d'euro — */
  function releaseAbandoned(ownerKey) {
    S.topups.forEach(function (t) {
      if (t.ownerKey === ownerKey && t.status === "pending" && Date.now() - new Date(t.createdAt).getTime() > 10 * 60000) { gateway.cancel(t.piId); t.status = "canceled"; }
    });
  }
  function usedTodayEur(ownerKey) {
    return S.topups.filter(function (t) {
      return t.ownerKey === ownerKey && ["pending", "requires_action", "processing", "succeeded"].indexOf(t.status) >= 0 && Date.now() - new Date(t.createdAt).getTime() < 864e5;
    }).reduce(function (s, t) { return s + eurEq(t.amountCents, t.currency); }, 0);
  }

  /* ───────── passerelle simulée (équivalent de SimGateway) ───────── */
  var gateway = {
    create: function (amountCents, currency, key) {
      if (S.keys[key] && S.intents[S.keys[key]]) return S.keys[key];
      var id = "pi_sim_" + randHex(18).toLowerCase();
      S.intents[id] = { id: id, status: "requires_payment_method", amountCents: amountCents, amountReceivedCents: 0, currency: currency, cardBrand: null, cardLast4: null, failureCode: null, failureMessage: null };
      S.keys[key] = id;
      return id;
    },
    get: function (id) { var i = S.intents[id]; if (!i) throw new Error("Intention de paiement simulée introuvable. Recommence la recharge."); return i; },
    pay: function (id, cardNumber) {
      var i = gateway.get(id);
      if (i.status === "succeeded" || i.status === "canceled") throw new Error("Cette recharge est déjà terminée.");
      var digits = String(cardNumber || "").replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19 || !luhn(digits)) { i.status = "requires_payment_method"; i.failureCode = "incorrect_number"; i.failureMessage = "Le numéro de carte est invalide."; return i; }
      i.cardBrand = brandOf(digits); i.cardLast4 = digits.slice(-4);
      if (DECLINES[digits]) { i.status = "requires_payment_method"; i.failureCode = DECLINES[digits].code; i.failureMessage = DECLINES[digits].message; }
      else if (THREE_DS[digits]) { i.status = "requires_action"; i.failureCode = null; i.failureMessage = null; }
      else { i.status = "succeeded"; i.amountReceivedCents = i.amountCents; i.failureCode = null; i.failureMessage = null; }
      return i;
    },
    authenticate: function (id) {
      var i = gateway.get(id);
      if (i.status !== "requires_action") throw new Error("Aucune validation bancaire n’est attendue pour cette recharge.");
      i.status = "succeeded"; i.amountReceivedCents = i.amountCents; return i;
    },
    cancel: function (id) { var i = S.intents[id]; if (i && i.status !== "succeeded") i.status = "canceled"; }
  };

  /* ───────── règlement d'une recharge (lecture de l'état réel, crédit unique) ───────── */
  function credit(t, intent) {
    if (t.status === "succeeded" || t.status === "refunded") return; // garde : jamais deux crédits
    if (intent.amountReceivedCents !== t.amountCents || intent.currency !== t.currency) {
      logAction("Système", t.scope + ".topup.mismatch", t.scope === "business" ? "business" : "wallet_topup", t.id, { reference: t.reference, paymentIntent: intent.id });
      throw new Error("Le montant encaissé ne correspond pas à la recharge.");
    }
    var acc = account(t.accountId);
    // paiement en XPF sur un compte en EUR (ou l'inverse) : conversion à la parité fixe, aucun risque de change
    var creditCents = convert(t.amountCents, t.currency, acc.currency), converted = t.currency !== acc.currency;
    acc.availableCents += creditCents;
    t.status = "succeeded"; t.creditedAt = iso(0); t.cardBrand = intent.cardBrand; t.cardLast4 = intent.cardLast4; t.failureCode = null; t.failureMessage = null;
    var brand = intent.cardBrand ? intent.cardBrand.charAt(0).toUpperCase() + intent.cardBrand.slice(1) : "Carte";
    ledgerAdd({ accountId: acc.id, type: "topup", direction: "credit", amountCents: creditCents, currency: acc.currency, reference: t.reference, description: "Recharge par carte " + brand + " •••• " + (intent.cardLast4 || "----") + (converted ? " (" + fmt(t.amountCents, t.currency) + ")" : ""), balanceAfterCents: acc.availableCents });
    logAction(t.actor, t.scope + ".topup.credit", t.scope === "business" ? "business" : "wallet_topup", t.id, { reference: t.reference, amountCents: t.amountCents, currency: t.currency, paymentIntent: t.piId, mode: "sim" });
    notify(acc.ownerKey, "Recharge créditée", "Votre recharge de " + fmt(t.amountCents, t.currency) + " a été créditée sur " + acc.label + ".");
  }
  function settle(t) {
    if (t.status === "succeeded" || t.status === "refunded" || t.status === "canceled") return t;
    var intent = gateway.get(t.piId);
    if (intent.status === "succeeded") credit(t, intent);
    else if (intent.status === "requires_action") { t.status = "requires_action"; t.cardBrand = intent.cardBrand; t.cardLast4 = intent.cardLast4; }
    else if (intent.status === "canceled") t.status = "canceled";
    else if (intent.failureCode) { t.status = "failed"; t.failureCode = intent.failureCode; t.failureMessage = intent.failureMessage; t.cardBrand = intent.cardBrand; t.cardLast4 = intent.cardLast4; }
    return t;
  }

  /* ───────── API asynchrone (mêmes noms que les procédures du serveur) ───────── */
  var api = {
    limits: limits,
    limitsByCurrency: limitsByCurrency,
    dailyRemaining: dailyRemaining,
    fmt: fmt,
    divisor: divisor,
    convert: convert,
    floorConvert: floorConvert,
    canConvert: canConvert,
    eurEq: eurEq,
    RATE: EUR_XPF_RATE,
    SYMBOLS: SYMBOLS,

    /** Configuration de la recharge. Wallet perso : un compte unique, devise de paiement `opts.currency` (EUR ou XPF).
     *  Wallet Pro : tous les comptes de l'entreprise, plafonds fournis pour chaque devise de paiement. */
    config: function (scope, opts) {
      opts = opts || {};
      var accs = Object.keys(S.accounts).map(function (k) { return S.accounts[k]; }).filter(function (a) { return a.scope === scope && a.ownerKey === opts.ownerKey; });
      var primary = accs[0];
      var currency = opts.currency || (primary && primary.currency) || "EUR";
      if (scope === "wallet" && primary && !canConvert(currency, primary.currency)) return Promise.reject(new Error("Ce wallet est en " + primary.currency + " : une recharge en " + currency + " n’est pas disponible."));
      releaseAbandoned(opts.ownerKey);
      var used = usedTodayEur(opts.ownerKey);
      var byCurrency = limitsByCurrency(scope, used, scope === "wallet" ? ["EUR", "XPF"] : ["EUR", "XPF", "USD"]);
      var l = byCurrency[currency] || byCurrency.EUR;
      if (scope === "wallet") accs = primary ? [primary] : [];
      return wait(jitter(80, 180)).then(function () {
        return {
          enabled: true, mode: "sim", publishableKey: null, fallback: true,
          reason: "Prototype : les paiements sont simulés dans cette page. Aucune carte réelle n’est lue et aucune clé Stripe n’existe ici.",
          currency: currency, accountCurrency: primary ? primary.currency : currency,
          minCents: l.minCents, maxCents: l.maxCents, dailyMaxCents: l.dailyMaxCents, dailyRemainingCents: l.dailyRemainingCents, effectiveMaxCents: l.effectiveMaxCents, limitsByCurrency: byCurrency,
          balanceCents: primary ? convert(primary.availableCents, primary.currency, currency) : 0, walletAccountId: primary ? primary.id : null,
          accounts: accs.map(function (a) { return { id: a.id, label: a.label, currency: a.currency, availableBalanceCents: a.availableCents, payableCurrencies: a.currency === "USD" ? ["USD"] : ["EUR", "XPF"] }; }),
          cards: S.cards.filter(function (c) { return accs.some(function (a) { return a.id === c.accountId; }); }).map(function (c) { return { id: c.id, label: c.label, lastFour: c.lastFour, network: c.network, status: c.status, businessWalletAccountId: c.accountId }; })
        };
      });
    },

    create: function (input) {
      return wait(jitter(120, 260)).then(function () {
        var acc = account(input.accountId);
        var P = input.currency || acc.currency;   // devise de paiement : celle du compte, ou EUR ↔ XPF converti à la parité fixe
        if (!canConvert(P, acc.currency)) throw new Error("Ce compte est en " + acc.currency + " : une recharge en " + P + " n’est pas disponible (seuls l’euro et le franc Pacifique sont convertibles).");
        var lim = limits(P, acc.scope);
        if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Le montant de la recharge doit être un entier positif.");
        if (input.amountCents < lim.minCents) throw new Error("Montant minimum par recharge : " + fmt(lim.minCents, P) + ".");
        if (input.amountCents > lim.maxCents) throw new Error("Montant maximum par recharge : " + fmt(lim.maxCents, P) + (P === "XPF" ? " (" + wholeEur(MAX_EUR[scopeOf(acc.scope)]) + ")" : "") + ".");
        var existing = S.topups.filter(function (t) { return t.idempotencyKey === input.idempotencyKey; })[0];
        if (existing) {
          if (existing.amountCents !== input.amountCents || existing.accountId !== acc.id || existing.currency !== P) throw new Error("Cette clé d’idempotence a déjà été utilisée pour une autre recharge.");
          return Object.assign(present(existing), { clientSecret: existing.status === "pending" ? "sim_secret" : null, replayed: true });
        }
        releaseAbandoned(acc.ownerKey);
        var remaining = dailyRemaining(P, usedTodayEur(acc.ownerKey));
        if (input.amountCents > remaining) throw new Error(remaining <= 0 ? "Plafond quotidien atteint : " + wholeEur(DAILY_MAX_EUR) + " de recharges par 24 h. Réessaie plus tard." : "Plafond quotidien : il te reste " + fmt(remaining, P) + " de recharge sur 24 h (" + wholeEur(DAILY_MAX_EUR) + " maximum par jour).");
        var pi = gateway.create(input.amountCents, P, input.idempotencyKey);
        var t = {
          id: ++S.seq, scope: acc.scope, reference: makeRef("TOP"), idempotencyKey: input.idempotencyKey, accountId: acc.id, accountLabel: acc.label,
          ownerKey: acc.ownerKey, who: input.who || acc.ownerName, detail: input.detail || acc.ownerDetail || "", actor: input.actor || acc.ownerName,
          billingName: input.billingName || null, amountCents: input.amountCents, currency: P, status: "pending", piId: pi,
          cardBrand: null, cardLast4: null, failureCode: null, failureMessage: null, createdAt: iso(0), creditedAt: null, refundedAt: null, refundReason: null
        };
        S.topups.unshift(t);
        logAction(t.actor, acc.scope + ".topup.create", acc.scope === "business" ? "business" : "wallet_topup", t.id, { reference: t.reference, amountCents: t.amountCents, currency: t.currency, mode: "sim" });
        emit("topup");
        return Object.assign(present(t), { clientSecret: "sim_secret", replayed: false });
      });
    },

    simPay: function (reference, cardNumber) {
      return wait(jitter(350, 700)).then(function () {
        var t = topupByRef(reference);
        gateway.pay(t.piId, cardNumber);
        settle(t);
        emit("topup");
        return present(t);
      });
    },
    simAuthenticate: function (reference) {
      return wait(jitter(500, 900)).then(function () {
        var t = topupByRef(reference);
        gateway.authenticate(t.piId);
        settle(t);
        emit("topup");
        return present(t);
      });
    },
    confirm: function (reference) {
      return wait(jitter(120, 260)).then(function () {
        var t = topupByRef(reference);
        settle(t);
        emit("topup");
        return present(t);
      });
    },

    listMine: function (scope, ownerKey, limit) {
      return wait(jitter(60, 140)).then(function () {
        return S.topups.filter(function (t) { return t.scope === scope && t.ownerKey === ownerKey; }).slice(0, limit || 20).map(function (t) { return present(t); });
      });
    },
    transactions: function (ownerKey, limit) {
      var ids = Object.keys(S.accounts).filter(function (k) { return S.accounts[k].ownerKey === ownerKey; }).map(Number);
      return wait(jitter(60, 140)).then(function () {
        return S.ledger.filter(function (l) { return ids.indexOf(l.accountId) >= 0; }).slice(0, limit || 50);
      });
    },

    /* — administration (Dashboard) — */
    stripeStatus: function () {
      return wait(jitter(60, 140)).then(function () {
        return {
          enabled: true, mode: "sim", publishableKey: null, fallback: true, requestedMode: "auto", liveUnlocked: false,
          reason: "Prototype publié : le simulateur remplace Stripe. Les vraies clés restent sur le serveur (apps/api/.env.local) et ne sont jamais envoyées à un navigateur.",
          publishableKeyHint: null, secretKeyKind: null, realKeysUsable: false, hasWebhookSecret: false, webhookPath: "/api/stripe/webhook",
          limits: {
            wallet: { eur: { perRechargeCents: MAX_EUR.wallet, dailyCents: DAILY_MAX_EUR }, xpf: { perRechargeCents: capIn(MAX_EUR.wallet, "XPF"), dailyCents: capIn(DAILY_MAX_EUR, "XPF") } },
            business: { eur: { perRechargeCents: MAX_EUR.business, dailyCents: DAILY_MAX_EUR }, xpf: { perRechargeCents: capIn(MAX_EUR.business, "XPF"), dailyCents: capIn(DAILY_MAX_EUR, "XPF") } }
          }
        };
      });
    },
    adminList: function (filter) {
      filter = filter || {};
      return wait(jitter(80, 180)).then(function () {
        return S.topups.filter(function (t) { return !filter.status || t.status === filter.status; }).map(function (t) {
          return { id: t.id, key: t.scope + "-" + t.id, scope: t.scope, reference: t.reference, createdAt: t.createdAt, creditedAt: t.creditedAt, refundedAt: t.refundedAt, refundReason: t.refundReason,
            who: t.who, detail: t.detail, accountLabel: t.accountLabel, amountCents: t.amountCents, currency: t.currency, status: t.status, mode: "sim", cardBrand: t.cardBrand, cardLast4: t.cardLast4,
            failureCode: t.failureCode, failureMessage: t.failureMessage, paymentIntentId: t.piId, billingName: t.billingName };
        });
      });
    },
    adminReconcile: function (reference, actor) {
      return wait(jitter(200, 400)).then(function () {
        var t = topupByRef(reference);
        settle(t);
        logAction(actor, t.scope + ".topup.reconcile", t.scope === "business" ? "business" : "wallet_topup", t.id, { reference: reference, status: t.status });
        emit("topup");
        return present(t);
      });
    },
    adminCancel: function (reference, actor) {
      return wait(jitter(200, 400)).then(function () {
        var t = topupByRef(reference);
        if (t.status !== "pending" && t.status !== "requires_action") throw new Error("Seule une recharge en attente peut être annulée.");
        gateway.cancel(t.piId);
        t.status = "canceled";
        logAction(actor, t.scope + ".topup.cancel", t.scope === "business" ? "business" : "wallet_topup", t.id, { reference: reference });
        emit("topup");
        return present(t);
      });
    },
    adminRefund: function (reference, reason, actor) {
      return wait(jitter(300, 600)).then(function () {
        var t = topupByRef(reference);
        if (!reason || reason.trim().length < 8) throw new Error("Une justification d’au moins huit caractères est requise.");
        if (t.status !== "succeeded") throw new Error("Seule une recharge créditée peut être remboursée.");
        var acc = account(t.accountId);
        var debitCents = convert(t.amountCents, t.currency, acc.currency);
        if (acc.availableCents < debitCents) throw new Error("Solde disponible insuffisant.");
        acc.availableCents -= debitCents;
        ledgerAdd({ accountId: acc.id, type: t.scope === "business" ? "refund" : "adjustment", direction: "debit", amountCents: debitCents, currency: acc.currency, reference: makeRef("RFD"), description: "Remboursement de la recharge " + t.reference, balanceAfterCents: acc.availableCents });
        t.status = "refunded"; t.refundedAt = iso(0); t.refundReason = reason.trim();
        logAction(actor, t.scope + ".topup.refund", t.scope === "business" ? "business" : "wallet_topup", t.id, { reference: reference, amountCents: t.amountCents, reason: reason.trim() });
        notify(acc.ownerKey, "Recharge remboursée", "Votre recharge de " + fmt(t.amountCents, t.currency) + " a été remboursée sur votre carte.");
        emit("topup");
        return present(t);
      });
    },

    /* — Wallet Pro : interventions du Dashboard (même logique que packages/business/src/service.ts) — */
    validateIban: validateIban,
    validateBic: validateBic,
    generatedIban: generatedIban,
    groupIban: groupIban,
    addAccount: function (a) { var id = a.id || ++S.seq; S.accounts[id] = Object.assign({ iban: null, bic: null, status: "active", reservedCents: 0 }, a, { id: id }); return S.accounts[id]; },
    addCard: function (c) { var id = c.id || ++S.seq; var card = Object.assign({ status: "active", network: "visa" }, c, { id: id }); S.cards.push(card); return card; },
    /** Génère un RIB valide pour un compte qui n'en a pas (provisionnement automatique). */
    adminGenerateBank: function (accountId, actor) {
      var a = account(accountId);
      if (a.iban) throw new Error("Ce compte a déjà un RIB : utilise « Remplacer le RIB ».");
      a.iban = generatedIban(a.id, a.scope); a.bic = a.scope === "business" ? "VTEXFRPPXXX" : "BNPAFRPPXXX";
      logAction(actor, "business.wallet.provision_bank_details", "business_wallet_account", a.id, { ibanLast4: a.iban.slice(-4) });
      emit("bank"); return a;
    },
    /** Attribue ou remplace le RIB d'un compte (IBAN MOD 97, BIC, motif ≥ 8 caractères — administrateur uniquement). */
    adminAssignBank: function (accountId, iban, bic, reason, actor) {
      if (!reason || reason.trim().length < 8) throw new Error("Le motif RIB doit contenir au moins huit caractères.");
      var nextIban = validateIban(iban), nextBic = validateBic(bic), a = account(accountId), previous = a.iban;
      a.iban = nextIban; a.bic = nextBic;
      logAction(actor, previous ? "admin.business.bank_details_rotate" : "admin.business.bank_details_assign", "business_wallet_account", a.id, { ibanLast4: nextIban.slice(-4), bic: nextBic, previousIbanLast4: previous ? previous.slice(-4) : null, reason: reason.trim() });
      emit("bank"); return a;
    },
    adminRevokeBank: function (accountId, reason, actor) {
      if (!reason || reason.trim().length < 8) throw new Error("Le motif de révocation doit contenir au moins huit caractères.");
      var a = account(accountId), previous = a.iban;
      if (!previous) throw new Error("Ce compte n’a aucun RIB à retirer.");
      a.iban = null; a.bic = null;
      logAction(actor, "admin.business.bank_details_revoke", "business_wallet_account", a.id, { previousIbanLast4: previous.slice(-4), reason: reason.trim() });
      emit("bank"); return a;
    },
    /** Met à jour le solde d'un compte (donc de ses cartes) : delta signé en unité mineure du compte, justification ≥ 8 caractères. */
    adminAdjust: function (accountId, deltaCents, reason, actor) {
      var a = account(accountId);
      if (!Number.isSafeInteger(deltaCents) || deltaCents === 0) throw new Error("Saisis un montant qui modifie le solde.");
      if (!reason || reason.trim().length < 8) throw new Error("Une justification d’au moins huit caractères est requise.");
      if (a.availableCents + deltaCents < 0) throw new Error("Solde disponible insuffisant.");
      a.availableCents += deltaCents;
      ledgerAdd({ accountId: a.id, type: "adjustment", direction: deltaCents > 0 ? "credit" : "debit", amountCents: Math.abs(deltaCents), currency: a.currency, reference: makeRef("ADJ"), description: "Ajustement — " + reason.trim(), balanceAfterCents: a.availableCents });
      logAction(actor, a.scope === "business" ? "admin.business.balance_adjust" : "wallet.adjust", a.scope === "business" ? "business_wallet_account" : "wallet", a.id, { deltaCents: deltaCents, reason: reason.trim() });
      emit("balance"); return a;
    },

    /* — accès direct à l'état (rendu synchrone dans les démos) — */
    state: S,
    account: function (id) { return account(id); },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    logAction: logAction,
    ledgerAdd: ledgerAdd,
    notify: notify,
    makeRef: makeRef,
    iso: iso,
    wait: wait
  };

  /** Amorçage : accounts {id,scope,label,currency,availableCents,ownerKey,ownerName,ownerDetail}, cards, topups, ledger, journal, notifications. */
  api.init = function (seed) {
    S.accounts = {};
    (seed.accounts || []).forEach(function (a) { S.accounts[a.id] = Object.assign({}, a); });
    S.cards = (seed.cards || []).slice();
    S.ledger = (seed.ledger || []).map(function (l) { return Object.assign({ id: ++S.seq, status: "completed", feeCents: 0 }, l); });
    S.journal = (seed.journal || []).slice();
    S.notifications = (seed.notifications || []).slice();
    S.topups = (seed.topups || []).map(function (t) {
      var pi = "pi_sim_" + randHex(18).toLowerCase();
      var intent = { id: pi, status: t.status === "succeeded" || t.status === "refunded" ? "succeeded" : t.status === "requires_action" ? "requires_action" : t.status === "canceled" ? "canceled" : t.status === "failed" ? "requires_payment_method" : "requires_payment_method", amountCents: t.amountCents, amountReceivedCents: t.status === "succeeded" || t.status === "refunded" ? t.amountCents : 0, currency: t.currency, cardBrand: t.cardBrand || null, cardLast4: t.cardLast4 || null, failureCode: t.failureCode || null, failureMessage: t.failureMessage || null };
      S.intents[pi] = intent;
      return Object.assign({ id: ++S.seq, reference: makeRef("TOP"), idempotencyKey: "seed:" + randHex(12), piId: pi, refundedAt: null, refundReason: null, creditedAt: null, failureCode: null, failureMessage: null, billingName: null }, t);
    });
    emit("init");
  };

  global.VtexCore = api;
})(window);
