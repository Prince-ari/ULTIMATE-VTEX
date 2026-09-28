/* VTEX Wallet Showcase — backend de démonstration en mémoire.
 *
 * Répond au sous-ensemble du contrat `apps/wallet/vtex-api.js` nécessaire à
 * une session complète sans backend réel :
 *   - /api/trpc/<procedure>        POST (json body) et GET (?input=…)
 *   - /api/auth/verify-otp         POST, pose un cookie de session
 *   - /api/events                  SSE — flux minimal (dégradation propre)
 *   - /api/media/upload            POST multipart léger, renvoie une URL fictive
 *   - /api/media/documents/[id]    téléchargement placeholder
 *
 * Aucune dépendance externe : uniquement les modules natifs Node. L'état vit
 * dans une variable JS ; il n'y a ni base ni fichier, un redémarrage remet
 * la démo dans l'état initial.
 */

import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { URL } from "node:url";

const PORT = Number(process.env.PORT ?? process.env.MOCK_API_PORT ?? 4000);
const HOST = process.env.HOST ?? "127.0.0.1";
const SESSION_COOKIE = "vtex-showcase-session";

/* ================================================================
   État en mémoire — reset à chaque redémarrage du process
   ================================================================ */

function nowIso() { return new Date().toISOString(); }

const state = {
  nextId: 1000,
  user: {
    id: 1,
    firstName: "Ariel",
    lastName: "Kouadio",
    email: "ariel.kouadio@vtex.demo",
    avatarUrl: null,
    kycVerified: true,
    createdAt: "2024-05-12T10:00:00.000Z",
    role: "user",
  },
  account: {
    id: 1,
    currency: "EUR",
    availableBalanceCents: 189540, // 1 895,40 €
    iban: "FR76 3000 4000 5000 6000 7000 890",
    bic: "BNPAFRPPXXX",
  },
  cards: [
    {
      id: 1, label: "Carte principale VTEX", network: "visa", lastFour: "4211",
      expiresAt: "2028-08-31T23:59:59.000Z", cardholderName: "ARIEL KOUADIO",
      status: "active", onlinePaymentsEnabled: true, contactlessEnabled: true,
      cashWithdrawalEnabled: true, dailyLimitCents: 500000, perTransactionLimitCents: 100000,
    },
    {
      id: 2, label: "Carte voyage", network: "mastercard", lastFour: "9872",
      expiresAt: "2027-11-30T23:59:59.000Z", cardholderName: "ARIEL KOUADIO",
      status: "active", onlinePaymentsEnabled: true, contactlessEnabled: true,
      cashWithdrawalEnabled: false, dailyLimitCents: 200000, perTransactionLimitCents: 50000,
    },
  ],
  transactions: [
    { id: 1, direction: "credit", status: "completed", type: "salaire",
      description: "Virement reçu — Selego SAS", amountCents: 250000, createdAt: "2026-09-01T09:12:00.000Z" },
    { id: 2, direction: "debit", status: "completed", type: "achat_en_ligne",
      description: "Amazon — Périphériques", amountCents: 12490, createdAt: "2026-09-03T14:37:00.000Z" },
    { id: 3, direction: "debit", status: "completed", type: "sans_contact",
      description: "Boulangerie du Marché", amountCents: 830, createdAt: "2026-09-05T08:14:00.000Z" },
    { id: 4, direction: "credit", status: "completed", type: "remboursement",
      description: "Remboursement — Blablacar", amountCents: 4200, createdAt: "2026-09-08T18:22:00.000Z" },
    { id: 5, direction: "debit", status: "completed", type: "virement",
      description: "Loyer — SCI Résidence des Palmiers", amountCents: 78000, createdAt: "2026-09-10T07:00:00.000Z" },
    { id: 6, direction: "debit", status: "pending", type: "virement",
      description: "Virement — Sarah Deguenon", amountCents: 5000, createdAt: "2026-09-14T21:45:00.000Z" },
  ],
  beneficiaries: [
    { id: 1, fullName: "Sarah Deguenon", iban: "FR76 1234 5678 9012 3456 7890 123", bic: "BNPAFRPP", internalWalletAccountId: null },
    { id: 2, fullName: "Jean Loko",       iban: "FR76 3210 9876 5432 1098 7654 321", bic: "SOGEFRPP", internalWalletAccountId: 2 },
    { id: 3, fullName: "Olabode Adeyemi", iban: "GB29 NWBK 6016 1331 9268 19",       bic: "NWBKGB2L", internalWalletAccountId: 3 },
  ],
  savingsGoals: [
    { id: 1, name: "Vacances Marrakech", targetCents: 150000, currentCents: 45000, currency: "EUR", status: "active", dueAt: "2026-12-20T00:00:00.000Z" },
    { id: 2, name: "Fonds d'urgence",    targetCents: 500000, currentCents: 180000, currency: "EUR", status: "active", dueAt: null },
  ],
  notifications: [
    { id: 1, title: "Virement reçu",     body: "Selego SAS — 2 500,00 €",                     createdAt: "2026-09-01T09:12:15.000Z" },
    { id: 2, title: "Paiement autorisé", body: "Amazon — 124,90 €",                            createdAt: "2026-09-03T14:37:20.000Z" },
    { id: 3, title: "Sécurité",          body: "Nouvelle connexion depuis Chrome sur Windows.", createdAt: "2026-09-14T22:03:00.000Z" },
  ],
  documents: [],
  /* userId → { code, expiresAt } */
  pendingOtps: new Map(),
  /* sessionId (string) → userId */
  sessions: new Map(),
};

