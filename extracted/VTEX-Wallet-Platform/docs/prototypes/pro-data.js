/* Wallet Pro — données d'exemple (entreprise fictive « Selego SAS ») et définition des modules génériques.
 * Toutes les valeurs sont des exemples : aucune donnée réelle. */
(function (global) {
  "use strict";
  var C = global.VtexCore;
  var OWNER = "selego";
  var h = function (n) { return C.iso(n * 60); };   // il y a n heures
  var d = function (n) { return C.iso(n * 60 * 24); }; // il y a n jours

  C.init({
    accounts: [
      { id: 201, scope: "business", label: "Compte principal", currency: "EUR", availableCents: 8420000, ownerKey: OWNER, ownerName: "Selego SAS", ownerDetail: "SAS Selego" },
      { id: 202, scope: "business", label: "Paiements en ligne", currency: "EUR", availableCents: 4189000, ownerKey: OWNER, ownerName: "Selego SAS", ownerDetail: "SAS Selego" },
      { id: 203, scope: "business", label: "Payouts fournisseurs", currency: "EUR", availableCents: 1240000, ownerKey: OWNER, ownerName: "Selego SAS", ownerDetail: "SAS Selego" },
      { id: 204, scope: "business", label: "Trésorerie USD", currency: "USD", availableCents: 1835000, ownerKey: OWNER, ownerName: "Selego SAS", ownerDetail: "SAS Selego" },
      { id: 205, scope: "business", label: "Trésorerie Pacifique", currency: "XPF", availableCents: 4180000, ownerKey: OWNER, ownerName: "Selego SAS", ownerDetail: "SAS Selego" }
    ],
    cards: [
      { id: 301, accountId: 201, label: "Compte principal", lastFour: "2280", network: "visa", status: "active", theme: "navy", holder: "SELEGO SAS", expiry: "09/28" },
      { id: 302, accountId: 202, label: "Paiements en ligne", lastFour: "6614", network: "mastercard", status: "active", theme: "teal", holder: "SELEGO SAS", expiry: "05/27" },
      { id: 303, accountId: 203, label: "Payouts fournisseurs", lastFour: "3390", network: "mastercard", status: "active", theme: "brick", holder: "SELEGO SAS", expiry: "01/29" },
      { id: 304, accountId: 205, label: "Trésorerie Pacifique", lastFour: "5108", network: "visa", status: "active", theme: "teal", holder: "SELEGO SAS", expiry: "11/28" }
    ],
    ledger: [
      { accountId: 201, type: "invoice_payment", direction: "credit", amountCents: 450000, currency: "EUR", reference: "INV-2045", description: "Règlement facture INV-2045 — Ademola B.", createdAt: h(0.4) },
      { accountId: 203, type: "payout", direction: "debit", amountCents: 120000, currency: "EUR", reference: "PY-118", description: "Payout PY-118 — Alice Perez", createdAt: h(1.5) },
      { accountId: 202, type: "subscription", direction: "credit", amountCents: 89000, currency: "EUR", reference: "SUB-0312", description: "Abonnement mensuel — Neema Corp.", createdAt: h(4) },
      { accountId: 202, type: "payment", direction: "credit", amountCents: 24900, currency: "EUR", reference: "PAY-88214", description: "Paiement en ligne — commande #4471", createdAt: h(5.5) },
      { accountId: 202, type: "chargeback", direction: "debit", amountCents: 32000, currency: "EUR", reference: "CB-4021", description: "Chargeback Visa — TX-4021", status: "pending", createdAt: h(7) },
      { accountId: 201, type: "payment", direction: "credit", amountCents: 156000, currency: "EUR", reference: "PAY-88190", description: "Lien de paiement — Formation Design System", createdAt: h(26) },
      { accountId: 203, type: "payout", direction: "debit", amountCents: 340000, currency: "EUR", reference: "PY-117", description: "Payout PY-117 — Atelier Nomade", createdAt: h(30) },
      { accountId: 201, type: "topup", direction: "credit", amountCents: 200000, currency: "EUR", reference: "TOP-1A2B3C4D5E6F7081", description: "Recharge par carte Mastercard •••• 4444", createdAt: d(2) },
      { accountId: 204, type: "payment", direction: "credit", amountCents: 240000, currency: "USD", reference: "PAY-USD-771", description: "Encaissement USD — Northwind Ltd.", createdAt: d(3) },
      { accountId: 201, type: "fee", direction: "debit", amountCents: 4900, currency: "EUR", reference: "FEE-0921", description: "Frais de plateforme — septembre", createdAt: d(4) }
    ],
    topups: [
      { scope: "business", accountId: 201, accountLabel: "Compte principal", ownerKey: OWNER, who: "Selego SAS", detail: "par Kevin Massou · SAS Selego", actor: "Kevin Massou", amountCents: 200000, currency: "EUR", status: "succeeded", cardBrand: "mastercard", cardLast4: "4444", createdAt: d(2), creditedAt: d(2) }
    ]
  });

  [201, 202, 203, 204, 205].forEach(function (id) { var a = C.account(id); a.iban = C.generatedIban(id, "business"); a.bic = "VTEXFRPPXXX"; });

  /* ───── navigation (mêmes 10 groupes que l'application réelle) ───── */
  var NAV = [
    { k: "Finance", items: [
      { id: "topup", label: "Recharger", icon: "plus", live: true, cta: true },
      { id: "wallet", label: "Wallet", icon: "wallet" }, { id: "transactions", label: "Transactions", icon: "list" },
      { id: "transfers", label: "Transferts", icon: "arrows" }, { id: "payouts", label: "Payouts", icon: "send" } ] },
    { k: "Payments", items: [
      { id: "checkout", label: "Checkout", icon: "basket" }, { id: "payment-links", label: "Payment Links", icon: "link", live: true },
      { id: "payment-buttons", label: "Payment Buttons", icon: "button" }, { id: "pos", label: "POS", icon: "pos" } ] },
    { k: "Sales", items: [
      { id: "invoices", label: "Invoices", icon: "invoice", live: true }, { id: "estimates", label: "Estimates", icon: "quote" },
      { id: "subscriptions", label: "Subscriptions", icon: "cycle" }, { id: "orders", label: "Orders", icon: "orders" }, { id: "products", label: "Products", icon: "box" } ] },
    { k: "Customers", items: [{ id: "customers", label: "Customers", icon: "people" }] },
    { k: "Analytics", items: [
      { id: "analytics", label: "Overview", icon: "chart" }, { id: "analytics-sales", label: "Sales", icon: "chartline" },
      { id: "analytics-customers", label: "Customers", icon: "people" }, { id: "reports", label: "Reports", icon: "file" } ] },
    { k: "Resolution", items: [
      { id: "disputes", label: "Disputes", icon: "flag" }, { id: "chargebacks", label: "Chargebacks", icon: "back" }, { id: "risk", label: "Risk", icon: "shield" } ] },
    { k: "Team", items: [
      { id: "team-users", label: "Users", icon: "team", live: true }, { id: "roles", label: "Roles", icon: "role" },
      { id: "permissions", label: "Permissions", icon: "lock" }, { id: "approvals", label: "Approvals", icon: "check" } ] },
    { k: "Developers", items: [
      { id: "api-keys", label: "API Keys", icon: "key" }, { id: "apps", label: "Applications", icon: "apps" },
      { id: "webhooks", label: "Webhooks", icon: "hook" }, { id: "sandbox", label: "Sandbox", icon: "sandbox" } ] },
    { k: "Settings", items: [
      { id: "settings-business", label: "Business", icon: "building" }, { id: "settings-finance", label: "Finance", icon: "coins" },
      { id: "settings-security", label: "Security", icon: "lock" }, { id: "settings-team", label: "Team", icon: "team" },
      { id: "settings-notifications", label: "Notifications", icon: "bell" }, { id: "settings-integrations", label: "Integrations", icon: "plug" } ] }
  ];

  /* ───── modules génériques : kpis + tableau + création + actions de ligne ───── */
  var eur = function (v) { return Math.round(v * 100); };
  var MODS = {
    transfers: {
      title: "Transferts", lede: "Déplace des fonds entre les comptes de l'entreprise. Chaque transfert écrit deux lignes au ledger.",
      kpis: [{ l: "Transferts ce mois", v: "14", h: "vs 11 en août", t: "up", d: "+3" }, { l: "Volume déplacé", v: "212 400 €", h: "tous comptes", t: "nt", d: "€" }],
      cols: [{ k: "ref", l: "Référence", kind: "mono" }, { k: "from", l: "De" }, { k: "to", l: "Vers" }, { k: "amt", l: "Montant", kind: "money" }, { k: "status", l: "Statut", kind: "badge" }, { k: "date", l: "Date" }],
      rows: [
        { ref: "TRF-7A21", from: "Paiements en ligne", to: "Compte principal", amt: eur(20000), cur: "EUR", status: "completed", date: "Il y a 2 j" },
        { ref: "TRF-7A18", from: "Compte principal", to: "Payouts fournisseurs", amt: eur(15000), cur: "EUR", status: "completed", date: "Il y a 5 j" },
        { ref: "TRF-7A09", from: "Compte principal", to: "Paiements en ligne", amt: eur(5000), cur: "EUR", status: "completed", date: "Il y a 9 j" }
      ],
      custom: "transfer"
    },
    checkout: {
      title: "Checkout", lede: "Sessions de paiement hébergées : suivi du taux de conversion et des abandons.",
      kpis: [{ l: "Sessions (30 j)", v: "1 402", h: "1 284 payées", t: "up", d: "+8,1 %" }, { l: "Conversion", v: "91,5 %", h: "objectif 90 %", t: "up", d: "+1,2 pt" }, { l: "Abandons", v: "118", h: "relances envoyées", t: "dn", d: "−4 %" }],
      cols: [{ k: "ref", l: "Session", kind: "mono" }, { k: "cust", l: "Client" }, { k: "amt", l: "Montant", kind: "money" }, { k: "method", l: "Moyen" }, { k: "status", l: "Statut", kind: "badge" }, { k: "date", l: "Date" }],
      rows: [
        { ref: "cs_9d21", cust: "Ademola B.", amt: eur(4500), cur: "EUR", method: "Carte Visa", status: "paid", date: "Il y a 20 min" },
        { ref: "cs_9d1f", cust: "Neema Corp.", amt: eur(890), cur: "EUR", method: "Prélèvement SEPA", status: "paid", date: "Il y a 4 h" },
        { ref: "cs_9d1a", cust: "Zenith Ltd.", amt: eur(240), cur: "EUR", method: "Carte Mastercard", status: "open", date: "Il y a 6 h" },
        { ref: "cs_9d10", cust: "Léa Martin", amt: eur(59), cur: "EUR", method: "Carte Visa", status: "expired", date: "Hier" }
      ]
    },
    "payment-links": {
      title: "Payment Links", lede: "Génère une URL de paiement à partager, pour un montant fixe ou libre.",
      kpis: [{ l: "Liens actifs", v: "6", h: "2 créés cette semaine", t: "up", d: "+2" }, { l: "Encaissé via liens", v: "12 480 €", h: "30 derniers jours", t: "up", d: "+9,7 %" }],
      cols: [{ k: "title", l: "Lien", sub: "url" }, { k: "amt", l: "Montant", kind: "money" }, { k: "uses", l: "Paiements", kind: "num" }, { k: "status", l: "Statut", kind: "badge" }, { k: "date", l: "Créé" }],
      rows: [
        { title: "Formation Design System", url: "pay.vtex.app/l/dsx3z", amt: eur(1560), cur: "EUR", uses: 34, status: "active", date: "Il y a 3 sem." },
        { title: "Consultation 1 h", url: "pay.vtex.app/l/k71qa", amt: eur(120), cur: "EUR", uses: 18, status: "active", date: "Il y a 2 sem." },
        { title: "Don libre — atelier", url: "pay.vtex.app/l/m0b2f", amt: 0, cur: "EUR", uses: 9, status: "active", date: "Il y a 5 j" },
        { title: "Pré-commande carnet", url: "pay.vtex.app/l/z9c4t", amt: eur(29), cur: "EUR", uses: 61, status: "expired", date: "Il y a 2 mois" }
      ],
      create: { label: "Nouveau lien", title: "Créer un lien de paiement", fields: [{ id: "title", l: "Intitulé", ph: "Ex. Atelier du samedi" }, { id: "amt", l: "Montant en € (0 = libre)", ph: "0", num: true }],
        make: function (v) { return { title: v.title || "Lien sans titre", url: "pay.vtex.app/l/" + Math.random().toString(36).slice(2, 7), amt: eur(Number(String(v.amt || 0).replace(",", ".")) || 0), cur: "EUR", uses: 0, status: "active", date: "À l’instant" }; } },
      actions: [{ l: "Désactiver", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "expired"; return "Lien désactivé."; } }, { l: "Copier le lien", run: function (r) { return "Lien copié : " + r.url; } }]
    },
    "payment-buttons": {
      title: "Payment Buttons", lede: "Boutons de paiement à intégrer sur ton site, sans code serveur.",
      kpis: [{ l: "Boutons publiés", v: "3", h: "sur 2 domaines", t: "nt", d: "actifs" }],
      cols: [{ k: "name", l: "Bouton" }, { k: "site", l: "Site" }, { k: "amt", l: "Montant", kind: "money" }, { k: "clicks", l: "Clics", kind: "num" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ name: "Acheter le guide", site: "selego.fr", amt: eur(19), cur: "EUR", clicks: 842, status: "active" }, { name: "Réserver une place", site: "selego.fr/ateliers", amt: eur(45), cur: "EUR", clicks: 311, status: "active" }, { name: "Soutenir le projet", site: "selego.fr/soutien", amt: 0, cur: "EUR", clicks: 96, status: "draft" }]
    },
    pos: {
      title: "POS", lede: "Terminaux de paiement en boutique et sur événement.",
      kpis: [{ l: "Terminaux", v: "2", h: "1 en ligne", t: "nt", d: "en service" }, { l: "Encaissé (7 j)", v: "3 240 €", h: "88 tickets", t: "up", d: "+6 %" }],
      cols: [{ k: "name", l: "Terminal" }, { k: "place", l: "Emplacement" }, { k: "today", l: "Aujourd'hui", kind: "money" }, { k: "seen", l: "Dernière activité" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ name: "POS-01", place: "Boutique Lyon", today: eur(612), cur: "EUR", seen: "Il y a 3 min", status: "active" }, { name: "POS-02", place: "Stand marché", today: 0, cur: "EUR", seen: "Il y a 2 j", status: "expired" }]
    },
    invoices: {
      title: "Invoices", lede: "Compose, envoie et suis le cycle Brouillon → Envoyée → Payée. Marquer une facture payée crédite le compte principal.",
      kpis: [{ l: "À encaisser", v: "17 260 €", h: "5 factures ouvertes", t: "dn", d: "3 en retard" }, { l: "Payées (30 j)", v: "38 900 €", h: "22 factures", t: "up", d: "+12 %" }],
      cols: [{ k: "ref", l: "N°", kind: "mono" }, { k: "cust", l: "Client" }, { k: "amt", l: "Montant", kind: "money" }, { k: "due", l: "Échéance" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [
        { ref: "INV-2046", cust: "Zenith Ltd.", amt: eur(4200), cur: "EUR", due: "12 oct.", status: "sent" },
        { ref: "INV-2044", cust: "Marlow & Fils", amt: eur(3120), cur: "EUR", due: "2 oct.", status: "overdue" },
        { ref: "INV-2043", cust: "Neema Corp.", amt: eur(890), cur: "EUR", due: "30 sept.", status: "overdue" },
        { ref: "INV-2042", cust: "Atelier Nomade", amt: eur(6350), cur: "EUR", due: "28 sept.", status: "overdue" },
        { ref: "INV-2047", cust: "Léa Martin", amt: eur(2700), cur: "EUR", due: "20 oct.", status: "draft" },
        { ref: "INV-2045", cust: "Ademola B.", amt: eur(4500), cur: "EUR", due: "—", status: "paid" }
      ],
      create: { label: "Nouvelle facture", title: "Créer une facture", fields: [{ id: "cust", l: "Client", ph: "Ex. Studio Kora" }, { id: "amt", l: "Montant en €", ph: "1200", num: true }],
        make: function (v, mod) { return { ref: "INV-" + (2048 + mod.rows.length - 6), cust: v.cust || "Client", amt: eur(Number(String(v.amt || 0).replace(",", ".")) || 0), cur: "EUR", due: "30 jours", status: "draft" }; } },
      actions: [
        { l: "Envoyer", show: function (r) { return r.status === "draft"; }, run: function (r) { r.status = "sent"; return "Facture " + r.ref + " envoyée à " + r.cust + "."; } },
        { l: "Marquer payée", show: function (r) { return r.status === "sent" || r.status === "overdue"; }, run: function (r) {
          var a = C.account(201); a.availableCents += r.amt;
          C.ledgerAdd({ accountId: 201, type: "invoice_payment", direction: "credit", amountCents: r.amt, currency: "EUR", reference: r.ref, description: "Règlement facture " + r.ref + " — " + r.cust, balanceAfterCents: a.availableCents });
          r.status = "paid"; return "Règlement enregistré : " + C.fmt(r.amt, "EUR") + " crédités sur le compte principal."; } },
        { l: "Annuler", show: function (r) { return r.status !== "paid" && r.status !== "cancelled"; }, run: function (r) { r.status = "cancelled"; return "Facture annulée."; } }
      ]
    },
    estimates: {
      title: "Estimates", lede: "Devis envoyés aux clients, convertibles en facture.",
      kpis: [{ l: "Devis ouverts", v: "4", h: "9 800 € potentiels", t: "nt", d: "en attente" }, { l: "Taux d'acceptation", v: "62 %", h: "90 derniers jours", t: "up", d: "+5 pts" }],
      cols: [{ k: "ref", l: "N°", kind: "mono" }, { k: "cust", l: "Client" }, { k: "amt", l: "Montant", kind: "money" }, { k: "valid", l: "Valide jusqu'au" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ ref: "EST-118", cust: "Studio Kora", amt: eur(3400), cur: "EUR", valid: "15 oct.", status: "sent" }, { ref: "EST-117", cust: "Marlow & Fils", amt: eur(2100), cur: "EUR", valid: "10 oct.", status: "accepted" }, { ref: "EST-116", cust: "Zenith Ltd.", amt: eur(4300), cur: "EUR", valid: "1 oct.", status: "declined" }, { ref: "EST-119", cust: "Neema Corp.", amt: eur(1200), cur: "EUR", valid: "30 oct.", status: "draft" }],
      actions: [{ l: "Convertir en facture", show: function (r) { return r.status === "accepted"; }, run: function (r) { r.status = "converted"; return "Devis " + r.ref + " converti en facture."; } }, { l: "Marquer accepté", show: function (r) { return r.status === "sent"; }, run: function (r) { r.status = "accepted"; return "Devis accepté."; } }]
    },
    subscriptions: {
      title: "Subscriptions", lede: "Abonnements récurrents et leurs prochains renouvellements.",
      kpis: [{ l: "MRR", v: "9 480 €", h: "revenu mensuel récurrent", t: "up", d: "+4,2 %" }, { l: "Abonnés actifs", v: "37", h: "2 en pause", t: "up", d: "+3" }],
      cols: [{ k: "ref", l: "Abonnement", kind: "mono" }, { k: "cust", l: "Client" }, { k: "plan", l: "Formule" }, { k: "amt", l: "Montant", kind: "money" }, { k: "next", l: "Prochain prélèvement" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ ref: "SUB-0312", cust: "Neema Corp.", plan: "Pro mensuel", amt: eur(890), cur: "EUR", next: "24 oct.", status: "active" }, { ref: "SUB-0308", cust: "Studio Kora", plan: "Équipe annuel", amt: eur(2400), cur: "EUR", next: "3 janv.", status: "active" }, { ref: "SUB-0301", cust: "Marlow & Fils", plan: "Pro mensuel", amt: eur(890), cur: "EUR", next: "—", status: "paused" }],
      actions: [{ l: "Mettre en pause", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "paused"; return "Abonnement en pause."; } }, { l: "Réactiver", show: function (r) { return r.status === "paused"; }, run: function (r) { r.status = "active"; return "Abonnement réactivé."; } }, { l: "Résilier", show: function (r) { return r.status !== "cancelled"; }, run: function (r) { r.status = "cancelled"; return "Abonnement résilié."; } }]
    },
    orders: {
      title: "Orders", lede: "Commandes issues de la boutique et des liens de paiement.",
      kpis: [{ l: "Commandes (30 j)", v: "486", h: "panier moyen 143,50 €", t: "up", d: "+8 %" }, { l: "À expédier", v: "12", h: "délai moyen 1,4 j", t: "nt", d: "en cours" }],
      cols: [{ k: "ref", l: "Commande", kind: "mono" }, { k: "cust", l: "Client" }, { k: "amt", l: "Montant", kind: "money" }, { k: "items", l: "Articles", kind: "num" }, { k: "status", l: "Statut", kind: "badge" }, { k: "date", l: "Date" }],
      rows: [{ ref: "#4471", cust: "Léa Martin", amt: eur(249), cur: "EUR", items: 2, status: "paid", date: "Il y a 5 h" }, { ref: "#4470", cust: "Ademola B.", amt: eur(1560), cur: "EUR", items: 1, status: "fulfilled", date: "Hier" }, { ref: "#4468", cust: "Zenith Ltd.", amt: eur(320), cur: "EUR", items: 4, status: "pending", date: "Hier" }],
      actions: [{ l: "Marquer expédiée", show: function (r) { return r.status === "paid" || r.status === "pending"; }, run: function (r) { r.status = "fulfilled"; return "Commande expédiée."; } }, { l: "Rembourser", show: function (r) { return r.status === "paid" || r.status === "fulfilled"; }, run: function (r) { r.status = "refunded"; return "Commande remboursée."; } }]
    },
    products: {
      title: "Products", lede: "Catalogue vendu via Checkout, liens et boutons.",
      kpis: [{ l: "Produits actifs", v: "9", h: "1 archivé", t: "nt", d: "catalogue" }],
      cols: [{ k: "name", l: "Produit" }, { k: "sku", l: "SKU", kind: "mono" }, { k: "amt", l: "Prix", kind: "money" }, { k: "stock", l: "Stock", kind: "num" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ name: "Formation Design System", sku: "FDS-01", amt: eur(1560), cur: "EUR", stock: 999, status: "active" }, { name: "Carnet Selego", sku: "CRN-02", amt: eur(29), cur: "EUR", stock: 214, status: "active" }, { name: "Consultation 1 h", sku: "CST-01", amt: eur(120), cur: "EUR", stock: 999, status: "active" }, { name: "Poster série 3", sku: "PST-03", amt: eur(45), cur: "EUR", stock: 0, status: "archived" }],
      actions: [{ l: "Archiver", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "archived"; return "Produit archivé."; } }, { l: "Réactiver", show: function (r) { return r.status === "archived"; }, run: function (r) { r.status = "active"; return "Produit réactivé."; } }]
    },
    customers: {
      title: "Customers", lede: "Ton portefeuille clients, avec leur encours et leur historique.",
      kpis: [{ l: "Clients", v: "312", h: "87 nouveaux (30 j)", t: "up", d: "+19" }, { l: "Encours", v: "17 260 €", h: "factures ouvertes", t: "dn", d: "3 en retard" }],
      cols: [{ k: "name", l: "Client", sub: "email" }, { k: "spent", l: "Total payé", kind: "money" }, { k: "orders", l: "Commandes", kind: "num" }, { k: "since", l: "Client depuis" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ name: "Neema Corp.", email: "compta@neema.co", spent: eur(10680), cur: "EUR", orders: 12, since: "mars 2025", status: "active" }, { name: "Ademola B.", email: "ademola@mail.com", spent: eur(6060), cur: "EUR", orders: 4, since: "juin 2025", status: "active" }, { name: "Zenith Ltd.", email: "ap@zenith.io", spent: eur(1240), cur: "EUR", orders: 3, since: "sept. 2026", status: "active" }, { name: "Marlow & Fils", email: "contact@marlow.fr", spent: eur(9800), cur: "EUR", orders: 9, since: "janv. 2025", status: "blocked" }],
      actions: [{ l: "Bloquer", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "blocked"; return r.name + " bloqué."; } }, { l: "Débloquer", show: function (r) { return r.status === "blocked"; }, run: function (r) { r.status = "active"; return r.name + " débloqué."; } }]
    },
    "analytics-sales": { title: "Analytics · Ventes", lede: "Évolution des ventes par produit et par canal.", chart: { title: "Ventes par mois (k€)", data: [["avr", 18], ["mai", 22], ["juin", 21], ["juil", 27], ["août", 30], ["sept", 34]] }, list: { title: "Meilleurs produits", rows: [["Formation Design System", "51 200 €"], ["Consultation 1 h", "21 600 €"], ["Carnet Selego", "6 206 €"]] } },
    "analytics-customers": { title: "Analytics · Clients", lede: "Acquisition, rétention et valeur client.", chart: { title: "Nouveaux clients par mois", data: [["avr", 42], ["mai", 51], ["juin", 47], ["juil", 63], ["août", 68], ["sept", 87]] }, list: { title: "Canaux d'acquisition", rows: [["Liens de paiement", "38 %"], ["Site web (boutons)", "31 %"], ["Recommandation", "19 %"], ["Autre", "12 %"]] } },
    reports: {
      title: "Reports", lede: "Exports comptables et rapports périodiques.",
      kpis: [{ l: "Rapports générés", v: "24", h: "ce trimestre", t: "nt", d: "T3" }],
      cols: [{ k: "name", l: "Rapport" }, { k: "period", l: "Période" }, { k: "fmt", l: "Format", kind: "mono" }, { k: "date", l: "Généré" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ name: "Grand livre", period: "Septembre 2026", fmt: "CSV", date: "Il y a 2 j", status: "ready" }, { name: "TVA collectée", period: "T3 2026", fmt: "PDF", date: "Il y a 5 j", status: "ready" }, { name: "Rapprochement bancaire", period: "Août 2026", fmt: "XLSX", date: "Il y a 3 sem.", status: "ready" }],
      create: { label: "Générer un rapport", title: "Générer un rapport", fields: [{ id: "name", l: "Rapport", ph: "Ex. Encaissements" }, { id: "period", l: "Période", ph: "Octobre 2026" }], make: function (v) { return { name: v.name || "Rapport", period: v.period || "Octobre 2026", fmt: "CSV", date: "À l’instant", status: "ready" }; } }
    },
    disputes: {
      title: "Disputes", lede: "Litiges clients à traiter avant leur échéance.",
      kpis: [{ l: "Litiges ouverts", v: "1", h: "échéance dans 5 j", t: "dn", d: "à traiter" }],
      cols: [{ k: "ref", l: "Dossier", kind: "mono" }, { k: "cust", l: "Client" }, { k: "amt", l: "Montant", kind: "money" }, { k: "reason", l: "Motif" }, { k: "due", l: "Échéance" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ ref: "DSP-031", cust: "Marlow & Fils", amt: eur(320), cur: "EUR", reason: "Produit non reçu", due: "5 j", status: "open" }, { ref: "DSP-029", cust: "Léa Martin", amt: eur(59), cur: "EUR", reason: "Débit en double", due: "—", status: "won" }],
      actions: [{ l: "Soumettre les preuves", show: function (r) { return r.status === "open"; }, run: function (r) { r.status = "under_review"; return "Preuves transmises : dossier en revue."; } }, { l: "Accepter le litige", show: function (r) { return r.status === "open"; }, run: function (r) { r.status = "lost"; return "Litige accepté."; } }]
    },
    chargebacks: {
      title: "Chargebacks", lede: "Rétrofacturations bancaires reçues sur les paiements par carte.",
      kpis: [{ l: "Taux de chargeback", v: "0,08 %", h: "seuil réseau 0,9 %", t: "up", d: "sain" }],
      cols: [{ k: "ref", l: "Chargeback", kind: "mono" }, { k: "tx", l: "Transaction", kind: "mono" }, { k: "amt", l: "Montant", kind: "money" }, { k: "network", l: "Réseau" }, { k: "due", l: "Réponse avant" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ ref: "CB-4021", tx: "TX-4021", amt: eur(320), cur: "EUR", network: "Visa", due: "5 j", status: "open" }],
      actions: [{ l: "Contester", show: function (r) { return r.status === "open"; }, run: function (r) { r.status = "under_review"; return "Contestation envoyée à l'acquéreur."; } }]
    },
    risk: {
      title: "Risk", lede: "Score de risque et règles de blocage automatique.",
      kpis: [{ l: "Score de risque", v: "Sain", h: "0 alerte automatique", t: "up", d: "42 / 100" }, { l: "Paiements bloqués", v: "3", h: "30 derniers jours", t: "nt", d: "règles" }],
      cols: [{ k: "rule", l: "Règle" }, { k: "trig", l: "Déclenchements", kind: "num" }, { k: "action", l: "Action" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ rule: "Carte étrangère > 2 000 €", trig: 2, action: "Revue manuelle", status: "active" }, { rule: "3 échecs en 10 min", trig: 1, action: "Blocage 1 h", status: "active" }, { rule: "Pays à risque élevé", trig: 0, action: "Refus", status: "disabled" }],
      actions: [{ l: "Désactiver", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "disabled"; return "Règle désactivée."; } }, { l: "Activer", show: function (r) { return r.status === "disabled"; }, run: function (r) { r.status = "active"; return "Règle activée."; } }]
    },
    roles: {
      title: "Roles", lede: "Cinq rôles standard, du propriétaire au lecteur.",
      cols: [{ k: "role", l: "Rôle" }, { k: "can", l: "Peut" }, { k: "members", l: "Membres", kind: "num" }],
      rows: [{ role: "Owner", can: "Tout, dont la clôture de l'entreprise", members: 1 }, { role: "Admin", can: "Équipe, paramètres, paiements, recharges", members: 2 }, { role: "Finance", can: "Recharges, payouts, factures, rapports", members: 2 }, { role: "Support", can: "Clients, litiges, remboursements", members: 3 }, { role: "Viewer", can: "Lecture seule", members: 4 }]
    },
    permissions: { title: "Permissions", lede: "Matrice des droits par rôle.", matrix: true },
    approvals: {
      title: "Approvals", lede: "Décisions en attente d'un rôle habilité (payouts au-dessus du seuil, nouveaux membres).",
      kpis: [{ l: "En attente", v: "2", h: "Owner requis", t: "dn", d: "à décider" }],
      cols: [{ k: "ref", l: "Demande", kind: "mono" }, { k: "what", l: "Objet" }, { k: "by", l: "Demandé par" }, { k: "amt", l: "Montant", kind: "money" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ ref: "APR-041", what: "Payout PY-119 — Studio Élan", by: "Sarah Deguenon", amt: eur(4800), cur: "EUR", status: "pending" }, { ref: "APR-040", what: "Invitation — Viewer", by: "Kevin Massou", amt: 0, cur: "EUR", status: "pending" }, { ref: "APR-039", what: "Payout PY-117 — Atelier Nomade", by: "Sarah Deguenon", amt: eur(3400), cur: "EUR", status: "approved" }],
      actions: [{ l: "Approuver", show: function (r) { return r.status === "pending"; }, run: function (r) { r.status = "approved"; return "Demande " + r.ref + " approuvée."; } }, { l: "Refuser", show: function (r) { return r.status === "pending"; }, run: function (r) { r.status = "rejected"; return "Demande " + r.ref + " refusée."; } }]
    },
    "api-keys": {
      title: "API Keys", lede: "Clés d'API de l'entreprise. Une clé secrète n'est affichée qu'une fois, à sa création.",
      cols: [{ k: "name", l: "Clé" }, { k: "hint", l: "Aperçu", kind: "mono" }, { k: "scope", l: "Portée" }, { k: "used", l: "Dernier appel" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ name: "Site vitrine", hint: "vtx_live_••••4f2a", scope: "Paiements (écriture)", used: "Il y a 2 min", status: "active" }, { name: "Comptabilité", hint: "vtx_live_••••91c0", scope: "Lecture seule", used: "Hier", status: "active" }, { name: "Test local", hint: "vtx_test_••••0d77", scope: "Sandbox", used: "Il y a 6 j", status: "active" }],
      create: { label: "Nouvelle clé", title: "Créer une clé d'API", fields: [{ id: "name", l: "Nom", ph: "Ex. Application mobile" }], make: function (v) { return { name: v.name || "Clé", hint: "vtx_test_••••" + Math.random().toString(16).slice(2, 6), scope: "Sandbox", used: "Jamais", status: "active" }; } },
      actions: [{ l: "Révoquer", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "revoked"; return "Clé révoquée."; } }]
    },
    apps: {
      title: "Applications", lede: "Applications connectées à ton entreprise.",
      cols: [{ k: "name", l: "Application" }, { k: "by", l: "Éditeur" }, { k: "scope", l: "Accès" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ name: "Compta Facile", by: "Compta Facile SAS", scope: "Factures, rapports", status: "active" }, { name: "Slack Alerts", by: "Slack", scope: "Notifications", status: "active" }, { name: "Zapier", by: "Zapier Inc.", scope: "Webhooks", status: "revoked" }],
      actions: [{ l: "Révoquer l'accès", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "revoked"; return "Accès révoqué."; } }]
    },
    webhooks: {
      title: "Webhooks", lede: "Endpoints notifiés à chaque événement (paiement, recharge, litige…).",
      cols: [{ k: "url", l: "Endpoint", kind: "mono" }, { k: "events", l: "Événements" }, { k: "ok", l: "Succès (24 h)", kind: "num" }, { k: "status", l: "Statut", kind: "badge" }],
      rows: [{ url: "https://selego.fr/api/vtex", events: "payment.*, topup.*", ok: 412, status: "active" }, { url: "https://compta.example/hooks/vtex", events: "invoice.paid", ok: 38, status: "active" }],
      create: { label: "Nouvel endpoint", title: "Ajouter un endpoint", fields: [{ id: "url", l: "URL", ph: "https://…" }], make: function (v) { return { url: v.url || "https://exemple.fr/hook", events: "payment.*", ok: 0, status: "active" }; } },
      actions: [{ l: "Envoyer un événement de test", run: function (r) { return "Événement de test envoyé à " + r.url + " — 200 OK (simulé)."; } }, { l: "Désactiver", show: function (r) { return r.status === "active"; }, run: function (r) { r.status = "disabled"; return "Endpoint désactivé."; } }]
    },
    sandbox: { title: "Sandbox", lede: "Environnement de test : aucune somme réelle n'est déplacée.", sandbox: true }
  };

  /* Panneaux de réglages */
  var SETTINGS = {
    "settings-business": { title: "Business", lede: "Identité légale et coordonnées de l'entreprise.", fields: [["Raison sociale", "SAS Selego"], ["Nom commercial", "Selego"], ["SIREN", "912 345 678"], ["N° TVA", "FR12 912345678"], ["E-mail de facturation", "compta@selego.fr"], ["Adresse", "14 rue des Ateliers, 69002 Lyon"]] },
    "settings-finance": { title: "Finance", lede: "Devise, seuils d'approbation et recharges par carte.", finance: true },
    "settings-security": { title: "Security", lede: "Authentification et sessions.", toggles: [["Authentification à deux facteurs obligatoire", "Pour tous les membres de l'équipe.", true], ["Alerte de connexion inhabituelle", "E-mail dès qu'un appareil inconnu se connecte.", true], ["Expiration des sessions à 12 h", "Reconnexion demandée chaque jour.", false]] },
    "settings-team": { title: "Team", lede: "Règles d'invitation et de rôles.", toggles: [["Invitation soumise à approbation", "Un Owner valide chaque nouveau membre.", true], ["Autoriser les rôles Finance à recharger", "Recharge par carte et virement entrant.", true], ["Masquer les soldes aux rôles Viewer", "Seuls les montants de leurs propres dossiers restent visibles.", false]] },
    "settings-notifications": { title: "Notifications", lede: "Ce que tu reçois, et où.", toggles: [["Paiement reçu", "Notification à chaque encaissement.", true], ["Recharge créditée ou refusée", "Résultat de chaque recharge par carte.", true], ["Litige ou chargeback", "Alerte immédiate avec l'échéance.", true], ["Résumé hebdomadaire", "Chaque lundi à 8 h.", false]] },
    "settings-integrations": { title: "Integrations", lede: "Services connectés.", toggles: [["Stripe — paiements par carte", "Recharge et encaissement par carte bancaire.", true], ["Compta Facile", "Export automatique des écritures.", true], ["Slack", "Alertes dans #finance.", true], ["Google Sheets", "Export quotidien des transactions.", false]] }
  };

  var MEMBERS = [
    { id: 1, name: "Kevin Massou", email: "kevin@selego.fr", role: "owner", status: "active", seen: "Il y a 4 min" },
    { id: 2, name: "Sarah Deguenon", email: "sarah@selego.fr", role: "finance", status: "active", seen: "Il y a 1 h" },
    { id: 3, name: "Alice Perez", email: "alice@selego.fr", role: "admin", status: "active", seen: "Hier" },
    { id: 4, name: "Yanis Boulé", email: "yanis@selego.fr", role: "support", status: "active", seen: "Il y a 2 j" },
    { id: 5, name: "Inès Robert", email: "ines@selego.fr", role: "viewer", status: "invited", seen: "—" }
  ];
  var PAYOUTS = [
    { ref: "PY-119", who: "Studio Élan", iban: "FR76 •••• 4412", amt: eur(4800), cur: "EUR", status: "pending_approval", date: "Il y a 3 h", account: 203 },
    { ref: "PY-120", who: "Marie Tessier", iban: "FR76 •••• 9081", amt: eur(1250), cur: "EUR", status: "pending_approval", date: "Il y a 1 h", account: 203 },
    { ref: "PY-118", who: "Alice Perez", iban: "FR76 •••• 3320", amt: eur(1200), cur: "EUR", status: "paid", date: "Il y a 2 h", account: 203 },
    { ref: "PY-117", who: "Atelier Nomade", iban: "FR76 •••• 7755", amt: eur(3400), cur: "EUR", status: "paid", date: "Il y a 30 h", account: 203 }
  ];

  global.ProData = { OWNER: OWNER, NAV: NAV, MODS: MODS, SETTINGS: SETTINGS, MEMBERS: MEMBERS, PAYOUTS: PAYOUTS, eur: eur };
})(window);
