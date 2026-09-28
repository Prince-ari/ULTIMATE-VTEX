import {
  bigint,
  boolean,
  char,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

/**
 * Schéma du noyau générique (@vtex/core) — réutilisable par n'importe
 * quel produit du studio, sans dépendance à une logique métier financière
 * (comptes, cartes ou transactions). Toute colonne
 * monétaire éventuelle resterait un BIGINT de centimes (jamais de
 * flottant, cf. @vtex/money). Toute suppression sur une table sensible
 * est RESTRICT — jamais CASCADE (leçon Vantex) : les FK ci-dessous
 * n'utilisent onDelete que là où c'est explicitement voulu (sessions,
 * notification_reads).
 *
 * Pas de relations() déclaratives ici : l'API relationnelle Drizzle
 * (db.query.*) n'est utilisée nulle part dans ce codebase (uniquement
 * .select().from()) — en avoir gardé d'inutilisées jusqu'ici était du
 * code mort, retiré lors de la scission en modules (audit d'architecture).
 */

// ===================================================================
// 1. users
// ===================================================================
export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  // `agent` = SUPPORT dans le RBAC (auth/rbac.ts). Les valeurs sont ajoutées à la fin de l'enum : aucune ligne existante ne change.
  role: mysqlEnum("role", ["admin", "agent", "user", "super_admin", "account_manager"]).notNull().default("user"),
  status: mysqlEnum("status", ["active", "suspended", "deleted"]).notNull().default("active"),
  kycVerified: boolean("kyc_verified").notNull().default(false),
  /** Dernière activité authentifiée (mise à jour au plus toutes les 5 minutes). */
  lastActiveAt: datetime("last_active_at"),
  /** Mot de passe temporaire : la seule action permise est de le changer (auth.changePassword). */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: datetime("password_changed_at"),
  tempPasswordExpiresAt: datetime("temp_password_expires_at"),
  /** Échecs consécutifs (mot de passe ou OTP) : verrouillage temporaire au-delà du seuil. */
  failedLoginCount: int("failed_login_count").notNull().default(0),
  lockedUntil: datetime("locked_until"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: datetime("deleted_at"),
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(t.email),
  roleIdx: index("users_role_idx").on(t.role),
  statusIdx: index("users_status_idx").on(t.status),
}))

// ===================================================================
// 2. sessions (table complémentaire, cf. Sprint 6 §2)
// ===================================================================
export const sessions = mysqlTable("sessions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  jti: varchar("jti", { length: 64 }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  device: varchar("device", { length: 255 }),
  ip: varchar("ip", { length: 45 }),
  expiresAt: datetime("expires_at").notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  revokedAt: datetime("revoked_at"),
}, (t) => ({
  jtiUnique: uniqueIndex("sessions_jti_unique").on(t.jti),
  userIdx: index("sessions_user_idx").on(t.userId),
  expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
}))

// ===================================================================
// 3. notifications
// ===================================================================
export const notifications = mysqlTable("notifications", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  targetUserId: bigint("target_user_id", { mode: "number" }).references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "sent"]).notNull().default("sent"),
  /** `suggestion` : message d'un membre de l'équipe (support, gestionnaire, administrateur) à propos d'un wallet précis ; `notification` : diffusion ou message système. */
  kind: mysqlEnum("kind", ["notification", "suggestion"]).notNull().default("notification"),
  /** Wallet concerné par une suggestion ((wallet_type, holder_id) = utilisateur ou entreprise) ; NULL pour une notification classique. */
  walletType: mysqlEnum("wallet_type", ["PERSONAL", "PROFESSIONAL"]),
  holderId: bigint("holder_id", { mode: "number" }),
  scheduledAt: datetime("scheduled_at"),
  sentAt: datetime("sent_at"),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  targetIdx: index("notifications_target_idx").on(t.targetUserId),
  statusIdx: index("notifications_status_idx").on(t.status, t.scheduledAt),
  kindWalletIdx: index("notifications_kind_wallet_idx").on(t.kind, t.walletType, t.holderId),
  senderIdx: index("notifications_sender_idx").on(t.createdBy, t.kind),
}))

// ===================================================================
// 3 bis. manager_assignments — wallets attribués aux gestionnaires (Sprint 5)
// ===================================================================
/**
 * Un gestionnaire (rôle `account_manager` ou `agent`) suit des wallets : `(wallet_type, holder_id)` = utilisateur ou entreprise.
 * Une ligne par couple (gestionnaire, wallet) ; retirer une attribution supprime la ligne, l'historique vit dans le journal d'audit
 * (`manager.assign` / `manager.unassign`). Le périmètre d'un ACCOUNT_MANAGER est exactement l'ensemble de ses lignes.
 */