function nextId() { return ++state.nextId; }
function generateOtpCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

/* ================================================================
   Helpers HTTP
   ================================================================ */

function json(res, status, body, extraHeaders) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(extraHeaders || {}) };
  const cors = corsHeaders();
  for (const k of Object.keys(cors)) headers[k] = cors[k];
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-credentials": "true",
  };
}

function trpcOk(data) { return { result: { data: { json: data } } }; }
function trpcErr(message, code) { return { error: { json: { message, code: code || "BAD_REQUEST" } } }; }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return resolve(null);
        resolve(JSON.parse(raw));
      } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function readCookie(req, name) {
  const cookie = req.headers.cookie || "";
  for (const pair of cookie.split(/;\s*/)) {
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.substring(0, eq) === name) return decodeURIComponent(pair.substring(eq + 1));
  }
  return null;
}

function currentUserId(req) {
  const sid = readCookie(req, SESSION_COOKIE);
  if (!sid) return null;
  return state.sessions.get(sid) || null;
}

function setSessionCookie(res, sid) {
  /* HttpOnly non requis pour la démo : le cookie est purement local. SameSite
     Lax + Path=/ permettent une navigation d'onglet cohérente ; pas de Secure
     pour que le cookie fonctionne en http://localhost. */
  res.setHeader("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(sid)}; Path=/; SameSite=Lax; Max-Age=86400`);
}

function unwrapTrpcInput(value) {
  /* tRPC v10 emballe l'input dans `{ json: … }`. */
  if (value && typeof value === "object" && "json" in value) return value.json;
  return value;
}

async function parseTrpcInput(req, url) {
  if (req.method === "GET") {
    const raw = url.searchParams.get("input");
    if (!raw) return null;
    try { return unwrapTrpcInput(JSON.parse(raw)); }
    catch (_) { return null; }
  }
  const body = await readBody(req).catch(() => null);
  return unwrapTrpcInput(body || {});
}

/* ================================================================
   Procédures tRPC
   ================================================================ */

function requireAuth(req) {
  const userId = currentUserId(req);
  if (!userId) { const err = new Error("Session invalide, connexion requise."); err.status = 401; throw err; }
  return userId;
}

const procedures = {
  /* -------- auth -------- */

  "auth.login": async ({ input }) => {
    const email = String(input && input.email || "").trim();
    if (!email) throw new Error("Email requis.");
    /* Toute paire email/mot de passe est acceptée dans le showcase. On
       enregistre un OTP à afficher à l'écran via `auth.devPeekOtp`. */
    const code = generateOtpCode();
    state.pendingOtps.set(state.user.id, { code, expiresAt: Date.now() + 5 * 60_000 });
    console.log(`[mock-api] auth.login (${email}) → OTP ${code}`);
    return { userId: state.user.id };
  },

  "auth.devPeekOtp": async ({ input }) => {
    const userId = Number(input && input.userId) || state.user.id;
    const entry = state.pendingOtps.get(userId);
    if (!entry) return { code: null };
    return { code: entry.code };
  },

  "auth.listSessions": async ({ req }) => {
    requireAuth(req);
    return [
      { id: 1, device: "VTEX Wallet Web", createdAt: nowIso(), lastActiveAt: nowIso() },
    ];
  },

  "auth.webauthnListCredentials": async ({ req }) => {
    requireAuth(req);
    return [];
  },

  /* -------- users -------- */

  "users.updateMe": async ({ req, input }) => {
    requireAuth(req);
    if (input && "avatarUrl" in input) state.user.avatarUrl = input.avatarUrl || null;
    if (input && input.firstName) state.user.firstName = String(input.firstName);
    if (input && input.lastName) state.user.lastName = String(input.lastName);
    return { ok: true };
  },

  /* -------- wallets -------- */

  "wallets.bootstrap": async ({ req }) => {
    requireAuth(req);
    return {
      user: state.user,
      account: state.account,
      cards: state.cards,
      transactions: state.transactions,
      beneficiaries: state.beneficiaries,
      savingsGoals: state.savingsGoals,
    };
  },

  /* -------- cards -------- */

  "cards.setFrozen": async ({ req, input }) => {
    requireAuth(req);
    const card = state.cards.find((c) => c.id === Number(input && input.cardId));
    if (!card) throw new Error("Carte introuvable.");
    card.status = input.frozen ? "frozen" : "active";
    return { ok: true };
  },

  "cards.updateControls": async ({ req, input }) => {
    requireAuth(req);
    const card = state.cards.find((c) => c.id === Number(input && input.cardId));
    if (!card) throw new Error("Carte introuvable.");
    for (const key of ["onlinePaymentsEnabled", "contactlessEnabled", "cashWithdrawalEnabled"]) {
      if (key in input) card[key] = Boolean(input[key]);
    }
    return { ok: true };
  },

  /* -------- beneficiaries -------- */

  "beneficiaries.create": async ({ req, input }) => {
    requireAuth(req);
    const beneficiary = {
      id: nextId(),
      fullName: String(input.fullName || "").trim() || "Bénéficiaire",
      iban: String(input.iban || "").trim(),
      bic: input.bic ? String(input.bic).trim() : null,
      internalWalletAccountId: input.internalWalletAccountId || null,
    };
    if (!beneficiary.iban) throw new Error("IBAN requis.");
    state.beneficiaries.push(beneficiary);
    return beneficiary;
  },

  "beneficiaries.update": async ({ req, input }) => {
    requireAuth(req);
    const beneficiary = state.beneficiaries.find((b) => b.id === Number(input.id));
    if (!beneficiary) throw new Error("Bénéficiaire introuvable.");
    if (input.fullName) beneficiary.fullName = String(input.fullName);
    if (input.iban) beneficiary.iban = String(input.iban);
    if ("bic" in input) beneficiary.bic = input.bic ? String(input.bic) : null;
    if ("internalWalletAccountId" in input) beneficiary.internalWalletAccountId = input.internalWalletAccountId || null;
    return beneficiary;
  },

  "beneficiaries.delete": async ({ req, input }) => {
    requireAuth(req);
    const index = state.beneficiaries.findIndex((b) => b.id === Number(input.id));
    if (index < 0) throw new Error("Bénéficiaire introuvable.");
    state.beneficiaries.splice(index, 1);
    return { ok: true };
  },

  /* -------- transactions -------- */

  "transactions.transferExternal": async ({ req, input }) => {
    requireAuth(req);
    const amount = Number(input.amountCents);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
    if (amount > state.account.availableBalanceCents) throw new Error("Solde insuffisant pour cet ordre.");
    const beneficiary = state.beneficiaries.find((b) => b.id === Number(input.beneficiaryId));
    const reference = "VTX-" + randomBytes(3).toString("hex").toUpperCase();
    state.account.availableBalanceCents -= amount;
    state.transactions.unshift({
      id: nextId(), direction: "debit", status: "pending", type: "virement",
      description: input.description || (beneficiary ? "Virement vers " + beneficiary.fullName : "Virement externe"),
      amountCents: amount, createdAt: nowIso(),
    });
    state.notifications.unshift({
      id: nextId(),
      title: "Ordre de virement enregistré",
      body: `${reference} — ${(amount / 100).toFixed(2)} €`,
      createdAt: nowIso(),
    });
    return { reference };
  },

  "transactions.shareFunds": async ({ req, input }) => {
    requireAuth(req);
    const recipients = Array.isArray(input.recipients) ? input.recipients : [];
    const total = recipients.reduce((sum, r) => sum + Number(r.amountCents || 0), 0);
    if (total <= 0) throw new Error("Montant partagé invalide.");
    if (total > state.account.availableBalanceCents) throw new Error("Solde insuffisant pour ce partage.");
    const reference = "VTX-SHARE-" + randomBytes(2).toString("hex").toUpperCase();
    state.account.availableBalanceCents -= total;
    for (const recipient of recipients) {
      const amt = Number(recipient.amountCents || 0);
      if (amt <= 0) continue;
      const target = state.beneficiaries.find((b) => b.internalWalletAccountId === recipient.walletAccountId);
      state.transactions.unshift({
        id: nextId(), direction: "debit", status: "completed", type: "partage_fonds",
        description: input.description || "Partage de fonds VTEX" + (target ? " — " + target.fullName : ""),
        amountCents: amt, createdAt: nowIso(),
      });
    }
    return { reference };
  },

  /* -------- savings goals -------- */

  "savingsGoals.create": async ({ req, input }) => {
    requireAuth(req);
    const target = Number(input.targetCents);
    if (!Number.isFinite(target) || target <= 0) throw new Error("Montant cible invalide.");
    const goal = {
      id: nextId(),
      name: String(input.name || "Nouvel objectif").trim(),
      targetCents: target,
      currentCents: 0,
      currency: state.account.currency,
      status: "active",
      dueAt: input.dueAt || null,
    };
    state.savingsGoals.push(goal);
    return goal;
  },

  "savingsGoals.fund": async ({ req, input }) => {
    requireAuth(req);
    const goal = state.savingsGoals.find((g) => g.id === Number(input.goalId));
    if (!goal) throw new Error("Objectif introuvable.");
    const amount = Number(input.amountCents);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Montant invalide.");
    if (amount > state.account.availableBalanceCents) throw new Error("Solde insuffisant.");
    state.account.availableBalanceCents -= amount;
    goal.currentCents += amount;
    state.transactions.unshift({
      id: nextId(), direction: "debit", status: "completed", type: "epargne_alimentation",
      description: `Alimentation objectif — ${goal.name}`,
      amountCents: amount, createdAt: nowIso(),
    });
    return goal;
  },

  "savingsGoals.update": async ({ req, input }) => {
    requireAuth(req);
    const goal = state.savingsGoals.find((g) => g.id === Number(input.goalId));
    if (!goal) throw new Error("Objectif introuvable.");
    if (input.name) goal.name = String(input.name);
    if (input.targetCents) goal.targetCents = Number(input.targetCents);
    if ("dueAt" in input) goal.dueAt = input.dueAt || null;
    return goal;
  },

  "savingsGoals.close": async ({ req, input }) => {
    requireAuth(req);
    const goal = state.savingsGoals.find((g) => g.id === Number(input.goalId));
    if (!goal) throw new Error("Objectif introuvable.");
    if (goal.currentCents > 0) {
      state.account.availableBalanceCents += goal.currentCents;
      goal.currentCents = 0;
    }
    goal.status = "archived";
    return goal;
  },

  /* -------- notifications -------- */

  "notifications.listMine": async ({ req }) => {
    requireAuth(req);
    return state.notifications;
  },

  "notifications.markRead": async ({ req, input }) => {
    requireAuth(req);
    /* Aucune notion de "lu" dans la démo — on accepte le marquage sans effet. */
    return { ok: true, id: Number(input && input.notificationId) || null };
  },

  /* -------- settings / documents -------- */

  "settings.get": async () => ({ platformName: "VTEX", supportEmail: "support@vtex.demo" }),

  "documents.listMine": async ({ req }) => {
    requireAuth(req);
    return state.documents;
  },

  "documents.submitTransferProof": async ({ req, input }) => {
    requireAuth(req);
    const doc = {
      id: nextId(),
      title: input.title || "Justificatif de virement",
      fileName: input.fileName || "justificatif.pdf",
      mimeType: input.mimeType || "application/pdf",
      sizeBytes: Number(input.sizeBytes || 0),
      storageKey: input.storageKey || null,
      transactionReference: input.transactionReference || null,
      createdAt: nowIso(),
    };
    state.documents.push(doc);
    return doc;
  },
};

/* ================================================================
   Serveur HTTP
   ================================================================ */

async function handleTrpc(req, res, procName, url) {
  const proc = procedures[procName];
  if (!proc) return json(res, 404, trpcErr(`Procédure inconnue: ${procName}`, "NOT_FOUND"));
  try {
    const input = await parseTrpcInput(req, url);
    const data = await proc({ req, res, input, url });
    return json(res, 200, trpcOk(data));
  } catch (error) {
    const status = error && error.status ? error.status : 400;
    return json(res, status, trpcErr(error && error.message ? error.message : "Requête invalide."));
  }
}

async function handleVerifyOtp(req, res) {
  try {
    const body = await readBody(req);
    const userId = Number(body && body.userId);
    const code = String(body && body.code || "").trim();
    const pending = state.pendingOtps.get(userId);
    if (!pending || pending.code !== code || pending.expiresAt < Date.now()) {
      return json(res, 401, { error: "Code OTP incorrect ou expiré." });
    }
    state.pendingOtps.delete(userId);
    const sid = randomUUID();
    state.sessions.set(sid, userId);
    setSessionCookie(res, sid);
    return json(res, 200, { ok: true, userId });
  } catch (error) {
    return json(res, 400, { error: error && error.message ? error.message : "Requête invalide." });
  }
}

function handleSse(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
    ...corsHeaders(),
  });
  res.write("event: hello\ndata: {}\n\n");
  const beat = setInterval(() => res.write(": keepalive\n\n"), 20_000);
  req.on("close", () => clearInterval(beat));
}

