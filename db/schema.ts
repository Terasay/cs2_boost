import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(0),
  role: text("role", { enum: ["client", "admin"] }).notNull().default("client"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  version: integer("version").notNull().default(0),
}, table => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

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
  status: text("status", { enum: ["new", "quoted", "awaiting_payment", "in_progress", "completed", "cancelled"] }).notNull().default("new"),
  quotedPrice: integer("quoted_price"),
  quotedCurrency: text("quoted_currency"),
  deadline: text("deadline"),
  riskAcceptedAt: integer("risk_accepted_at").notNull(),
  source: text("source"),
  medium: text("medium"),
  campaign: text("campaign"),
  campaignContent: text("campaign_content"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [index("orders_user_created_idx").on(table.userId, table.createdAt)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("messages_order_created_idx").on(table.orderId, table.createdAt, table.id)]);

export const supportThreads = sqliteTable("support_threads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const supportMessages = sqliteTable("support_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().references(() => supportThreads.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("support_messages_thread_created_idx").on(table.threadId, table.createdAt)]);