export const managerAssignments = mysqlTable("manager_assignments", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  managerUserId: bigint("manager_user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  walletType: mysqlEnum("wallet_type", ["PERSONAL", "PROFESSIONAL"]).notNull(),
  holderId: bigint("holder_id", { mode: "number" }).notNull(),
  assignedBy: bigint("assigned_by", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  uniquePair: uniqueIndex("manager_assignments_unique").on(t.managerUserId, t.walletType, t.holderId),
  holderIdx: index("manager_assignments_holder_idx").on(t.walletType, t.holderId),
}))

// ===================================================================
// 4. notification_reads (table complémentaire, cf. Sprint 6 §7)
// ===================================================================
export const notificationReads = mysqlTable("notification_reads", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  notificationId: bigint("notification_id", { mode: "number" }).notNull().references(() => notifications.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: datetime("read_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  uniquePair: uniqueIndex("notification_reads_unique").on(t.notificationId, t.userId),
  userIdx: index("notification_reads_user_idx").on(t.userId),
}))

// ===================================================================
// 5. leads
// ===================================================================
export const leads = mysqlTable("leads", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  source: varchar("source", { length: 100 }),
  status: mysqlEnum("status", ["new", "contacted", "qualified", "converted", "lost"]).notNull().default("new"),
  // Chaque chemin de création initialise explicitement les notes. Éviter un
  // DEFAULT JSON garantit la compatibilité MySQL/TiDB de la migration initiale.
  notes: json("notes").$type<{ authorId: number; body: string; createdAt: string }[]>().notNull(),
  convertedUserId: bigint("converted_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  statusIdx: index("leads_status_idx").on(t.status),
  convertedIdx: index("leads_converted_idx").on(t.convertedUserId),
}))

// ===================================================================
// 6. settings (singleton)
// ===================================================================
export const settings = mysqlTable("settings", {
  id: tinyint("id").notNull().primaryKey().default(1),
  platformName: varchar("platform_name", { length: 100 }).notNull(),
  logoUrl: varchar("logo_url", { length: 500 }),
  defaultTheme: mysqlEnum("default_theme", ["light", "dark"]).notNull().default("light"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: varchar("maintenance_message", { length: 500 }),
  supportEmail: varchar("support_email", { length: 255 }).notNull(),
  /**
   * Valeurs de remplacement pour les statistiques du Dashboard — nulles
   * par défaut (la vraie donnée calculée s'affiche alors). Un admin peut
   * en fixer une explicitement pour une démonstration/présentation ;
   * jamais utilisées pour un calcul, uniquement pour l'affichage — la
   * vraie donnée sous-jacente n'est jamais modifiée ni perdue.
   */
  statsActiveUsersOverride: int("stats_active_users_override"),
  statsPlatformBalanceCentsOverride: bigint("stats_platform_balance_cents_override", { mode: "number" }),
  statsTransactionsThisMonthOverride: int("stats_transactions_this_month_override"),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})
// Le CHECK (id = 1) natif MySQL/MariaDB est ajouté en SQL brut après le push
// (cf. db/afterPush.ts) — drizzle-kit ne génère pas de CHECK constraint
// portable pour toutes les versions ciblées.

// ===================================================================
// 7. support_tickets
// ===================================================================
export const supportTickets = mysqlTable("support_tickets", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  subject: varchar("subject", { length: 200 }).notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved"]).notNull().default("open"),
  priority: mysqlEnum("priority", ["low", "normal", "high"]).notNull().default("normal"),
  messages: json("messages").$type<{ authorId: number; authorRole: string; body: string; createdAt: string }[]>().notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  userIdx: index("support_tickets_user_idx").on(t.userId),
  statusIdx: index("support_tickets_status_idx").on(t.status),
  priorityIdx: index("support_tickets_priority_idx").on(t.priority),
}))

