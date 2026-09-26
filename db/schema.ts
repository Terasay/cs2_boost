import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["client", "admin"] }).notNull().default("client"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});

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
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});
