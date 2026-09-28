/* Wallet personnel — serveur de démonstration en mémoire.
 * Remplace fetch("/api/trpc/…") pour que l'application Wallet réelle (index.html, vtex-api.js, topup.js) tourne
 * telle quelle dans une page publiée : connexion, OTP, solde, cartes, virements, objectifs, recharge par carte. */
(function () {
  "use strict";
  var C = window.VtexCore;
  var ME = { id: 1, firstName: "Ariel", lastName: "Kouadio", email: "ariel.kouadio@vtex.app", role: "user", avatarUrl: null, kycVerified: true, createdAt: "2025-03-12T09:00:00.000Z" };
  var OWNER = "ariel";
  var seq = 500;
  var cardsState = [
    { id: 1, label: "Compte courant", network: "visa", lastFour: "4821", cardholderName: "ARIEL KOUADIO", expiresAt: "2029-08-31T00:00:00.000Z", status: "active", onlinePaymentsEnabled: true, contactlessEnabled: true, cashWithdrawalEnabled: false, dailyLimitCents: 200000, perTransactionLimitCents: 100000, monthlyLimitCents: 800000 },
    { id: 2, label: "Cagnotte voyages", network: "mastercard", lastFour: "7734", cardholderName: "ARIEL KOUADIO", expiresAt: "2028-03-31T00:00:00.000Z", status: "active", onlinePaymentsEnabled: true, contactlessEnabled: false, cashWithdrawalEnabled: false, dailyLimitCents: 150000, perTransactionLimitCents: 80000, monthlyLimitCents: 500000 }
  ];
  var beneficiaries = [
    { id: 1, fullName: "SCI Résidence des Palmiers", iban: "FR7630004028320001234567890", bic: "BNPAFRPP", internalWalletAccountId: null },
    { id: 2, fullName: "Selego SAS", iban: "FR7612739000502134567890123", bic: "CMCIFRPP", internalWalletAccountId: 11 },
    { id: 3, fullName: "Amina Diallo", iban: "FR7630006000011234567890189", bic: "AGRIFRPP", internalWalletAccountId: 12 }
  ];
  var goals = [
    { id: 1, name: "Vacances Marrakech", targetCents: 150000, currentCents: 102000, currency: "EUR", status: "active", dueAt: "2026-12-31T00:00:00.000Z" },
    { id: 2, name: "Fonds d'urgence", targetCents: 500000, currentCents: 185000, currency: "EUR", status: "active", dueAt: null },
    { id: 3, name: "MacBook Studio", targetCents: 250000, currentCents: 210000, currency: "EUR", status: "active", dueAt: "2026-11-30T00:00:00.000Z" }
  ];

  C.init({
    accounts: [
      { id: 1, scope: "wallet", label: "Mon compte Wallet · EUR", currency: "EUR", availableCents: 1248065, ownerKey: OWNER, ownerName: "Ariel Kouadio", ownerDetail: ME.email },
      { id: 11, scope: "wallet", label: "Selego SAS", currency: "EUR", availableCents: 0, ownerKey: "selego", ownerName: "Selego SAS", ownerDetail: "" },
      { id: 12, scope: "wallet", label: "Amina Diallo", currency: "EUR", availableCents: 0, ownerKey: "amina", ownerName: "Amina Diallo", ownerDetail: "" }
    ],
    ledger: [
      { accountId: 1, type: "transfer_in", direction: "credit", amountCents: 250000, currency: "EUR", reference: "TRF-9A41C2E07B55D318", description: "Virement reçu — Selego SAS", createdAt: C.iso(60 * 5) },
      { accountId: 1, type: "card_payment", direction: "debit", amountCents: 12490, currency: "EUR", reference: "PAY-41E8B0C3D9A2F7E1", description: "Amazon — Périphériques", createdAt: C.iso(60 * 3) },
      { accountId: 1, type: "transfer_out", direction: "debit", amountCents: 78000, currency: "EUR", reference: "TRF-5C0D7A3E19B4F268", description: "Virement — Loyer SCI Résidence des Palmiers", status: "pending", createdAt: C.iso(60 * 2) },
      { accountId: 1, type: "card_payment", direction: "debit", amountCents: 1890, currency: "EUR", reference: "PAY-7D2A94F0E61B3C58", description: "Café Boulevard", createdAt: C.iso(60 * 26) },
      { accountId: 1, type: "transfer_in", direction: "credit", amountCents: 45000, currency: "EUR", reference: "TRF-0B7E3A912C5D48F6", description: "Remboursement — Amina Diallo", createdAt: C.iso(60 * 50) },
      { accountId: 1, type: "card_payment", direction: "debit", amountCents: 6490, currency: "EUR", reference: "PAY-C81F5B0A7E349D26", description: "Abonnement Fibre Pro", createdAt: C.iso(60 * 74) },
      { accountId: 1, type: "topup", direction: "credit", amountCents: 20000, currency: "EUR", reference: "TOP-D3B7A80E5C214F96", description: "Recharge par carte Visa •••• 4242", createdAt: C.iso(60 * 98) }
    ],
    notifications: [
      { id: 1, scopeKey: OWNER, title: "Virement reçu", body: "Selego SAS vous a envoyé 2 500,00 €.", createdAt: C.iso(60 * 5), readAt: null },
      { id: 2, scopeKey: OWNER, title: "Paiement par carte", body: "Amazon — Périphériques · 124,90 €.", createdAt: C.iso(60 * 3), readAt: null },
      { id: 3, scopeKey: OWNER, title: "Sécurité", body: "Nouvelle connexion depuis un appareil de confiance.", createdAt: C.iso(60 * 30), readAt: null }
    ],
    topups: [
      { scope: "wallet", accountId: 1, accountLabel: "Mon compte Wallet · EUR", ownerKey: OWNER, who: "Ariel Kouadio", detail: ME.email, actor: "Ariel Kouadio", amountCents: 20000, currency: "EUR", status: "succeeded", cardBrand: "visa", cardLast4: "4242", createdAt: C.iso(60 * 98), creditedAt: C.iso(60 * 98) }
    ]
  });

  function state() { return C.state; }
  function txRows() {
    return state().ledger.filter(function (l) { return l.accountId === 1; }).map(function (l) {
      return { id: l.id, reference: l.reference, type: l.type, direction: l.direction, amountCents: l.amountCents, currency: l.currency, status: l.status, description: l.description, createdAt: l.createdAt };
    });
  }
  function accountRow() {
    var a = C.account(1);
    return { id: 1, currency: "EUR", availableBalanceCents: a.availableCents, reservedBalanceCents: 0, status: "active", iban: "FR76 3000 4028 3200 0123 4567 890", bic: "BNPAFRPP" };
  }
  function wallet(currency) {
    var found = Object.keys(state().accounts).map(function (k) { return state().accounts[k]; }).filter(function (a) { return a.ownerKey === OWNER && a.currency === currency; })[0];
    if (found) return found;
    var id = 100 + Object.keys(state().accounts).length;
    state().accounts[id] = { id: id, scope: "wallet", label: "Mon compte Wallet · " + currency, currency: currency, availableCents: 0, ownerKey: OWNER, ownerName: "Ariel Kouadio", ownerDetail: ME.email };
    return state().accounts[id];
  }
  function requireAmount(cents) { if (!(cents > 0)) throw new Error("Le montant doit être strictement positif."); }
  function debit(cents, entry) {
    var a = C.account(1);
    if (a.availableCents < cents) throw new Error("Solde disponible insuffisant.");
    a.availableCents -= cents;
    return C.ledgerAdd(Object.assign({ accountId: 1, direction: "debit", amountCents: cents, currency: "EUR", balanceAfterCents: a.availableCents }, entry));
  }
  function goal(id) { var g = goals.filter(function (x) { return x.id === id; })[0]; if (!g) throw new Error("Objectif introuvable."); return g; }
  function card(id) { var c = cardsState.filter(function (x) { return x.id === id; })[0]; if (!c) throw new Error("Carte introuvable."); return c; }

  var H = {
    "auth.login": function () { return { userId: 1 }; },
    "auth.devPeekOtp": function () { return { code: "246810" }; },
    "users.getMe": function () { return ME; },
    "users.updateMe": function (i) { Object.assign(ME, i || {}); return ME; },
    "wallets.bootstrap": function () {
      return { user: ME, account: accountRow(), cards: cardsState, transactions: txRows(), beneficiaries: beneficiaries, savingsGoals: goals };
    },
    "notifications.listMine": function () { return state().notifications.filter(function (n) { return n.scopeKey === OWNER; }); },
    "notifications.markRead": function (i) { state().notifications.forEach(function (n) { if (n.id === i.notificationId) n.readAt = C.iso(0); }); return { ok: true }; },
    "settings.get": function () { return { platformName: "VTEX" }; },
    "documents.listMine": function () { return []; },
    "documents.submitTransferProof": function () { return { ok: true }; },
    "auth.listSessions": function () { return [{ id: 1, device: "VTEX Wallet Web", createdAt: C.iso(30) }]; },
    "auth.webauthnListCredentials": function () { return []; },
    "cards.setPin": function () { return { pinConfigured: true }; },
    "cards.setFrozen": function (i) { card(i.cardId).status = i.frozen ? "frozen" : "active"; return { ok: true }; },
    "cards.updateControls": function (i) { var c = card(i.cardId); ["onlinePaymentsEnabled", "contactlessEnabled", "cashWithdrawalEnabled"].forEach(function (k) { if (typeof i[k] === "boolean") c[k] = i[k]; }); return { ok: true }; },
    "beneficiaries.create": function (i) {
      var b = { id: ++seq, fullName: i.fullName, iban: i.iban, bic: i.bic || null, internalWalletAccountId: i.internalWalletAccountId || null }; beneficiaries.push(b); return b;
    },
    "beneficiaries.update": function (i) {
      var b = beneficiaries.filter(function (x) { return x.id === i.id; })[0]; if (!b) throw new Error("Bénéficiaire introuvable.");
      b.fullName = i.fullName; b.iban = i.iban; b.bic = i.bic || null; b.internalWalletAccountId = i.internalWalletAccountId || null; return b;
    },
    "beneficiaries.delete": function (i) { beneficiaries = beneficiaries.filter(function (x) { return x.id !== i.id; }); return { ok: true }; },
    "transactions.transferExternal": function (i) {
      requireAmount(i.amountCents);
      var b = beneficiaries.filter(function (x) { return x.id === i.beneficiaryId; })[0]; if (!b) throw new Error("Bénéficiaire introuvable.");
      var row = debit(i.amountCents, { type: "transfer_out", status: "pending", reference: C.makeRef("TRF"), description: i.description ? i.description + " — " + b.fullName : "Virement — " + b.fullName });
      return { reference: row.reference, status: "pending" };
    },
    "transactions.shareFunds": function (i) {
      var total = i.recipients.reduce(function (s, r) { return s + r.amountCents; }, 0); requireAmount(total);
      var row = debit(total, { type: "transfer_out", reference: C.makeRef("SHR"), description: i.description || "Partage de fonds" });
      return { reference: row.reference, status: "completed" };
    },
    "transactions.listMine": function (i) { return { items: txRows().slice(0, (i && i.limit) || 20) }; },
    "savingsGoals.create": function (i) { var g = { id: ++seq, name: i.name, targetCents: i.targetCents, currentCents: 0, currency: "EUR", status: "active", dueAt: i.dueAt || null }; goals.push(g); return g; },
    "savingsGoals.fund": function (i) {
      requireAmount(i.amountCents); var g = goal(i.goalId);
      debit(i.amountCents, { type: "savings_fund", reference: C.makeRef("SAV"), description: "Objectif d’épargne — " + g.name });
      g.currentCents += i.amountCents; return g;
    },
    "savingsGoals.update": function (i) { var g = goal(i.goalId); if (i.name) g.name = i.name; if (i.targetCents) g.targetCents = i.targetCents; g.dueAt = i.dueAt || null; return g; },
    "savingsGoals.close": function (i) {
      var g = goal(i.goalId); var a = C.account(1); a.availableCents += g.currentCents;
      C.ledgerAdd({ accountId: 1, type: "savings_release", direction: "credit", amountCents: g.currentCents, currency: "EUR", reference: C.makeRef("SAV"), description: "Objectif clôturé — " + g.name, balanceAfterCents: a.availableCents });
      g.currentCents = 0; g.status = "archived"; return g;
    },

    /* — recharge par carte : mêmes procédures que le vrai routeur — */
    /* Le wallet est un compte unique en euros : la devise de paiement (EUR ou XPF) est convertie à la parité fixe au crédit. */
    "topups.config": function (i) {
      var cur = (i && i.currency) || "EUR";
      return C.config("wallet", { ownerKey: OWNER, currency: cur }).then(function (cfg) {
        cfg.cards = cardsState.map(function (c) { return { id: c.id, label: c.label, lastFour: c.lastFour, network: c.network, status: c.status }; });
        return cfg;
      });
    },
    "topups.create": function (i) {
      return C.create({ accountId: 1, currency: i.currency || "EUR", amountCents: i.amountCents, idempotencyKey: i.idempotencyKey, who: "Ariel Kouadio", detail: ME.email, actor: "Ariel Kouadio" });
    },
    "topups.confirm": function (i) { return C.confirm(i.reference); },
    "topups.listMine": function (i) { return C.listMine("wallet", OWNER, i && i.limit); },
    "topups.simPay": function (i) { return C.simPay(i.reference, i.cardNumber); },
    "topups.simAuthenticate": function (i) { return C.simAuthenticate(i.reference); }
  };

  function reply(status, body) {
    return new Response(JSON.stringify(body), { status: status, headers: { "content-type": "application/json" } });
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = ((init && init.method) || "GET").toUpperCase();
    var m = /\/api\/trpc\/([A-Za-z0-9_.]+)(\?.*)?$/.exec(url);
    if (m) {
      var name = m[1];
      var payload = null;
      try {
        if (method === "GET" && m[2]) { var raw = new URLSearchParams(m[2].slice(1)).get("input"); payload = raw ? JSON.parse(raw).json : null; }
        else if (init && init.body) payload = JSON.parse(init.body).json;
      } catch (_) { payload = null; }
      var handler = H[name];
      if (!handler) return Promise.resolve(reply(404, { error: { json: { message: "Cette fonction n’est pas incluse dans le prototype (" + name + ")." } } }));
      return new Promise(function (resolve) {
        var run;
        try { run = Promise.resolve(handler(payload)); } catch (error) { run = Promise.reject(error); }
        var finish = function (fn) { setTimeout(fn, 60); };
        run.then(function (data) { finish(function () { resolve(reply(200, { result: { data: { json: data } } })); }); },
          function (error) { finish(function () { resolve(reply(400, { error: { json: { message: error && error.message ? error.message : "Erreur." } } })); }); });
      });
    }
    if (/\/api\/auth\/verify-otp/.test(url)) return Promise.resolve(reply(200, { success: true }));
    if (/\/api\/(media|events)/.test(url)) return Promise.resolve(reply(404, { error: "Non disponible dans le prototype." }));
    return realFetch ? realFetch(input, init) : Promise.reject(new Error("Réseau indisponible dans le prototype."));
  };
  window.EventSource = function () { this.addEventListener = function () {}; this.close = function () {}; };
})();
