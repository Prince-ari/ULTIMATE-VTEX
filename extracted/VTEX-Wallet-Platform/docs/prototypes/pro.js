/* Wallet Pro — coque, routeur et vues du prototype. Dépend de VtexCore, ProData et VtexReceipt. */
(function () {
  "use strict";
  var C = window.VtexCore, D = window.ProData;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var fmt = C.fmt;
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ───── icônes (trait 2 px, viewBox 24) ───── */
  var IC = {
    home: '<path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/>', wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2.5"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', arrows: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>', send: '<path d="M3 11.5 21 3l-6 18-3.5-7.5Z"/>',
    basket: '<path d="M5 9h14l-1.4 9.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    button: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h8"/>', pos: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9 6.5h6M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M12 14.5h.01M15 14.5h.01"/>',
    invoice: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', quote: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>', cycle: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12A8 8 0 0 1 18 6.7"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    orders: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>', box: '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4"/>', people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5a3.2 3.2 0 0 1 0 6M18 14a5.5 5.5 0 0 1 3.5 6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', chartline: '<path d="M3 17 9 11l4 4 8-9"/><path d="M15 6h6v6"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', shield: '<path d="M12 3 5 6v6c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6z"/><path d="m9 12 2 2 4-4"/>', team: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    role: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l3 3"/>', apps: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    hook: '<path d="M9 7a3 3 0 1 1 3 3l-2 5a3 3 0 1 0 5 2M16 12a3 3 0 1 1-3 5"/>', sandbox: '<path d="M4 7h16l-1.5 12a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8z"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>', building: '<path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M14 10h4a1 1 0 0 1 1 1v10M3 21h18M9 8h.01M9 12h.01M9 16h.01"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5A6 6 0 1 1 9.5 15"/>', bell: '<path d="M18 10a6 6 0 0 0-12 0c0 6-2.5 7-2.5 8h17c0-1-2.5-2-2.5-8"/><path d="M10 21h4"/>', plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', card: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h3"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', up: '<path d="M4 15h6v6h4v-6h6L12 3Z"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'
  };
  function ico(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || IC.file) + "</svg>"; }

  var STATUS = {
    paid: ["ok", "Payée"], sent: ["nt", "Envoyée"], overdue: ["er", "En retard"], draft: ["ne", "Brouillon"], cancelled: ["ne", "Annulée"], active: ["ok", "Actif"], expired: ["ne", "Expiré"], open: ["wa", "Ouvert"], completed: ["ok", "Terminé"],
    fulfilled: ["ok", "Expédiée"], pending: ["wa", "En attente"], refunded: ["ne", "Remboursée"], accepted: ["ok", "Accepté"], declined: ["er", "Refusé"], converted: ["nt", "Converti"], paused: ["wa", "En pause"], blocked: ["er", "Bloqué"],
    disabled: ["ne", "Désactivé"], archived: ["ne", "Archivé"], won: ["ok", "Gagné"], lost: ["er", "Perdu"], under_review: ["nt", "En revue"], ready: ["ok", "Prêt"], revoked: ["er", "Révoqué"], rejected: ["er", "Refusé"], approved: ["ok", "Approuvé"],
    pending_approval: ["wa", "À approuver"], invited: ["nt", "Invité"], succeeded: ["ok", "Créditée"], failed: ["er", "Refusée"], requires_action: ["wa", "Validation bancaire"], canceled: ["ne", "Annulée"]
  };
  function badge(s) { var m = STATUS[s] || ["ne", s]; return '<span class="badge ' + m[0] + '">' + m[1] + "</span>"; }
  /* Devise d'AFFICHAGE de Wallet Pro (€ ou ₣, parité fixe 1 € = 119,3317 ₣) : les comptes gardent leur devise, seuls l'affichage et la saisie
     des montants suivent ce choix. Le dollar n'est jamais converti. */
  var DISP = "EUR";
  try { var savedDisp = window.localStorage.getItem("vtex-pro-art-disp"); if (savedDisp === "EUR" || savedDisp === "XPF") DISP = savedDisp; } catch (_) { /* stockage indisponible */ }
  function dispCur(cur) { return (cur || "EUR") === "USD" ? "USD" : DISP; }
  function money(cents, cur) { cur = cur || "EUR"; var to = dispCur(cur); return fmt(C.convert(cents, cur, to), to); }
  function sym(cur) { return C.SYMBOLS[dispCur(cur)]; }
  /* Textes statiques (KPI, listes) : les montants en euros suivent la devise d'affichage. « &euro; » est volontairement épargné (lignes bi-devises). */
  function loc(s) {
    if (DISP === "EUR") return String(s);
    return String(s).replace(/(\d[\d   ]*(?:[.,]\d{1,2})?)\s?€/g, function (m, d) {
      var e = Number(d.replace(/[\s  ]/g, "").replace(",", "."));
      return isFinite(e) ? fmt(C.convert(Math.round(e * 100), "EUR", "XPF"), "XPF") : m;
    });
  }
  /* Saisie (devise d'affichage) → unité stockée du compte ; null si invalide. */
  function stored(value, accCur) {
    var major = Number(String(value).replace(/\s/g, "").replace(",", "."));
    if (!isFinite(major)) return null;
    var entry = dispCur(accCur);
    return C.convert(Math.round(major * C.divisor(entry)), entry, accCur);
  }
  function applyDisp(next) {
    DISP = next;
    try { window.localStorage.setItem("vtex-pro-art-disp", next); } catch (_) { /* choix non mémorisé */ }
    document.querySelectorAll("[data-disp]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.disp === DISP)); });
  }
  function setDisp(next) { applyDisp(next); closeAll(); if (route === "topup") { if (receipt) receipt.refresh(); } else render(); }
  function curSwitch() {
    return '<div class="curbar" role="group" aria-label="Devise d’affichage">' + [["EUR", "€", "Euro"], ["XPF", "₣", "Franc Pacifique"]].map(function (o) {
      return '<button type="button" data-disp="' + o[0] + '" aria-pressed="' + (DISP === o[0]) + '" title="' + (o[0] === "XPF" ? "Parité fixe : 1 € = 119,3317 ₣" : "Euro") + '"><b>' + o[1] + '</b><span class="lbl">' + o[2] + "</span></button>";
    }).join("") + "</div>";
  }

  /* ───── toast, tiroir, dialogue ───── */
  var toastTimer;
  function toast(msg, err) { var t = $("#toast"); t.textContent = loc(msg); t.classList.toggle("err", !!err); t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("on"); }, 3200); }
  function closeAll() { $("#overlay").classList.remove("on"); $("#drawer").classList.remove("on"); $("#dlg").classList.remove("on"); }
  function openDrawer(title, sub, body, foot) {
    $("#drawer").innerHTML = '<div class="drawer-h"><div><h2>' + title + "</h2><p>" + (sub || "") + '</p></div><button class="icon-btn" data-close aria-label="Fermer">' + ico("close") + '</button></div><div class="drawer-b">' + loc(body) + "</div>" + (foot ? '<div class="drawer-f">' + foot + "</div>" : "");
    $("#overlay").classList.add("on"); $("#drawer").classList.add("on");
  }
  function openDialog(html) { $("#dlg").innerHTML = loc(html); $("#overlay").classList.add("on"); $("#dlg").classList.add("on"); var f = $("#dlg input,#dlg select"); if (f) setTimeout(function () { f.focus(); }, 60); }

  /* ───── coque ───── */
  var route = "dashboard";
  var navLabel = {};
  D.NAV.forEach(function (g) { g.items.forEach(function (i) { navLabel[i.id] = { label: i.label, group: g.k }; }); });
  navLabel.dashboard = { label: "Dashboard", group: "" };

  function buildShell() {
    var nav = '<button class="nav-i" data-go="dashboard"><span class="ic">' + ico("home") + "</span>Dashboard</button>" + D.NAV.map(function (g) {
      return '<div class="nav-grp"><div class="nav-k">' + g.k + "</div>" + g.items.map(function (i) {
        return '<button class="nav-i' + (i.cta ? " cta" : "") + '" data-go="' + i.id + '"><span class="ic">' + ico(i.icon) + "</span>" + i.label + (i.live ? '<span class="live">Live</span>' : "") + "</button>";
      }).join("") + "</div>";
    }).join("");
    $("#app").innerHTML = '<aside class="side" id="side"><div class="brand"><span class="brand-mark"><span>VTEX</span></span><div>VTEX Business<small>Wallet Pro</small></div></div>' +
      '<div class="org"><span class="org-av">SL</span><div><b>Selego SAS</b><small>Kevin Massou · Owner</small></div></div><nav class="nav" aria-label="Navigation principale">' + nav + "</nav></aside>" +
      '<div class="scrim" data-scrim></div><div class="main"><header class="top"><button class="burger" data-burger aria-label="Ouvrir le menu">' + ico("menu") + '</button><div class="crumb" id="crumb"></div><div class="top-r">' + curSwitch() +
      '<label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input id="nav-search" placeholder="Aller à… (Payouts, Factures)" aria-label="Aller à une section" list="nav-list"></label><datalist id="nav-list">' +
      Object.keys(navLabel).map(function (k) { return '<option value="' + navLabel[k].label + '">'; }).join("") + '</datalist><button class="icon-btn" data-go="approvals" aria-label="Notifications">' + ico("bell") + '<span class="dotn"></span></button></div></header><main class="pg" id="page"></main></div>';
  }

  function setRoute(id, opts) {
    route = id; opts = opts || {};
    document.body.classList.remove("nav-open");
    var topup = id === "topup";
    document.body.classList.toggle("focus", topup);
    if (topup) unmountStage();
    $("#screen-topup").classList.toggle("on", topup);
    if (topup) { receipt.open(opts); }
    else render(opts);
    document.querySelectorAll(".nav-i").forEach(function (b) { b.setAttribute("aria-current", b.getAttribute("data-go") === id ? "page" : "false"); });
    var n = navLabel[id]; var cr = $("#crumb"); if (cr) cr.innerHTML = n ? (n.group ? n.group + " › " : "") + "<b>" + n.label + "</b>" : "";
    try { if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id); } catch (_) { /* environnement sans historique */ }
    window.scrollTo(0, 0);
  }

  /* ───── vues ───── */
  function spark(data, color, w, h) {
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data), rng = (max - min) || 1, pad = 4, step = (w - pad * 2) / (data.length - 1);
    var pts = data.map(function (v, i) { return [pad + i * step, pad + (1 - (v - min) / rng) * (h - pad * 2)]; });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var id = "g" + Math.random().toString(36).slice(2, 7), last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + " " + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".22"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs><path d="' + line + " L " + last[0] + " " + (h - pad) + " L " + pts[0][0] + " " + (h - pad) + ' Z" fill="url(#' + id + ')"/><path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="' + color + '"/></svg>';
  }
  function accts() { return Object.keys(C.state.accounts).map(function (k) { return C.state.accounts[k]; }).filter(function (a) { return a.ownerKey === D.OWNER; }); }
  function ledger() { var ids = accts().map(function (a) { return a.id; }); return C.state.ledger.filter(function (l) { return ids.indexOf(l.accountId) >= 0; }); }
  function ago(iso) { var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (m < 1) return "à l’instant"; if (m < 60) return "il y a " + m + " min"; var h = Math.round(m / 60); if (h < 24) return "il y a " + h + " h"; return "il y a " + Math.round(h / 24) + " j"; }
  var LEDGER_LABEL = { topup: "Recharge", payment: "Paiement", invoice_payment: "Facture", subscription: "Abonnement", payout: "Payout", refund: "Remboursement", chargeback: "Chargeback", fee: "Frais", transfer: "Transfert", adjustment: "Ajustement" };

  function pageHead(title, lede, acts) { return '<div class="ph"><div><div class="kick" style="margin-bottom:8px">' + (navLabel[route] && navLabel[route].group ? navLabel[route].group : "Wallet Pro") + "</div><h1>" + title + "</h1>" + (lede ? "<p>" + lede + "</p>" : "") + "</div>" + (acts ? '<div class="acts">' + acts + "</div>" : "") + "</div>"; }
  function kpiRow(k) { return '<div class="grid4">' + k.map(function (x) { return '<div class="kpi"><span class="kick">' + x.l + '</span><span class="kpi-v">' + x.v + '</span><span class="kpi-r"><span class="dl ' + (x.t || "nt") + '">' + (x.d === "€" ? sym("EUR") : x.d) + "</span>" + (x.h || "") + "</span></div>"; }).join("") + "</div>"; }

  var VIEWS = {};

  VIEWS.dashboard = function () {
    var eurAccts = accts().filter(function (a) { return a.currency !== "USD"; }), usd = accts().filter(function (a) { return a.currency === "USD"; });
    var total = eurAccts.reduce(function (s, a) { return s + C.convert(a.availableCents, a.currency, DISP); }, 0), usdTotal = usd.reduce(function (s, a) { return s + a.availableCents; }, 0);
    var whole = Math.floor(total / C.divisor(DISP)), cents = String(total % 100).padStart(2, "0");
    var heroTotal = DISP === "XPF" ? new Intl.NumberFormat("fr-FR").format(total) + " <span>₣</span>" : new Intl.NumberFormat("fr-FR").format(whole) + "," + cents + " <span>€</span>";
    var topupSum = C.state.topups.filter(function (t) { return t.scope === "business" && t.status === "succeeded"; }).reduce(function (s, t) { return s + C.eurEq(t.amountCents, t.currency); }, 0);
    var tl = ledger().slice(0, 7).map(function (l) {
      var col = l.direction === "credit" ? (l.type === "topup" ? "#62B8B0" : "#5FB03E") : l.type === "chargeback" ? "#ef5a67" : "#E85820";
      return '<li><span class="dot" style="background:' + col + ";box-shadow:0 0 0 4px " + col + '29"></span><div style="min-width:0;flex:1"><div class="t mono">' + ago(l.createdAt) + " · " + (LEDGER_LABEL[l.type] || l.type) + '</div><div class="w">' + esc(l.description) + '</div></div><div class="a ' + (l.direction === "credit" ? "c" : "d") + ' mono">' + (l.direction === "credit" ? "+" : "−") + money(l.amountCents, l.currency) + "</div></li>";
    }).join("");
    var pend = D.PAYOUTS.filter(function (p) { return p.status === "pending_approval"; }).length;
    var overdue = D.MODS.invoices.rows.filter(function (r) { return r.status === "overdue"; });
    var overdueSum = overdue.reduce(function (s, r) { return s + r.amt; }, 0);
    return '<section class="hero"><div class="hero-wm" aria-hidden="true">VTEX</div><div class="hero-in"><div style="min-width:0"><div class="kick">Solde consolidé · comptes en ' + (DISP === "XPF" ? "francs Pacifique" : "euros") + ' (parité fixe)</div><div class="hero-amt num" id="hero-total">' + heroTotal + "</div>" +
      '<div class="hero-meta"><span class="pill-pos">' + ico("up").replace("<svg", '<svg width="12" height="12" fill="currentColor" stroke="none"') + ' +12,4 % vs mois précédent</span><span>' + eurAccts.length + " comptes · + " + money(usdTotal, "USD") + " en USD</span></div>" +
      '<div class="hero-ctas"><button class="btn dark" data-go="topup">Recharger le wallet<span class="dot">' + ico("plus") + '</span></button><button class="btn ghost" data-go="payment-links">' + ico("link") + ' Encaisser un paiement</button><button class="btn ghost" data-go="invoices">' + ico("invoice") + " Nouvelle facture</button></div></div>" +
      '<div class="hero-spark"><div class="row"><span>Encaissement · 30 j</span><span style="color:#3E8B54">↑ tendance</span></div>' + spark([4200, 4600, 3900, 5100, 5400, 5900, 4700, 5200, 6100, 6400, 5800, 6300, 7100, 6800, 7400, 6900, 7800, 7500, 8200, 8600, 8100, 8900, 9400, 9100, 9800, 10500, 10100, 11200, 10800, 11900], "#2A5B84", 260, 74) + '<div class="row" style="margin:8px 0 0"><span>15 août</span><span>Aujourd’hui</span></div></div></div></section>' +
      '<div class="grid4"><button class="atile forest" data-go="topup"><span class="socle" style="background:#97CE5E">' + ico("card") + '</span><div><div class="kick">Finance · recharge</div><h3>Recharger par carte</h3><p>Crédite un compte ou une carte depuis une carte bancaire extérieure.</p></div></button>' +
      '<button class="atile blue" data-go="payment-links"><span class="socle" style="background:#5FA8D8">' + ico("link") + '</span><div><div class="kick">Payments · lien</div><h3>Encaisser en un lien</h3><p>Génère une URL de paiement à partager.</p></div></button>' +
      '<button class="atile brick" data-go="payouts"><span class="socle" style="background:#E5903F">' + ico("send") + '</span><div><div class="kick">Finance · payout</div><h3>Payer un fournisseur</h3><p>' + pend + " payout(s) attendent une approbation.</p></div></button>" +
      '<button class="atile teal" data-go="team-users"><span class="socle" style="background:#BFE3A8">' + ico("team") + '</span><div><div class="kick">Team · invitation</div><h3>Inviter un membre</h3><p>Owner, Admin, Finance, Support ou Viewer.</p></div></button></div>' +
      kpiRow([{ l: "Encaissé ce mois", v: "184 320 €", d: "+12,4 %", t: "up", h: "vs mois précédent" }, { l: "Recharges par carte", v: money(topupSum, "EUR"), d: "live", t: "nt", h: "recharges créditées" }, { l: "Paiements réussis", v: "1 284", d: "+8,1 %", t: "up", h: "91,5 % de réussite" }, { l: "Nouveaux clients", v: "87", d: "+19", t: "up", h: "30 derniers jours" }]) +
      '<div class="bento"><article class="panel"><div class="panel-h"><div><h2>Aujourd’hui, minute par minute</h2><p>Paiements, recharges et payouts dans le même flux.</p></div><button class="btn sm" data-go="transactions">Voir tout ' + ico("ext") + '</button></div><ol class="tl">' + tl + "</ol></article>" +
      '<article class="panel"><div class="panel-h"><div><h2>Alertes actives</h2></div><span class="badge wa">3</span></div>' +
      '<button class="alert" data-go="invoices"><span class="socle" style="background:#E5903F">' + ico("invoice") + "</span><span><b>" + overdue.length + " factures en retard</b><span>Total " + money(overdueSum, "EUR") + " · relances programmées ce soir</span></span></button>" +
      '<button class="alert" data-go="payouts"><span class="socle" style="background:#8ea9ff">' + ico("check") + "</span><span><b>" + pend + " payouts à approuver</b><span>Fournisseurs · décision Owner requise</span></span></button>" +
      '<button class="alert" data-go="chargebacks"><span class="socle" style="background:#ef5a67;color:#fff">' + ico("flag") + "</span><span><b>1 litige à traiter</b><span>Chargeback Visa · échéance dans 5 j</span></span></button></article></div>";
  };

  VIEWS.wallet = function () {
    var tone = ["blue", "teal", "brick", "forest"];
    var ac = accts().map(function (a, i) {
      var cards = C.state.cards.filter(function (c) { return c.accountId === a.id; });
      return '<div class="acc ' + tone[i % 4] + '"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div class="kick" style="color:inherit;opacity:.7">' + (C.SYMBOLS[a.currency] || a.currency) + " · compte</div><h3 style=\"font-size:18px;margin-top:4px\">" + esc(a.label) + '</h3></div><span class="socle" style="width:40px;height:40px;background:rgba(255,255,255,.85)">' + ico("wallet") + '</span></div><div class="amt">' + money(a.availableCents, a.currency) + '</div><div class="iban">' + esc(a.iban ? C.groupIban(a.iban) : "Aucun RIB attribué") + '</div><div class="row"><button class="btn sm solid" data-go="topup" data-acct="' + a.id + '">' + ico("plus") + ' Recharger ce compte</button><button class="btn sm" data-go="transactions" data-acct="' + a.id + '">Transactions</button></div></div>';
    }).join("");
    var cardBtns = C.state.cards.map(function (c) { return '<button class="btn sm" data-go="topup" data-card="' + c.id + '">' + ico("plus") + " Recharger •••• " + c.lastFour + "</button>"; }).join("");
    var rows = C.state.topups.filter(function (t) { return t.scope === "business"; }).slice(0, 6).map(function (t) {
      return "<tr><td><b>" + esc(t.reference) + '</b><span class="sub">' + esc(t.accountLabel) + "</span></td><td>" + (t.cardLast4 ? esc(t.cardBrand) + " •••• " + t.cardLast4 : "—") + '</td><td class="r mono">' + money(t.amountCents, t.currency) + "</td><td>" + badge(t.status) + "</td><td>" + ago(t.createdAt) + "</td></tr>";
    }).join("");
    return pageHead("Wallet", "Comptes, cartes et recharges de l’entreprise. Les cartes d’un compte se rechargent en créditant ce compte.", '<button class="btn pri" data-go="topup">' + ico("plus") + " Recharger</button>") +
      '<div class="grid2">' + ac + "</div>" +
      '<section><div class="panel-h"><div><h2>Cartes de l’entreprise</h2><p>Chaque carte partage le solde de son compte.</p></div></div>' + stageHtml() + '<div class="acts" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">' + cardBtns + "</div></section>" +
      '<section class="panel"><div class="panel-h"><div><h2>Recharges par carte</h2><p>Historique des recharges de tous les comptes.</p></div></div><div class="tbl-w"><table><thead><tr><th>Référence</th><th>Carte utilisée</th><th class="r">Montant</th><th>Statut</th><th>Date</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="empty">Aucune recharge.</td></tr>') + "</tbody></table></div></section>";
  };

  var tx = { q: "", f: "all", acct: null };
  VIEWS.transactions = function (o) {
    if (o) tx.acct = o.acct || null;
    var chips = [["all", "Toutes"], ["topup", "Recharges"], ["in", "Encaissements"], ["out", "Sorties"]].map(function (c) { return '<button class="chip" data-txf="' + c[0] + '" aria-pressed="' + (tx.f === c[0]) + '">' + c[1] + "</button>"; }).join("");
    var rows = ledger().filter(function (l) {
      if (tx.acct && l.accountId !== tx.acct) return false;
      if (tx.f === "topup" && l.type !== "topup") return false;
      if (tx.f === "in" && (l.direction !== "credit" || l.type === "topup")) return false;
      if (tx.f === "out" && l.direction !== "debit") return false;
      return !tx.q || (l.description + " " + l.reference).toLowerCase().indexOf(tx.q.toLowerCase()) >= 0;
    });
    var body = rows.map(function (l) {
      var a = C.account(l.accountId);
      return '<tr class="clk" data-tx="' + l.id + '"><td>' + esc(l.description) + '<span class="sub mono">' + esc(l.reference) + "</span></td><td>" + (LEDGER_LABEL[l.type] || l.type) + "</td><td>" + esc(a.label) + '</td><td class="r mono ' + (l.direction === "credit" ? "pos" : "neg") + '">' + (l.direction === "credit" ? "+" : "−") + money(l.amountCents, l.currency) + "</td><td>" + badge(l.status === "completed" ? "completed" : l.status) + "</td><td>" + ago(l.createdAt) + "</td></tr>";
    }).join("");
    return pageHead("Transactions", "Toutes les écritures du ledger : encaissements, recharges par carte, payouts, frais et remboursements." + (tx.acct ? " Filtre : " + esc(C.account(tx.acct).label) + "." : ""), tx.acct ? '<button class="btn sm" data-txclear>Retirer le filtre compte</button>' : "") +
      '<div class="tools">' + chips + '<label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input id="tx-q" placeholder="Référence, libellé…" value="' + esc(tx.q) + '" aria-label="Rechercher une transaction"></label></div>' +
      '<div class="tbl-w"><table><thead><tr><th>Libellé</th><th>Type</th><th>Compte</th><th class="r">Montant</th><th>Statut</th><th>Date</th></tr></thead><tbody>' + (body || '<tr><td colspan="6" class="empty">Aucune transaction ne correspond.</td></tr>') + "</tbody></table></div>";
  };

  VIEWS.payouts = function () {
    var pend = D.PAYOUTS.filter(function (p) { return p.status === "pending_approval"; });
    var bal = C.account(203).availableCents;
    var rows = D.PAYOUTS.map(function (p, i) {
      return '<tr class="clk" data-po="' + i + '"><td><b class="mono">' + p.ref + "</b></td><td>" + esc(p.who) + '<span class="sub mono">' + p.iban + '</span></td><td class="r mono">' + money(p.amt, p.cur) + "</td><td>" + badge(p.status) + "</td><td>" + p.date + '</td><td class="r">' + (p.status === "pending_approval" ? '<button class="btn sm pri" data-poact="approve" data-i="' + i + '">Valider</button> <button class="btn sm" data-poact="reject" data-i="' + i + '">Refuser</button>' : "") + "</td></tr>";
    }).join("");
    return pageHead("Payouts", "Paie tes fournisseurs depuis le compte « Payouts fournisseurs ». Valider un payout débite le compte et l’écrit au ledger.", '<button class="btn sm" data-go="topup" data-acct="203">' + ico("plus") + " Recharger ce compte</button>") +
      kpiRow([{ l: "À approuver", v: String(pend.length), d: "Owner", t: pend.length ? "dn" : "up", h: money(pend.reduce(function (s, p) { return s + p.amt; }, 0), "EUR") }, { l: "Solde payouts", v: money(bal, "EUR"), d: "disponible", t: "nt", h: "compte 203" }, { l: "Payés (30 j)", v: "38 400 €", d: "+4 %", t: "up", h: "19 payouts" }]) +
      '<div class="tbl-w"><table><thead><tr><th>Réf.</th><th>Bénéficiaire</th><th class="r">Montant</th><th>Statut</th><th>Date</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  };

  var roleOpts = ["owner", "admin", "finance", "support", "viewer"];
  VIEWS["team-users"] = function () {
    var rows = D.MEMBERS.map(function (m) {
      return "<tr><td><b>" + esc(m.name) + '</b><span class="sub">' + esc(m.email) + '</span></td><td><select class="sel" data-role="' + m.id + '" style="width:auto;padding:7px 12px" aria-label="Rôle de ' + esc(m.name) + '">' + roleOpts.map(function (r) { return '<option value="' + r + '"' + (m.role === r ? " selected" : "") + ">" + r.charAt(0).toUpperCase() + r.slice(1) + "</option>"; }).join("") + "</select></td><td>" + badge(m.status) + "</td><td>" + m.seen + '</td><td class="r"><button class="btn sm" data-mem="' + m.id + '">' + (m.status === "suspended" ? "Réactiver" : "Suspendre") + "</button></td></tr>";
    }).join("");
    return pageHead("Users", "Membres de l’équipe et leurs rôles. Seuls Owner, Admin et Finance peuvent recharger un compte.", '<button class="btn pri" data-invite>' + ico("plus") + " Inviter un membre</button>") +
      '<div class="tbl-w"><table><thead><tr><th>Membre</th><th>Rôle</th><th>Statut</th><th>Dernière activité</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  };

  VIEWS.analytics = function () {
    var data = [["avr", 118], ["mai", 131], ["juin", 126], ["juil", 149], ["août", 164], ["sept", 184]];
    return pageHead("Overview", "Vue d’ensemble de l’activité sur six mois.") + kpiRow([{ l: "Encaissé (sept.)", v: "184 320 €", d: "+12,4 %", t: "up", h: "vs août" }, { l: "Panier moyen", v: "143,50 €", d: "−2,3 %", t: "dn", h: "vs août" }, { l: "Taux de réussite", v: "91,5 %", d: "+1,2 pt", t: "up", h: "paiements" }, { l: "Remboursements", v: "0,6 %", d: "−0,1 pt", t: "up", h: "du volume" }]) +
      chartPanel("Encaissements par mois (k€)", data) + "";
  };
  function chartPanel(title, data, list) {
    if (DISP === "XPF" && /k€/.test(title)) { title = title.replace("k€", "M ₣"); data = data.map(function (d) { return [d[0], Math.round(d[1] * 0.1193317 * 100) / 100]; }); }
    var max = Math.max.apply(null, data.map(function (d) { return d[1]; }));
    return '<div class="bento"><article class="panel"><div class="panel-h"><div><h2>' + title + '</h2></div></div><div class="bars">' + data.map(function (d) { return '<div class="b"><span class="mono" style="font-size:11px">' + new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(d[1]) + '</span><i style="height:' + Math.round(d[1] / max * 130) + 'px"></i><small>' + d[0] + "</small></div>"; }).join("") + "</div></article>" +
      (list ? '<article class="panel"><div class="panel-h"><div><h2>' + list.title + "</h2></div></div>" + list.rows.map(function (r) { return '<div class="setrow"><b>' + r[0] + '</b><span class="mono" style="color:var(--c-t1)">' + r[1] + "</span></div>"; }).join("") + "</article>" : '<article class="panel"><div class="panel-h"><div><h2>Meilleurs produits</h2></div></div>' + [["Formation Design System", "51 200 €"], ["Consultation 1 h", "21 600 €"], ["Carnet Selego", "6 206 €"]].map(function (r) { return '<div class="setrow"><b>' + r[0] + '</b><span class="mono" style="color:var(--c-t1)">' + r[1] + "</span></div>"; }).join("") + "</article>") + "</div>";
  }

  /* — modules génériques — */
  var modState = {};
  function cell(c, r) {
    var v = r[c.k];
    if (c.kind === "money") return '<td class="r mono">' + (v ? money(v, r.cur) : "Libre") + "</td>";
    if (c.kind === "badge") return "<td>" + badge(v) + "</td>";
    if (c.kind === "mono") return '<td class="mono">' + esc(v) + "</td>";
    if (c.kind === "num") return '<td class="r mono">' + new Intl.NumberFormat("fr-FR").format(v) + "</td>";
    return "<td>" + esc(v) + (c.sub ? '<span class="sub">' + esc(r[c.sub]) + "</span>" : "") + "</td>";
  }
  function genericView(id) {
    var m = D.MODS[id]; var st = modState[id] || (modState[id] = { q: "" });
    if (m.sandbox) return sandboxView(m);
    if (m.matrix) return matrixView(m);
    if (m.chart) return pageHead(m.title, m.lede) + chartPanel(m.chart.title, m.chart.data, m.list);
    var acts = m.custom === "transfer" ? '<button class="btn pri" data-newtrf>' + ico("plus") + " Nouveau transfert</button>" : m.create ? '<button class="btn pri" data-new="' + id + '">' + ico("plus") + " " + m.create.label + "</button>" : "";
    var rows = m.rows.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return !st.q || JSON.stringify(x.r).toLowerCase().indexOf(st.q.toLowerCase()) >= 0; });
    var thead = m.cols.map(function (c) { return "<th" + (c.kind === "money" || c.kind === "num" ? ' class="r"' : "") + ">" + c.l + "</th>"; }).join("") + (m.actions ? "<th></th>" : "");
    var body = rows.map(function (x) {
      return '<tr class="clk" data-row="' + id + ":" + x.i + '">' + m.cols.map(function (c) { return cell(c, x.r); }).join("") + (m.actions ? '<td class="r"><span class="badge ne" style="cursor:pointer">Ouvrir</span></td>' : "") + "</tr>";
    }).join("");
    return pageHead(m.title, m.lede, acts) + (m.kpis ? kpiRow(m.kpis) : "") +
      '<div class="tools"><label class="search">' + ico("search").replace("<svg", '<svg width="15" height="15"') + '<input data-gq="' + id + '" placeholder="Rechercher…" value="' + esc(st.q) + '" aria-label="Rechercher dans ' + esc(m.title) + '"></label></div>' +
      '<div class="tbl-w"><table><thead><tr>' + thead + "</tr></thead><tbody>" + (body || '<tr><td colspan="' + (m.cols.length + 1) + '" class="empty">Aucun résultat.</td></tr>') + "</tbody></table></div>";
  }
  function matrixView(m) {
    var perms = ["Voir les soldes", "Recharger un compte", "Créer un payout", "Approuver un payout", "Gérer l’équipe", "Créer des clés d’API", "Modifier les réglages"];
    var roles = { Owner: [1, 1, 1, 1, 1, 1, 1], Admin: [1, 1, 1, 0, 1, 1, 1], Finance: [1, 1, 1, 0, 0, 0, 0], Support: [1, 0, 0, 0, 0, 0, 0], Viewer: [1, 0, 0, 0, 0, 0, 0] };
    return pageHead(m.title, m.lede) + '<div class="tbl-w"><table><thead><tr><th>Droit</th>' + Object.keys(roles).map(function (r) { return '<th class="r">' + r + "</th>"; }).join("") + "</tr></thead><tbody>" + perms.map(function (p, i) {
      return "<tr><td>" + p + "</td>" + Object.keys(roles).map(function (r) { return '<td class="r ' + (roles[r][i] ? "pos" : "") + '">' + (roles[r][i] ? "✓" : "—") + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
  }
  function sandboxView(m) {
    var cards = [["4242 4242 4242 4242", "Paiement réussi"], ["4000 0027 6000 3184", "Validation 3D Secure requise"], ["4000 0000 0000 0002", "Carte refusée"], ["4000 0000 0000 9995", "Fonds insuffisants"], ["4000 0000 0000 0069", "Carte expirée"]];
    return pageHead(m.title, m.lede, '<button class="btn pri" data-go="topup">' + ico("card") + " Tester une recharge</button>") +
      '<div class="panel"><div class="panel-h"><div><h2>Cartes de test</h2><p>Utilise ces numéros dans la page de recharge. Aucun n’est une vraie carte.</p></div></div>' + cards.map(function (c) { return '<div class="setrow"><b class="mono">' + c[0] + "</b><span>" + c[1] + "</span></div>"; }).join("") + "</div>";
  }
  function settingsView(id) {
    var s = D.SETTINGS[id];
    if (s.finance) {
      var lw = C.limits("EUR", "business");
      return pageHead(s.title, s.lede) + '<div class="grid2"><article class="panel"><div class="panel-h"><div><h2>Recharges par carte</h2><p>Paramètres appliqués par le serveur à chaque recharge.</p></div><span class="badge wa">Simulation</span></div>' +
        '<div class="setrow"><div><b>Mode de paiement</b><span>Ce prototype simule Stripe : aucune carte réelle, aucune clé.</span></div><span class="mono">sim</span></div>' +
        '<div class="setrow"><div><b>Montant minimum</b><span>Par recharge.</span></div><span class="mono">' + fmt(lw.minCents, "EUR").replace("€", "&euro;") + " · " + fmt(C.limits("XPF", "business").minCents, "XPF") + '</span></div>' +
        '<div class="setrow"><div><b>Plafond par recharge</b><span>Wallet Pro ; le wallet personnel est limité à ' + fmt(C.limits("EUR", "wallet").maxCents, "EUR").replace("€", "&euro;") + '.</span></div><span class="mono">' + fmt(lw.maxCents, "EUR").replace("€", "&euro;") + " · " + fmt(C.limits("XPF", "business").maxCents, "XPF") + '</span></div>' +
        '<div class="setrow"><div><b>Plafond cumulé sur 24 h</b><span>Par entreprise, tous comptes confondus.</span></div><span class="mono">' + fmt(lw.dailyMaxCents, "EUR").replace("€", "&euro;") + " · " + fmt(C.limits("XPF", "business").dailyMaxCents, "XPF") + '</span></div>' +
        '<div class="setrow"><div><b>Parité fixe</b><span>1 000 ₣ = 8,38 &euro; : un compte en euros se recharge en francs Pacifique, et inversement.</span></div><span class="mono">1 &euro; = 119,3317 ₣</span></div>' +
        '<div class="setrow"><div><b>Rôles autorisés</b><span>Owner, Admin et Finance.</span></div><span class="badge ok">3 rôles</span></div>' +
        '<div class="setrow"><div><b>Frais de recharge</b><span>Offerts pendant la phase de test.</span></div><span class="mono">0,00 €</span></div></article>' +
        '<article class="panel"><div class="panel-h"><div><h2>Devise et seuils</h2></div></div><div class="setrow"><div><b>Devise principale</b><span>Utilisée pour le solde consolidé.</span></div><span class="mono">' + sym("EUR") + '</span></div><div class="setrow"><div><b>Seuil d’approbation des payouts</b><span>Au-delà, un Owner doit valider.</span></div><span class="mono">1 000,00 €</span></div><div class="setrow"><div><b>Double validation</b><span>Deux membres pour les payouts &gt; 10 000 €.</span></div><button class="sw" role="switch" aria-checked="false" data-sw aria-label="Double validation"></button></div></article></div>';
    }
    if (s.fields) return pageHead(s.title, s.lede) + '<div class="panel">' + s.fields.map(function (f, i) { return '<div class="setrow"><label for="sf' + i + '"><b>' + f[0] + '</b></label><input class="inp" id="sf' + i + '" value="' + esc(f[1]) + '" style="max-width:340px"></div>'; }).join("") + '<div class="acts" style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn pri" data-save>Enregistrer</button></div></div>';
    return pageHead(s.title, s.lede) + '<div class="panel">' + s.toggles.map(function (t) { return '<div class="setrow"><div><b>' + t[0] + "</b><span>" + t[1] + '</span></div><button class="sw" role="switch" aria-checked="' + t[2] + '" data-sw aria-label="' + t[0] + '"></button></div>'; }).join("") + "</div>";
  }

  function render(opts) {
    var v = VIEWS[route];
    var html = v ? v(opts) : D.SETTINGS[route] ? settingsView(route) : D.MODS[route] ? genericView(route) : '<div class="empty">Section introuvable.</div>';
    unmountStage();
    $("#page").innerHTML = loc(html);
    if (route === "wallet") mountStage();
  }
  var stageCleanup = null;
  function unmountStage() { if (stageCleanup) { try { stageCleanup(); } catch (_) { /* nettoyage best-effort */ } stageCleanup = null; } }
  function mountStage() {
    var root = $("#stage3d"); if (!root || !window.VtexStage3D || !window.THREE) return;
    var themes = ["navy", "teal", "brick"], types = ["ENTREPRISE", "VIRTUELLE", "OPÉRATIONS", "PACIFIQUE"];
    var list = C.state.cards.filter(function (c) { return C.account(c.accountId).currency !== "USD"; }).map(function (c, i) {
      var a = C.account(c.accountId);
      return { theme: c.theme || themes[i % 3], type: types[i] || "ENTREPRISE", label: c.label, balance: C.convert(a.availableCents, a.currency, "EUR") / 100, network: c.network === "visa" ? "visa" : "mc", num: "•••• •••• •••• " + c.lastFour, holder: c.holder || "SELEGO SAS", expiry: c.expiry || "09/28", frozen: c.status === "frozen" };
    });
    try { stageCleanup = window.VtexStage3D.mount(root, DISP, list); } catch (_) { root.classList.add("no3d"); }
  }
  /* Carrousel 3D des cartes : « Glisser ou cliquer pour changer » se lit sous les cartes, juste au-dessus des flèches. */
  function stageHtml() {
    var arrow = function (d) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };
    return '<div class="stage3d" id="stage3d"><div class="vs-top"><span class="vs-count">01 / 01</span></div><div class="vs-view"><canvas class="vs-canvas"></canvas><div class="vs-hit" role="region" aria-label="Carrousel de cartes 3D"></div>' +
      '<div class="vs-cap"><div class="vs-sub">Solde disponible</div><div class="vs-amt">—</div></div></div>' +
      '<p class="vs-hint">Glisser ou cliquer pour changer</p>' +
      '<nav class="vs-nav"><button type="button" class="vs-prev" aria-label="Carte précédente">' + arrow("M15 5 8 12l7 7") + '</button><div class="vs-dots"></div><button type="button" class="vs-next" aria-label="Carte suivante">' + arrow("M9 5l7 7-7 7") + "</button></nav></div>";
  }

  /* ───── interactions ───── */
  function rowDrawer(id, i) {
    var m = D.MODS[id], r = m.rows[i];
    var kv = m.cols.map(function (c) { var v = r[c.k]; return '<div class="kv"><span>' + c.l + "</span><span>" + (c.kind === "money" ? (v ? money(v, r.cur) : "Libre") : c.kind === "badge" ? badge(v) : esc(v)) + "</span></div>"; }).join("");
    var foot = (m.actions || []).filter(function (a) { return !a.show || a.show(r); }).map(function (a, k) { return '<button class="btn ' + (k === 0 ? "pri" : "") + '" data-act="' + id + ":" + i + ":" + m.actions.indexOf(a) + '">' + a.l + "</button>"; }).join("");
    openDrawer(esc(r[m.cols[0].k]), m.title, '<div><div class="sec-t">Détail</div>' + kv + "</div>", foot || '<span style="color:var(--c-t3);font-size:12px">Aucune action disponible pour ce statut.</span>');
  }
  function txDrawer(idn) {
    var l = C.state.ledger.filter(function (x) { return x.id === Number(idn); })[0]; if (!l) return;
    var a = C.account(l.accountId), t = C.state.topups.filter(function (x) { return x.reference === l.reference; })[0];
    openDrawer(money(l.amountCents, l.currency), esc(l.description), '<div><div class="sec-t">Écriture</div><div class="kv"><span>Référence</span><span class="mono">' + esc(l.reference) + '</span></div><div class="kv"><span>Type</span><span>' + (LEDGER_LABEL[l.type] || l.type) + '</span></div><div class="kv"><span>Sens</span><span>' + (l.direction === "credit" ? "Crédit" : "Débit") + '</span></div><div class="kv"><span>Compte</span><span>' + esc(a.label) + '</span></div><div class="kv"><span>Date</span><span>' + new Date(l.createdAt).toLocaleString("fr-FR") + "</span></div></div>" +
      (t ? '<div><div class="sec-t">Recharge par carte</div><div class="kv"><span>Carte</span><span>' + esc(t.cardBrand) + " •••• " + esc(t.cardLast4) + '</span></div><div class="kv"><span>Statut</span><span>' + badge(t.status) + '</span></div><div class="kv"><span>Mode</span><span>Simulation</span></div></div>' : ""), "");
  }
  function formDialog(title, fields, submitLabel, onSubmit) {
    openDialog("<h2>" + title + "</h2>" + fields.map(function (f) { return '<label class="fld"><span>' + f.l + "</span>" + (f.options ? '<select class="sel" id="df-' + f.id + '">' + f.options.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</select>" : '<input class="inp" id="df-' + f.id + '" placeholder="' + esc(f.ph || "") + '"' + (f.num ? ' inputmode="decimal"' : "") + ">") + "</label>"; }).join("") + '<div class="acts"><button class="btn" data-close>Annuler</button><button class="btn pri" id="df-ok">' + submitLabel + "</button></div>");
    $("#df-ok").onclick = function () { var v = {}; fields.forEach(function (f) { v[f.id] = $("#df-" + f.id).value; }); if (onSubmit(v) !== false) closeAll(); };
  }
  function transferDialog() {
    var opts = accts().filter(function (a) { return a.currency === "EUR"; }).map(function (a) { return [a.id, a.label + " — " + money(a.availableCents, "EUR")]; });
    formDialog("Nouveau transfert", [{ id: "from", l: "Depuis", options: opts }, { id: "to", l: "Vers", options: opts }, { id: "amt", l: "Montant en " + sym("EUR"), ph: DISP === "XPF" ? "60 000" : "500", num: true }], "Transférer", function (v) {
      var from = Number(v.from), to = Number(v.to), cents = stored(v.amt, "EUR");
      if (from === to) { toast("Choisis deux comptes différents.", true); return false; }
      if (!(cents > 0)) { toast("Saisis un montant valide.", true); return false; }
      var a = C.account(from), b = C.account(to);
      if (a.availableCents < cents) { toast("Solde disponible insuffisant sur « " + a.label + " ».", true); return false; }
      var ref = C.makeRef("TRF"); a.availableCents -= cents; b.availableCents += cents;
      C.ledgerAdd({ accountId: from, type: "transfer", direction: "debit", amountCents: cents, currency: "EUR", reference: ref, description: "Transfert vers " + b.label, balanceAfterCents: a.availableCents });
      C.ledgerAdd({ accountId: to, type: "transfer", direction: "credit", amountCents: cents, currency: "EUR", reference: ref, description: "Transfert depuis " + a.label, balanceAfterCents: b.availableCents });
      D.MODS.transfers.rows.unshift({ ref: ref.slice(0, 8), from: a.label, to: b.label, amt: cents, cur: "EUR", status: "completed", date: "À l’instant" });
      toast("Transfert de " + money(cents, "EUR") + " effectué."); render(); return true;
    });
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var dp = t.closest("[data-disp]"); if (dp) return setDisp(dp.dataset.disp);
    var go = t.closest("[data-go]");
    if (go) { var o = {}; if (go.dataset.acct) o.accountId = Number(go.dataset.acct), o.acct = Number(go.dataset.acct); if (go.dataset.card) o.cardId = Number(go.dataset.card); closeAll(); return setRoute(go.dataset.go, o); }
    if (t.closest("[data-close]") || t === $("#overlay")) return closeAll();
    if (t.closest("[data-burger]")) return document.body.classList.add("nav-open");
    if (t.closest("[data-scrim]")) return document.body.classList.remove("nav-open");
    var f = t.closest("[data-txf]"); if (f) { tx.f = f.dataset.txf; return render(); }
    if (t.closest("[data-txclear]")) { tx.acct = null; return render(); }
    var r = t.closest("[data-tx]"); if (r) return txDrawer(r.dataset.tx);
    var pa = t.closest("[data-poact]");
    if (pa) {
      var p = D.PAYOUTS[Number(pa.dataset.i)];
      if (pa.dataset.poact === "approve") {
        var acc = C.account(p.account);
        if (acc.availableCents < p.amt) return toast("Solde insuffisant sur « " + acc.label + " » : recharge le compte avant de valider.", true);
        acc.availableCents -= p.amt; p.status = "paid"; p.date = "À l’instant";
        C.ledgerAdd({ accountId: p.account, type: "payout", direction: "debit", amountCents: p.amt, currency: p.cur, reference: p.ref, description: "Payout " + p.ref + " — " + p.who, balanceAfterCents: acc.availableCents });
        toast("Payout " + p.ref + " validé : " + money(p.amt, p.cur) + " débités.");
      } else { p.status = "rejected"; toast("Payout " + p.ref + " refusé."); }
      return render();
    }
    if (t.closest("[data-po]") && !pa) return;
    var mem = t.closest("[data-mem]"); if (mem) { var m = D.MEMBERS.filter(function (x) { return x.id === Number(mem.dataset.mem); })[0]; m.status = m.status === "suspended" ? "active" : "suspended"; toast(m.name + (m.status === "suspended" ? " suspendu." : " réactivé.")); return render(); }
    if (t.closest("[data-invite]")) return formDialog("Inviter un membre", [{ id: "name", l: "Nom", ph: "Prénom Nom" }, { id: "email", l: "E-mail", ph: "prenom@selego.fr" }, { id: "role", l: "Rôle", options: roleOpts.map(function (x) { return [x, x.charAt(0).toUpperCase() + x.slice(1)]; }) }], "Inviter", function (v) {
      if (!v.name.trim() || v.email.indexOf("@") < 1) { toast("Renseigne un nom et un e-mail valide.", true); return false; }
      D.MEMBERS.push({ id: D.MEMBERS.length + 1, name: v.name.trim(), email: v.email.trim(), role: v.role, status: "invited", seen: "—" }); toast("Invitation envoyée à " + v.email.trim() + "."); render(); return true;
    });
    if (t.closest("[data-newtrf]")) return transferDialog();
    var nw = t.closest("[data-new]");
    if (nw) { var mod = D.MODS[nw.dataset.new]; return formDialog(mod.create.title, mod.create.fields, "Créer", function (v) { mod.rows.unshift(mod.create.make(v, mod)); toast("Créé : " + mod.rows[0][mod.cols[0].k]); render(); return true; }); }
    var gr = t.closest("[data-row]"); if (gr) { var p2 = gr.dataset.row.split(":"); return D.MODS[p2[0]].actions ? rowDrawer(p2[0], Number(p2[1])) : null; }
    var ac = t.closest("[data-act]"); if (ac) { var q = ac.dataset.act.split(":"); var md = D.MODS[q[0]], row = md.rows[Number(q[1])]; var msg = md.actions[Number(q[2])].run(row); closeAll(); toast(msg); return render(); }
    var sw = t.closest("[data-sw]"); if (sw) return sw.setAttribute("aria-checked", sw.getAttribute("aria-checked") === "true" ? "false" : "true");
    if (t.closest("[data-save]")) return toast("Modifications enregistrées.");
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "tx-q") { tx.q = t.value; var pos = t.selectionStart; render(); var n = $("#tx-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
    if (t.dataset && t.dataset.gq) { modState[t.dataset.gq].q = t.value; var pos2 = t.selectionStart; render(); var n2 = document.querySelector('[data-gq="' + t.dataset.gq + '"]'); if (n2) { n2.focus(); n2.setSelectionRange(pos2, pos2); } }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.role) { var m = D.MEMBERS.filter(function (x) { return x.id === Number(t.dataset.role); })[0]; m.role = t.value; toast("Rôle de " + m.name + " : " + t.value + "."); }
    if (t.id === "nav-search") { var val = t.value.trim().toLowerCase(); var hit = Object.keys(navLabel).filter(function (k) { return navLabel[k].label.toLowerCase() === val; })[0]; if (hit) { t.value = ""; setRoute(hit); } }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });
  window.addEventListener("hashchange", function () { var id = location.hash.slice(1); if (id && id !== route && (navLabel[id] || id === "dashboard")) setRoute(id); });

  /* ───── démarrage ───── */
  var receipt;
  function start() {
    buildShell();
    receipt = window.VtexReceipt.mount($("#screen-topup"), {
      ownerKey: D.OWNER, kicker: "Wallet Pro · Selego", who: "Selego SAS", detail: "par Kevin Massou · SAS Selego", actor: "Kevin Massou", defaultName: "SAS Selego",
      getDisplay: function () { return DISP; }, setDisplay: function (x) { applyDisp(x); }, onBack: function () { setRoute("dashboard"); }, onHistory: function () { setRoute("transactions"); }, onChange: function () { /* le tableau de bord se recalcule à l’affichage */ }
    });
    var first = location.hash.slice(1);
    setRoute(first && (navLabel[first] || first === "dashboard") ? first : "dashboard");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

