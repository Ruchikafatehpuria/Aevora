/** Helpers shared by the Knowledge server actions and UI. */

export function normalizeTags(tags: string[]) {
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").slice(0, 30);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

/** Accepts "example.com/x" or a full http(s) link; returns null for anything else (javascript:, data:, …). */
export function normalizeUrl(raw: string) {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** First non-empty line of the body, for list previews. */
export function excerpt(body: string, max = 140) {
  const text = body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+\[[ xX]\]\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
