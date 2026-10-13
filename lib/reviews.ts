import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { orderReviews, orders } from "@/db/schema";

export type OrderReview = typeof orderReviews.$inferSelect;
export type PublicReview = Pick<OrderReview, "id" | "rating" | "authorName" | "body" | "createdAt"> & { platform: string; service: string };
export type ReviewPage = { reviews: PublicReview[]; total: number; average: number | null; page: number; pages: number };

export function publicReviews(requestedPage = 1, pageSize = 9): ReviewPage {
  const db = getDb();
  const visible = and(eq(orderReviews.published, true), eq(orders.status, "completed"));
  const summary = db.select({ total: sql<number>`count(*)`, average: sql<number | null>`avg(${orderReviews.rating})` }).from(orderReviews).innerJoin(orders, eq(orders.id, orderReviews.orderId)).where(visible).get()!;
  const pages = Math.max(1, Math.ceil(summary.total / pageSize));
  const page = Math.min(pages, Math.max(1, requestedPage));
  const reviews = db.select({ id: orderReviews.id, rating: orderReviews.rating, authorName: orderReviews.authorName, body: orderReviews.body, createdAt: orderReviews.createdAt, platform: orders.platform, service: orders.service }).from(orderReviews).innerJoin(orders, eq(orders.id, orderReviews.orderId)).where(visible).orderBy(desc(orderReviews.createdAt), desc(orderReviews.id)).limit(pageSize).offset((page - 1) * pageSize).all();
  return { reviews, total: summary.total, average: summary.average === null ? null : Math.round(summary.average * 10) / 10, page, pages };
}
