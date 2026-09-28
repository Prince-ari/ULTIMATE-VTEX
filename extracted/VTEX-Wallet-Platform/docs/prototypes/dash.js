/* VTEX Control Center — coque, routeur et vues. Dépend de VtexCore et DashData. */
(function () {
  "use strict";
  var C = window.VtexCore, D = window.DashData;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var fmt = C.fmt, ME = "Ariel Kouadio";
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /* Devise d'AFFICHAGE du Dashboard (€ ou ₣, parité fixe 1 € = 119,3317 ₣) : les comptes gardent leur devise, seul l'affichage
     et la saisie des montants suivent ce choix. Le dollar n'est jamais converti. */
  var DISP = "EUR";
  try { var savedDisp = window.localStorage.getItem("vtex-dash-art-disp"); if (savedDisp === "EUR" || savedDisp === "XPF") DISP = savedDisp; } catch (_) { /* stockage indisponible */ }
  function dispCur(cur) { return (cur || "EUR") === "USD" ? "USD" : DISP; }
  function money(c, cur) { cur = cur || "EUR"; var to = dispCur(cur); return fmt(C.convert(c, cur, to), to); }
  /* Textes libres (tickets, notifications) : les montants en euros suivent la devise d'affichage. */
  function loc(s) {
    if (DISP === "EUR") return String(s);
    return String(s).replace(/(\d[\d   ]*(?:[.,]\d{1,2})?)\s?€/g, function (m, d) {
      var e = Number(d.replace(/[\s  ]/g, "").replace(",", "."));
      return isFinite(e) ? fmt(C.convert(Math.round(e * 100), "EUR", "XPF"), "XPF") : m;
    });
  }
  function sym(cur) { return C.SYMBOLS[dispCur(cur)]; }
  /* Saisie de l'opérateur (devise d'affichage) → unité stockée du compte ; null si invalide. */
  function stored(value, accCur) {
    var major = Number(String(value).replace(/\s/g, "").replace(",", ".").replace("−", "-"));
    if (!isFinite(major)) return null;
    var entry = dispCur(accCur);
    return C.convert(Math.round(major * C.divisor(entry)), entry, accCur);
  }
  var curDrawer = null;
  function setDisp(next) {
    DISP = next;
    try { window.localStorage.setItem("vtex-dash-art-disp", next); } catch (_) { /* choix non mémorisé */ }
    document.querySelectorAll("[data-disp]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.disp === DISP)); });
    render();
    if (curDrawer && $("#drawer").classList.contains("on")) curDrawer();
  }
  function curSwitch() {
    return '<div class="curbar" role="group" aria-label="Devise d’affichage"><span class="cap">Devise d’affichage</span><span class="opts">' +
      [["EUR", "€", "Euro"], ["XPF", "₣", "Franc Pacifique"]].map(function (o) { return '<button data-disp="' + o[0] + '" aria-pressed="' + (DISP === o[0]) + '" title="' + (o[0] === "XPF" ? "Parité fixe : 1 € = 119,3317 ₣" : "Euro") + '"><b>' + o[1] + "</b> " + o[2] + "</button>"; }).join("") + "</span></div>";
  }
  function ago(iso) { var mn = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (mn < 1) return "à l’instant"; if (mn < 60) return "il y a " + mn + " min"; var hh = Math.round(mn / 60); if (hh < 24) return "il y a " + hh + " h"; return "il y a " + Math.round(hh / 24) + " j"; }
  function dt(iso) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }

  var IC = {
    home: '<path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>', user: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>', "user-add": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M18 8v6M15 11h6"/>',
    wallet: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v3H6.5A2.5 2.5 0 0 0 4 10.5v8A2.5 2.5 0 0 0 6.5 21H20V8"/><path d="M15 14h5"/>', building: '<path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16"/><path d="M14 10h4a1 1 0 0 1 1 1v10"/><path d="M9 8h.01M9 11h.01M9 14h.01M9 17h.01M17 14h.01M17 17h.01"/><path d="M3 21h18"/>',
    topup: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/><path d="M17 13v4M15 15h4"/>', folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v9A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5Z"/><path d="M3 10h18"/>',
    bell: '<path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 22h4"/>', analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', support: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13h3v6H5a1 1 0 0 1-1-1zM20 13h-3v6h2a1 1 0 0 0 1-1zM12 21h3"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', card: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h3"/>', shield: '<path d="M12 3 5 6v6c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6z"/><path d="m9 12 2 2 4-4"/>', refresh: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12A8 8 0 0 1 18 6.7"/><path d="M18 3v4h-4M6 21v-4h4"/>', send: '<path d="M3 11.5 21 3l-6 18-3.5-7.5Z"/>'
  };
  function ico(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || IC.file) + "</svg>"; }
  var ST = { active: ["ok", "Actif"], pending: ["wa", "En attente"], suspended: ["er", "Suspendu"], closed: ["ne", "Clôturé"], validated: ["ok", "Validé"], rejected: ["er", "Refusé"], new: ["nt", "Nouveau"], contacted: ["wa", "Contacté"], qualified: ["ok", "Qualifié"], lost: ["ne", "Perdu"], open: ["wa", "Ouvert"], resolved: ["ok", "Résolu"], high: ["er", "Haute"], medium: ["wa", "Moyenne"], low: ["ne", "Basse"], frozen: ["nt", "Gelée"],
    succeeded: ["ok", "Créditée"], requires_action: ["wa", "Validation bancaire"], failed: ["er", "Refusée"], canceled: ["ne", "Annulée"], refunded: ["nt", "Remboursée"], processing: ["wa", "En cours"], pending_approval: ["wa", "À approuver"], paid: ["ok", "Payé"] };
  function badge(s) { var x = ST[s] || ["ne", s]; return '<span class="badge ' + x[0] + '">' + x[1] + "</span>"; }

  /* ───── utilitaires d'interface ───── */
  var toastTimer;
  function toast(msg, err) { var t = $("#toast"); t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("on"); }, 3400); }
  function closeAll() { $("#overlay").classList.remove("on"); $("#drawer").classList.remove("on"); $("#dlg").classList.remove("on"); }
  function drawer(title, sub, body, foot) {
    $("#drawer").innerHTML = '<div class="drawer-h"><div><h2>' + title + "</h2><p>" + (sub || "") + '</p></div><button class="btn sm" data-close aria-label="Fermer">' + ico("close") + '</button></div><div class="drawer-b">' + body + "</div>" + (foot ? '<div class="drawer-f">' + foot + "</div>" : "");
    $("#overlay").classList.add("on"); $("#drawer").classList.add("on");
  }
  function closeDialog() { $("#dlg").classList.remove("on"); if (!$("#drawer").classList.contains("on")) $("#overlay").classList.remove("on"); }
  function dialog(html) { $("#dlg").innerHTML = html; $("#overlay").classList.add("on"); $("#dlg").classList.add("on"); var f = $("#dlg input,#dlg select,#dlg textarea"); if (f) setTimeout(function () { f.focus(); }, 60); }
  function form(title, intro, fields, submit, cb, danger) {
    dialog("<h2>" + title + "</h2>" + (intro ? "<p>" + intro + "</p>" : "") + fields.map(function (f) {
      return '<label class="fld"><span>' + f.l + "</span>" + (f.options ? '<select class="sel" id="df-' + f.id + '">' + f.options.map(function (o) { return '<option value="' + o[0] + '"' + (f.value === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" : '<input class="inp" id="df-' + f.id + '" placeholder="' + esc(f.ph || "") + '" value="' + esc(f.value || "") + '"' + (f.num ? ' inputmode="decimal"' : "") + ">") + "</label>";
    }).join("") + '<div class="acts"><button class="btn" data-closedlg>Annuler</button><button class="btn ' + (danger ? "dng" : "pri") + '" id="df-ok">' + submit + "</button></div>");
    $("#df-ok").onclick = function () { var v = {}; fields.forEach(function (f) { v[f.id] = $("#df-" + f.id).value; }); Promise.resolve(cb(v)).then(function (ok) { if (ok !== false) closeDialog(); }); };
  }
  function log(action, targetType, targetId, detail) { C.logAction(ME, action, targetType, targetId, detail); refreshBadges(); }

  /* ───── coque ───── */
  var NAV = [
    { k: "Modules", items: [["home", "Accueil", "home"], ["users", "Utilisateurs", "user"], ["wallets", "Wallets", "wallet"], ["business", "Wallet Pro", "building"], ["topups", "Recharges", "topup"], ["documents", "Documents", "folder"], ["leads", "Leads", "user-add"], ["notifications", "Notifications", "bell"], ["analytics", "Analytics", "analytics"]] },
    { k: "Système", items: [["support", "Support", "support"], ["journal", "Journal système", "file"], ["settings", "Paramètres", "settings"]] }
  ];
  var TITLES = {};
  NAV.forEach(function (g) { g.items.forEach(function (i) { TITLES[i[0]] = i[1]; }); });
  var route = "home";

  function openTopups() { return C.state.topups.filter(function (t) { return ["pending", "requires_action", "processing"].indexOf(t.status) >= 0; }).length; }
  function refreshBadges() { var b = $("#cnt-topups"); if (b) { var n = openTopups(); b.textContent = n; b.hidden = !n; } }
  function shell() {
    $("#app").innerHTML = '<aside class="side" id="side"><div class="brand"><div class="wordmark" aria-label="VTEX">VTEX</div><small>Dashboard</small></div><nav class="nav" aria-label="Navigation principale">' + NAV.map(function (g) {
      return "<div><span class=\"nav-k\">" + g.k + "</span><ul>" + g.items.map(function (i) { return '<li><button class="nav-i" data-go="' + i[0] + '">' + ico(i[2]) + i[1] + (i[0] === "topups" ? '<span class="cnt" id="cnt-topups"></span>' : "") + "</button></li>"; }).join("") + "</ul></div>";
    }).join("") + '</nav><div class="me"><span class="me-av">AK</span><div><b>Ariel Kouadio</b><small>Administrateur</small></div></div></aside><div class="scrim" data-scrim></div>' +
      '<div class="main"><header class="top"><button class="burger" data-burger aria-label="Ouvrir le menu">' + ico("menu") + '</button><b>VTEX Dashboard</b><span class="me-av" style="background:linear-gradient(158deg,#A9BCFF,#6E8AE6)">AK</span></header><main class="pg" id="page"></main></div>';
    var pg = $("#page"); pg.insertAdjacentHTML("beforebegin", '<div class="curwrap">' + curSwitch() + "</div>");
    refreshBadges();
  }
  function go(id, opts) {
    route = id; document.body.classList.remove("nav-open"); closeAll();
    document.querySelectorAll(".nav-i").forEach(function (b) { b.setAttribute("aria-current", b.getAttribute("data-go") === id ? "page" : "false"); });
    render(opts);
    try { if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id); } catch (_) { /* pas d'historique */ }
    window.scrollTo(0, 0);
  }
  function head(kick, title, lede, acts) { return '<header class="ph"><div><p class="kick">' + kick + "</p><h1>" + title + "</h1>" + (lede ? "<p>" + lede + "</p>" : "") + "</div>" + (acts ? '<div class="acts">' + acts + "</div>" : "") + "</header>"; }
  function kpi(tone, icon, label, value, hint) { return '<div class="kpi ' + tone + '"><span class="ico ' + tone + '">' + ico(icon) + "</span><span><small>" + label + "</small><strong>" + value + "</strong><em>" + hint + "</em></span></div>"; }

  /* ───── libellés du journal (mêmes que le vrai Dashboard) ───── */
  var TOPUP_ACTIONS = { create: "Recharge initiée", credit: "Recharge créditée", mismatch: "Écart de paiement détecté", reconcile: "Recharge réconciliée", cancel: "Recharge annulée", refund: "Recharge remboursée" };
  var isTopup = function (a) { return /^(wallet|business)\.topup\./.test(a); };
  var ADMIN_ACTIONS = { "admin.business.create": "Entreprise créée", "admin.business.balance_adjust": "Solde Wallet Pro mis à jour", "admin.business.bank_details_assign": "RIB Wallet Pro attribué", "admin.business.bank_details_rotate": "RIB Wallet Pro remplacé", "admin.business.bank_details_revoke": "RIB Wallet Pro retiré", "business.wallet.provision_bank_details": "RIB Wallet Pro généré", "business.card.create": "Carte Wallet Pro émise" };
  function actionLabel(a) { if (ADMIN_ACTIONS[a]) return ADMIN_ACTIONS[a]; if (!isTopup(a)) return a; var p = a.split("."); return (TOPUP_ACTIONS[p[2]] || p[2]) + " · " + (p[0] === "business" ? "Wallet Pro" : "Wallet perso"); }
  function detailText(a, x) {
    if (!x) return "—";
    if (ADMIN_ACTIONS[a] && typeof x === "object") return [x.legalName, typeof x.deltaCents === "number" ? (x.deltaCents >= 0 ? "+" : "−") + money(Math.abs(x.deltaCents), x.currency || "EUR") : null, x.ibanLast4 ? "IBAN …" + x.ibanLast4 : null, x.previousIbanLast4 ? "ancien IBAN …" + x.previousIbanLast4 : null, x.reason ? "motif : " + x.reason : null].filter(Boolean).join(" · ") || JSON.stringify(x);
    if (!isTopup(a) || typeof x !== "object") return JSON.stringify(x);
    var parts = [x.reference, typeof x.amountCents === "number" ? money(x.amountCents, x.currency || "EUR") : null, x.mode ? "mode " + x.mode : null, x.status ? "statut " + x.status : null, x.reason ? "motif : " + x.reason : null].filter(Boolean);
    return parts.join(" · ");
  }

  var V = {};

  V.home = function () {
    var total = USERS_BAL(), users = D.USERS.length, biz = D.BUSINESSES.length;
    var day = C.state.topups.filter(function (t) { return t.status === "succeeded" && Date.now() - new Date(t.createdAt).getTime() < 864e5; }).reduce(function (s, t) { return s + C.eurEq(t.amountCents, t.currency); }, 0);
    var rows = C.state.journal.slice(0, 6).map(function (l) {
      var tone = isTopup(l.action) ? "teal" : /freeze|status|suspend/.test(l.action) ? "amber" : /login/.test(l.action) ? "violet" : /approve|validate|credit/.test(l.action) ? "green" : "violet";
      return '<li><span class="d ' + tone + '">' + ico(isTopup(l.action) ? "topup" : "shield") + '</span><span class="tx"><b>' + esc(actionLabel(l.action)) + "</b><small>" + esc(l.actor) + " · " + ago(l.createdAt) + '</small></span><span class="r" style="color:var(--muted);font-weight:500;font-size:12px">' + esc(l.targetType) + " #" + l.targetId + "</span></li>";
    }).join("");
    var open = D.TICKETS.filter(function (t) { return t.status === "open"; }).length;
    return head("VTEX · Dashboard", "Accueil", "Vue d’ensemble de la plateforme : utilisateurs, wallets, entreprises et flux de recharge.") +
      '<section class="kpis">' + kpi("violet", "user", "Utilisateurs", String(users), "3 nouveaux ce mois") + kpi("green", "wallet", "Solde total wallets", money(total, "EUR"), "Wallets personnels") + kpi("amber", "building", "Wallet Pro", String(biz), "Entreprises actives") + kpi("teal", "topup", "Recharges (24 h)", money(day, "EUR"), openTopups() + " en cours de traitement") + "</section>" +
      '<section class="content"><div class="panel"><div class="panel-h"><div><h2>Activité récente</h2><p>Les dernières actions sensibles, tous modules confondus.</p></div><button class="btn sm" data-go="journal">Journal système</button></div><ul class="act">' + rows + "</ul></div>" +
      '<div class="panel"><div class="panel-h"><div><h2>Actions rapides</h2></div></div><div class="actions">' +
      '<button class="action teal" data-go="topups"><span class="ico teal">' + ico("topup") + '</span><span><strong>Recharges</strong><span class="t">' + openTopups() + " à surveiller</span></span></button>" +
      '<button class="action violet" data-newuser><span class="ico violet">' + ico("user-add") + '</span><span><strong>Créer un utilisateur</strong><span class="t">Invitation immédiate</span></span></button>' +
      '<button class="action green" data-go="documents"><span class="ico green">' + ico("folder") + '</span><span><strong>Documents</strong><span class="t">' + D.DOCS.filter(function (x) { return x.status === "pending"; }).length + " à valider</span></span></button>" +
      '<button class="action amber" data-go="support"><span class="ico amber">' + ico("support") + '</span><span><strong>Support</strong><span class="t">' + open + " ticket(s) ouvert(s)</span></span></button></div></div></section>" +
      '<section class="callouts"><button class="callout navy" data-go="settings"><span>Intégration Stripe</span><strong>Simulateur actif</strong><small>Les recharges par carte sont simulées dans ce prototype. Le vrai serveur pilote Stripe avec des clés qui ne quittent jamais l’API.</small></button>' +
      '<button class="callout violet" data-go="analytics"><span>Analytics</span><strong>Taux de réussite des recharges</strong><small>' + successRate() + " % des recharges aboutissent. Ouvre l’analyse pour voir le détail par mois.</small></button></section>";
  };
  function USERS_BAL() { return Object.keys(C.state.accounts).map(function (k) { return C.state.accounts[k]; }).filter(function (a) { return a.scope === "wallet" && a.currency === "EUR"; }).reduce(function (s, a) { return s + a.availableCents; }, 0); }
  function successRate() { var done = C.state.topups.filter(function (t) { return ["succeeded", "failed", "refunded"].indexOf(t.status) >= 0; }); if (!done.length) return 100; return Math.round(done.filter(function (t) { return t.status !== "failed"; }).length / done.length * 100); }

  /* — Utilisateurs — */
  var uf = { q: "", f: "all" };
  V.users = function () {
    var chips = [["all", "Tous"], ["active", "Actifs"], ["pending", "En attente"], ["suspended", "Suspendus"]].map(function (c) { return '<button class="chip" data-uf="' + c[0] + '" aria-pressed="' + (uf.f === c[0]) + '">' + c[1] + "</button>"; }).join("");
    var rows = D.USERS.filter(function (u) { return (uf.f === "all" || u.status === uf.f) && (!uf.q || (u.first + " " + u.last + " " + u.email).toLowerCase().indexOf(uf.q.toLowerCase()) >= 0); }).map(function (u) {
      return '<tr class="clk" data-user="' + u.id + '"><td><b>' + esc(u.first + " " + u.last) + '</b><span class="sub">' + esc(u.email) + "</span></td><td>" + u.role + "</td><td>" + badge(u.status) + "</td><td>" + (u.kyc ? '<span class="badge ok">Vérifié</span>' : '<span class="badge wa">À vérifier</span>') + "</td><td>" + u.joined + '</td><td class="r mono">' + money(C.account(1000 + u.id).availableCents) + "</td></tr>";
    }).join("");
    return head("Modules", "Utilisateurs", "Comptes de la plateforme : rôles, statut, vérification d’identité et wallet associé.", '<button class="btn pri" data-newuser>' + ico("plus") + " Créer un utilisateur</button>") +
      '<div class="tools"><label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input id="uq" placeholder="Nom ou e-mail" value="' + esc(uf.q) + '" aria-label="Rechercher un utilisateur"></label><div class="chips">' + chips + "</div></div>" +
      '<div class="tbl-w"><table><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Statut</th><th>Identité</th><th>Inscrit</th><th class="r">Solde wallet</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="empty">Aucun utilisateur.</td></tr>') + "</tbody></table></div>";
  };
  function userDrawer(id) {
    curDrawer = function () { userDrawer(id); };
    var u = D.USERS.filter(function (x) { return x.id === id; })[0], a = C.account(1000 + u.id);
    var foot = '<button class="btn pri" data-usertoggle="' + id + '">' + (u.status === "suspended" ? "Réactiver le compte" : "Suspendre le compte") + '</button><button class="btn" data-go="wallets" data-open="' + id + '">Ouvrir le wallet</button>';
    drawer(esc(u.first + " " + u.last), esc(u.email), '<div><div class="sec-t">Profil</div><div class="kv"><span>Statut</span><span>' + badge(u.status) + '</span></div><div class="kv"><span>Rôle</span><span><select class="sel" data-urole="' + id + '" style="width:auto;padding:6px 12px"><option value="user"' + (u.role === "user" ? " selected" : "") + '>user</option><option value="agent"' + (u.role === "agent" ? " selected" : "") + '>agent</option><option value="admin"' + (u.role === "admin" ? " selected" : "") + '>admin</option></select></span></div><div class="kv"><span>Identité</span><span>' + (u.kyc ? "Vérifiée" : "À vérifier") + '</span></div><div class="kv"><span>Ville</span><span>' + esc(u.city) + '</span></div><div class="kv"><span>Inscrit</span><span>' + u.joined + '</span></div></div><div><div class="sec-t">Wallet</div><div class="kv"><span>Solde disponible</span><span class="mono">' + money(a.availableCents) + "</span></div></div>", foot);
  }

  /* — Wallets — */
  var wf = { q: "" };
  V.wallets = function (o) {
    var rows = D.USERS.filter(function (u) { return !wf.q || (u.first + " " + u.last).toLowerCase().indexOf(wf.q.toLowerCase()) >= 0; }).map(function (u) {
      var a = C.account(1000 + u.id), c = C.state.cards.filter(function (x) { return x.accountId === a.id; })[0];
      return '<tr class="clk" data-wallet="' + u.id + '"><td><b>' + esc(u.first + " " + u.last) + '</b><span class="sub">' + esc(u.email) + '</span></td><td class="r mono">' + money(a.availableCents) + "</td><td>" + (c ? badge(c.status) + ' <span class="sub" style="display:inline">•••• ' + c.lastFour + "</span>" : "—") + "</td><td>" + badge(u.status) + "</td></tr>";
    }).join("");
    setTimeout(function () { if (o && o.open) walletDrawer(Number(o.open)); }, 30);
    return head("Modules", "Wallets", "Chaque wallet personnel : solde, cartes, ajustements comptables et recharges.") +
      kpiRowW() + '<div class="tools"><label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input id="wq" placeholder="Rechercher un titulaire" value="' + esc(wf.q) + '" aria-label="Rechercher un wallet"></label></div>' +
      '<div class="tbl-w"><table><thead><tr><th>Titulaire</th><th class="r">Solde disponible</th><th>Carte</th><th>Compte</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4" class="empty">Aucun wallet.</td></tr>') + "</tbody></table></div>";
  };
  function kpiRowW() {
    var cards = C.state.cards.filter(function (c) { return c.id < 2000; });
    return '<section class="kpis">' + kpi("green", "wallet", "Solde total", money(USERS_BAL()), D.USERS.length + " wallets") + kpi("violet", "card", "Cartes actives", String(cards.filter(function (c) { return c.status === "active"; }).length), cards.filter(function (c) { return c.status === "frozen"; }).length + " gelée(s)") + kpi("teal", "topup", "Recharges créditées", String(C.state.topups.filter(function (t) { return t.scope === "wallet" && t.status === "succeeded"; }).length), "wallets personnels") + kpi("amber", "shield", "À vérifier", String(D.USERS.filter(function (u) { return !u.kyc; }).length), "identité incomplète") + "</section>";
  }
  function walletDrawer(id) {
    curDrawer = function () { walletDrawer(id); };
    var u = D.USERS.filter(function (x) { return x.id === id; })[0], a = C.account(1000 + id), c = C.state.cards.filter(function (x) { return x.accountId === a.id; })[0];
    var tops = C.state.topups.filter(function (t) { return t.accountId === a.id; }).slice(0, 4).map(function (t) { return '<div class="kv"><span>' + esc(t.reference.slice(0, 12)) + "… · " + ago(t.createdAt) + "</span><span>" + money(t.amountCents) + " " + badge(t.status) + "</span></div>"; }).join("") || '<p style="color:var(--muted)">Aucune recharge.</p>';
    var led = C.state.ledger.filter(function (l) { return l.accountId === a.id; }).slice(0, 4).map(function (l) { return '<div class="kv"><span>' + esc(l.description) + "</span><span class=\"" + (l.direction === "credit" ? "pos" : "neg") + '">' + (l.direction === "credit" ? "+" : "−") + money(l.amountCents) + "</span></div>"; }).join("") || '<p style="color:var(--muted)">Aucune opération.</p>';
    drawer(money(a.availableCents), esc(u.first + " " + u.last) + " · wallet personnel",
      '<div><div class="sec-t">Carte</div>' + (c ? '<div class="kv"><span>' + esc(c.label) + " •••• " + c.lastFour + "</span><span>" + badge(c.status) + '</span></div><button class="btn sm" data-cardtoggle="' + c.id + '" data-owner="' + id + '">' + (c.status === "frozen" ? "Dégeler la carte" : "Geler la carte") + "</button>" : '<p style="color:var(--muted)">Aucune carte provisionnée.</p>') + '</div>' +
      '<div><div class="sec-t">Ajustement comptable</div><p style="color:var(--muted);font-size:12px;margin-bottom:10px">Crédite ou débite le wallet. Le motif est journalisé.</p><button class="btn sm pri" data-adjust="' + id + '">Ajuster le solde</button></div>' +
      '<div><div class="sec-t">Recharges par carte</div>' + tops + '<button class="btn sm" data-go="topups" style="margin-top:8px">Ouvrir les recharges</button></div><div><div class="sec-t">Dernières opérations</div>' + led + "</div>", "");
  }
  function adjustDialog(id) {
    var u = D.USERS.filter(function (x) { return x.id === id; })[0];
    form("Ajuster le solde", "Wallet de " + esc(u.first + " " + u.last) + ". Montant négatif pour débiter.", [{ id: "amt", l: "Montant en " + sym("EUR") + " (négatif pour débiter)", ph: DISP === "XPF" ? "3 000" : "25,00", num: true }, { id: "why", l: "Justification (8 caractères minimum)", ph: "Geste commercial ticket SUP-…" }], "Enregistrer l’ajustement", function (v) {
      var cents = stored(v.amt, "EUR");
      try { C.adminAdjust(1000 + id, cents === null ? 0 : cents, v.why, ME); } catch (er) { toast(er.message, true); return false; }
      refreshBadges(); toast("Ajustement enregistré et journalisé."); render(); walletDrawer(id); return true;
    });
  }

  /* — Wallet Pro — */
  var bf = { q: "" }, bizTab = "apercu";
  V.business = function () {
    var rows = D.BUSINESSES.filter(function (b) { return !bf.q || (b.brand + b.legal).toLowerCase().indexOf(bf.q.toLowerCase()) >= 0; }).map(function (b) {
      var bal = balEur(b);
      return '<tr class="clk" data-biz="' + b.id + '"><td><b>' + esc(b.brand) + '</b><span class="sub">' + esc(b.legal) + "</span></td><td>" + esc(b.industry) + '</td><td class="r mono">' + money(bal) + "</td><td>" + badge(b.status) + "</td><td>" + b.created + "</td></tr>";
    }).join("");
    var total = D.BUSINESSES.reduce(function (s, b) { return s + balEur(b); }, 0);
    return head("Modules", "Wallet Pro", "Chaque entreprise, son équipe, son wallet, ses cartes et ses paiements — piloté et journalisé depuis un seul espace.", '<button class="btn pri" data-newbiz>' + ico("plus") + " Créer une entreprise</button>") +
      '<section class="kpis">' + kpi("violet", "building", "Entreprises", String(D.BUSINESSES.length), D.BUSINESSES.filter(function (b) { return b.status === "active"; }).length + " actives") + kpi("green", "wallet", "Solde total", money(total), "Tous wallets Pro (hors dollars)") + kpi("amber", "send", "Payouts en attente", String(PAYOUTS.filter(function (p) { return p.status === "pending_approval"; }).length), money(PAYOUTS.filter(function (p) { return p.status === "pending_approval"; }).reduce(function (s, p) { return s + p.amt; }, 0))) + kpi("teal", "topup", "Recharges créditées", String(C.state.topups.filter(function (t) { return t.scope === "business" && t.status === "succeeded"; }).length), "wallets Pro") + "</section>" +
      '<div class="tools"><label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input id="bq" placeholder="Rechercher une entreprise" value="' + esc(bf.q) + '" aria-label="Rechercher une entreprise"></label></div>' +
      '<div class="tbl-w"><table><thead><tr><th>Entreprise</th><th>Secteur</th><th class="r">Solde disponible</th><th>Statut</th><th>Créée le</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  };
  /* Solde d'une entreprise en euros (les comptes en francs Pacifique sont convertis à la parité fixe ; le dollar reste hors total). */
  function balEur(b) { return bizAccts(b).filter(function (a) { return a.currency !== "USD"; }).reduce(function (s, a) { return s + C.convert(a.availableCents, a.currency, "EUR"); }, 0); }
  function bizAccts(b) { return Object.keys(C.state.accounts).map(function (k) { return C.state.accounts[k]; }).filter(function (a) { return a.ownerKey === "b" + b.id; }); }
  var PAYOUTS = [{ id: 1, biz: 1, ref: "PY-119", who: "Studio Élan", amt: 480000, status: "pending_approval" }, { id: 2, biz: 3, ref: "PY-431", who: "Transports Diop", amt: 1250000, status: "pending_approval" }, { id: 3, biz: 5, ref: "PY-077", who: "Imprimerie Vega", amt: 96000, status: "paid" }];
  function bizOfAccount(a) { return Number(String(a.ownerKey).slice(1)); }
  function acctBox(a) {
    return '<div class="acct-box"><div class="acct-h"><b>' + esc(a.label) + '</b><span class="badge nt">' + a.currency + " · #" + a.id + '</span></div>' +
      '<div class="kv"><span>IBAN</span><span class="mono" style="font-size:12px">' + (a.iban ? esc(C.groupIban(a.iban)) : "Aucun RIB attribué") + '</span></div>' +
      '<div class="kv"><span>BIC</span><span class="mono">' + (a.bic || "—") + '</span></div>' +
      '<div class="kv"><span>Disponible</span><span class="mono">' + money(a.availableCents, a.currency) + '</span></div>' +
      '<div class="acts">' + (!a.iban ? '<button class="btn sm" data-ribgen="' + a.id + '">Générer un RIB</button>' : "") + '<button class="btn sm" data-ribassign="' + a.id + '">' + (a.iban ? "Remplacer le RIB" : "Attribuer un RIB") + "</button>" + (a.iban ? '<button class="btn sm dng" data-ribrevoke="' + a.id + '">Retirer le RIB</button>' : "") + '<button class="btn sm pri" data-acctbal="' + a.id + '">Mettre à jour le solde</button></div></div>';
  }
  function cardBox(c, a) {
    return '<div class="acct-box"><div class="acct-h"><b>' + esc(String(c.network).toUpperCase()) + " •••• " + c.lastFour + "</b>" + badge(c.status) + '</div>' +
      '<div class="kv"><span>' + esc(c.label) + ' · solde de la carte</span><span class="mono">' + money(a.availableCents, a.currency) + '</span></div>' +
      '<p class="note">La carte dépense le solde de son compte #' + a.id + " (" + a.currency + ") : le mettre à jour met la carte à jour.</p>" +
      '<div class="acts"><button class="btn sm" data-bcard="' + c.id + '">' + (c.status === "frozen" ? "Dégeler" : "Geler") + '</button><button class="btn sm pri" data-acctbal="' + a.id + '">Mettre à jour le solde</button></div></div>';
  }
  function bizDrawer(id) {
    curDrawer = function () { bizDrawer(id); };
    var b = D.BUSINESSES.filter(function (x) { return x.id === id; })[0], accts = bizAccts(b);
    var tabs = [["apercu", "Aperçu"], ["equipe", "Équipe"], ["paiements", "Paiements"]].map(function (t2) { return '<button class="chip" data-btab="' + t2[0] + '" data-bid="' + id + '" aria-pressed="' + (bizTab === t2[0]) + '">' + t2[1] + "</button>"; }).join("");
    var body;
    if (bizTab === "apercu") {
      var cards = C.state.cards.filter(function (c) { return accts.some(function (a) { return a.id === c.accountId; }); });
      body = '<div><div class="sec-t">Comptes Wallet Pro (' + accts.length + ")</div>" + (accts.map(acctBox).join("") || '<p style="color:var(--muted)">Aucun compte.</p>') + "</div>" +
        '<div><div class="sec-t">Cartes (' + cards.length + ")</div>" + (cards.map(function (c) { return cardBox(c, C.account(c.accountId)); }).join("") || '<p style="color:var(--muted)">Aucune carte.</p>') + '<div class="acts" style="margin-top:8px"><button class="btn sm" data-newcard="' + id + '">' + ico("plus") + " Émettre une carte</button></div></div>" +
        '<div><div class="sec-t">Profil</div><div class="kv"><span>Raison sociale</span><span>' + esc(b.legal) + '</span></div><div class="kv"><span>Titulaire</span><span>' + esc(b.owner) + '</span></div><div class="kv"><span>Secteur</span><span>' + esc(b.industry) + '</span></div><div class="kv"><span>Statut</span><span>' + badge(b.status) + '</span></div></div>' +
        '<div><div class="sec-t">Cycle de vie</div><div class="acts">' + ["active", "suspended", "closed"].filter(function (s2) { return s2 !== b.status; }).map(function (s2) { return '<button class="btn sm ' + (s2 === "closed" ? "dng" : "") + '" data-bstatus="' + s2 + '" data-bid="' + id + '">' + { active: "Activer", suspended: "Suspendre", closed: "Clôturer" }[s2] + "</button>"; }).join("") + "</div></div>";
    } else if (bizTab === "equipe") body = '<div><div class="sec-t">Membres (' + b.members + ")</div>" + [b.owner + " — Owner", "Sarah Deguenon — Finance", "Alice Perez — Admin", "Yanis Boulé — Support", "Inès Robert — Viewer"].slice(0, b.members).map(function (m2) { return '<div class="kv"><span>' + esc(m2.split(" — ")[0]) + "</span><span>" + m2.split(" — ")[1] + "</span></div>"; }).join("") + "</div>";
    else body = '<div><div class="sec-t">Payouts</div>' + (PAYOUTS.filter(function (p) { return p.biz === id; }).map(function (p) { return '<div class="kv"><span>' + p.ref + " · " + esc(p.who) + '</span><span>' + money(p.amt) + " " + badge(p.status) + "</span></div>" + (p.status === "pending_approval" ? '<div class="acts" style="margin-bottom:8px"><button class="btn sm pri" data-payout="approve" data-pid="' + p.id + '">Valider</button><button class="btn sm" data-payout="reject" data-pid="' + p.id + '">Refuser</button></div>' : ""); }).join("") || '<p style="color:var(--muted)">Aucun payout.</p>') + '</div><div><div class="sec-t">Recharges par carte</div>' + (C.state.topups.filter(function (t3) { return t3.ownerKey === "b" + id; }).slice(0, 5).map(function (t3) { return '<div class="kv"><span>' + ago(t3.createdAt) + " · " + esc(t3.accountLabel) + "</span><span>" + money(t3.amountCents, t3.currency) + " " + badge(t3.status) + "</span></div>"; }).join("") || '<p style="color:var(--muted)">Aucune recharge.</p>') + "</div>";
    drawer(esc(b.brand), esc(b.legal) + " · Wallet Pro", '<div class="tabs">' + tabs + "</div>" + body, "");
  }

  /* — Wallet Pro : créer une entreprise, RIB, soldes — */
  function refreshBiz(id) { refreshBadges(); render(); if (id) bizDrawer(id); }
  function newBizDialog() {
    var owners = D.USERS.filter(function (u) { return u.status === "active"; }).map(function (u) { return [String(u.id), u.first + " " + u.last + " · " + u.email]; });
    form("Créer une entreprise", "Ouvre un compte Business pour un titulaire existant : wallet, équipe, RIB et solde initial sont provisionnés immédiatement.", [
      { id: "owner", l: "Titulaire", options: owners }, { id: "legal", l: "Raison sociale", ph: "SAS Exemple" }, { id: "brand", l: "Nom commercial", ph: "Exemple" }, { id: "ind", l: "Secteur (facultatif)", ph: "Agence, négoce…" },
      { id: "cur", l: "Devise du compte principal", options: [["EUR", "€ Euro"], ["XPF", "₣ Franc Pacifique"], ["USD", "$ Dollar"]] },
      { id: "open", l: "Solde initial (facultatif, en " + sym("EUR") + " ; en $ pour un compte en dollars)", ph: DISP === "XPF" ? "300 000" : "2 500", num: true },
      { id: "rib", l: "RIB du compte principal", options: [["generate", "Générer automatiquement"], ["manual", "Attribuer un RIB existant"], ["none", "Aucun pour l’instant"]] },
      { id: "iban", l: "IBAN (si RIB existant)", ph: "FR76 3000 4028 …" }, { id: "bic", l: "BIC (si RIB existant)", ph: "BNPAFRPP" }
    ], "Créer l’entreprise", function (v) {
      var owner = D.USERS.filter(function (u) { return u.id === Number(v.owner); })[0];
      if (!owner) { toast("Sélectionne un titulaire actif.", true); return false; }
      if (v.legal.trim().length < 2 || v.brand.trim().length < 2) { toast("Raison sociale et nom commercial requis.", true); return false; }
      var opening = v.open.trim() ? stored(v.open, v.cur) : 0;
      if (opening === null || opening < 0) { toast("Solde initial invalide.", true); return false; }
      if (v.rib === "manual") { try { C.validateIban(v.iban); C.validateBic(v.bic); } catch (er) { toast(er.message, true); return false; } }
      var id = D.BUSINESSES.reduce(function (m2, x) { return Math.max(m2, x.id); }, 0) + 1;
      D.BUSINESSES.unshift({ id: id, brand: v.brand.trim(), legal: v.legal.trim(), owner: owner.first + " " + owner.last, industry: v.ind.trim() || "—", status: "active", created: "aujourd’hui", members: 1, accts: [] });
      var acc = C.addAccount({ id: 2000 + id * 10, scope: "business", label: "Compte principal", currency: v.cur, availableCents: 0, ownerKey: "b" + id, ownerName: v.brand.trim(), ownerDetail: v.legal.trim() });
      log("admin.business.create", "business", id, { legalName: v.legal.trim(), ownerUserId: owner.id });
      var notes = [];
      if (v.rib === "generate") { try { C.adminGenerateBank(acc.id, ME); } catch (er) { notes.push("RIB : " + er.message); } }
      if (v.rib === "manual") { try { C.adminAssignBank(acc.id, v.iban, v.bic, "Attribution à la création de l’entreprise", ME); } catch (er) { notes.push("RIB : " + er.message); } }
      if (opening > 0) { try { C.adminAdjust(acc.id, opening, "Solde initial à l’ouverture du compte", ME); } catch (er) { notes.push("Solde initial : " + er.message); } }
      bizTab = "apercu"; refreshBiz(id);
      toast(notes.length ? "Entreprise créée, mais : " + notes.join(" · ") : "Entreprise créée : wallet Pro, équipe, RIB et solde initial provisionnés.", notes.length > 0);
      return true;
    });
  }
  function ribAssignDialog(accId) {
    var a = C.account(accId);
    form(a.iban ? "Remplacer le RIB" : "Attribuer un RIB", "Compte « " + esc(a.label) + " » (" + a.currency + "). L’IBAN (clé MOD 97) et le BIC sont contrôlés ; le motif est journalisé.", [
      { id: "iban", l: "IBAN", ph: "FR76 3000 4028 3200 0123 4567 890", value: "" }, { id: "bic", l: "BIC / SWIFT", ph: "BNPAFRPP" }, { id: "why", l: "Motif (8 caractères minimum)", ph: "Ex. RIB validé par la conformité" }
    ], a.iban ? "Remplacer le RIB" : "Attribuer le RIB", function (v) {
      try { C.adminAssignBank(accId, v.iban, v.bic, v.why, ME); } catch (er) { toast(er.message, true); return false; }
      toast(a.iban ? "RIB enregistré et journalisé." : "RIB enregistré et journalisé."); refreshBiz(bizOfAccount(a)); return true;
    });
  }
  function ribRevokeDialog(accId) {
    var a = C.account(accId);
    form("Retirer le RIB de ce compte ?", "Les virements entrants vers l’IBAN " + esc(C.groupIban(a.iban || "")) + " ne seront plus rapprochés. L’action est journalisée avec le motif.", [{ id: "why", l: "Motif du retrait (8 caractères minimum)", ph: "Ex. Compte clôturé à la demande du titulaire" }], "Retirer le RIB", function (v) {
      try { C.adminRevokeBank(accId, v.why, ME); } catch (er) { toast(er.message, true); return false; }
      toast("RIB retiré et journalisé."); refreshBiz(bizOfAccount(a)); return true;
    }, true);
  }
  /* Met à jour le solde d'un compte (donc de toutes ses cartes) : ajouter/retirer un montant, ou fixer le solde cible. Saisie en devise d'affichage. */
  function balDialog(accId) {
    var a = C.account(accId);
    form("Mettre à jour le solde", esc(a.label) + " · " + a.currency + " — solde actuel " + money(a.availableCents, a.currency) + ". Les cartes rattachées à ce compte suivent immédiatement.", [
      { id: "mode", l: "Type de mise à jour", options: [["adjust", "Ajouter / retirer un montant"], ["set", "Définir le solde à…"]] },
      { id: "amt", l: "Montant en " + sym(a.currency) + " (négatif pour retirer)", ph: DISP === "XPF" ? "300 000" : "2 500", num: true },
      { id: "why", l: "Justification (8 caractères minimum, journalisée)", ph: "Correction motivée…" }
    ], "Enregistrer le solde", function (v) {
      var s2 = v.amt.trim() ? stored(v.amt, a.currency) : null;
      if (s2 === null) { toast("Saisis un montant.", true); return false; }
      var delta = v.mode === "set" ? s2 - a.availableCents : s2;
      try { C.adminAdjust(a.id, delta, v.why, ME); } catch (er) { toast(er.message, true); return false; }
      toast("Solde mis à jour et journalisé : " + money(a.availableCents, a.currency) + "."); refreshBiz(bizOfAccount(a)); return true;
    });
  }
  function newCardDialog(bid) {
    var accts = bizAccts(D.BUSINESSES.filter(function (x) { return x.id === bid; })[0]);
    form("Émettre une carte pro", "La carte dépensera le solde du compte choisi.", [
      { id: "acc", l: "Compte débité", options: accts.map(function (a) { return [String(a.id), a.label + " (" + a.currency + ")"]; }) },
      { id: "holder", l: "Titulaire de la carte", ph: "Prénom Nom" }, { id: "net", l: "Réseau", options: [["visa", "Visa"], ["mastercard", "Mastercard"]] }
    ], "Émettre la carte", function (v) {
      if (v.holder.trim().length < 2) { toast("Renseigne le titulaire de la carte.", true); return false; }
      var c = C.addCard({ accountId: Number(v.acc), label: v.holder.trim(), lastFour: String(1000 + Math.floor(Math.random() * 9000)), network: v.net });
      log("business.card.create", "business_card", c.id, { cardholderName: v.holder.trim() });
      toast("Carte émise."); refreshBiz(bid); return true;
    });
  }

  /* — Recharges — */
  var rf = { q: "", scope: "all", st: "all" }, selTopup = null;
  var STATUS_ORDER = ["all", "succeeded", "pending", "requires_action", "failed", "canceled", "refunded"];
  var STATUS_LABEL = { all: "Tous les statuts", succeeded: "Créditée", pending: "En attente", requires_action: "Validation bancaire", failed: "Refusée", canceled: "Annulée", refunded: "Remboursée" };
  var rows = [], stripeSt = null;
  V.topups = function () {
    Promise.all([C.adminList(), C.stripeStatus()]).then(function (r) { rows = r[0]; stripeSt = r[1]; var box = $("#topup-body"); if (box) box.innerHTML = topupBody(); refreshBadges(); });
    return head("Modules", "Recharges par carte", "Chaque recharge du wallet personnel et du Wallet Pro par carte bancaire (Stripe) : statut, carte utilisée, écriture au ledger, réconciliation et remboursement.", '<button class="btn" data-simtopup>' + ico("card") + ' Simuler une recharge client</button><button class="btn" data-refresh>' + ico("refresh") + " Rafraîchir</button>") + '<div id="topup-body"><div class="empty">Chargement des recharges…</div></div>';
  };
  function topupBody() {
    var s = stripeSt, vol = {}, credited = rows.filter(function (r) { return r.status === "succeeded"; });
    credited.forEach(function (r) { var k = dispCur(r.currency); vol[k] = (vol[k] || 0) + (k === "USD" ? r.amountCents : C.convert(r.amountCents, r.currency, k)); });
    var volLabel = Object.keys(vol).length ? Object.keys(vol).map(function (k) { return money(vol[k], k); }).join(" · ") : money(0);
    var open = rows.filter(function (r) { return ["pending", "requires_action", "processing"].indexOf(r.status) >= 0; }).length;
    var filtered = rows.filter(function (r) { return (rf.scope === "all" || r.scope === rf.scope) && (rf.st === "all" || r.status === rf.st) && (!rf.q || (r.reference + r.who + r.detail + (r.cardLast4 || "")).toLowerCase().indexOf(rf.q.toLowerCase()) >= 0); });
    var callout = '<section class="stripe sim" aria-label="État de l’intégration Stripe"><p class="h">Simulateur local actif : aucune carte réelle n’est débitée.</p><p style="margin-top:4px">' + esc(s.reason) + '</p><dl><div><dt>Mode demandé</dt><dd>' + s.requestedMode + ' → simulateur (repli)</dd></div><div><dt>Clé secrète</dt><dd>Absente de cette page</dd></div><div><dt>Clé publique</dt><dd>—</dd></div><div><dt>Webhook signé</dt><dd>Non configuré (' + s.webhookPath + ')</dd></div><div><dt>Débits réels</dt><dd>Verrouillés (STRIPE_ALLOW_LIVE_CHARGES)</dd></div><div style="grid-column:span 2"><dt>Plafond par recharge — wallet personnel</dt><dd>' + fmt(s.limits.wallet.eur.perRechargeCents, "EUR") + " · " + fmt(s.limits.wallet.xpf.perRechargeCents, "XPF") + '</dd></div><div style="grid-column:span 2"><dt>Plafond par recharge — Wallet Pro</dt><dd>' + fmt(s.limits.business.eur.perRechargeCents, "EUR") + " · " + fmt(s.limits.business.xpf.perRechargeCents, "XPF") + '</dd></div><div style="grid-column:span 2"><dt>Plafond cumulé sur 24 h glissantes, par portefeuille</dt><dd>' + fmt(s.limits.wallet.eur.dailyCents, "EUR") + " · " + fmt(s.limits.wallet.xpf.dailyCents, "XPF") + '</dd></div></dl></section>';
    var chips = STATUS_ORDER.map(function (k) { return '<button class="chip" data-rst="' + k + '" aria-pressed="' + (rf.st === k) + '">' + STATUS_LABEL[k] + "</button>"; }).join("");
    var scope = [["all", "Tous"], ["wallet", "Wallet perso"], ["business", "Wallet Pro"]].map(function (c) { return '<button class="chip" data-rsc="' + c[0] + '" aria-pressed="' + (rf.scope === c[0]) + '">' + c[1] + "</button>"; }).join("");
    var body = filtered.map(function (r) {
      return '<tr class="clk" data-topup="' + r.reference + '"><td>' + dt(r.createdAt) + '</td><td><b>' + esc(r.who) + '</b><span class="sub">' + (r.scope === "wallet" ? "Wallet perso" : "Wallet Pro") + " · " + esc(r.detail) + '</span></td><td class="mono" style="font-size:12px">' + esc(r.reference) + "</td><td>" + (r.cardLast4 ? esc(String(r.cardBrand).toUpperCase()) + " •••• " + r.cardLast4 : "—") + '</td><td class="r mono">' + (r.status === "succeeded" ? '<span class="pos">+' + money(r.amountCents, r.currency) + "</span>" : '<span style="color:var(--muted);' + (["failed", "canceled", "refunded"].indexOf(r.status) >= 0 ? "text-decoration:line-through" : "") + '">' + money(r.amountCents, r.currency) + "</span>") + "</td><td>" + badge(r.status) + '</td><td style="color:var(--muted);font-size:12px">Simulation</td></tr>';
    }).join("");
    return callout + '<section class="kpis" style="margin-top:20px">' + kpi("green", "topup", "Volume crédité", volLabel, credited.length + " recharge" + (credited.length > 1 ? "s" : "") + " créditée" + (credited.length > 1 ? "s" : "")) + kpi("amber", "topup", "En cours", String(open), "En attente, 3-D Secure ou traitement") + kpi("brick", "topup", "Refusées", String(rows.filter(function (r) { return r.status === "failed"; }).length), "Carte refusée, expirée ou fonds insuffisants") + kpi("violet", "topup", "Remboursées", String(rows.filter(function (r) { return r.status === "refunded"; }).length), "Débitées du wallet, remboursées sur la carte") + "</section>" +
      '<section class="panel" style="margin-top:20px"><div class="panel-h"><div><p class="kick">Journal des recharges</p><h2>Toutes les recharges</h2><p>Wallets personnels et Wallet Pro dans un même tableau. Ouvre une ligne pour agir.</p></div></div>' +
      '<div class="tools"><label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input id="rq" placeholder="Référence, titulaire, entreprise, carte…" value="' + esc(rf.q) + '" aria-label="Rechercher une recharge"></label><div class="chips">' + scope + '</div></div><div class="chips" style="margin:10px 0 14px">' + chips + "</div>" +
      '<div class="tbl-w"><table><thead><tr><th>Date</th><th>Portefeuille</th><th>Référence</th><th>Carte</th><th class="r">Montant</th><th>Statut</th><th>Mode</th></tr></thead><tbody>' + (body || '<tr><td colspan="7" class="empty">' + (rows.length ? "Aucune recharge ne correspond aux filtres." : "Aucune recharge pour le moment.") + "</td></tr>") + "</tbody></table></div></section>";
  }
  function topupDrawer(ref) {
    curDrawer = function () { topupDrawer(ref); };
    var r = rows.filter(function (x) { return x.reference === ref; })[0]; if (!r) return; selTopup = ref;
    var openish = ["pending", "requires_action", "processing"].indexOf(r.status) >= 0;
    var foot = (openish ? '<button class="btn pri" data-tact="reconcile">Relire l’état chez Stripe</button>' : "") + (r.status === "pending" || r.status === "requires_action" ? '<button class="btn" data-tact="cancel">Annuler la recharge</button>' : "") + (r.status === "succeeded" ? '<button class="btn dng" data-tact="refund">Rembourser</button>' : "") + (!openish && r.status !== "succeeded" ? '<span style="color:var(--muted);font-size:12px">Cette recharge est clôturée : aucune action disponible.</span>' : "");
    var sim = r.status === "pending" ? '<div><div class="sec-t">Simulation (prototype)</div><p style="color:var(--muted);font-size:12px;margin-bottom:8px">Fais payer ce client depuis son navigateur, avec une carte de test.</p><button class="btn sm" data-tsim="4242 4242 4242 4242">Payer avec la carte 4242</button></div>' : r.status === "requires_action" ? '<div><div class="sec-t">Simulation (prototype)</div><p style="color:var(--muted);font-size:12px;margin-bottom:8px">Le client doit valider le paiement dans l’application de sa banque.</p><button class="btn sm" data-tsim="auth">Simuler la validation 3-D Secure du client</button></div>' : "";
    drawer(money(r.amountCents, r.currency), esc(r.reference) + " · " + (r.scope === "wallet" ? "Wallet perso" : "Wallet Pro"),
      '<div><div class="sec-t">Paiement</div><div class="kv"><span>Statut</span><span>' + badge(r.status) + '</span></div><div class="kv"><span>Carte</span><span>' + (r.cardLast4 ? esc(String(r.cardBrand).toUpperCase()) + " •••• " + r.cardLast4 : "—") + '</span></div><div class="kv"><span>Mode</span><span>Simulation</span></div><div class="kv"><span>Créée</span><span>' + dt(r.createdAt) + '</span></div><div class="kv"><span>Créditée</span><span>' + (r.creditedAt ? dt(r.creditedAt) : "—") + '</span></div><div class="kv"><span>PaymentIntent</span><span class="mono" style="font-size:11px">' + esc(r.paymentIntentId) + "</span></div>" + (r.failureMessage ? '<div class="kv"><span>Motif du refus</span><span>' + esc(r.failureMessage) + " (" + esc(r.failureCode) + ")</span></div>" : "") + '</div><div><div class="sec-t">Titulaire</div><div class="kv"><span>' + (r.scope === "wallet" ? "Utilisateur" : "Entreprise") + "</span><span>" + esc(r.who) + '</span></div><div class="kv"><span>Détail</span><span>' + esc(r.detail) + '</span></div><div class="kv"><span>Compte crédité</span><span>' + esc(r.accountLabel) + "</span></div></div>" +
      (r.status === "refunded" ? '<div><div class="sec-t">Remboursement</div><div class="kv"><span>Remboursée le</span><span>' + dt(r.refundedAt) + '</span></div><div class="kv"><span>Justification</span><span>' + esc(r.refundReason) + "</span></div></div>" : "") + sim +
      '<p style="color:var(--muted);font-size:12px">Chaque action est écrite dans le <a href="#journal" data-go="journal" style="text-decoration:underline">Journal système</a>.</p>', foot);
  }
  function reloadTopups(keep) { return Promise.all([C.adminList(), C.stripeStatus()]).then(function (r) { rows = r[0]; stripeSt = r[1]; var box = $("#topup-body"); if (box) box.innerHTML = topupBody(); refreshBadges(); if (keep) topupDrawer(keep); }); }
  /* « 2 000,00 € ≈ 238 663 ₣ » : plafond par recharge d'un portefeuille, dans les deux devises. */
  function capHint(scope) { return fmt(C.limits("EUR", scope).maxCents, "EUR") + " ≈ " + fmt(C.limits("XPF", scope).maxCents, "XPF"); }
  function simDialog() {
    var owners = D.USERS.filter(function (u) { return u.status === "active"; }).map(function (u) { return ["w:" + u.id, "Wallet perso — " + u.first + " " + u.last]; }).concat(D.BUSINESSES.filter(function (b) { return b.status === "active"; }).map(function (b) { return ["b:" + b.id, "Wallet Pro — " + b.brand]; }));
    form("Simuler une recharge client", "Crée une recharge et la fait payer avec une carte de test, comme le ferait le client depuis son application.", [
      { id: "who", l: "Portefeuille", options: owners }, { id: "amt", l: "Montant en " + sym("EUR") + " (max par recharge : " + capHint("wallet") + " en perso, " + capHint("business") + " en Pro)", ph: DISP === "XPF" ? "12 000" : "100", value: DISP === "XPF" ? "12000" : "100", num: true },
      { id: "card", l: "Carte de test", options: [["4242 4242 4242 4242", "4242 — paiement direct"], ["4000 0027 6000 3184", "3184 — 3-D Secure requis"], ["4000 0000 0000 0002", "0002 — carte refusée"], ["4000 0000 0000 9995", "9995 — fonds insuffisants"]] }], "Lancer la recharge", function (v) {
      var p = v.who.split(":");
      var acc = p[0] === "w" ? C.account(1000 + Number(p[1])) : C.account(2000 + Number(p[1]) * 10);
      // la recharge est payée dans la devise d'affichage (€ ou ₣) quand le compte l'accepte, puis créditée à la parité fixe
      var P = acc.currency === "USD" ? "USD" : DISP, m = Number(String(v.amt).replace(/\s/g, "").replace(",", ".")), cents = isFinite(m) ? Math.round(m * C.divisor(P)) : 0;
      var actor = p[0] === "w" ? acc.ownerName : D.BUSINESSES.filter(function (b) { return b.id === Number(p[1]); })[0].owner;
      return C.create({ accountId: acc.id, amountCents: cents, currency: P, idempotencyKey: "sim:" + Math.random().toString(36).slice(2), who: acc.ownerName, detail: p[0] === "w" ? acc.ownerDetail : "par " + actor + " · " + acc.ownerDetail, actor: actor }).then(function (c) { return C.simPay(c.reference, v.card); }).then(function (r) {
        toast(r.status === "succeeded" ? "Recharge créditée : " + fmt(r.amountCents, r.currency) + "." : r.status === "requires_action" ? "Validation 3-D Secure requise : ouvre la ligne pour la simuler." : "Recharge refusée : " + r.failureMessage, r.status === "failed");
        return reloadTopups().then(function () { return true; });
      }, function (e) { toast(e.message, true); return false; });
    });
  }

  /* — Documents, leads, notifications — */
  V.documents = function () {
    var rowsH = D.DOCS.map(function (x) { return '<tr class="clk" data-doc="' + x.id + '"><td><b>' + esc(x.title) + '</b><span class="sub mono" style="font-size:11px">' + esc(x.file) + "</span></td><td>" + esc(x.user) + "</td><td>" + x.type + "</td><td>" + badge(x.status) + "</td><td>" + x.date + "</td></tr>"; }).join("");
    return head("Modules", "Documents", "Justificatifs déposés par les utilisateurs et les entreprises (KYC, KYB, preuves de virement).") +
      '<section class="kpis">' + kpi("amber", "folder", "À valider", String(D.DOCS.filter(function (x) { return x.status === "pending"; }).length), "en attente") + kpi("green", "check", "Validés", String(D.DOCS.filter(function (x) { return x.status === "validated"; }).length), "ce mois") + kpi("brick", "close", "Refusés", String(D.DOCS.filter(function (x) { return x.status === "rejected"; }).length), "à redéposer") + "</section>" +
      '<div class="tbl-w"><table><thead><tr><th>Document</th><th>Déposé par</th><th>Type</th><th>Statut</th><th>Date</th></tr></thead><tbody>' + rowsH + "</tbody></table></div>";
  };
  V.leads = function () {
    var rowsH = D.LEADS.map(function (x) { return '<tr class="clk" data-lead="' + x.id + '"><td><b>' + esc(x.name) + '</b><span class="sub">' + esc(x.company) + "</span></td><td>" + x.source + '</td><td class="r mono">' + money(x.value) + "</td><td>" + badge(x.status) + "</td><td>" + x.date + "</td></tr>"; }).join("");
    var pipe = D.LEADS.filter(function (x) { return x.status !== "lost"; }).reduce(function (s, x) { return s + x.value; }, 0);
    return head("Modules", "Leads", "Prospects entrants et leur avancement commercial.") + '<section class="kpis">' + kpi("violet", "user-add", "Leads ouverts", String(D.LEADS.filter(function (x) { return x.status !== "lost"; }).length), "dans le pipeline") + kpi("green", "wallet", "Valeur du pipeline", money(pipe), "estimée") + "</section>" +
      '<div class="tbl-w"><table><thead><tr><th>Contact</th><th>Source</th><th class="r">Valeur</th><th>Statut</th><th>Reçu</th></tr></thead><tbody>' + rowsH + "</tbody></table></div>";
  };
  V.notifications = function () {
    var rowsH = D.NOTIFS.map(function (x) { return "<tr><td><b>" + esc(loc(x.title)) + '</b><span class="sub">' + esc(x.audience) + " · " + x.channel + "</span></td><td>" + x.sent + '</td><td class="r mono">' + x.reach + "</td></tr>"; }).join("");
    return head("Modules", "Notifications", "Messages envoyés aux utilisateurs par la plateforme.", '<button class="btn pri" data-newnotif>' + ico("plus") + " Nouvelle notification</button>") +
      '<div class="tbl-w"><table><thead><tr><th>Notification</th><th>Envoyée</th><th class="r">Destinataires</th></tr></thead><tbody>' + rowsH + "</tbody></table></div>";
  };

  /* — Analytics — */
  V.analytics = function () {
    // volumes mensuels en k€ ; en francs Pacifique : millions de ₣ (1 k€ = 0,1193317 M₣)
    var xp = DISP === "XPF", unit = xp ? "M ₣" : "k€", k = xp ? 0.1193317 : 1, nf = function (n) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: xp ? 2 : 1 }).format(n); };
    var byMonth = [["avr", 4.2], ["mai", 5.1], ["juin", 4.8], ["juil", 6.3], ["août", 7.4], ["sept", 8.9]].map(function (x) { return [x[0], Math.round(x[1] * k * 100) / 100]; });
    var mx = Math.max.apply(null, byMonth.map(function (x) { return x[1]; }));
    var bars = byMonth.map(function (x) { return '<div class="b"><span class="mono" style="font-size:11px">' + nf(x[1]) + '</span><i style="height:' + Math.round(x[1] / mx * 140) + 'px"></i><small>' + x[0] + "</small></div>"; }).join("");
    var cards = { visa: 0, mastercard: 0 }; C.state.topups.forEach(function (t) { if (t.cardBrand && cards[t.cardBrand] != null) cards[t.cardBrand]++; });
    return head("Modules", "Analytics", "Indicateurs de la plateforme sur six mois.") +
      '<section class="kpis">' + kpi("green", "topup", "Taux de réussite", successRate() + " %", "recharges par carte") + kpi("violet", "user", "Utilisateurs actifs", "11", "sur 12 inscrits") + kpi("teal", "wallet", "Volume recharges (sept.)", nf(8.9 * k) + " " + unit, "+20 % vs août") + kpi("amber", "shield", "Fraude détectée", "0,02 %", "sous le seuil") + "</section>" +
      '<section class="content"><div class="panel"><div class="panel-h"><div><h2>Volume de recharges par mois (' + unit + ')</h2></div></div><div class="bars">' + bars + '</div></div><div class="panel"><div class="panel-h"><div><h2>Cartes utilisées</h2></div></div><div class="setrow"><b>Visa</b><span class="mono">' + cards.visa + '</span></div><div class="setrow"><b>Mastercard</b><span class="mono">' + cards.mastercard + '</span></div><div class="setrow"><b>Autres</b><span class="mono">0</span></div></div></section>';
  };

  /* — Support — */
  V.support = function () {
    var rowsH = D.TICKETS.map(function (x) { return '<tr class="clk" data-ticket="' + x.id + '"><td><b class="mono">' + x.id + '</b></td><td>' + esc(loc(x.subject)) + '<span class="sub">' + esc(x.user) + "</span></td><td>" + badge(x.priority) + "</td><td>" + badge(x.status) + "</td><td>" + x.date + "</td></tr>"; }).join("");
    return head("Système", "Support", "Demandes des utilisateurs et des entreprises.") + '<div class="tbl-w"><table><thead><tr><th>Ticket</th><th>Sujet</th><th>Priorité</th><th>Statut</th><th>Reçu</th></tr></thead><tbody>' + rowsH + "</tbody></table></div>";
  };
  function ticketDrawer(id) {
    var t = D.TICKETS.filter(function (x) { return x.id === id; })[0];
    drawer(esc(t.id), esc(loc(t.subject)) + " · " + esc(t.user), '<div class="thread">' + t.thread.map(function (m2) { return '<div class="msg ' + m2[0] + '">' + esc(loc(m2[1])) + "<small>" + (m2[0] === "a" ? "Support · " : esc(t.user) + " · ") + m2[2] + "</small></div>"; }).join("") + '</div><label class="fld"><span>Répondre</span><textarea class="inp" id="reply" rows="3" placeholder="Votre réponse…"></textarea></label>',
      '<button class="btn pri" data-reply="' + id + '">Envoyer la réponse</button>' + (t.status === "open" ? '<button class="btn" data-resolve="' + id + '">Marquer comme résolu</button>' : ""));
  }

  /* — Journal — */
  var jf = { q: "", f: "all" };
  V.journal = function () {
    var chips = [["all", "Tout"], ["wallet", "Wallet"], ["card", "Carte"], ["user", "Utilisateur"], ["transaction", "Transaction"], ["topup", "Recharges"], ["business", "Wallet Pro"]].map(function (c) { return '<button class="chip" data-jf="' + c[0] + '" aria-pressed="' + (jf.f === c[0]) + '">' + c[1] + "</button>"; }).join("");
    var list = C.state.journal.filter(function (l) { return (jf.f === "all" || (jf.f === "topup" ? isTopup(l.action) : jf.f === "business" ? /^(admin\.)?business\./.test(l.action) : l.targetType === jf.f)) && (!jf.q || (l.action + actionLabel(l.action) + detailText(l.action, l.detail)).toLowerCase().indexOf(jf.q.toLowerCase()) >= 0); });
    var rowsH = list.map(function (l) { return "<tr><td>" + dt(l.createdAt) + "</td><td>" + esc(l.actor) + "</td><td>" + (isTopup(l.action) || ADMIN_ACTIONS[l.action] ? "<b>" + esc(actionLabel(l.action)) + '</b><span class="sub mono">' + l.action + "</span>" : esc(l.action)) + "</td><td>" + esc(l.targetType) + " #" + l.targetId + '</td><td style="max-width:360px;overflow-wrap:anywhere">' + esc(detailText(l.action, l.detail)) + "</td></tr>"; }).join("");
    return head("Système", "Journal système", "Traçabilité de toutes les actions sensibles. Lecture seule — aucune modification ou suppression n’est possible depuis cet écran.") +
      '<div class="tools"><label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input id="jq" placeholder="Type d’action…" value="' + esc(jf.q) + '" aria-label="Filtrer le journal"></label><div class="chips">' + chips + "</div></div>" +
      '<div class="tbl-w"><table><thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Cible</th><th>Détail</th></tr></thead><tbody>' + (rowsH || '<tr><td colspan="5" class="empty">Aucune entrée.</td></tr>') + "</tbody></table></div>";
  };

  /* — Paramètres — */
  V.settings = function () {
    var lw = C.limits("EUR", "wallet"), lb = C.limits("EUR", "business");
    var sw = function (name, desc, on) { return '<div class="setrow"><div><b>' + name + '</b><span class="d">' + desc + '</span></div><button class="sw" role="switch" aria-checked="' + on + '" data-sw aria-label="' + name + '"></button></div>'; };
    return head("Système", "Paramètres", "Configuration de la plateforme et des intégrations.", "") +
      '<div class="grid2"><section class="panel"><div class="panel-h"><div><h2>Plateforme</h2></div></div><div class="setrow"><div><b>Nom de la plateforme</b><span class="d">Affiché dans les e-mails et les applications.</span></div><input class="inp" style="max-width:200px" value="VTEX" aria-label="Nom de la plateforme"></div>' + sw("Inscriptions ouvertes", "Les nouveaux utilisateurs peuvent créer un compte.", true) + sw("Vérification d’identité obligatoire", "Plafonds réduits tant que le KYC n’est pas validé.", true) + sw("Alerte e-mail pour les litiges", "Envoyée à l’équipe support.", true) + "</section>" +
      '<section class="panel"><div class="panel-h"><div><h2>Recharges par carte</h2><p>Paramètres appliqués par le serveur à chaque recharge.</p></div><span class="badge wa">Simulation</span></div><div class="setrow"><div><b>Mode Stripe</b><span class="d">Prototype : simulateur. Le serveur réel accepte auto, real ou sim.</span></div><span class="mono">auto → sim</span></div><div class="setrow"><div><b>Plafond par recharge</b><span class="d">Wallet perso · Wallet Pro.</span></div><span class="mono">' + fmt(lw.maxCents, "EUR") + " / " + fmt(lb.maxCents, "EUR") + " · " + fmt(C.limits("XPF", "wallet").maxCents, "XPF") + " / " + fmt(C.limits("XPF", "business").maxCents, "XPF") + '</span></div><div class="setrow"><div><b>Plafond cumulé sur 24 h</b><span class="d">Par portefeuille : par utilisateur ou par entreprise.</span></div><span class="mono">' + fmt(lw.dailyMaxCents, "EUR") + " · " + fmt(C.limits("XPF", "wallet").dailyMaxCents, "XPF") + '</span></div><div class="setrow"><div><b>Montant minimum</b><span class="d">Wallet perso · Wallet Pro.</span></div><span class="mono">' + fmt(lw.minCents, "EUR") + " / " + fmt(lb.minCents, "EUR") + " · " + fmt(C.limits("XPF", "wallet").minCents, "XPF") + " / " + fmt(C.limits("XPF", "business").minCents, "XPF") + '</span></div><div class="setrow"><div><b>Parité fixe</b><span class="d">1 000 ₣ = 8,38 € : un compte en euros se recharge en francs Pacifique, et inversement.</span></div><span class="mono">1 € = 119,3317 ₣</span></div><div class="setrow"><div><b>Débits réels</b><span class="d">Verrou STRIPE_ALLOW_LIVE_CHARGES.</span></div><span class="badge er">Verrouillés</span></div><div class="setrow"><div><b>Webhook Stripe</b><span class="d">/api/stripe/webhook — filet de sécurité si le navigateur se ferme.</span></div><span class="badge ne">Non configuré</span></div></section></div>';
  };

  function render(o) {
    var v = V[route]; $("#page").innerHTML = v ? v(o) : '<div class="empty">Section introuvable.</div>';
  }

  /* ───── interactions ───── */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var g = t.closest("[data-go]"); if (g) { e.preventDefault(); var o = {}; if (g.dataset.open) o.open = g.dataset.open; return go(g.dataset.go, o); }
    if (t.closest("[data-closedlg]")) return closeDialog();
    if (t.closest("[data-close]") || t === $("#overlay")) return closeAll();
    if (t.closest("[data-burger]")) return document.body.classList.add("nav-open");
    if (t.closest("[data-scrim]")) return document.body.classList.remove("nav-open");
    var x;
    if ((x = t.closest("[data-disp]"))) return setDisp(x.dataset.disp);
    if ((x = t.closest("[data-uf]"))) { uf.f = x.dataset.uf; return render(); }
    if ((x = t.closest("[data-user]"))) return userDrawer(Number(x.dataset.user));
    if ((x = t.closest("[data-usertoggle]"))) { var u = D.USERS.filter(function (y) { return y.id === Number(x.dataset.usertoggle); })[0]; u.status = u.status === "suspended" ? "active" : "suspended"; log("user.update", "user", u.id, { status: u.status }); toast(u.first + (u.status === "suspended" ? " suspendu(e)." : " réactivé(e).")); render(); return userDrawer(u.id); }
    if (t.closest("[data-newuser]")) return form("Créer un utilisateur", "Le wallet personnel est provisionné immédiatement.", [{ id: "first", l: "Prénom", ph: "Prénom" }, { id: "last", l: "Nom", ph: "Nom" }, { id: "email", l: "E-mail", ph: "prenom.nom@mail.com" }], "Créer l’utilisateur", function (v) {
      if (!v.first.trim() || !v.last.trim() || v.email.indexOf("@") < 1) { toast("Renseigne prénom, nom et un e-mail valide.", true); return false; }
      var id = D.USERS.length + 1; D.USERS.push({ id: id, first: v.first.trim(), last: v.last.trim(), email: v.email.trim(), role: "user", status: "active", kyc: false, joined: "aujourd’hui", city: "—", balance: 0 });
      C.state.accounts[1000 + id] = { id: 1000 + id, scope: "wallet", label: "Compte Wallet EUR", currency: "EUR", availableCents: 0, ownerKey: "u" + id, ownerName: v.first.trim() + " " + v.last.trim(), ownerDetail: v.email.trim() };
      log("user.create", "user", id, { email: v.email.trim() }); toast("Utilisateur créé, wallet provisionné."); go("users"); return true;
    });
    if ((x = t.closest("[data-wallet]"))) return walletDrawer(Number(x.dataset.wallet));
    if ((x = t.closest("[data-cardtoggle]"))) { var c = C.state.cards.filter(function (y) { return y.id === Number(x.dataset.cardtoggle); })[0]; c.status = c.status === "frozen" ? "active" : "frozen"; log(c.status === "frozen" ? "card.freeze" : "card.unfreeze", "card", c.id, {}); toast(c.status === "frozen" ? "Carte gelée." : "Carte dégelée."); render(); return walletDrawer(Number(x.dataset.owner)); }
    if ((x = t.closest("[data-adjust]"))) return adjustDialog(Number(x.dataset.adjust));
    if ((x = t.closest("[data-biz]"))) { bizTab = "apercu"; return bizDrawer(Number(x.dataset.biz)); }
    if ((x = t.closest("[data-btab]"))) { bizTab = x.dataset.btab; return bizDrawer(Number(x.dataset.bid)); }
    if ((x = t.closest("[data-bstatus]"))) { var b = D.BUSINESSES.filter(function (y) { return y.id === Number(x.dataset.bid); })[0]; b.status = x.dataset.bstatus; log("business.status", "business", b.id, { status: b.status }); toast(b.brand + " : statut « " + b.status + " »."); render(); return bizDrawer(b.id); }
    if (t.closest("[data-newbiz]")) return newBizDialog();
    if ((x = t.closest("[data-ribgen]"))) { try { C.adminGenerateBank(Number(x.dataset.ribgen), ME); } catch (er) { return toast(er.message, true); } toast("RIB généré (IBAN valide, clé MOD 97)."); return refreshBiz(bizOfAccount(C.account(Number(x.dataset.ribgen)))); }
    if ((x = t.closest("[data-ribassign]"))) return ribAssignDialog(Number(x.dataset.ribassign));
    if ((x = t.closest("[data-ribrevoke]"))) return ribRevokeDialog(Number(x.dataset.ribrevoke));
    if ((x = t.closest("[data-acctbal]"))) return balDialog(Number(x.dataset.acctbal));
    if ((x = t.closest("[data-newcard]"))) return newCardDialog(Number(x.dataset.newcard));
    if ((x = t.closest("[data-bcard]"))) { var bc = C.state.cards.filter(function (y) { return y.id === Number(x.dataset.bcard); })[0]; bc.status = bc.status === "frozen" ? "active" : "frozen"; log(bc.status === "frozen" ? "card.freeze" : "card.unfreeze", "card", bc.id, {}); toast(bc.status === "frozen" ? "Carte gelée." : "Carte dégelée."); return refreshBiz(bizOfAccount(C.account(bc.accountId))); }
    if ((x = t.closest("[data-payout]"))) { var p = PAYOUTS.filter(function (y) { return y.id === Number(x.dataset.pid); })[0]; p.status = x.dataset.payout === "approve" ? "paid" : "rejected"; log("payout." + x.dataset.payout, "transaction", p.id, { reference: p.ref }); toast("Payout " + p.ref + (p.status === "paid" ? " validé." : " refusé.")); render(); return bizDrawer(p.biz); }
    /* recharges */
    if ((x = t.closest("[data-rst]"))) { rf.st = x.dataset.rst; return reloadTopups(); }
    if ((x = t.closest("[data-rsc]"))) { rf.scope = x.dataset.rsc; return reloadTopups(); }
    if ((x = t.closest("[data-topup]"))) return topupDrawer(x.dataset.topup);
    if (t.closest("[data-refresh]")) return reloadTopups().then(function () { toast("Liste actualisée."); });
    if (t.closest("[data-simtopup]")) return simDialog();
    if ((x = t.closest("[data-tact]"))) {
      var act = x.dataset.tact, ref = selTopup;
      if (act === "reconcile") return C.adminReconcile(ref, ME).then(function () { toast("État relu auprès du prestataire de paiement."); return reloadTopups(ref); }, function (er) { toast(er.message, true); });
      if (act === "cancel") return form("Annuler cette recharge ?", "Le paiement en attente est annulé chez Stripe : aucune somme ne sera débitée ni créditée.", [], "Annuler la recharge", function () { return C.adminCancel(ref, ME).then(function () { toast("Recharge annulée et journalisée."); return reloadTopups(ref).then(function () { return true; }); }, function (er) { toast(er.message, true); return false; }); }, true);
      if (act === "refund") { var r0 = rows.filter(function (y) { return y.reference === ref; })[0]; return form("Rembourser cette recharge ?", money(r0.amountCents, r0.currency) + " seront débités du solde de " + esc(r0.who) + " et remboursés sur la carte. Si le solde ne couvre plus le montant, l’opération est refusée.", [{ id: "why", l: "Justification (journalisée)", ph: "Ex. Demande du client, doublon de paiement…" }], "Confirmer le remboursement", function (v) { return C.adminRefund(ref, v.why, ME).then(function () { toast("Recharge remboursée : le solde a été débité et le remboursement journalisé."); return reloadTopups(ref).then(function () { return true; }); }, function (er) { toast(er.message, true); return false; }); }, true); }
    }
    if ((x = t.closest("[data-tsim]"))) { var ref2 = selTopup, card = x.dataset.tsim; var pr = card === "auth" ? C.simAuthenticate(ref2) : C.simPay(ref2, card); return pr.then(function () { return C.adminReconcile(ref2, "Système"); }).then(function () { toast(card === "auth" ? "Validation 3-D Secure simulée : recharge créditée." : "Paiement simulé."); return reloadTopups(ref2); }, function (er) { toast(er.message, true); }); }
    /* documents / leads / notifications / support */
    if ((x = t.closest("[data-doc]"))) { var dc = D.DOCS.filter(function (y) { return y.id === Number(x.dataset.doc); })[0]; return drawer(esc(dc.title), esc(dc.user) + " · " + dc.type, '<div><div class="sec-t">Fichier</div><div class="kv"><span>Nom</span><span class="mono" style="font-size:12px">' + esc(dc.file) + '</span></div><div class="kv"><span>Statut</span><span>' + badge(dc.status) + '</span></div><div class="kv"><span>Déposé</span><span>' + dc.date + "</span></div></div>", dc.status === "pending" ? '<button class="btn pri" data-docact="validated" data-did="' + dc.id + '">Valider</button><button class="btn dng" data-docact="rejected" data-did="' + dc.id + '">Refuser</button>' : ""); }
    if ((x = t.closest("[data-docact]"))) { var d2 = D.DOCS.filter(function (y) { return y.id === Number(x.dataset.did); })[0]; d2.status = x.dataset.docact; log(d2.status === "validated" ? "document.validate" : "document.reject", "document", d2.id, { title: d2.title }); toast("Document " + (d2.status === "validated" ? "validé." : "refusé.")); closeAll(); return render(); }
    if ((x = t.closest("[data-lead]"))) { var ld = D.LEADS.filter(function (y) { return y.id === Number(x.dataset.lead); })[0]; return drawer(esc(ld.name), esc(ld.company) + " · " + ld.source, '<div><div class="sec-t">Suivi</div><div class="kv"><span>Statut</span><span>' + badge(ld.status) + '</span></div><div class="kv"><span>Valeur estimée</span><span class="mono">' + money(ld.value) + "</span></div></div>", ["contacted", "qualified", "lost"].filter(function (s) { return s !== ld.status; }).map(function (s) { return '<button class="btn" data-leadact="' + s + '" data-lid="' + ld.id + '">' + { contacted: "Marquer contacté", qualified: "Qualifier", lost: "Perdu" }[s] + "</button>"; }).join("")); }
    if ((x = t.closest("[data-leadact]"))) { var l2 = D.LEADS.filter(function (y) { return y.id === Number(x.dataset.lid); })[0]; l2.status = x.dataset.leadact; toast("Lead mis à jour."); closeAll(); return render(); }
    if (t.closest("[data-newnotif]")) return form("Nouvelle notification", "Envoyée immédiatement aux destinataires choisis.", [{ id: "title", l: "Titre", ph: "Ex. Nouvelle fonctionnalité" }, { id: "aud", l: "Destinataires", options: [["Tous les utilisateurs", "Tous les utilisateurs"], ["Wallets personnels", "Wallets personnels"], ["Wallet Pro", "Wallet Pro"], ["KYC incomplet", "KYC incomplet"]] }], "Envoyer", function (v) { if (v.title.trim().length < 4) { toast("Donne un titre d’au moins 4 caractères.", true); return false; } D.NOTIFS.unshift({ id: D.NOTIFS.length + 1, title: v.title.trim(), audience: v.aud, channel: "In-app", sent: "À l’instant", reach: v.aud === "Tous les utilisateurs" ? D.USERS.length : 6 }); log("notification.send", "notification", D.NOTIFS.length, { audience: v.aud }); toast("Notification envoyée."); render(); return true; });
    if ((x = t.closest("[data-ticket]"))) return ticketDrawer(x.dataset.ticket);
    if ((x = t.closest("[data-reply]"))) { var tk = D.TICKETS.filter(function (y) { return y.id === x.dataset.reply; })[0], txt = $("#reply").value.trim(); if (txt.length < 2) return toast("Écris une réponse.", true); tk.thread.push(["a", txt, "à l’instant"]); toast("Réponse envoyée."); return ticketDrawer(tk.id); }
    if ((x = t.closest("[data-resolve]"))) { var tk2 = D.TICKETS.filter(function (y) { return y.id === x.dataset.resolve; })[0]; tk2.status = "resolved"; log("support.resolve", "ticket", 0, { ticket: tk2.id }); toast("Ticket résolu."); closeAll(); return render(); }
    if ((x = t.closest("[data-jf]"))) { jf.f = x.dataset.jf; return render(); }
    if ((x = t.closest("[data-sw]"))) return x.setAttribute("aria-checked", x.getAttribute("aria-checked") === "true" ? "false" : "true");
  });
  function keepFocus(input, setter) { return function () { setter(input.value); var pos = input.selectionStart, id = input.id; render(); var n = document.getElementById(id); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }; }
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "uq") keepFocus(t, function (v) { uf.q = v; })();
    else if (t.id === "wq") keepFocus(t, function (v) { wf.q = v; })();
    else if (t.id === "bq") keepFocus(t, function (v) { bf.q = v; })();
    else if (t.id === "jq") keepFocus(t, function (v) { jf.q = v; })();
    else if (t.id === "rq") { rf.q = t.value; var pos = t.selectionStart; var box = $("#topup-body"); if (box) { box.innerHTML = topupBody(); var n = $("#rq"); n.focus(); n.setSelectionRange(pos, pos); } }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.urole) { var u = D.USERS.filter(function (y) { return y.id === Number(t.dataset.urole); })[0]; u.role = t.value; log("user.update", "user", u.id, { role: u.role }); toast("Rôle de " + u.first + " : " + u.role + "."); render(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });
  window.addEventListener("hashchange", function () { var id = location.hash.slice(1); if (id && id !== route && V[id]) go(id); });
  C.subscribe(function () { refreshBadges(); });

  function start() { shell(); var first = location.hash.slice(1); go(first && V[first] ? first : "home"); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
