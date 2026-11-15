import "server-only";
import type { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Structured-JSON generation across several AI providers. Providers are tried in AI_PROVIDERS order
 * (default: gemini → groq → cloudflare → anthropic), skipping any without credentials. If one fails
 * (rate limit, outage, invalid JSON), the next is tried. Every answer is validated with zod.
 */

export type ProviderName = "gemini" | "groq" | "cloudflare" | "anthropic";

export type JsonRequest<T> = {
  system: string;
  text: string;
  /** Only sent to providers that accept images (Gemini, Anthropic); others get the text alone. */
  image?: { base64: string; mime: string } | null;
  schemaName: string;
  /** Plain JSON Schema: every property required, nullable fields as ["type","null"], additionalProperties false. */
  jsonSchema: Record<string, unknown>;
  validate: z.ZodType<T>;
};

export type JsonResult<T> = { data: T; provider: ProviderName; model: string };

const env = (k: string) => process.env[k]?.trim() || "";

/** Each provider's model list (comma-separated env override). Busy or failing models fall through to the next. */
const MODELS: Record<ProviderName, () => string> = {
  gemini: () => env("GEMINI_MODEL") || "gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.8-flash",
  groq: () => env("GROQ_MODEL") || "openai/gpt-oss-120b",
  cloudflare: () => env("CLOUDFLARE_AI_MODEL") || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  anthropic: () => env("ANTHROPIC_MODEL") || "claude-opus-5-5",
};

const CONFIGURED: Record<ProviderName, () => boolean> = {
  gemini: () => !!env("GEMINI_API_KEY"),
  groq: () => !!env("GROQ_API_KEY"),
  cloudflare: () => !!env("CLOUDFLARE_ACCOUNT_ID") && !!env("CLOUDFLARE_API_TOKEN"),
  anthropic: () => !!env("ANTHROPIC_API_KEY"),
};

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  cloudflare: "Cloudflare Workers AI",
  anthropic: "Anthropic Claude",
};

export function configuredProviders(): ProviderName[] {
  const order = (env("AI_PROVIDERS") || "gemini,groq,cloudflare,anthropic")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderName => s in CONFIGURED);
  return [...new Set(order)].filter((p) => CONFIGURED[p]());
}

export const aiConfigured = () => configuredProviders().length > 0;

class ProviderError extends Error {}

/**
 * Models that answered 429 (rate limited / daily quota) are skipped until their cool-down ends, so a
 * spent free-tier model doesn't add a slow failed call to every request. In-memory, per server process.
 */
const g = globalThis as unknown as { __synclyAiCooling?: Map<string, number> };
// Kept on globalThis so every bundle/layer in the server process shares one map.
const coolingUntil = (g.__synclyAiCooling ??= new Map<string, number>());
const MAX_COOLDOWN_MS = 6 * 3600_000;

function noteRateLimit(key: string, message: string) {
  if (!/HTTP 429\b/.test(message)) return;
  const h = Number(message.match(/(\d+)h/)?.[1] ?? 0), m = Number(message.match(/(\d+)m\d/)?.[1] ?? message.match(/(\d+)m\b/)?.[1] ?? 0), sec = Number(message.match(/(\d+(?:\.\d+)?)s\b/)?.[1] ?? 0);
  const parsed = (h * 3600 + m * 60 + sec) * 1000;
  coolingUntil.set(key, Date.now() + Math.min(MAX_COOLDOWN_MS, parsed > 0 ? parsed : 60_000));
}

const isCooling = (key: string) => (coolingUntil.get(key) ?? 0) > Date.now();

/** Provider/model pairs to try in order, skipping cooling ones unless every one is cooling. */
function candidates(): [ProviderName, string][] {
  const all = configuredProviders().flatMap((p) =>
    MODELS[p]().split(",").map((m) => m.trim()).filter(Boolean).map((m) => [p, m] as [ProviderName, string]),
  );
  const ready = all.filter(([p, m]) => !isCooling(`${p}/${m}`));
  return ready.length ? ready : all;
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("Response was not JSON");
  }
}

/** Pulls the first JSON object out of model text (tolerates code fences or stray prose). */
function parseJsonText(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const s = String(raw ?? "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{"), end = s.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new ProviderError("Model output contained no JSON");
  }
}

/** Collects text from an Interactions API response without depending on one exact layout. */
function geminiText(res: Record<string, unknown>): string {
  if (typeof res.output_text === "string") return res.output_text;
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if ((o.type === "text" || o.type === undefined) && typeof o.text === "string") parts.push(o.text);
      for (const k of ["outputs", "output", "content", "parts", "steps"]) if (k in o) walk(o[k]);
    }
  };
  walk(res);
  if (!parts.length) throw new ProviderError("Gemini response had no text output");
  return parts.join("");
}

