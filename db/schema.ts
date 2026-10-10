import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(0),
  role: text("role", { enum: ["client", "admin"] }).notNull().default("client"),
  createdAt: integer("created_at").notNull(),
  emailVerifiedAt: integer("email_verified_at"),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  draft: text("draft"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("email_verifications_email_idx").on(table.email), index("email_verifications_expiry_idx").on(table.expiresAt)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  version: integer("version").notNull().default(0),
  twoFactorVerified: integer("two_factor_verified", { mode: "boolean" }).notNull().default(false),
}, table => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

export const twoFactors = sqliteTable("two_factors", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  enabledAt: integer("enabled_at"),
  expiresAt: integer("expires_at").notNull(),
  lastStep: integer("last_step").notNull().default(-1),
});

export const recoveryCodes = sqliteTable("recovery_codes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, table => [index("recovery_codes_user_idx").on(table.userId)]);

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("auth_challenges_expiry_idx").on(table.expiresAt), index("auth_challenges_user_idx").on(table.userId)]);

export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: integer("window_start").notNull(),
  blockedUntil: integer("blocked_until").notNull(),
}, table => [index("auth_attempts_window_idx").on(table.windowStart)]);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  platform: text("platform", { enum: ["premier", "faceit"] }).notNull(),
  service: text("service", { enum: ["rating", "calibration"] }).notNull(),
  method: text("method", { enum: ["duo", "piloted"] }).notNull(),
  currentRating: integer("current_rating"),
  targetRating: integer("target_rating"),
  status: text("status", { enum: ["new", "quoted", "awaiting_payment", "awaiting_access", "in_progress", "completed", "cancelled"] }).notNull().default("new"),
  quotedPrice: integer("quoted_price"),
  quotedCurrency: text("quoted_currency"),
  deadline: text("deadline"),
  pricingVersion: integer("pricing_version").notNull().default(0),
  redTrust: integer("red_trust", { mode: "boolean" }).notNull().default(false),
  promoCode: text("promo_code"),
  baseAmount: integer("base_amount"),
  surchargeAmount: integer("surcharge_amount").notNull().default(0),
  discountAmount: integer("discount_amount").notNull().default(0),
  totalAmount: integer("total_amount"),
  initialTotalAmount: integer("initial_total_amount"),
  commissionAmount: integer("commission_amount").notNull().default(0),
  durationDays: integer("duration_days"),
  standardDays: integer("standard_days"),
  acceptedAt: integer("accepted_at"),
  paidAt: integer("paid_at"),
  startedAt: integer("started_at"),
  dueAt: integer("due_at"),
  completedAt: integer("completed_at"),
  proposalAmount: integer("proposal_amount"),
  proposalDays: integer("proposal_days"),
  proposalReason: text("proposal_reason"),
  riskAcceptedAt: integer("risk_accepted_at").notNull(),
  source: text("source"),
  medium: text("medium"),
  campaign: text("campaign"),
  campaignContent: text("campaign_content"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [index("orders_user_created_idx").on(table.userId, table.createdAt), index("orders_created_idx").on(table.createdAt, table.id), index("orders_status_created_idx").on(table.status, table.createdAt, table.id)]);

export const orderEvents = sqliteTable("order_events", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  details: text("details").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("order_events_order_idx").on(table.orderId, table.createdAt)]);

export const promoEarnings = sqliteTable("promo_earnings", {
  orderId: text("order_id").primaryKey().references(() => orders.id, { onDelete: "cascade" }),
  promoCode: text("promo_code").notNull(),
  paidAmount: integer("paid_amount").notNull(),
  amount: integer("amount").notNull(),
  createdAt: integer("created_at").notNull(),
  reversedAt: integer("reversed_at"),
}, table => [index("promo_earnings_code_idx").on(table.promoCode, table.createdAt)]);

export const orderAccess = sqliteTable("order_access", {
  orderId: text("order_id").primaryKey().references(() => orders.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  receivedAt: integer("received_at"),
  receivedBy: text("received_by").references(() => users.id),
}, table => [index("order_access_expiry_idx").on(table.expiresAt)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, table => [index("messages_order_created_idx").on(table.orderId, table.createdAt, table.id)]);

export const supportThreads = sqliteTable("support_threads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [index("support_threads_updated_idx").on(table.updatedAt, table.id)]);

export const supportMessages = sqliteTable("support_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().references(() => supportThreads.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, table => [index("support_messages_thread_created_idx").on(table.threadId, table.createdAt)]);

export const donationConnections = sqliteTable("donation_connections", {
  id: text("id").primaryKey(),
  secret: text("secret"),
  accountId: text("account_id"),
  code: text("code"),
  name: text("name"),
  stateHash: text("state_hash"),
  stateActor: text("state_actor").references(() => users.id),
  stateExpiresAt: integer("state_expires_at"),
  revision: integer("revision").notNull().default(0),
});

export const donationTests = sqliteTable("donation_tests", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  actorId: text("actor_id").notNull().references(() => users.id),
  orderId: text("order_id").references(() => orders.id, { onDelete: "cascade" }),
  orderRevision: integer("order_revision"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("RUB"),
  status: text("status", { enum: ["pending", "matched"] }).notNull().default("pending"),
  matchedAt: integer("matched_at"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("donation_tests_created_idx").on(table.createdAt)]);

export const donationTestEvents = sqliteTable("donation_test_events", {
  id: text("id").primaryKey(),
  testId: text("test_id").notNull().references(() => donationTests.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["simulation", "api"] }).notNull(),
  result: text("result").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("donation_test_events_test_idx").on(table.testId, table.createdAt)]);

export const paymentIntents = sqliteTable("payment_intents", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  reference: text("reference").notNull().unique(),
  accountId: text("account_id").notNull(),
  accountCode: text("account_code").notNull(),
  orderRevision: integer("order_revision").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status", { enum: ["pending", "review", "confirmed", "void"] }).notNull().default("pending"),
  matchedAt: integer("matched_at"),
  confirmedAt: integer("confirmed_at"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("payment_intents_order_idx").on(table.orderId, table.createdAt), index("payment_intents_status_idx").on(table.status, table.createdAt)]);

export const paymentReceipts = sqliteTable("payment_receipts", {
  id: text("id").primaryKey(),
  intentId: text("intent_id").notNull().references(() => paymentIntents.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  result: text("result").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("payment_receipts_intent_idx").on(table.intentId, table.createdAt)]);