// ===================================================================
// 8. logs (Journal système) — immuable, référence polymorphe volontaire
// ===================================================================
export const logs = mysqlTable("logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  actorId: bigint("actor_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetId: bigint("target_id", { mode: "number" }).notNull(),
  detail: json("detail").$type<Record<string, unknown> | null>(),
  // Contexte d'audit (alimenté automatiquement par logAction depuis le contexte de requête, cf. api/requestContext.ts).
  actorRole: varchar("actor_role", { length: 20 }),
  sessionJti: varchar("session_jti", { length: 64 }),
  ip: varchar("ip", { length: 45 }),
  requestId: varchar("request_id", { length: 36 }),
  /** Titulaire du wallet concerné : PERSONAL → users.id, PROFESSIONAL → businesses.id. */
  walletType: mysqlEnum("wallet_type", ["PERSONAL", "PROFESSIONAL"]),
  holderId: bigint("holder_id", { mode: "number" }),
  /** Renseigné pendant une session support (Sprint 8) : distingue à coup sûr une action d'admin d'une action de l'utilisateur. */
  supportSessionId: bigint("support_session_id", { mode: "number" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  actorIdx: index("logs_actor_idx").on(t.actorId),
  targetIdx: index("logs_target_idx").on(t.targetType, t.targetId),
  createdIdx: index("logs_created_idx").on(t.createdAt),
  holderIdx: index("logs_holder_idx").on(t.walletType, t.holderId, t.createdAt),
}))

/** Type de wallet, porté par le TITULAIRE : un utilisateur (PERSONAL) ou une société (PROFESSIONAL). */
export const WALLET_TYPES = ["PERSONAL", "PROFESSIONAL"] as const
export type WalletType = (typeof WALLET_TYPES)[number]

// ===================================================================
// 9. rate_limit_buckets — remplace la Map en mémoire du process
// (incompatible serverless : Vercel/Netlify peuvent router deux requêtes
// consécutives vers deux instances différentes, sans mémoire partagée —
// la base devient le seul état commun fiable entre invocations).
// ===================================================================
export const rateLimitBuckets = mysqlTable("rate_limit_buckets", {
  bucketKey: varchar("bucket_key", { length: 191 }).notNull().primaryKey(),
  count: int("count").notNull().default(0),
  // datetime(3) = précision milliseconde. Un DATETIME sans précision
  // fractionnaire tronque aux secondes — invisible pour les fenêtres de
  // 60s utilisées partout ailleurs, mais un vrai bug de précision latent
  // pour toute fenêtre plus courte. Trouvé par un test, corrigé ici.
  resetsAt: datetime("resets_at", { fsp: 3 }).notNull(),
})

// ===================================================================
// 10. otp_codes — remplace la Map en mémoire (même raisonnement que
// rate_limit_buckets : un code généré sur une instance serverless doit
// pouvoir être vérifié depuis une autre). Un seul code actif par
// utilisateur à la fois — une nouvelle demande écrase la précédente.
// ===================================================================
export const otpCodes = mysqlTable("otp_codes", {
  userId: bigint("user_id", { mode: "number" }).notNull().primaryKey(),
  /** En production : « ------ ». Le vrai code n'est écrit ici qu'hors production (devPeekOtp) ; la vérification utilise `codeHash`. */
  code: char("code", { length: 6 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }),
  attempts: int("attempts").notNull().default(0),
  expiresAt: datetime("expires_at").notNull(),
})

/**
 * Identifiants Passkey (WebAuthn) — un utilisateur peut enregistrer
 * plusieurs appareils (téléphone, ordinateur...), d'où une table à
 * part plutôt qu'une colonne sur `users`. Ne contient jamais de donnée
 * biométrique — uniquement la clé publique et l'identifiant opaque du
 * credential, exactement ce que le protocole WebAuthn produit côté
 * serveur (RFC 8809 / W3C WebAuthn Level 2).
 */
export const webauthnCredentials = mysqlTable("webauthn_credentials", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  credentialId: varchar("credential_id", { length: 255 }).notNull(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  deviceName: varchar("device_name", { length: 100 }).notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastUsedAt: datetime("last_used_at"),
}, (t) => ({
  credentialIdUnique: uniqueIndex("webauthn_credentials_credential_id_unique").on(t.credentialId),
  userIdx: index("webauthn_credentials_user_idx").on(t.userId),
}))

/**
 * Challenge WebAuthn en attente — même patron que `otp_codes` (une
 * ligne par utilisateur, courte durée de vie, remplacée à chaque
 * nouvelle tentative). `purpose` distingue un challenge d'enregistrement
 * (ajout d'un nouvel appareil, utilisateur déjà authentifié) d'un
 * challenge de connexion (l'utilisateur s'identifie par Passkey).
 */
export const webauthnChallenges = mysqlTable("webauthn_challenges", {
  userId: bigint("user_id", { mode: "number" }).notNull().primaryKey(),
  challenge: varchar("challenge", { length: 255 }).notNull(),
  purpose: mysqlEnum("purpose", ["register", "login"]).notNull(),
  expiresAt: datetime("expires_at").notNull(),
})


// ===================================================================
// 11. documents — capacité transverse extraite de l'ancien Wallet
// ===================================================================
/**
 * Documents rattachés à un utilisateur. Le nom physique historique est
 * conservé pour permettre une transition non destructive depuis VTEX V1 ;
 * le module et le contrat exposés sont désormais génériques.
 */
