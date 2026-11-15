import "server-only";
import { db } from "./db";

/**
 * Fixed-window rate limit backed by the database.
 * Returns true if the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);
  return db.$transaction(async (tx) => {
    const row = await tx.rateLimit.findUnique({ where: { key } });
    if (!row || row.windowStart < windowStart) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      return true;
    }
    if (row.count >= limit) return false;
    await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return true;
  });
}