async function handleMediaUpload(req, res) {
  /* Démo : on lit le corps sans le stocker et on renvoie une URL fictive.
     La partie navigateur ne lit que { url, fileName, mimeType, storageKey, sizeBytes }. */
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on("data", (c) => chunks.push(c));
    req.on("end", resolve);
    req.on("error", reject);
  });
  const sizeBytes = Buffer.concat(chunks).length;
  const key = "demo/" + randomUUID();
  return json(res, 200, {
    url: "/api/media/object/" + key,
    fileName: "upload.bin",
    mimeType: "application/octet-stream",
    storageKey: key,
    sizeBytes,
  });
}

function handleDocumentDownload(res) {
  /* Placeholder minimal : un PDF vide de démonstration. */
  res.writeHead(200, {
    "content-type": "application/pdf",
    "content-disposition": 'inline; filename="document-demo.pdf"',
    ...corsHeaders(),
  });
  res.end(Buffer.from("%PDF-1.4\n%demo\n"));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders()); res.end(); return; }

  try {
    if (path.startsWith("/api/trpc/")) {
      const procName = path.substring("/api/trpc/".length);
      return handleTrpc(req, res, procName, url);
    }
    if (path === "/api/auth/verify-otp" && req.method === "POST") {
      return handleVerifyOtp(req, res);
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      const sid = readCookie(req, SESSION_COOKIE);
      if (sid) state.sessions.delete(sid);
      res.setHeader("set-cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
      return json(res, 200, { ok: true });
    }
    if (path === "/api/events") {
      return handleSse(req, res);
    }
    if (path === "/api/media/upload" && req.method === "POST") {
      return handleMediaUpload(req, res);
    }
    if (path.startsWith("/api/media/documents/")) {
      return handleDocumentDownload(res);
    }
    if (path === "/health") {
      return json(res, 200, { ok: true, uptime: process.uptime() });
    }
    return json(res, 404, { error: "Route inconnue: " + path });
  } catch (error) {
    return json(res, 500, { error: error && error.message ? error.message : "Erreur serveur." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] VTEX Wallet showcase backend prêt sur http://${HOST}:${PORT}`);
  console.log(`[mock-api] Utilise n'importe quel email + mot de passe pour te connecter ; le code OTP s'affiche dans le Wallet.`);
});
