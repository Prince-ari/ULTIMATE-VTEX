/* VTEX Wallet v4 — adaptateur navigateur vers l’API tRPC du monorepo.
 * Les tableaux globaux existants ne sont que des modèles de rendu ; leur
 * contenu est hydraté depuis le serveur et aucune mutation financière locale
 * n’est autorisée dans ce fichier. */
(function () {
  "use strict";

  var pendingOtpUserId = null;
  var walletAccount = null;
  var authenticated = false;

  var authStyle = document.createElement("style");
  authStyle.textContent = ".phone.vtex-unauthenticated .view:not(#view-login):not(#view-otp){display:none!important}";
  document.head.appendChild(authStyle);

  function setAuthenticatedUI(nextAuthenticated) {
    authenticated = nextAuthenticated;
    var root = document.querySelector(".phone");
    if (root) root.classList.toggle("vtex-unauthenticated", !nextAuthenticated);
  }

  var originalShowView = window.showView;
  if (typeof originalShowView === "function") {
    window.showView = function (name) {
      if (!authenticated && name !== "login" && name !== "otp") return originalShowView("login");
      return originalShowView(name);
    };
  }

  function makeIdempotencyKey(scope) {
    var uuid = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    return scope + ":" + uuid;
  }

  /* Devise d'AFFICHAGE choisie dans Profil › Devise (€ ou ₣). Le compte reste en euros : les montants saisis dans la
     devise affichée sont convertis en centimes d'euro à la parité fixe, et inversement pour l'affichage. */
  function displayCurrency() {
    try { if (CURRENCIES[currentCurrency]) return CURRENCIES[currentCurrency]; } catch (_) { /* application pas encore initialisée */ }
    return { name: "Euro", symbol: "€", rate: 1, decimals: 2 };
  }

  function majorToCents(value) {
    var normalized = String(value || "").trim().replace(/\s/g, "").replace(",", ".");
    var major = Number(normalized);
    if (!Number.isFinite(major) || major <= 0) throw new Error("Entre un montant strictement positif.");
    return Math.round((major / displayCurrency().rate) * 100);
  }

  function centsToMajor(cents) {
    return Number(cents || 0) / 100;
  }

  /* Montant en euros (centimes) → nombre dans la devise affichée. */
  function centsToDisplay(cents) {
    var currency = displayCurrency();
    var value = centsToMajor(cents) * currency.rate;
    return currency.decimals === 0 ? Math.round(value) : value;
  }

  function notify(message, icon) {
    if (typeof window.showToast === "function") window.showToast(message, icon || "ph-info");
    else window.alert(message);
  }

  function errorMessage(error, fallback) {
    return error && error.message ? String(error.message) : fallback;
  }

  function isAuthenticationError(error) {
    var message = errorMessage(error, "").toLowerCase();
    return /unauthor|non authentifi|session invalide|token invalide|connexion requise/.test(message);
  }

  function setAuthState(state, message) {
    var card = document.querySelector("#view-login .auth-card");
    var status = document.getElementById("auth-state");
    var submit = document.getElementById("auth-submit");
    if (card) card.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    if (status) {
      status.dataset.state = state || "idle";
      status.textContent = message || "";
    }
    if (submit) submit.disabled = state === "loading";
  }

  function setOtpState(state, message) {
    var stage = document.getElementById("otp-stage-code");
    var status = document.getElementById("otp-state");
    var alert = document.getElementById("otp-error");
    if (stage) {
      stage.dataset.state = state || "idle";
      stage.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    }
    if (status) {
      status.dataset.state = state || "idle";
      status.textContent = state === "error" ? "Le code n’a pas été validé." : (message || "");
    }
    if (alert) {
      alert.hidden = state !== "error";
      alert.textContent = state === "error" ? (message || "Vérifiez le code puis réessayez.") : "";
    }
    document.querySelectorAll("#otp-keypad button").forEach(function (button) { button.disabled = state === "loading"; });
  }

  function setWalletServiceState(kind, title, detail, retryable) {
    var root = document.querySelector(".phone");
    var state = document.getElementById("wallet-service-state");
    if (root) root.dataset.walletLoading = kind === "loading" ? "true" : "false";
    if (!state) return;
    if (kind === "idle") {
      state.hidden = true;
      state.dataset.kind = "idle";
      return;
    }
    state.hidden = false;
    state.dataset.kind = kind;
    var titleNode = document.getElementById("wallet-service-state-title");
    var detailNode = document.getElementById("wallet-service-state-detail");
    var retry = document.getElementById("wallet-service-state-retry");
    if (titleNode) titleNode.textContent = title || "Mise à jour du Wallet";
    if (detailNode) detailNode.textContent = detail || "";
    if (retry) retry.hidden = !retryable;
  }

  window.retryWalletConnection = function () {
    hydrateWallet().catch(function () { /* L’état global présente déjà une reprise sûre. */ });
  };

  function setDevelopmentOtpHint(code) {
    var hint = document.getElementById("otp-dev-hint");
    if (!hint) return;
    if (code) {
      hint.textContent = "Développement — aucun e-mail envoyé, code : " + code;
      hint.style.display = "block";
    } else {
      hint.textContent = "";
      hint.style.display = "none";
    }
  }

  async function rpc(path, input) {
    var response = await fetch("/api/trpc/" + path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: input === undefined ? null : input }),
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.error) {
      var message = payload && payload.error && payload.error.json && payload.error.json.message;
      throw new Error(message || "La requête Wallet a échoué.");
    }
    return payload.result && payload.result.data ? payload.result.data.json : payload;
  }

  async function query(path, input) {
    var encodedInput = encodeURIComponent(JSON.stringify({ json: input === undefined ? null : input }));
    var response = await fetch("/api/trpc/" + path + "?input=" + encodedInput, {
      method: "GET",
      credentials: "include",
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.error) {
      var message = payload && payload.error && payload.error.json && payload.error.json.message;
      throw new Error(message || "La requête Wallet a échoué.");
    }
    return payload.result && payload.result.data ? payload.result.data.json : payload;
  }

  async function authRequest(path, input) {
    var response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error || "Authentification impossible.");
    return payload;
  }

  function iconForTransaction(transaction) {
    if (transaction.status === "pending") return { bg: "rgba(217,119,6,.12)", col: "#d97706", ri: "ri-time-line", ic: '<circle cx="8.5" cy="8.5" r="6.5"/><path d="M8.5 5v4l3 2"/>' };
    if (transaction.direction === "credit") return { bg: "rgba(34,197,94,.12)", col: "#22c55e", ri: "ri-arrow-down-line", ic: '<path d="M8.5 3v11M4 10l4.5 4.5L13 10"/>' };
    return { bg: "rgba(90,107,216,.12)", col: "#5a6bd8", ri: "ri-arrow-up-line", ic: '<path d="M9 2l7 7-7 7M16 9H2"/>' };
  }

  function mapCard(card, account, index) {
    var expiration = new Date(card.expiresAt);
    var iconCaps = {
      online: { used: 0, max: centsToMajor(card.dailyLimitCents), color: "var(--c-accent)" },
      contactless: { used: 0, max: centsToMajor(card.perTransactionLimitCents), color: "var(--c-green)" },
      atm: { used: 0, max: centsToMajor(card.perTransactionLimitCents), color: "var(--c-orange)" },
    };
    return {
      id: String(card.id),
      walletAccountId: account.id,
      type: "virtuelle",
      theme: (index % 2 === 0) ? "navy" : "teal",
      network: card.network === "mastercard" ? "mastercard" : "visa",
      label: card.label,
      balance: centsToMajor(account.availableBalanceCents),
      num: "•••• •••• •••• " + card.lastFour,
      fullNum: null,
      cvv: null,
      holder: card.cardholderName,
      expiry: String(expiration.getMonth() + 1).padStart(2, "0") + "/" + String(expiration.getFullYear()).slice(-2),
      frozen: card.status === "frozen",
      toggles: {
        online: Boolean(card.onlinePaymentsEnabled),
        contactless: Boolean(card.contactlessEnabled),
        atm: Boolean(card.cashWithdrawalEnabled),
        international: false,
        notify: true,
      },
      wallets: { apple: false, google: false },
      caps: iconCaps,
    };
  }

  var TRANSACTION_TYPE_LABELS = { topup: "Recharge par carte", transfer_in: "Virement reçu", transfer_out: "Virement émis", card_payment: "Paiement par carte", adjustment: "Régularisation", refund: "Remboursement" };
  function transactionTypeLabel(type) { return TRANSACTION_TYPE_LABELS[type] || String(type).replace(/_/g, " "); }

  function mapTransaction(transaction) {
    var date = new Date(transaction.createdAt);
    var visual = iconForTransaction(transaction);
    return {
      id: String(transaction.id),
      month: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date),
      date: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date),
      name: transaction.description || transactionTypeLabel(transaction.type),
      sub: transaction.status === "pending" ? "En attente de validation" : transaction.status === "rejected" ? "Refusé" : transactionTypeLabel(transaction.type),
      type: transaction.direction === "credit" ? "in" : "out",
      amountEUR: centsToMajor(transaction.amountCents),
      ic: visual.ic,
      bg: visual.bg,
      col: visual.col,
      ri: visual.ri,
    };
  }

  function initials(name) {
    return String(name || "VTEX").split(/\s+/).filter(Boolean).map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase() || "VT";
  }

  function walletDisplayName(user) {
    var candidate = [user && user.firstName, user && user.lastName].filter(Boolean).join(" ").trim();
    var systemAdministrator = user && user.role === "admin" && /^(administrateur\s+vtex|admin\s+vtex)$/i.test(candidate);
    var emailLocalPart = String(user && user.email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
    var emailIdentity = emailLocalPart.replace(/\b\p{L}/gu, function (letter) { return letter.toUpperCase(); });
    if (systemAdministrator) return emailIdentity || "Espace personnel";
    return candidate || emailIdentity || "Espace personnel";
  }

  function safeAvatarUrl(value) {
    var raw = String(value || "").trim();
    if (raw.indexOf("/api/media/object/media/users/") === 0) return raw;
    try {
      var parsed = new URL(raw);
      return parsed.protocol === "https:" ? parsed.href : null;
    } catch (_) { return null; }
  }

  function applyAvatar(element, fullName, avatarUrl) {
    var url = safeAvatarUrl(avatarUrl);
    element.textContent = "";
    element.classList.toggle("has-profile-photo", Boolean(url));
    if (url) {
      var image = document.createElement("img");
      image.className = "profile-avatar-image";
      image.alt = "";
      image.decoding = "async";
      image.src = url;
      image.addEventListener("error", function () { element.classList.remove("has-profile-photo"); element.textContent = initials(fullName); });
      element.appendChild(image);
    } else {
      element.textContent = initials(fullName);
    }
  }

  function applyProfile(user, account) {
    if (!user) return;
    var fullName = walletDisplayName(user);
    var email = user.email || "Adresse non renseignée";
    [".vtx-sb-uname", ".hd-greet-name", ".topbar-greet-name", "#view-profil .settings-profile-card .settings-profile-name", ".rcv-holder-name"].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (element) { element.textContent = fullName; });
    });
    document.querySelectorAll("#view-profil .settings-profile-card .settings-profile-email").forEach(function (element) { element.textContent = email; });
    document.querySelectorAll(".vtx-sb-usub").forEach(function (element) { element.textContent = "Compte personnel sécurisé"; });
    document.querySelectorAll(".profile-avatar-target, .topbar-avatar, .rcv-av.avatar-self, .transfer-av.avatar-self").forEach(function (element) { applyAvatar(element, fullName, user.avatarUrl); });
    var memberSince = document.getElementById("profile-member-since");
    if (memberSince) memberSince.textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—";
    var accountOpenedSince = document.getElementById("bank-opened-since");
    if (accountOpenedSince) accountOpenedSince.textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—";
    var receiveCurrency = document.getElementById("receive-currency-val");
    if (receiveCurrency) receiveCurrency.textContent = displayCurrency().symbol;
    document.querySelectorAll(".rcv-info-tile").forEach(function (tile) {
      var label = tile.querySelector(".lbl");
      var value = tile.querySelector(".val");
      if (!label || !value) return;
      var receiveLabel = label.textContent.trim();
      if (receiveLabel === "Titulaire") value.textContent = fullName;
      if (receiveLabel === "Devise") value.textContent = displayCurrency().name + " (" + displayCurrency().symbol + ")";
    });
    document.querySelectorAll(".bank-row").forEach(function (row) {
      var label = row.querySelector(".bank-lbl");
      var value = row.querySelector(".bank-val");
      if (!label || !value) return;
      var text = label.textContent.trim();
      if (text === "Nom complet") value.textContent = fullName;
      if (text === "IBAN") value.textContent = account.iban || "En cours de provisionnement";
      if (text === "BIC / SWIFT") value.textContent = account.bic || "Non provisionné";
      if (text === "Ouvert depuis") value.textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—";
      if (text === "Devise du compte") value.textContent = displayCurrency().name + " (" + displayCurrency().symbol + ")";
    });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, function (character) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]; });
  }

  function notifIconFor(title) {
    var t = (title || "").toLowerCase();
    if (t.indexOf("reçu") !== -1 || t.indexOf("virement") !== -1) return { bg: "rgba(74,222,128,.14)", col: "#5FB03E", svg: '<path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 21h16"/>' };
    if (t.indexOf("sécurité") !== -1 || t.indexOf("connexion") !== -1) return { bg: "rgba(230,179,78,.15)", col: "#e6b34e", svg: '<path d="M12 2.5 4 6v6c0 5 3.4 7.7 8 9 4.6-1.3 8-4 8-9V6Z"/>' };
    if (t.indexOf("paiement") !== -1 || t.indexOf("achat") !== -1) return { bg: "rgba(255,107,61,.16)", col: "#E85820", svg: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5Z"/><path d="M16 12h3.5" stroke="var(--c-s1)" stroke-width="2"/>' };
    return { bg: "rgba(90,107,216,.14)", col: "#7aa2ff", svg: '<path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 5-2 6-2 7.2a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1c0-1.2-2-2.2-2-7.2A6.5 6.5 0 0 0 12 2.5Z"/><path d="M9.4 18.6a2.7 2.7 0 0 0 5.2 0Z"/>' };
  }
  /* Les textes de notification sont composés par le serveur en euros : on y convertit les montants dans la devise affichée. */
  function localizeAmounts(text) {
    var currency = displayCurrency();
    if (currency.symbol === "€") return String(text || "");
    return String(text || "").replace(/(\d[\d   ]*(?:[.,]\d{1,2})?)\s?(?:€|EUR\b)/g, function (match, digits) {
      var euros = Number(digits.replace(/[\s  ]/g, "").replace(",", "."));
      if (!Number.isFinite(euros)) return match;
      var converted = euros * currency.rate;
      return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: currency.decimals }).format(currency.decimals === 0 ? Math.round(converted) : converted) + " " + currency.symbol;
    });
  }
  function renderNotifications(items) {
    var container = document.getElementById("vtex-notification-list");
    if (!container) return;
    if (items) window.__lastNotifications = items;
    var all = window.__lastNotifications || [];
    if (all.length === 0) {
      container.innerHTML = '<div class="switch-row"><div class="switch-sub">Aucune notification pour le moment.</div></div>';
      return;
    }
    var term = (document.getElementById("notif-search") && document.getElementById("notif-search").value || "").trim().toLocaleLowerCase("fr-FR");
    var kind = window.__notifFilter || null;
    /* Une suggestion est un message d'un membre de l'équipe (support, gestionnaire, administrateur) : le serveur la marque `kind = "suggestion"`. */
    function isSuggestion(it) {
      return it.kind === "suggestion";
    }
    function senderLabel(it) {
      if (!it.sender) return "";
      var role = it.sender.role === "account_manager" ? "Votre gestionnaire" : it.sender.role === "agent" ? "Support" : "Administration";
      return escapeHtml(it.sender.firstName) + " · " + role;
    }
    var incomingCount = all.filter(function (it) { return !isSuggestion(it); }).length;
    var suggCount = all.length - incomingCount;
    var elIn = document.getElementById("notif-count-incoming");
    var elSg = document.getElementById("notif-count-sugg");
    if (elIn) elIn.textContent = String(incomingCount);
    if (elSg) elSg.textContent = String(suggCount);

    var filtered = all.filter(function (it) {
      if (term && (it.title + " " + it.body).toLocaleLowerCase("fr-FR").indexOf(term) === -1) return false;
      if (kind === "suggestions") return isSuggestion(it);
      if (kind === "incoming") return !isSuggestion(it);
      return true;
    });
    if (filtered.length === 0) {
      container.innerHTML = '<div class="switch-row"><div class="switch-sub">Aucune notification correspondante.</div></div>';
      return;
    }
    // Regroupement par jour — même mécanisme que renderTransactions (mois)
    var groups = {};
    var order = [];
    filtered.forEach(function (item) {
      var d = item.createdAt ? new Date(item.createdAt) : new Date();
      var key = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push({ item: item, date: d });
    });
    container.innerHTML = order.map(function (key) {
      var rows = groups[key].map(function (entry) {
        var icon = isSuggestion(entry.item)
          ? { bg: "rgba(151,206,94,.16)", col: "#97CE5E", svg: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5Z"/>' }
          : notifIconFor(entry.item.title);
        var from = isSuggestion(entry.item) ? '<div class="switch-sub" style="font-weight:700;margin-bottom:2px">Suggestion de ' + senderLabel(entry.item) + '</div>' : "";
        var time = entry.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        return '<button type="button" class="switch-row" style="width:100%;text-align:left;background:none;border:0;cursor:pointer;display:flex;align-items:center;gap:10px" data-notification-id="' + entry.item.id + '">'
          + '<div class="switch-ic" style="--tx-bg:' + icon.bg + ';--tx-col:' + icon.col + '"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="0">' + icon.svg + '</svg></div>'
          + '<span class="switch-row-signal"></span>'
          + '<div style="flex:1;min-width:0">' + from + '<div class="switch-name">' + escapeHtml(localizeAmounts(entry.item.title)) + '</div><div class="switch-sub">' + escapeHtml(localizeAmounts(entry.item.body)) + '</div></div>'
          + '<span class="switch-time">' + time + '</span>'
          + '</button>';
      }).join("");
      return '<div class="section-lbl">' + key + '</div>' + rows;
    }).join("");
    container.querySelectorAll("[data-notification-id]").forEach(function (button) {
      button.addEventListener("click", async function () {
        try { await rpc("notifications.markRead", { notificationId: Number(button.dataset.notificationId) }); } catch (_) { /* Lecture non bloquante. */ }
      });
    });
  }
  window.rerenderNotifications = function () { renderNotifications(); };
  window.markAllNotificationsRead = async function () {
    var all = window.__lastNotifications || [];
    for (var i = 0; i < all.length; i++) {
      try { await rpc("notifications.markRead", { notificationId: Number(all[i].id) }); } catch (_) {}
    }
  };

  function renderDocuments(items) {
    var container = document.getElementById("wallet-documents-list");
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="switch-row"><div class="switch-sub">Aucun document pour l’instant. Ceux que l’équipe VTEX vous envoie apparaîtront ici.</div></div>';
      return;
    }
    var categories = { statement: "Relevé", receipt: "Reçu", contract: "Contrat", identity: "Pièce d’identité", tax: "Fiscal", notice: "Avis", account_document: "Document de compte", rib: "RIB", transfer_proof: "Justificatif de virement", other: "Autre" };
    var reviews = { pending: { label: "En cours d’examen", color: "#F2B84B" }, validated: { label: "Validé", color: "#97CE5E" }, rejected: { label: "Refusé", color: "#FF6B6B" } };
    var fileSvg = '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M6 2.5h8L19 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4A1.5 1.5 0 0 1 6.5 2.5Z"/><path d="M14 2.5V7a1 1 0 0 0 1 1h4" fill="var(--c-s1)"/></svg>';
    var downloadSvg = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--c-t2)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 21h16"/></svg>';
    container.innerHTML = items.map(function (item) {
      var date = item.createdAt ? new Date(item.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "";
      var category = categories[item.documentType] || "";
      var review = reviews[item.reviewStatus];
      var isNew = item.source === "admin" && !item.firstViewedAt;
      var badge = review
        ? ' <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#0A0D1E;background:' + review.color + '">' + review.label + '</span>'
        : isNew ? ' <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#0A0D1E;background:#7aa2ff">Nouveau</span>' : "";
      var meta = (category ? category + ' · ' : '') + item.fileName + (date ? ' · ' + date : '');
      var extra = (item.reviewStatus === "rejected" && item.reviewReason ? '<div class="switch-sub" style="color:#FF9C9C">Motif : ' + escapeHtml(item.reviewReason) + '</div>' : '')
        + (item.note ? '<div class="switch-sub" style="font-style:italic">« ' + escapeHtml(item.note) + ' »</div>' : '');
      return '<button type="button" class="switch-row" style="width:100%;text-align:left;background:none;border:0;cursor:pointer;display:flex;align-items:center;gap:14px" data-document-id="' + item.id + '"><div class="switch-ic" style="--tx-bg:rgba(90,107,216,.14);--tx-col:#7aa2ff">' + fileSvg + '</div><div style="flex:1;min-width:0"><div class="switch-name">' + escapeHtml(item.title) + badge + '</div><div class="switch-sub">' + escapeHtml(meta) + '</div>' + extra + '</div>' + downloadSvg + '</button>';
    }).join("");
    container.querySelectorAll("[data-document-id]").forEach(function (button) {
      button.addEventListener("click", function () { window.open("/api/media/documents/" + button.dataset.documentId, "_blank", "noopener"); });
    });
  }

  var TICKET_STATUS = { open: { label: "En attente", color: "#F2B84B" }, in_progress: { label: "En cours", color: "#8EA9FF" }, resolved: { label: "Résolu", color: "#97CE5E" } };

  function renderTickets(items) {
    var container = document.getElementById("wallet-tickets-list");
    if (!container) return;
    window.__lastTickets = items || [];
    // Un renderTickets() est rejoué après chaque envoi/réponse : on conserve les fils déjà ouverts pour ne pas les refermer sous les doigts de l’utilisateur.
    var openIds = {};
    container.querySelectorAll(".faq-item.open[data-ticket-id]").forEach(function (item) { openIds[item.dataset.ticketId] = true; });
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="switch-row"><div class="switch-sub">Aucun ticket pour l’instant. Ouvre le premier ci-dessous si tu as besoin d’aide.</div></div>';
      return;
    }
    container.innerHTML = items.map(function (ticket) {
      var status = TICKET_STATUS[ticket.status] || TICKET_STATUS.open;
      var badge = '<span style="display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#0A0D1E;background:' + status.color + '">' + status.label + '</span>';
      var messages = (ticket.messages || []).map(function (message) {
        var author = message.authorRole === "user" ? "Toi" : "Conseiller";
        var when = message.createdAt ? new Date(message.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
        return '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.6);margin-bottom:2px">' + escapeHtml(author) + (when ? ' · ' + when : '') + '</div><div>' + escapeHtml(message.body) + '</div></div>';
      }).join("");
      return '<div class="faq-item' + (openIds[String(ticket.id)] ? ' open' : '') + '" data-ticket-id="' + ticket.id + '">'
        + '<div class="faq-q" onclick="toggleFaq(this)"><span>' + escapeHtml(ticket.subject) + badge + '</span><svg class="faq-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5 16 12l-6.5 7"/></svg></div>'
        + '<div class="faq-a">' + messages
        + (ticket.status !== "resolved" ? '<textarea id="ticket-reply-' + ticket.id + '" rows="2" placeholder="Répondre…" aria-label="Répondre au ticket" style="width:100%;margin:8px 0;resize:vertical;font-family:var(--f-sans);background:rgba(255,255,255,.1);border:none;border-radius:var(--r-md);padding:10px 12px;color:#fff;font-size:13px"></textarea><button type="button" onclick="event.stopPropagation();replyToSupportTicket(' + ticket.id + ')" style="background:rgba(255,255,255,.92);color:#0a0d1e;border:none;border-radius:999px;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer">Envoyer</button>' : '')
        + '</div></div>';
    }).join("");
  }

  window.submitSupportTicket = async function () {
    var subjectInput = document.getElementById("ticket-subject");
    var messageInput = document.getElementById("ticket-message");
    var subject = subjectInput && subjectInput.value.trim();
    var message = messageInput && messageInput.value.trim();
    if (!subject || !message) return notify("Ajoute un sujet et un message.", "ph-warning-circle");
    try {
      await rpc("support.create", { subject: subject, message: message });
      subjectInput.value = ""; messageInput.value = "";
      renderTickets(await query("support.listMine"));
      notify("Ticket envoyé. Un conseiller te répond ici.", "ph-check-circle");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.replyToSupportTicket = async function (id) {
    var input = document.getElementById("ticket-reply-" + id);
    var body = input && input.value.trim();
    if (!body) return notify("Écris un message avant d’envoyer.", "ph-warning-circle");
    try {
      await rpc("support.reply", { id: id, body: body });
      renderTickets(await query("support.listMine"));
      notify("Réponse envoyée.", "ph-check-circle");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  async function uploadMedia(file, purpose) {
    if (!file) throw new Error("Sélectionnez un fichier.");
    var form = new FormData();
    form.append("purpose", purpose);
    form.append("file", file);
    var response = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: form });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error || "Téléversement impossible.");
    return payload;
  }

  function formatGoalAmount(cents, currency) {
    if (currency && currency !== "EUR") return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency }).format(centsToMajor(cents));
    var display = displayCurrency();
    var value = centsToMajor(cents) * display.rate;
    return value.toLocaleString("fr-FR", { minimumFractionDigits: display.decimals, maximumFractionDigits: display.decimals }) + " " + display.symbol;
  }

  function renderSavingsGoals(items) {
    var container = document.getElementById("goals-list");
    if (!container) return;
    var activeGoals = (items || []).filter(function (goal) { return goal.status !== "archived"; }).slice(0, 3);
    if (activeGoals.length === 0) {
      container.innerHTML = '<button type="button" class="goal-card g-ghost" onclick="window.openSavingsGoalComposer()">'
        + '<div class="goal-ghost-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg></div>'
        + '<div class="goal-ghost-title">Nouvel objectif</div><div class="goal-ghost-sub">Mets de l\'argent de côté pour ce qui compte</div></button>';
      return;
    }
    var palette = ["g-platinum", "g-teal", "g-indigo"];
    var CIRC = 138.23;
    container.innerHTML = activeGoals.map(function (goal, index) {
      var percent = Math.max(0, Math.min(100, Math.round((Number(goal.currentCents || 0) / Number(goal.targetCents || 1)) * 100)));
      var dashoffset = (CIRC * (1 - percent / 100)).toFixed(2);
      var currentAmt = formatGoalAmount(goal.currentCents, goal.currency);
      var targetAmt = formatGoalAmount(goal.targetCents, goal.currency);
      var due = goal.dueAt ? new Date(goal.dueAt).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : "Sans échéance";
      var name = escapeHtml(goal.name || "Objectif");
      var action = "window.handleSavingsGoalAction('fund'," + Number(goal.id) + ",\'" + name.replace(/'/g, "\\'") + "\'," + Number(goal.targetCents || 0) + ",'" + (goal.dueAt ? new Date(goal.dueAt).toISOString() : "") + "')";
      return '<button type="button" class="goal-card ' + palette[index % palette.length] + '" data-goal-id="' + Number(goal.id) + '" onclick="' + action + '">'
        + '<div class="goal-ring-wrap"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="rgba(10,13,30,.12)" stroke-width="4"></circle><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="169.65" stroke-dashoffset="' + (169.65 * (1 - percent / 100)).toFixed(2) + '" stroke-linecap="round" transform="rotate(-90 32 32)"></circle></svg><span class="goal-ring-pct">' + percent + '%</span></div>'
        + '<div class="goal-name">' + name + '</div><div class="goal-amounts">' + currentAmt + ' sur ' + targetAmt + '</div><div class="goal-due">' + escapeHtml(due) + '</div></button>';
    }).join("");
  }

  function renderProfileSummary(notifications, goals) {
    var notificationCount = Array.isArray(notifications) ? notifications.length : 0;
    var activeGoalCount = Array.isArray(goals) ? goals.filter(function (goal) { return goal.status !== "archived"; }).length : 0;
    var notificationLabel = notificationCount === 0 ? "Aucune notification récente" : notificationCount + " notification" + (notificationCount > 1 ? "s" : "") + " récente" + (notificationCount > 1 ? "s" : "");
    var goalLabel = activeGoalCount === 0 ? "aucun objectif actif" : activeGoalCount + " objectif" + (activeGoalCount > 1 ? "s" : "") + " actif" + (activeGoalCount > 1 ? "s" : "");
    var securitySummary = document.getElementById("profile-security-summary");
    if (securitySummary) securitySummary.textContent = notificationLabel + " · " + goalLabel;
    var notificationsSummary = document.getElementById("profile-notifications-summary");
    if (notificationsSummary) notificationsSummary.textContent = notificationLabel;
  }

  function renderProfileSecurity(user, sessions, credentials) {
    var verified = Boolean(user && user.kycVerified);
    var sessionCount = Array.isArray(sessions) ? sessions.length : 0;
    var credentialCount = Array.isArray(credentials) ? credentials.length : 0;
    var verification = document.getElementById("profile-verification-status");
    if (verification) verification.lastChild.textContent = verified ? "Compte vérifié" : "Vérification à finaliser";
    var gauge = document.getElementById("profile-security-gauge");
    if (gauge) gauge.textContent = verified && sessionCount > 0 ? "OK" : "—";
    var level = document.getElementById("profile-security-level");
    if (level) level.textContent = verified && sessionCount > 0 ? "Actif" : "À vérifier";
    var webauthn = document.getElementById("profile-webauthn-summary");
    if (webauthn) webauthn.textContent = credentialCount === 0 ? "Aucune clé de sécurité enregistrée" : credentialCount + " clé" + (credentialCount > 1 ? "s" : "") + " de sécurité enregistrée" + (credentialCount > 1 ? "s" : "");
    var devices = document.getElementById("profile-device-summary");
    if (devices) devices.textContent = sessionCount === 0 ? "Aucune session active" : sessionCount + " appareil" + (sessionCount > 1 ? "s" : "") + " connecté" + (sessionCount > 1 ? "s" : "");
  }

  window.openSavingsGoalComposer = async function () {
    if (!walletAccount) return notify("Votre compte Wallet est en cours de chargement.", "ph-warning-circle");
    var name = window.prompt("Nom de l’objectif d’épargne (2 à 100 caractères) :");
    if (name === null) return;
    var target = window.prompt("Montant cible en " + displayCurrency().symbol + " :");
    if (target === null) return;
    var dueAt = window.prompt("Échéance facultative (AAAA-MM-JJ) :", "");
    if (dueAt === null) return;
    try {
      await rpc("savingsGoals.create", { walletAccountId: Number(walletAccount.id), name: name.trim(), targetCents: majorToCents(target), dueAt: dueAt.trim() ? new Date(dueAt + "T00:00:00.000Z").toISOString() : undefined });
      await hydrateWallet();
      notify("Objectif d’épargne créé.", "ph-check-circle");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.handleSavingsGoalAction = async function (action, goalId, currentName, currentTargetCents, currentDueAt) {
    try {
      if (action === "fund") {
        var amount = window.prompt("Montant à affecter à cet objectif (en " + displayCurrency().symbol + ") :");
        if (amount === null) return;
        await rpc("savingsGoals.fund", { goalId: goalId, amountCents: majorToCents(amount), idempotencyKey: makeIdempotencyKey("savings-fund") });
      } else if (action === "rename") {
        var name = window.prompt("Nouveau nom de l’objectif :", currentName);
        if (name === null) return;
        var target = window.prompt("Nouveau montant cible en " + displayCurrency().symbol + " (laissez vide pour conserver le montant actuel) :", currentTargetCents ? centsToDisplay(currentTargetCents) : "");
        if (target === null) return;
        var dueAt = window.prompt("Échéance (AAAA-MM-JJ, laissez vide pour retirer l’échéance) :", currentDueAt ? currentDueAt.slice(0, 10) : "");
        if (dueAt === null) return;
        var update = { goalId: goalId, name: name.trim() };
        if (target.trim()) update.targetCents = majorToCents(target);
        update.dueAt = dueAt.trim() ? new Date(dueAt + "T00:00:00.000Z").toISOString() : null;
        await rpc("savingsGoals.update", update);
      } else if (action === "close") {
        if (!window.confirm("Clôturer cet objectif et restituer son solde disponible ?")) return;
        await rpc("savingsGoals.close", { goalId: goalId, idempotencyKey: makeIdempotencyKey("savings-close") });
      }
      await hydrateWallet();
      notify("Objectif d’épargne mis à jour.", "ph-check-circle");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  function renderFinancialSummary(account, cardRows, transactionRows, savingsGoalRows) {
    var currency = account.currency || "EUR";
    var currentMonth = new Date();
    var monthTransactions = (transactionRows || []).filter(function (transaction) {
      var createdAt = transaction.createdAt ? new Date(transaction.createdAt) : null;
      return createdAt && createdAt.getUTCFullYear() === currentMonth.getUTCFullYear() && createdAt.getUTCMonth() === currentMonth.getUTCMonth() && transaction.status === "completed";
    });
    var credits = monthTransactions.filter(function (transaction) { return transaction.direction === "credit"; }).reduce(function (total, transaction) { return total + Number(transaction.amountCents || 0); }, 0);
    var debits = monthTransactions.filter(function (transaction) { return transaction.direction === "debit"; }).reduce(function (total, transaction) { return total + Number(transaction.amountCents || 0); }, 0);
    var today = new Date();
    var netToday = (transactionRows || []).filter(function (transaction) {
      var createdAt = transaction.createdAt ? new Date(transaction.createdAt) : null;
      return createdAt && createdAt.toDateString() === today.toDateString() && transaction.status === "completed";
    }).reduce(function (total, transaction) { return total + (transaction.direction === "credit" ? 1 : -1) * Number(transaction.amountCents || 0); }, 0);
    var incoming = document.getElementById("fin-stat-in");
    var outgoing = document.getElementById("fin-stat-out");
    var todayNode = document.getElementById("fin-today");
    var cardSummary = document.getElementById("fin-card-summary");
    if (incoming) incoming.textContent = "+" + formatGoalAmount(credits, currency);
    if (outgoing) outgoing.textContent = "−" + formatGoalAmount(debits, currency);
    var netNode = document.getElementById("fin-stat-net");
    if (netNode) { var net = credits - debits; netNode.textContent = (net >= 0 ? "+" : "−") + formatGoalAmount(Math.abs(net), currency); netNode.classList.toggle("pos", net >= 0); netNode.classList.toggle("out", net < 0); }
    var splitTotal = credits + debits;
    var inBar = document.getElementById("acc-split-in-bar"), outBar = document.getElementById("acc-split-out-bar");
    var inPct = document.getElementById("acc-split-in-pct"), outPct = document.getElementById("acc-split-out-pct");
    if (inBar && outBar) {
      var pIn = splitTotal > 0 ? Math.round((credits / splitTotal) * 100) : 50;
      inBar.style.width = pIn + "%"; outBar.style.width = (100 - pIn) + "%";
      if (inPct) inPct.textContent = pIn + "%";
      if (outPct) outPct.textContent = (100 - pIn) + "%";
    }
    if (todayNode) todayNode.textContent = (netToday >= 0 ? "+" : "−") + formatGoalAmount(Math.abs(netToday), currency);
    var sourceBalance = document.getElementById("source-wallet-balance");
    if (sourceBalance) sourceBalance.textContent = formatGoalAmount(account.availableBalanceCents, currency);
    if (cardSummary) {
      cardSummary.innerHTML = (cardRows || []).slice(0, 2).map(function (card) {
        return '<div class="wtg-chip"><span class="dot visa"></span>' + escapeHtml(card.label || "Carte VTEX") + '<b>' + escapeHtml(String(card.lastFour || "" ).replace(/(\d{4})$/, "•••• $1")) + '</b></div>';
      }).join("") || '<div class="wtg-chip"><span class="dot visa"></span>Aucune carte provisionnée</div>';
    }
    var suggestions = document.getElementById("wallet-suggestions");
    if (suggestions) {
      var activeGoals = (savingsGoalRows || []).filter(function (goal) { return goal.status === "active"; });
      if (activeGoals.length > 0) {
        suggestions.innerHTML = '<button type="button" class="sugg-card" style="cursor:pointer" onclick="showView(\'accueil\');document.getElementById(\'goals-section\')?.scrollIntoView({behavior:\'smooth\'})"><div class="sugg-title">Objectif d’épargne actif</div><div class="sugg-sub">Suivez la progression de ' + escapeHtml(activeGoals[0].name) + ' dans vos objectifs.</div></button>';
      } else if ((transactionRows || []).length === 0) {
        suggestions.innerHTML = '<div class="sugg-card"><div class="sugg-title">Votre espace est prêt</div><div class="sugg-sub">Vos transactions et objectifs apparaîtront ici dès leur création.</div></div>';
      } else {
        suggestions.innerHTML = '<button type="button" class="sugg-card" style="cursor:pointer" onclick="showView(\'historique\')"><div class="sugg-title">Consultez votre activité</div><div class="sugg-sub">Votre historique est synchronisé depuis votre compte Wallet.</div></button>';
      }
    }
  }

  /* Dernières données rendues : permet de recalculer objectifs et statistiques quand la devise d'affichage change. */
  var lastWalletData = null;
  window.vtexRerenderCurrency = function () {
    if (window.__lastNotifications) renderNotifications();
    if (!lastWalletData) return;
    renderSavingsGoals(lastWalletData.goals);
    renderFinancialSummary(lastWalletData.account, lastWalletData.cards, lastWalletData.transactions, lastWalletData.goals);
  };

  function applyWalletData(account, cardRows, transactionRows, beneficiaryRows, savingsGoalRows) {
    lastWalletData = { account: account, cards: cardRows, transactions: transactionRows, goals: savingsGoalRows || [] };
    walletAccount = account;
    window.__walletApiBalance = centsToMajor(account.availableBalanceCents);
    CARDS.splice(0, CARDS.length);
    Array.prototype.push.apply(CARDS, cardRows.map(function (card, index) { return mapCard(card, account, index); }));
    window.__walletActiveCardId = cardRows[0] ? Number(cardRows[0].id) : null;
    TRANSACTIONS.splice(0, TRANSACTIONS.length);
    Array.prototype.push.apply(TRANSACTIONS, transactionRows.map(mapTransaction));
    BENEFICIAIRES.splice(0, BENEFICIAIRES.length);
    Array.prototype.push.apply(BENEFICIAIRES, beneficiaryRows.map(function (beneficiary) {
      return { id: String(beneficiary.id), name: beneficiary.fullName, iban: beneficiary.iban, bank: beneficiary.bic || "", internalWalletAccountId: beneficiary.internalWalletAccountId || null };
    }));
    // Les objectifs, cartes et transactions rendus ci-dessous proviennent du
    // bootstrap Wallet : ils doivent rester la source de vérité face au
    // fallback local de la preview.
    window.__walletApiDataReady = true;
    renderSavingsGoals(savingsGoalRows || []);
    renderFinancialSummary(account, cardRows, transactionRows, savingsGoalRows || []);
    activeCardIndex = Math.min(activeCardIndex || 0, Math.max(0, CARDS.length - 1));
    if (typeof window.renderTransactions === "function") window.renderTransactions();
    if (typeof window.renderQuickSend === "function") window.renderQuickSend();
    if (typeof window.renderBeneficiaires === "function") window.renderBeneficiaires();
    if (typeof window.renderEnvRecent === "function") window.renderEnvRecent();
    if (typeof window.renderSplitPeople === "function") window.renderSplitPeople();
    if (typeof window.renderCardStack === "function") window.renderCardStack();
    if (typeof window.renderCardsScreen === "function" && CARDS.length) window.renderCardsScreen();
    if (typeof window.refreshFinancialDisplays === "function") window.refreshFinancialDisplays();
    if (window.vtx3d && window.vtx3d.refreshCards) window.vtx3d.refreshCards();
    else if (window.vtexRefreshCardFaces) window.vtexRefreshCardFaces();
  }

  window.setWalletPin = async function (pin) {
    if (typeof window.isDemoPreview === "function" && window.isDemoPreview()) return { pinConfigured: true, preview: true };
    if (!window.__walletActiveCardId) throw new Error("Aucune carte active n’est disponible.");
    return rpc("cards.setPin", { cardId: Number(window.__walletActiveCardId), pin: pin });
  };

  /* ── Devises : le catalogue et la préférence d'affichage viennent du serveur (config.currencies, walletSettings). ── */
  var serverCurrencyApplied = false;

  /* Fusionne le catalogue serveur dans CURRENCIES (seules les devises à parité fixe avec l'euro peuvent servir d'affichage). */
  async function loadCurrencyCatalog() {
    try {
      var list = await query("config.currencies");
      if (!Array.isArray(list)) return;
      list.forEach(function (entry) {
        if (!entry || entry.eurRate === null || entry.eurRate === undefined) return;
        CURRENCIES[String(entry.code).toLowerCase()] = { code: entry.code, name: entry.name, short: entry.name + " (" + entry.symbol + ")", symbol: entry.symbol, glyph: entry.glyph, region: entry.region, tone: entry.tone, rate: entry.eurRate, decimals: entry.decimals };
      });
      if (typeof renderCurrencyOptions === "function") renderCurrencyOptions();
      if (typeof renderCurrencyIcon === "function") renderCurrencyIcon();
    } catch (_) { /* Le catalogue local de repli reste valable. */ }
  }

  /* À la première ouverture seulement : la préférence serveur s'applique, puis le choix en cours de session reste maître. */
  function applyServerCurrency(settings) {
    if (serverCurrencyApplied) return;
    serverCurrencyApplied = true;
    var wanted = settings && settings.displayCurrency ? String(settings.displayCurrency).toLowerCase() : null;
    if (wanted && CURRENCIES[wanted] && wanted !== currentCurrency && typeof selectCurrency === "function") selectCurrency(wanted, { fromServer: true });
  }

  window.vtexPersistDisplayCurrency = function (key) {
    if (!authenticated) return;
    rpc("walletSettings.updateMine", { displayCurrency: String(key).toUpperCase() }).catch(function () { /* Non bloquant : l'affichage reste correct pour la session. */ });
  };

  /* ── Mot de passe temporaire : le serveur refuse tout (PASSWORD_CHANGE_REQUIRED) tant qu'il n'est pas remplacé. ── */
  function isPasswordChangeRequired(error) { return /PASSWORD_CHANGE_REQUIRED/.test(errorMessage(error, "")); }

  function showPasswordChangeOverlay() {
    if (document.getElementById("vtex-pwd-overlay")) return;
    var overlay = document.createElement("div");
    overlay.id = "vtex-pwd-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "vtex-pwd-title");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(6,8,22,.92);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    var card = document.createElement("form");
    card.noValidate = true;
    card.style.cssText = "width:100%;max-width:380px;background:#12152b;color:#e8ebff;border:1px solid rgba(142,169,255,.25);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 80px rgba(0,0,0,.55)";
    var fieldStyle = "width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;border:1.5px solid rgba(142,169,255,.3);background:#0a0d1e;color:#fff;font-size:15px";
    card.innerHTML = '<h2 id="vtex-pwd-title" style="margin:0;font-size:19px">Choisissez votre mot de passe</h2>' +
      '<p style="margin:0;font-size:13px;line-height:1.5;color:#aab2e8">Le mot de passe temporaire qui vous a été transmis ne sert qu’une fois. Remplacez-le pour accéder à votre Wallet.</p>' +
      '<label style="font-size:12px;color:#aab2e8" for="vtex-pwd-current">Mot de passe temporaire</label><input id="vtex-pwd-current" type="password" autocomplete="current-password" style="' + fieldStyle + '">' +
      '<label style="font-size:12px;color:#aab2e8" for="vtex-pwd-new">Nouveau mot de passe</label><input id="vtex-pwd-new" type="password" autocomplete="new-password" aria-describedby="vtex-pwd-rules" style="' + fieldStyle + '">' +
      '<div id="vtex-pwd-rules" style="font-size:12px;color:#8990c8">10 caractères minimum, avec au moins une lettre et un chiffre.</div>' +
      '<label style="font-size:12px;color:#aab2e8" for="vtex-pwd-confirm">Confirmer</label><input id="vtex-pwd-confirm" type="password" autocomplete="new-password" style="' + fieldStyle + '">' +
      '<div id="vtex-pwd-error" role="alert" style="min-height:16px;font-size:13px;color:#ff8d8d"></div>' +
      '<button id="vtex-pwd-submit" type="submit" style="padding:12px;border:0;border-radius:12px;background:#8ea9ff;color:#0a0d1e;font-weight:700;font-size:15px;cursor:pointer">Enregistrer et continuer</button>' +
      '<button id="vtex-pwd-logout" type="button" style="background:none;border:0;color:#8990c8;font-size:12px;cursor:pointer;text-decoration:underline">Se déconnecter</button>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    var current = card.querySelector("#vtex-pwd-current");
    var next = card.querySelector("#vtex-pwd-new");
    var confirmInput = card.querySelector("#vtex-pwd-confirm");
    var errorBox = card.querySelector("#vtex-pwd-error");
    var submit = card.querySelector("#vtex-pwd-submit");
    current.focus();
    card.querySelector("#vtex-pwd-logout").addEventListener("click", function () {
      authRequest("/api/auth/logout", {}).catch(function () { /* déjà déconnecté */ }).then(function () { window.location.reload(); });
    });
    card.addEventListener("submit", async function (event) {
      event.preventDefault();
      errorBox.textContent = "";
      if (next.value.length < 10 || !/[A-Za-z]/.test(next.value) || !/\d/.test(next.value)) { errorBox.textContent = "10 caractères minimum, avec au moins une lettre et un chiffre."; return; }
      if (next.value !== confirmInput.value) { errorBox.textContent = "Les deux mots de passe ne correspondent pas."; return; }
      submit.disabled = true;
      try {
        await rpc("auth.changePassword", { currentPassword: current.value, newPassword: next.value });
        overlay.remove();
        setAuthenticatedUI(true);
        await hydrateWallet();
        startRealtime();
        window.showView("accueil");
        try { notify("Mot de passe remplacé.", "ph-check-circle"); } catch (_) { /* l'annonce est facultative */ }
      } catch (error) {
        errorBox.textContent = errorMessage(error, "Changement impossible. Vérifiez le mot de passe temporaire.");
        submit.disabled = false;
      }
    });
  }

  /* ── RIB : source de vérité = bank_accounts (bankAccounts.mine). Le RIB principal alimente l'écran Banque, Recevoir, la copie et le partage ;
     les sous-RIB actifs s'affichent en liste. Rien n'est codé en dur en mode connecté. ── */
  function groupIban(iban) { return String(iban || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim(); }

  function bankRowValue(row, text) {
    var value = row.querySelector(".bank-val");
    var label = row.querySelector(".bank-lbl");
    return label && value && label.textContent.trim() === text ? value : null;
  }

  function renderSubRibs(container, wrapper, subs, rowClass) {
    if (!container || !wrapper) return;
    container.textContent = "";
    wrapper.hidden = subs.length === 0;
    subs.forEach(function (sub) {
      var row = document.createElement("div");
      row.className = "bank-row";
      // Pastille pleine + libellé + « Copier » sur la première ligne ; l'IBAN, long, occupe la ligne suivante.
      var icon = document.createElement("span");
      icon.className = rowClass || "bk-row-ic";
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M9.4 3h2l-.6 4h3.6l.6-4h2l-.6 4H20v2h-3.1l-.5 3.6H20v2h-3.9l-.6 4.4h-2l.6-4.4H10.5l-.6 4.4h-2l.6-4.4H4v-2h4.8l.5-3.6H4V7h5.6Zm1.1 6-.5 3.6h3.6l.5-3.6Z"/></svg>';
      var label = document.createElement("span");
      label.className = "bank-lbl";
      label.style.flex = "1";
      label.textContent = sub.label;
      var value = document.createElement("span");
      value.className = "bank-val mono";
      value.style.cssText = "flex:0 0 100%;order:3;text-align:left;font-size:12px";
      value.textContent = sub.ibanFormatted || groupIban(sub.iban);
      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "bank-copy";
      copy.textContent = "Copier";
      copy.addEventListener("click", function () {
        if (navigator.clipboard) navigator.clipboard.writeText(sub.ibanFormatted || groupIban(sub.iban)).catch(function () {});
        notify("IBAN « " + sub.label + " » copié dans le presse-papiers.", "ph-copy");
      });
      row.appendChild(icon);
      row.appendChild(label);
      row.appendChild(copy);
      row.appendChild(value);
      container.appendChild(row);
    });
  }

  function renderBankAccounts(banks, user, account) {
    banks = Array.isArray(banks) ? banks : [];
    var main = banks.filter(function (bank) { return bank.kind === "MAIN"; })[0] || null;
    // Compte historique sans RIB rattrapé : les colonnes du compte restent lues (elles sont écrites en parallèle).
    if (!main && account && account.iban) main = { iban: account.iban, ibanFormatted: groupIban(account.iban), bic: account.bic, bankName: "VTEX", accountHolderName: walletDisplayName(user), currency: account.currency };
    window.__bankAccounts = banks;
    window.__bankMain = main ? { iban: main.iban, ibanFormatted: main.ibanFormatted || groupIban(main.iban), bic: main.bic || "", bank: main.bankName || "VTEX", holder: main.accountHolderName || walletDisplayName(user) } : null;

    var hero = document.getElementById("bank-hero-iban");
    if (hero) {
      if (main) {
        var groups = groupIban(main.iban).split(" ");
        hero.textContent = "";
        for (var index = 0; index < groups.length; index += 3) {
          if (index) hero.appendChild(document.createElement("br"));
          hero.appendChild(document.createTextNode(groups.slice(index, index + 3).join(" ")));
        }
      } else hero.textContent = "En cours de provisionnement";
    }

    document.querySelectorAll(".bank-row").forEach(function (row) {
      var iban = bankRowValue(row, "IBAN");
      if (iban) iban.textContent = main ? (main.ibanFormatted || groupIban(main.iban)) : "En cours de provisionnement";
      var bic = bankRowValue(row, "BIC / SWIFT");
      if (bic) bic.textContent = main && main.bic ? main.bic : "Non provisionné";
      var bank = bankRowValue(row, "Banque");
      if (bank) bank.textContent = main ? main.bankName || "VTEX" : "À provisionner";
      var country = bankRowValue(row, "Pays");
      if (country) country.textContent = main && main.iban ? ({ FR: "France", BE: "Belgique", DE: "Allemagne", LU: "Luxembourg" })[main.iban.slice(0, 2)] || main.iban.slice(0, 2) : "Non renseigné";
      var holder = bankRowValue(row, "Domiciliation");
      if (holder) holder.textContent = main ? main.bankName || "VTEX" : "Non renseignée";
      var copyButton = row.querySelector(".bank-copy");
      var copied = iban ? (main && (main.ibanFormatted || groupIban(main.iban))) : bic ? (main && main.bic) : null;
      if (copyButton && (iban || bic)) {
        copyButton.disabled = !copied;
        copyButton.onclick = copied ? function () {
          if (navigator.clipboard) navigator.clipboard.writeText(copied).catch(function () {});
          notify((iban ? "IBAN" : "BIC") + " copié dans le presse-papiers.", "ph-copy");
        } : null;
      }
    });

    var copyMain = document.getElementById("rcv-copy-iban");
    if (copyMain) {
      copyMain.disabled = !main;
      var copyLabel = copyMain.lastChild;
      if (copyLabel && copyLabel.nodeType === 3) copyLabel.textContent = main ? " Copier l’IBAN" : " RIB non disponible";
    }
    var note = document.getElementById("bank-provision-note");
    if (note) note.style.display = main ? "none" : "";

    var subs = banks.filter(function (bank) { return bank.kind === "SUB"; });
    renderSubRibs(document.getElementById("bank-subs-list"), document.getElementById("bank-subs"), subs);
    renderSubRibs(document.getElementById("rcv-subs-list"), document.getElementById("rcv-subs"), subs, "rv-row-ic");

    window.renderReceiveQr(main);
  }

  /** QR de réception (norme EPC/SCT, EUR uniquement) affiché sur les écrans Banque et Recevoir : même RIB, deux emplacements.
   *  `main` porte un vrai `.id` de `bank_accounts` uniquement quand il vient de `bankAccounts.mine` (jamais pour le repli historique
   *  basé sur les colonnes du compte) — dans tous les autres cas on retombe sur le glyphe de secours déjà prévu par le CSS. */
  var qrGeneration = 0;
  window.renderReceiveQr = async function renderReceiveQr(main) {
    var generation = ++qrGeneration;
    var frames = document.querySelectorAll(".qr-frame");
    if (!main || !main.id || main.currency !== "EUR") {
      frames.forEach(function (frame) {
        frame.classList.add("qr-fallback");
        var img = frame.querySelector(".qr-img");
        if (img) img.innerHTML = "";
      });
      return;
    }
    try {
      var result = await query("bankAccounts.receiveQr", { bankAccountId: main.id });
      if (generation !== qrGeneration) return; // Une hydratation plus récente a démarré entre-temps : on abandonne ce résultat.
      frames.forEach(function (frame) {
        frame.classList.remove("qr-fallback");
        var img = frame.querySelector(".qr-img");
        if (img) { img.innerHTML = result.svg; img.setAttribute("aria-label", "QR code pour recevoir un virement SEPA vers ce RIB"); }
      });
    } catch (error) {
      if (generation !== qrGeneration) return;
      frames.forEach(function (frame) {
        frame.classList.add("qr-fallback");
        var img = frame.querySelector(".qr-img");
        if (img) img.innerHTML = "";
      });
    }
  }

  async function hydrateWallet() {
    setWalletServiceState("loading", "Mise à jour sécurisée du Wallet", "Nous récupérons vos soldes et vos opérations sans réexécuter d’action.", false);
    try {
      await loadCurrencyCatalog();
      var result = await rpc("wallets.bootstrap");
      applyServerCurrency(result.settings);
      applyWalletData(result.account, result.cards || [], result.transactions || [], result.beneficiaries || [], result.savingsGoals || []);
      applyProfile(result.user, result.account);
      var banks = await query("bankAccounts.mine").catch(function () { return []; });
      renderBankAccounts(banks, result.user, result.account);
      var extra = await Promise.all([query("notifications.listMine"), query("settings.get"), query("documents.listMine"), query("auth.listSessions"), query("auth.webauthnListCredentials"), query("support.listMine")]);
      renderNotifications(extra[0]);
      renderProfileSummary(extra[0], result.savingsGoals || []);
      renderProfileSecurity(result.user, extra[3], extra[4]);
      if (extra[1] && extra[1].platformName) document.title = extra[1].platformName + " — Wallet";
      renderDocuments(extra[2]);
      renderTickets(extra[5]);
      setWalletServiceState("idle");
      return result.account;
    } catch (error) {
      if (isPasswordChangeRequired(error)) {
        setWalletServiceState("idle");
        showPasswordChangeOverlay();
        throw error;
      }
      setWalletServiceState("error", "Mise à jour du Wallet indisponible", "Vos dernières actions ne sont pas rejouées. Vérifiez votre connexion puis relancez la mise à jour.", true);
      throw error;
    }
  }

  window.clearProfileAvatar = async function () {
    if (!window.confirm("Retirer votre photo de profil ?")) return;
    try {
      await rpc("users.updateMe", { avatarUrl: null });
      await hydrateWallet();
      notify("Photo de profil retirée.", "ph-check-circle");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.uploadProfileAvatar = async function () {
    var input = document.getElementById("profile-avatar-file");
    var file = input && input.files && input.files[0];
    if (!file) return notify("Sélectionne une image JPEG, PNG ou WebP.", "ph-warning-circle");
    try {
      var uploaded = await uploadMedia(file, "avatar");
      await rpc("users.updateMe", { avatarUrl: uploaded.url });
      await hydrateWallet();
      if (input) input.value = "";
      notify("Photo de profil importée et synchronisée.", "ph-check-circle");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.submitTransferProof = async function () {
    var input = document.getElementById("transfer-proof-file");
    var file = input && input.files && input.files[0];
    var referenceInput = document.getElementById("transfer-proof-reference");
    if (!file) return notify("Ajoute une capture, une image ou un PDF de ton virement.", "ph-warning-circle");
    try {
      var uploaded = await uploadMedia(file, "transfer-proof");
      await rpc("documents.submitTransferProof", { title: "Justificatif de virement", fileName: uploaded.fileName, mimeType: uploaded.mimeType, storageKey: uploaded.storageKey, sizeBytes: uploaded.sizeBytes, transactionReference: referenceInput && referenceInput.value.trim() || undefined });
      if (input) input.value = "";
      if (referenceInput) referenceInput.value = "";
      notify("Justificatif transmis à ton gestionnaire de compte.", "ph-check-circle");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  var realtimeStream = null;
  function startRealtime() {
    if (realtimeStream || typeof EventSource === "undefined") return;
    realtimeStream = new EventSource("/api/events");
    ["notification.created", "document.assigned"].forEach(function (eventName) {
      realtimeStream.addEventListener(eventName, function () {
        hydrateWallet().catch(function () { /* Les données persistées seront reprises à la reconnexion. */ });
      });
    });
  }

  window.submitLogin = async function (event) {
    if (event) event.preventDefault();
    if (typeof window.isDemoPreview === "function" && window.isDemoPreview()) {
      pendingOtpUserId = null;
      otpCode = "";
      setDevelopmentOtpHint(null);
      setAuthenticatedUI(true);
      setAuthState("success", "Mode aperçu local activé.");
      window.showView("accueil");
      return false;
    }
    var email = document.getElementById("auth-email").value.trim();
    var password = document.getElementById("auth-password").value;
    setWalletServiceState("idle");
    setAuthState("loading", "Vérification sécurisée de vos identifiants…");
    try {
      var result = await rpc("auth.login", { email: email, password: password });
      pendingOtpUserId = result.userId;
      otpCode = "";
      setDevelopmentOtpHint(null);
      try {
        var preview = await query("auth.devPeekOtp", { userId: result.userId });
        setDevelopmentOtpHint(preview && preview.code);
      } catch (_) {
        // En production, la route de prévisualisation OTP est interdite : l’aide reste masquée.
      }
      window.renderOtpDots();
      setAuthState("success", "Identifiants validés. Saisissez le code reçu.");
      window.showView("otp");
    } catch (error) {
      var message = errorMessage(error, "Connexion impossible. Vérifiez vos identifiants puis réessayez.");
      setAuthState("error", message);
      notify(message, "ph-warning-circle");
    }
    return false;
  };

  window.otpPress = function (digit) {
    if (!pendingOtpUserId || otpCode.length >= 6) return;
    setOtpState("idle", "Saisissez les six chiffres pour continuer.");
    otpCode += digit;
    window.renderOtpDots();
    if (otpCode.length === 6) window.otpSucceed();
  };

  window.otpSucceed = async function () {
    if (!pendingOtpUserId || otpCode.length !== 6) return;
    setOtpState("loading", "Vérification sécurisée du code…");
    try {
      await authRequest("/api/auth/verify-otp", { userId: pendingOtpUserId, code: otpCode, device: "VTEX Wallet Web" });
    } catch (error) {
      otpCode = "";
      window.renderOtpDots();
      setOtpState("error", errorMessage(error, "Code incorrect ou expiré. Demandez un nouveau code si nécessaire."));
      return;
    }
    setDevelopmentOtpHint(null);
    document.getElementById("otp-stage-code").style.display = "none";
    document.getElementById("otp-stage-success").style.display = "flex";
    requestAnimationFrame(function () { document.getElementById("otp-status-ring").classList.add("ok"); });
    setAuthenticatedUI(true);
    try {
      await hydrateWallet();
      startRealtime();
      setOtpState("success", "Identité vérifiée.");
      setTimeout(function () {
        otpCode = "";
        pendingOtpUserId = null;
        window.renderOtpDots();
        document.getElementById("otp-stage-code").style.display = "flex";
        document.getElementById("otp-stage-success").style.display = "none";
        document.getElementById("otp-status-ring").classList.remove("ok");
        setOtpState("idle", "Saisissez les six chiffres pour continuer.");
        window.showView("accueil");
      }, 650);
    } catch (_) {
      /* L’identité est validée ; l’état de service global fournit une reprise sans rejouer l’OTP. */
      window.showView("accueil");
    }
  };

  window.toggleFreeze = async function () {
    var card = CARDS[activeCardIndex];
    if (!card) return notify("Aucune carte disponible.", "ph-warning-circle");
    try {
      await rpc("cards.setFrozen", { cardId: Number(card.id), frozen: !card.frozen });
      await hydrateWallet();
      notify(card.frozen ? "Carte dégelée" : "Carte gelée", "ph-credit-card");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.toggleKey = async function (key) {
    var card = CARDS[activeCardIndex];
    if (!card) return;
    var map = { online: "onlinePaymentsEnabled", contactless: "contactlessEnabled", atm: "cashWithdrawalEnabled" };
    if (!map[key]) return notify("Ce réglage est indisponible pour cette carte.", "ph-info");
    try {
      var payload = { cardId: Number(card.id) };
      payload[map[key]] = !card.toggles[key];
      await rpc("cards.updateControls", payload);
      await hydrateWallet();
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.submitBeneficiaireForm = async function (event) {
    event.preventDefault();
    var name = document.getElementById("bf-name").value.trim();
    var iban = document.getElementById("bf-iban").value.trim();
    var bic = document.getElementById("bf-bank").value.trim();
    var internalWalletAccountId = Number(document.getElementById("bf-wallet-id").value.trim()) || undefined;
    var errorBox = document.getElementById("bf-err");
    try {
      if (editingBeneficiaireId) await rpc("beneficiaries.update", { id: Number(editingBeneficiaireId), fullName: name, iban: iban, bic: bic || undefined, internalWalletAccountId: internalWalletAccountId || null });
      else await rpc("beneficiaries.create", { fullName: name, iban: iban, bic: bic || undefined, internalWalletAccountId: internalWalletAccountId || null });
      await hydrateWallet();
      notify(editingBeneficiaireId ? "Bénéficiaire mis à jour" : "Bénéficiaire ajouté", "ph-user-plus");
      window.showView("beneficiaires");
    } catch (error) { errorBox.textContent = error.message; }
    return false;
  };

  window.bdDelete = async function () {
    if (!currentDetailId || !window.confirm("Supprimer ce bénéficiaire ?")) return;
    try {
      await rpc("beneficiaries.delete", { id: Number(currentDetailId) });
      await hydrateWallet();
      window.showView("beneficiaires");
      notify("Bénéficiaire supprimé", "ph-trash");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.submitClassique = async function () {
    var name = document.getElementById("cl-name").value.trim();
    var iban = document.getElementById("cl-iban").value.trim().replace(/\s/g, "").toUpperCase();
    var amount = document.getElementById("cl-amount").value;
    if (!name || !iban || !amount) return notify("Complète le destinataire et le montant.", "ph-warning-circle");
    if (document.getElementById("when-schedule").classList.contains("active") || document.getElementById("when-recurring").classList.contains("active")) {
      return notify("La programmation et la récurrence ne sont pas encore activées côté serveur. Crée un ordre immédiat ou reviens ultérieurement.", "ph-info");
    }
    try {
      if (!walletAccount) throw new Error("Session Wallet non chargée.");
      var beneficiary = BENEFICIAIRES.find(function (item) { return item.iban.replace(/\s/g, "").toUpperCase() === iban; });
      if (!beneficiary) {
        var created = await rpc("beneficiaries.create", { fullName: name, iban: iban });
        beneficiary = { id: String(created.id), name: created.fullName, iban: created.iban, bank: created.bic || "" };
      }
      var outcome = await rpc("transactions.transferExternal", { walletAccountId: walletAccount.id, beneficiaryId: Number(beneficiary.id), amountCents: majorToCents(amount), description: "Virement classique immédiat", idempotencyKey: makeIdempotencyKey("classic") });
      await hydrateWallet();
      notify("Ordre " + outcome.reference + " enregistré et en attente de validation.", "ph-clock");
      window.showView("historique");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.submitSplit = async function () {
    var people = BENEFICIAIRES.filter(function (item) { return splitSelected.has(item.id); });
    if (!people.length) return notify("Sélectionne au moins un bénéficiaire.", "ph-warning-circle");
    if (people.some(function (item) { return !item.internalWalletAccountId; })) return notify("Chaque bénéficiaire sélectionné doit être lié à un compte Wallet interne pour un partage réel.", "ph-warning-circle");
    try {
      if (!walletAccount) throw new Error("Session Wallet non chargée.");
      var totalCents = majorToCents(document.getElementById("split-amount").value);
      var base = Math.floor(totalCents / people.length);
      var remainder = totalCents - (base * people.length);
      var outcome = await rpc("transactions.shareFunds", {
        fromWalletAccountId: walletAccount.id,
        recipients: people.map(function (person, index) { return { walletAccountId: Number(person.internalWalletAccountId), amountCents: base + (index === 0 ? remainder : 0) }; }),
        description: "Partage de fonds VTEX",
        idempotencyKey: makeIdempotencyKey("share"),
      });
      await hydrateWallet();
      notify("Partage " + outcome.reference + " exécuté.", "ph-check-circle");
      window.showView("historique");
    } catch (error) { notify(error.message, "ph-warning-circle"); }
  };

  window.submitTransfertCartes = function () {
    var error = document.getElementById("tc-err");
    if (error) error.textContent = "Les cartes VTEX partagent le même solde Wallet. Le déplacement local de fonds est désactivé ; utilisez un virement vers un autre compte Wallet.";
  };

  window.submitSend = async function (event) {
    if (event) event.preventDefault();
    var name = document.getElementById("f-name").value.trim();
    var iban = document.getElementById("f-iban").value.trim().replace(/\s/g, "").toUpperCase();
    var reference = document.getElementById("f-ref").value.trim();
    var amount = document.getElementById("f-amount").value;
    var error = document.getElementById("f-err");
    if (!name || !iban || !reference || !amount) { if (error) error.textContent = "Complète le bénéficiaire, le montant et la référence."; return false; }
    try {
      if (!walletAccount) throw new Error("Session Wallet non chargée.");
      var beneficiary = BENEFICIAIRES.find(function (item) { return item.iban.replace(/\s/g, "").toUpperCase() === iban; });
      if (!beneficiary) {
        var created = await rpc("beneficiaries.create", { fullName: name, iban: iban });
        beneficiary = { id: String(created.id), name: created.fullName, iban: created.iban, bank: created.bic || "" };
      }
      var outcome = await rpc("transactions.transferExternal", { walletAccountId: walletAccount.id, beneficiaryId: Number(beneficiary.id), amountCents: majorToCents(amount), description: reference, idempotencyKey: makeIdempotencyKey("quick-send") });
      await hydrateWallet();
      if (error) error.textContent = "";
      notify("Ordre " + outcome.reference + " enregistré et en attente de validation.", "ph-clock");
      window.showView("historique");
    } catch (exception) { if (error) error.textContent = exception.message; else notify(exception.message, "ph-warning-circle"); }
    return false;
  };

  function demoPreviewTarget() {
    if (typeof window.isDemoPreview !== "function" || !window.isDemoPreview()) return null;
    var requestedView = new URLSearchParams(window.location.search).get("preview");
    var allowedViews = ["login", "otp", "accueil", "recu", "cartes", "profil", "confidentialite", "support", "email-compose", "banque", "recevoir", "historique", "notifications", "envoyer", "beneficiaires", "beneficiaire-detail", "beneficiaire-form", "partage-fonds", "virement-choix", "virement-instantane", "virement-classique", "transfert-cartes", "confirmation", "recharger"];
    return allowedViews.indexOf(requestedView || "accueil") >= 0 ? (requestedView || "accueil") : "accueil";
  }

  async function restoreSession() {
    var previewTarget = demoPreviewTarget();
    if (previewTarget) {
      setAuthenticatedUI(true);
      window.showView(previewTarget);
      return;
    }

    try {
      await hydrateWallet();
      setAuthenticatedUI(true);
      startRealtime();
      window.showView("accueil");
    } catch (error) {
      /* Mot de passe temporaire : la fenêtre de changement est déjà affichée (hydrateWallet) ; pas d'écran de connexion derrière. */
      if (isPasswordChangeRequired(error)) return;
      /* L’absence de cookie reste normale. Un incident de service est toutefois rendu explicite et récupérable. */
      setAuthenticatedUI(false);
      window.showView("login");
      if (isAuthenticationError(error)) {
        setWalletServiceState("idle");
        setAuthState("idle", "");
      } else {
        setAuthState("error", "Impossible de vérifier la session. Votre accès n’est pas confirmé ; vérifiez la connexion puis réessayez.");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", restoreSession);
})();
