/* Dashboard d'administration — données d'exemple (utilisateurs, wallets, entreprises, recharges, journal…).
 * Toutes les valeurs sont fictives. */
(function (global) {
  "use strict";
  var C = global.VtexCore;
  var m = function (n) { return C.iso(n); };            // il y a n minutes
  var h = function (n) { return C.iso(n * 60); };
  var d = function (n) { return C.iso(n * 60 * 24); };
  var eur = function (v) { return Math.round(v * 100); };

  var USERS = [
    { id: 1, first: "Ariel", last: "Kouadio", email: "ariel.kouadio@vtex.app", role: "admin", status: "active", kyc: true, joined: "12 mars 2025", city: "Abidjan", balance: 1248065 },
    { id: 2, first: "Amina", last: "Diallo", email: "amina.diallo@mail.com", role: "user", status: "active", kyc: true, joined: "2 avr. 2025", city: "Dakar", balance: 385040 },
    { id: 3, first: "Léa", last: "Martin", email: "lea.martin@mail.com", role: "user", status: "active", kyc: true, joined: "19 mai 2025", city: "Lyon", balance: 92010 },
    { id: 4, first: "Yanis", last: "Boulé", email: "yanis.boule@vtex.app", role: "agent", status: "active", kyc: true, joined: "3 juin 2025", city: "Paris", balance: 0 },
    { id: 5, first: "Neema", last: "Okafor", email: "neema.okafor@mail.com", role: "user", status: "pending", kyc: false, joined: "8 sept. 2026", city: "Lagos", balance: 0 },
    { id: 6, first: "Tomás", last: "Herrera", email: "tomas.herrera@mail.com", role: "user", status: "active", kyc: true, joined: "22 juil. 2025", city: "Madrid", balance: 210500 },
    { id: 7, first: "Sofia", last: "Ricci", email: "sofia.ricci@mail.com", role: "user", status: "suspended", kyc: true, joined: "1 août 2025", city: "Milan", balance: 15000 },
    { id: 8, first: "Kwame", last: "Mensah", email: "kwame.mensah@mail.com", role: "user", status: "active", kyc: true, joined: "14 août 2025", city: "Accra", balance: 640800 },
    { id: 9, first: "Chloé", last: "Bernard", email: "chloe.bernard@mail.com", role: "user", status: "active", kyc: true, joined: "30 août 2025", city: "Nantes", balance: 48800 },
    { id: 10, first: "Ibrahim", last: "Traoré", email: "ibrahim.traore@mail.com", role: "user", status: "active", kyc: false, joined: "5 sept. 2025", city: "Bamako", balance: 12300 },
    { id: 11, first: "Hana", last: "Sato", email: "hana.sato@mail.com", role: "user", status: "active", kyc: true, joined: "17 sept. 2025", city: "Paris", balance: 720400 },
    { id: 12, first: "Kevin", last: "Massou", email: "kevin@selego.fr", role: "user", status: "active", kyc: true, joined: "6 oct. 2025", city: "Lyon", balance: 154000 }
  ];
  var BUSINESSES = [
    { id: 1, brand: "Selego", legal: "SAS Selego", owner: "Kevin Massou", industry: "Design & formation", status: "active", created: "6 oct. 2025", members: 5, accts: [["Compte principal", 8420000, "EUR"], ["Paiements en ligne", 4189000, "EUR"], ["Payouts fournisseurs", 1240000, "EUR"]] },
    { id: 2, brand: "Atelier Nomade", legal: "Atelier Nomade SARL", owner: "Marie Tessier", industry: "Artisanat", status: "active", created: "18 nov. 2025", members: 3, accts: [["Compte principal", 1265000, "EUR"]] },
    { id: 3, brand: "Marlow & Fils", legal: "Marlow & Fils SA", owner: "Paul Marlow", industry: "Négoce", status: "active", created: "2 janv. 2026", members: 8, accts: [["Compte principal", 3320000, "EUR"], ["Trésorerie USD", 910000, "USD"]] },
    { id: 4, brand: "Zenith", legal: "Zenith Ltd.", owner: "Ola Adeyemi", industry: "Logiciel", status: "suspended", created: "9 mars 2026", members: 2, accts: [["Compte principal", 245000, "EUR"]] },
    { id: 5, brand: "Studio Kora", legal: "Studio Kora SAS", owner: "Inès Robert", industry: "Agence créative", status: "active", created: "21 mai 2026", members: 4, accts: [["Compte principal", 618000, "EUR"]] }
  ];

  var accounts = [], cards = [];
  USERS.forEach(function (u) {
    accounts.push({ id: 1000 + u.id, scope: "wallet", label: "Compte Wallet EUR", currency: "EUR", availableCents: u.balance, ownerKey: "u" + u.id, ownerName: u.first + " " + u.last, ownerDetail: u.email });
    if (u.balance > 0) cards.push({ id: 1000 + u.id, accountId: 1000 + u.id, label: "Carte virtuelle VTEX", lastFour: String(4000 + u.id * 137).slice(-4), network: u.id % 2 ? "visa" : "mastercard", status: u.status === "suspended" ? "frozen" : "active" });
  });
  BUSINESSES.forEach(function (b) {
    b.accts.forEach(function (a, i) {
      var accId = 2000 + b.id * 10 + i;
      // le compte principal de chaque entreprise a un RIB ; les comptes secondaires n'en ont pas encore (à attribuer depuis le Dashboard)
      accounts.push({ id: accId, scope: "business", label: a[0], currency: a[2], availableCents: a[1], ownerKey: "b" + b.id, ownerName: b.brand, ownerDetail: b.legal, iban: i === 0 ? C.generatedIban(accId, "business") : null, bic: i === 0 ? "VTEXFRPPXXX" : null });
      cards.push({ id: 3000 + b.id * 10 + i, accountId: accId, label: a[0], lastFour: String(2000 + (b.id * 10 + i) * 811).slice(-4), network: i % 2 ? "mastercard" : "visa", status: b.status === "suspended" ? "frozen" : "active" });
    });
  });

  function wt(uid, amount, status, when, extra) {
    var u = USERS.filter(function (x) { return x.id === uid; })[0];
    return Object.assign({ scope: "wallet", accountId: 1000 + uid, accountLabel: "Compte Wallet EUR", ownerKey: "u" + uid, who: u.first + " " + u.last, detail: u.email, actor: u.first + " " + u.last, amountCents: eur(amount), currency: "EUR", status: status, createdAt: when, creditedAt: status === "succeeded" || status === "refunded" ? when : null }, extra || {});
  }
  function bt(bid, amount, status, when, actor, extra) {
    var b = BUSINESSES.filter(function (x) { return x.id === bid; })[0];
    return Object.assign({ scope: "business", accountId: 2000 + bid * 10, accountLabel: b.accts[0][0], ownerKey: "b" + bid, who: b.brand, detail: "par " + actor + " · " + b.legal, actor: actor, amountCents: eur(amount), currency: "EUR", status: status, createdAt: when, creditedAt: status === "succeeded" || status === "refunded" ? when : null, billingName: b.legal }, extra || {});
  }
  var TOPUPS = [
    wt(3, 50, "pending", m(4)),
    bt(3, 1500, "requires_action", m(11), "Paul Marlow", { cardBrand: "visa", cardLast4: "3184" }),
    wt(8, 200, "succeeded", m(38), { cardBrand: "visa", cardLast4: "4242" }),
    bt(1, 2000, "succeeded", h(3), "Kevin Massou", { cardBrand: "mastercard", cardLast4: "4444" }),
    wt(2, 80, "failed", h(5), { cardBrand: "visa", cardLast4: "9995", failureCode: "insufficient_funds", failureMessage: "Fonds insuffisants sur la carte." }),
    wt(11, 300, "succeeded", h(8), { cardBrand: "mastercard", cardLast4: "5100" }),
    bt(5, 1200, "succeeded", h(20), "Inès Robert", { cardBrand: "visa", cardLast4: "4242" }),
    wt(6, 120, "refunded", d(1), { cardBrand: "visa", cardLast4: "4242", refundedAt: h(20), refundReason: "Doublon de paiement signalé par le client" }),
    bt(2, 800, "failed", d(1), "Marie Tessier", { cardBrand: "visa", cardLast4: "0002", failureCode: "card_declined", failureMessage: "Ta banque a décliné la transaction." }),
    wt(1, 100, "succeeded", d(2), { cardBrand: "visa", cardLast4: "4242" }),
    wt(9, 25, "canceled", d(2)),
    bt(3, 2000, "succeeded", d(3), "Paul Marlow", { cardBrand: "visa", cardLast4: "4242" }),
    wt(12, 500, "succeeded", d(4), { cardBrand: "mastercard", cardLast4: "4444" }),
    wt(10, 40, "failed", d(5), { cardBrand: "visa", cardLast4: "0069", failureCode: "expired_card", failureMessage: "La carte est expirée." })
  ];

  var LEDGER = [
    { accountId: 1001, type: "transfer_in", direction: "credit", amountCents: 250000, currency: "EUR", reference: "TRF-9A41C2E07B55D318", description: "Virement reçu — Selego SAS", createdAt: h(5) },
    { accountId: 1001, type: "card_payment", direction: "debit", amountCents: 12490, currency: "EUR", reference: "PAY-41E8B0C3D9A2F7E1", description: "Amazon — Périphériques", createdAt: h(3) },
    { accountId: 1002, type: "transfer_out", direction: "debit", amountCents: 20000, currency: "EUR", reference: "TRF-5C0D7A3E19B4F268", description: "Virement — Loyer", createdAt: h(30) },
    { accountId: 1008, type: "card_payment", direction: "debit", amountCents: 4500, currency: "EUR", reference: "PAY-7D2A94F0E61B3C58", description: "Supermarché Accra", createdAt: h(9) },
    { accountId: 1011, type: "transfer_in", direction: "credit", amountCents: 150000, currency: "EUR", reference: "TRF-0B7E3A912C5D48F6", description: "Virement reçu — Studio Kora", createdAt: h(50) }
  ];

  var JOURNAL = [
    { id: 1, createdAt: m(2), actor: "Ariel Kouadio", action: "user.update", targetType: "user", targetId: 7, detail: { status: "suspended" } },
    { id: 2, createdAt: m(25), actor: "Yanis Boulé", action: "wallet.adjust", targetType: "wallet", targetId: 1011, detail: { deltaCents: 5000, reason: "Geste commercial ticket SUP-204" } },
    { id: 3, createdAt: h(2), actor: "Système", action: "session.login", targetType: "user", targetId: 1, detail: { device: "VTEX Core Dashboard Web" } },
    { id: 4, createdAt: h(6), actor: "Ariel Kouadio", action: "card.freeze", targetType: "card", targetId: 1007, detail: { reason: "Activité suspecte" } },
    { id: 5, createdAt: h(9), actor: "Yanis Boulé", action: "document.validate", targetType: "document", targetId: 3, detail: { title: "Justificatif de domicile" } },
    { id: 6, createdAt: h(14), actor: "Ariel Kouadio", action: "business.status", targetType: "business", targetId: 4, detail: { status: "suspended" } },
    { id: 7, createdAt: d(1), actor: "Système", action: "payout.approve", targetType: "transaction", targetId: 118, detail: { reference: "PY-118" } },
    { id: 8, createdAt: d(2), actor: "Ariel Kouadio", action: "settings.update", targetType: "settings", targetId: 1, detail: { key: "platformName" } }
  ];

  var DOCS = [
    { id: 1, title: "Pièce d’identité", user: "Neema Okafor", type: "KYC", status: "pending", date: "Il y a 20 min", file: "cni-okafor.pdf" },
    { id: 2, title: "Justificatif de virement", user: "Amina Diallo", type: "Virement", status: "pending", date: "Il y a 2 h", file: "virement-2609.png" },
    { id: 3, title: "Justificatif de domicile", user: "Ibrahim Traoré", type: "KYC", status: "validated", date: "Il y a 9 h", file: "facture-edf.pdf" },
    { id: 4, title: "Kbis", user: "Zenith Ltd.", type: "KYB", status: "rejected", date: "Hier", file: "kbis-zenith.pdf" },
    { id: 5, title: "Relevé d’identité bancaire", user: "Studio Kora", type: "KYB", status: "validated", date: "Il y a 2 j", file: "rib-kora.pdf" }
  ];
  var LEADS = [
    { id: 1, name: "Camille Roux", company: "Boulangerie Roux", source: "Site web", status: "new", value: eur(1200), date: "Il y a 1 h" },
    { id: 2, name: "Ousmane Ba", company: "Ba Transport", source: "Recommandation", status: "contacted", value: eur(4800), date: "Il y a 5 h" },
    { id: 3, name: "Julia Petit", company: "Petit Studio", source: "Salon", status: "qualified", value: eur(9600), date: "Hier" },
    { id: 4, name: "Marc Dubois", company: "Dubois & Co", source: "Site web", status: "lost", value: eur(2200), date: "Il y a 3 j" }
  ];
  var NOTIFS = [
    { id: 1, title: "Maintenance programmée dimanche 2 h", audience: "Tous les utilisateurs", channel: "In-app + e-mail", sent: "Il y a 2 j", reach: 12 },
    { id: 2, title: "Nouveau : rechargez votre wallet par carte", audience: "Wallets personnels", channel: "In-app", sent: "Il y a 3 j", reach: 10 },
    { id: 3, title: "Vérifiez votre identité pour lever les plafonds", audience: "KYC incomplet", channel: "E-mail", sent: "Il y a 6 j", reach: 2 }
  ];
  var TICKETS = [
    { id: "SUP-207", subject: "Ma recharge de 50 € est restée en attente", user: "Léa Martin", priority: "high", status: "open", date: "Il y a 4 min", thread: [["u", "Bonjour, j’ai rechargé 50 € par carte il y a quelques minutes et mon solde n’a pas bougé.", "Il y a 4 min"]] },
    { id: "SUP-204", subject: "Geste commercial — retard de virement", user: "Studio Kora", priority: "medium", status: "resolved", date: "Hier", thread: [["u", "Notre virement a pris 3 jours.", "Hier"], ["a", "Nous avons crédité 50 € de geste commercial. Merci pour votre patience.", "Hier"]] },
    { id: "SUP-201", subject: "Changer le plafond de ma carte", user: "Kwame Mensah", priority: "low", status: "open", date: "Il y a 2 j", thread: [["u", "Je voudrais passer mon plafond journalier à 2 000 €.", "Il y a 2 j"]] }
  ];

  C.init({ accounts: accounts, cards: cards, ledger: LEDGER, journal: JOURNAL, topups: TOPUPS });

  global.DashData = { USERS: USERS, BUSINESSES: BUSINESSES, DOCS: DOCS, LEADS: LEADS, NOTIFS: NOTIFS, TICKETS: TICKETS, eur: eur };
})(window);