const CALLS: Record<ProviderName, (r: JsonRequest<unknown>, model: string) => Promise<unknown>> = {
  async gemini(r, model) {
    // Interactions API (Api-Revision 2026-05-20). The system prompt goes first in the input.
    const input: unknown[] = [{ type: "text", text: `${r.system}\n\n${r.text}` }];
    if (r.image) input.push({ type: "image", data: r.image.base64, mime_type: r.image.mime });
    const res = await post(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      { "x-goog-api-key": env("GEMINI_API_KEY"), "Api-Revision": "2026-05-20" },
      { model, input, response_format: { type: "text", mime_type: "application/json", schema: r.jsonSchema } },
    );
    return parseJsonText(geminiText(res));
  },

  async groq(r, model) {
    const res = await post(
      "https://api.groq.com/openai/v1/chat/completions",
      { Authorization: `Bearer ${env("GROQ_API_KEY")}` },
      {
        model,
        messages: [
          { role: "system", content: r.system },
          { role: "user", content: r.text },
        ],
        response_format: { type: "json_schema", json_schema: { name: r.schemaName, strict: true, schema: r.jsonSchema } },
      },
    );
    return parseJsonText(res.choices?.[0]?.message?.content);
  },

  async cloudflare(r, model) {
    const res = await post(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env("CLOUDFLARE_ACCOUNT_ID"))}/ai/run/${model}`,
      { Authorization: `Bearer ${env("CLOUDFLARE_API_TOKEN")}` },
      {
        messages: [
          { role: "system", content: `${r.system}\nReply with JSON only.` },
          { role: "user", content: r.text },
        ],
        response_format: { type: "json_schema", json_schema: r.jsonSchema },
        max_tokens: 1500,
      },
    );
    if (res.success === false) throw new ProviderError(`Cloudflare error: ${JSON.stringify(res.errors).slice(0, 300)}`);
    return parseJsonText(res.result?.response);
  },

  async anthropic(r, model) {
    const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
    const client = new AnthropicClient();
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (r.image) content.push({ type: "image", source: { type: "base64", media_type: r.image.mime as "image/jpeg", data: r.image.base64 } });
    content.push({ type: "text", text: r.text });
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: r.jsonSchema } },
      system: r.system,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") throw new ProviderError("Request declined");
    const block = res.content.find((b) => b.type === "text");
    return parseJsonText(block && "text" in block ? block.text : "");
  },
};

export async function generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
  if (!aiConfigured()) throw new Error("No AI provider is configured");
  const failures: string[] = [];
  const badKey = new Set<ProviderName>();
  for (const [provider, model] of candidates()) {
    if (badKey.has(provider)) continue;
    try {
      const raw = await CALLS[provider](req as JsonRequest<unknown>, model);
      const parsed = req.validate.safeParse(raw);
      if (!parsed.success) throw new ProviderError(`Invalid shape: ${parsed.error.issues[0]?.message ?? "unknown"}`);
      return { data: parsed.data, provider, model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${provider}/${model}: ${msg.slice(0, 200)}`);
      noteRateLimit(`${provider}/${model}`, msg);
      console.warn(`[ai] ${provider} (${model}) failed, trying next. ${msg.slice(0, 200)}`);
      // A bad key fails the same way for every model of this provider.
      if (/HTTP 40[13]\b|API_KEY_INVALID|authentication/i.test(msg)) badKey.add(provider);
    }
  }
  throw new Error(`All AI providers failed. ${failures.join(" | ")}`);
}

// ───────────── Plain-text generation (chat answers) ─────────────

export type TextRequest = { system: string; text: string };
export type TextResult = { text: string; provider: ProviderName; model: string };

const TEXT_CALLS: Record<ProviderName, (r: TextRequest, model: string) => Promise<string>> = {
  async gemini(r, model) {
    const res = await post(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      { "x-goog-api-key": env("GEMINI_API_KEY"), "Api-Revision": "2026-05-20" },
      { model, input: [{ type: "text", text: `${r.system}\n\n${r.text}` }] },
    );
    return geminiText(res);
  },
  async groq(r, model) {
    const res = await post(
      "https://api.groq.com/openai/v1/chat/completions",
      { Authorization: `Bearer ${env("GROQ_API_KEY")}` },
      { model, messages: [{ role: "system", content: r.system }, { role: "user", content: r.text }] },
    );
    return String(res.choices?.[0]?.message?.content ?? "");
  },
  async cloudflare(r, model) {
    const res = await post(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env("CLOUDFLARE_ACCOUNT_ID"))}/ai/run/${model}`,
      { Authorization: `Bearer ${env("CLOUDFLARE_API_TOKEN")}` },
      { messages: [{ role: "system", content: r.system }, { role: "user", content: r.text }], max_tokens: 2000 },
    );
    if (res.success === false) throw new ProviderError(`Cloudflare error: ${JSON.stringify(res.errors).slice(0, 300)}`);
    return String(res.result?.response ?? "");
  },
  async anthropic(r, model) {
    const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
    const res = await new AnthropicClient().beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: r.system,
      messages: [{ role: "user", content: r.text }],
    });
    if (res.stop_reason === "refusal") throw new ProviderError("Request declined");
    const block = res.content.find((b) => b.type === "text");
    return block && "text" in block ? block.text : "";
  },
};

export async function generateText(req: TextRequest): Promise<TextResult> {
  if (!aiConfigured()) throw new Error("No AI provider is configured");
  const failures: string[] = [];
  const badKey = new Set<ProviderName>();
  for (const [provider, model] of candidates()) {
    if (badKey.has(provider)) continue;
    try {
      const text = (await TEXT_CALLS[provider](req, model)).trim();
      if (!text) throw new ProviderError("Empty answer");
      return { text, provider, model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${provider}/${model}: ${msg.slice(0, 200)}`);
      noteRateLimit(`${provider}/${model}`, msg);
      console.warn(`[ai] ${provider} (${model}) failed, trying next. ${msg.slice(0, 200)}`);
      if (/HTTP 40[13]\b|API_KEY_INVALID|authentication/i.test(msg)) badKey.add(provider);
    }
  }
  throw new Error(`All AI providers failed. ${failures.join(" | ")}`);
}
