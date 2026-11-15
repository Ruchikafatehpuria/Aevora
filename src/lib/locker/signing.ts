import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.FILE_URL_SECRET;
  if (!s || s.length < 32) throw new Error("FILE_URL_SECRET must be set (32+ characters) to sign download URLs.");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** Short-lived URL bound to a file and user. The download route also re-checks the session. */
export function signedFileUrl(fileId: string, userId: string, opts: { inline?: boolean; ttlSeconds?: number } = {}) {
  const exp = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 300);
  const disp = opts.inline ? "inline" : "attachment";
  const sig = sign(`${fileId}.${userId}.${exp}.${disp}`);
  return `/api/locker/download/${fileId}?exp=${exp}&d=${disp}&sig=${sig}`;
}

export function verifyFileSignature(fileId: string, userId: string, exp: string, disp: string, sig: string) {
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  if (disp !== "inline" && disp !== "attachment") return false;
  const expected = Buffer.from(sign(`${fileId}.${userId}.${exp}.${disp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
