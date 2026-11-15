import "server-only";
import type { AuthTokenType } from "@prisma/client";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "./crypto";

const TTL: Record<AuthTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 3600_000,
  PASSWORD_RESET: 3600_000,
};

/** Issues a single-use token, invalidating earlier unused tokens of the same type. */
export async function issueToken(userId: string, type: AuthTokenType) {
  const token = generateToken();
  await db.$transaction([
    db.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    db.authToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL[type]) },
    }),
  ]);
  return token;
}

/** Validates and marks a token as used. Returns the userId or null. */
export async function consumeToken(token: string, type: AuthTokenType) {
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const updated = await db.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return updated.count === 1 ? row.userId : null;
}

export async function peekToken(token: string, type: AuthTokenType) {
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!row && row.type === type && !row.usedAt && row.expiresAt > new Date();
}