/**
 * Fichier stocké une seule fois (objet privé) et partagé par toutes ses remises : un document envoyé à dix wallets = un fichier, dix lignes de `wallet_documents`.
 * `sha256` identifie le contenu sans l'exposer ; l'objet lui-même n'est jamais servi par une URL publique (route authentifiée uniquement).
 */
export const documentFiles = mysqlTable("document_files", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  fileName: varchar("file_name", { length: 180 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: int("size_bytes").notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  storageKeyUnique: uniqueIndex("document_files_storage_key_unique").on(t.storageKey),
  sha256Idx: index("document_files_sha256_idx").on(t.sha256),
}))

/**
 * Une ligne = UNE REMISE : un document remis à UN destinataire, à propos d'UN wallet. Historiquement une ligne portait aussi le fichier
 * (`storage_key`, `content`) ; les nouvelles remises pointent vers `document_files` (`file_id`) et laissent `storage_key` à NULL.
 * `document_type` sert de catégorie. `review_status` ne vaut autre chose que `none` que pour les pièces remises PAR le titulaire (justificatifs à valider).
 */
export const documents = mysqlTable("wallet_documents", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 180 }).notNull(),
  documentType: mysqlEnum("document_type", ["statement", "receipt", "contract", "identity", "account_document", "transfer_proof", "tax", "notice", "other"]).notNull().default("statement"),
  fileName: varchar("file_name", { length: 180 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull().default("text/plain; charset=utf-8"),
  content: text("content"),
  storageKey: varchar("storage_key", { length: 512 }),
  sizeBytes: int("size_bytes"),
  source: mysqlEnum("source", ["admin", "user"]).notNull().default("admin"),
  status: mysqlEnum("status", ["active", "revoked", "archived"]).notNull().default("active"),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  transactionReference: varchar("transaction_reference", { length: 120 }),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  /** Fichier partagé (NULL pour une ancienne remise qui porte encore son propre objet). */
  fileId: bigint("file_id", { mode: "number" }).references(() => documentFiles.id, { onDelete: "set null" }),
  /** Wallet concerné : `(wallet_type, holder_id)` = utilisateur (PERSONAL) ou entreprise (PROFESSIONAL). */
  walletType: mysqlEnum("wallet_type", ["PERSONAL", "PROFESSIONAL"]),
  holderId: bigint("holder_id", { mode: "number" }),
  /** Remises envoyées ensemble (même fichier, mêmes réglages) partagent ce lot. */
  batchId: char("batch_id", { length: 36 }),
  note: varchar("note", { length: 500 }),
  reviewStatus: mysqlEnum("review_status", ["none", "pending", "validated", "rejected"]).notNull().default("none"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  reviewedAt: datetime("reviewed_at"),
  reviewReason: varchar("review_reason", { length: 250 }),
  firstViewedAt: datetime("first_viewed_at"),
  archivedAt: datetime("archived_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  userIdx: index("wallet_documents_user_idx").on(t.userId, t.createdAt),
  statusIdx: index("wallet_documents_status_idx").on(t.status, t.createdAt),
  storageKeyUnique: uniqueIndex("wallet_documents_storage_key_unique").on(t.storageKey),
  walletIdx: index("wallet_documents_wallet_idx").on(t.walletType, t.holderId, t.createdAt),
  batchIdx: index("wallet_documents_batch_idx").on(t.batchId),
  reviewIdx: index("wallet_documents_review_idx").on(t.reviewStatus, t.createdAt),
}))

export type Document = typeof documents.$inferSelect
export type InsertDocument = typeof documents.$inferInsert

// ===================================================================
// 12. card_vault — données de carte saisies par l'administrateur, chiffrées au repos
// ===================================================================
/**
 * Coffre des données de carte (numéro, CVV, PIN) saisies manuellement par l'administrateur. Une seule table pour les deux
 * types de wallet : `(wallet_type, card_id)` désigne `cards.id` (PERSONAL) ou `business_cards.id` (PROFESSIONAL) — pas de
 * clé étrangère (deux paquets, deux historiques de migrations), la cohérence est portée par le service.
 *
 * Chaque champ est un chiffré AES-256-GCM auto-décrit (`keyId.base64url`), lié à sa ligne et à sa colonne (AAD) : jamais
 * lisible en SQL, jamais renvoyé par une liste, un export ou le journal. `pan_fingerprint` = index aveugle (HMAC) : il
 * empêche d'attacher le même numéro à deux cartes sans jamais le stocker en clair.
 */
export const cardVault = mysqlTable("card_vault", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  walletType: mysqlEnum("wallet_type", ["PERSONAL", "PROFESSIONAL"]).notNull(),
  cardId: bigint("card_id", { mode: "number" }).notNull(),
  keyId: varchar("key_id", { length: 16 }).notNull(),
  panEnc: varchar("pan_enc", { length: 400 }),
  panFingerprint: char("pan_fingerprint", { length: 64 }),
  cvvEnc: varchar("cvv_enc", { length: 200 }),
  pinEnc: varchar("pin_enc", { length: 200 }),
  setBy: bigint("set_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  lastRevealedAt: datetime("last_revealed_at"),
  lastRevealedBy: bigint("last_revealed_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  revealCount: int("reveal_count").notNull().default(0),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  cardUnique: uniqueIndex("card_vault_card_unique").on(t.walletType, t.cardId),
  fingerprintUnique: uniqueIndex("card_vault_pan_fingerprint_unique").on(t.panFingerprint),
  keyIdx: index("card_vault_key_idx").on(t.keyId),
}))

export type CardVaultRow = typeof cardVault.$inferSelect

// ===================================================================
// 13. bank_accounts — RIB principaux et sous-RIB (IBAN virtuels), source de vérité unique
// ===================================================================
/**
 * Coordonnées bancaires de la plateforme. Un RIB `MAIN` est celui d'un compte (personnel ou Wallet Pro) ; un `SUB` est un IBAN virtuel
 * rattaché à un compte. `(wallet_type, holder_id)` désigne le titulaire (users.id / businesses.id), `ledger_account_id` le compte crédité
 * (`wallet_accounts.id` / `business_wallet_accounts.id`). Un sous-RIB peut être NON attribué (holder/ledger NULL) : il attend dans le stock.
 *
 * L'IBAN est chiffré au repos (AES-256-GCM, même coffre que les cartes) ; `iban_fingerprint` (index aveugle) garantit l'unicité sans le
 * révéler ; seuls les quatre derniers caractères sont en clair. Les colonnes `iban`/`bic` historiques des comptes restent alimentées
 * par le service (écriture jumelée) tant que le Wallet les lit — additif d'abord, suppression plus tard.
 * Jamais de suppression : un RIB se désactive (traçabilité). L'historique complet vit dans `logs` (target_type = 'bank_account').
 */
export const bankAccounts = mysqlTable("bank_accounts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  walletType: mysqlEnum("wallet_type", ["PERSONAL", "PROFESSIONAL"]).notNull(),
  holderId: bigint("holder_id", { mode: "number" }),
  ledgerAccountId: bigint("ledger_account_id", { mode: "number" }),
  kind: mysqlEnum("kind", ["MAIN", "SUB"]).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  accountHolderName: varchar("account_holder_name", { length: 160 }).notNull(),
  bankName: varchar("bank_name", { length: 120 }).notNull().default("VTEX"),
  currency: char("currency", { length: 3 }).notNull(),
  ibanEnc: varchar("iban_enc", { length: 400 }).notNull(),
  ibanFingerprint: char("iban_fingerprint", { length: 64 }).notNull(),
  ibanLast4: char("iban_last4", { length: 4 }).notNull(),
  ibanCountry: char("iban_country", { length: 2 }).notNull(),
  bic: char("bic", { length: 11 }),
  status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
  keyId: varchar("key_id", { length: 16 }).notNull(),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  updatedBy: bigint("updated_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  disabledAt: datetime("disabled_at"),
  /** Garde-fou de base : un seul RIB principal ACTIF par compte (NULL pour tout le reste, donc sans effet sur les sous-RIB ni les RIB désactivés). */
  mainSlot: varchar("main_slot", { length: 40 }).generatedAlwaysAs(sql`(IF(\`kind\` = 'MAIN' AND \`status\` = 'active' AND \`ledger_account_id\` IS NOT NULL, CONCAT(\`wallet_type\`, ':', \`ledger_account_id\`), NULL))`, { mode: "stored" }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  ibanUnique: uniqueIndex("bank_accounts_iban_fingerprint_unique").on(t.ibanFingerprint),
  mainSlotUnique: uniqueIndex("bank_accounts_main_slot_unique").on(t.mainSlot),
  holderIdx: index("bank_accounts_holder_idx").on(t.walletType, t.holderId, t.status),
  ledgerIdx: index("bank_accounts_ledger_idx").on(t.walletType, t.ledgerAccountId, t.kind, t.status),
  statusIdx: index("bank_accounts_status_idx").on(t.status, t.kind),
}))

export type BankAccountRow = typeof bankAccounts.$inferSelect
