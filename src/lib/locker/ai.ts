import "server-only";
import { z } from "zod";
import { aiConfigured, generateJson, type ProviderName } from "@/lib/ai/providers";
import { storage } from "./storage";
import { streamToBuffer } from "./zip";

export const aiEnabled = aiConfigured;

export const SuggestionSchema = z.object({
  folderPath: z.array(z.string()),
  category: z.string(),
  tags: z.array(z.string()),
  subject: z.string().nullable(),
  project: z.string().nullable(),
  documentDate: z.string().nullable(),
  importance: z.enum(["low", "normal", "high"]),
  sensitive: z.boolean(),
  confidence: z.number(),
  reason: z.string(),
  visibleText: z.string().nullable(),
});
export type Suggestion = z.infer<typeof SuggestionSchema> & { provider?: ProviderName; model?: string };

const str = (description: string) => ({ type: "string", description });
const nullableStr = (description: string) => ({ type: ["string", "null"], description });

const SUGGESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["folderPath", "category", "tags", "subject", "project", "documentDate", "importance", "sensitive", "confidence", "reason", "visibleText"],
  properties: {
    folderPath: { type: "array", items: { type: "string" }, description: "Folder path from the top level, 1-4 segments, e.g. [\"College\",\"Study Materials\",\"Machine Learning\"]" },
    category: str("One category, preferably from the preferred list"),
    tags: { type: "array", items: { type: "string" }, description: "3-6 short lowercase tags" },
    subject: nullableStr("Academic subject or topic, if any"),
    project: nullableStr("Project name, if clearly indicated"),
    documentDate: nullableStr("YYYY-MM-DD only if clearly stated in the content or filename"),
    importance: { type: "string", enum: ["low", "normal", "high"] },
    sensitive: { type: "boolean", description: "True for identity, financial, medical or legal documents" },
    confidence: { type: "number", description: "0 to 1: how sure you are about folderPath and category" },
    reason: str("One short sentence explaining the suggestion"),
    visibleText: nullableStr("For images only: readable text in the image, else null"),
  },
};

const SYSTEM = `You organise files in a student's and young professional's personal document locker.
Suggest where a file belongs. Prefer the user's existing folders when one fits; otherwise propose a short, conventional path.
Use only the evidence given (filename, type, source, and content if provided). Never invent facts such as dates, people or subjects that the evidence doesn't support; use null instead.
If the evidence is thin (for example a generic camera filename with no content), give a low confidence rather than guessing confidently.
Respond with JSON matching the requested schema.`;

type ClassifyInput = {
  name: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  source: string;
  originalPath: string | null;
  excerpt: string | null;
  image: { key: string; mime: string } | null;
  folders: string[];
  categories: string[];
  profileHint: string | null;
};

export async function classifyFile(input: ClassifyInput): Promise<Suggestion | null> {
  if (!aiEnabled()) return null;
  const facts = [
    `Filename: ${input.name}`,
    `Type: .${input.extension} (${input.mimeType}), ${Math.round(input.sizeBytes / 1024)} KB`,
    `Source: ${input.source}`,
    input.originalPath ? `Original path: ${input.originalPath}` : null,
    input.profileHint ? `About the user: ${input.profileHint}` : null,
    `Existing folders: ${input.folders.length ? input.folders.join(" | ") : "(none yet)"}`,
    `Preferred categories: ${input.categories.join(", ")}`,
  ].filter(Boolean);
  const image = input.image ? { base64: (await streamToBuffer((await storage.read(input.image.key)), 5 * 1048576)).toString("base64"), mime: input.image.mime } : null;

  const { data, provider, model } = await generateJson({
    system: SYSTEM,
    text: `<file_facts>\n${facts.join("\n")}\n</file_facts>\n${
      input.excerpt ? `<file_content_excerpt>\n${input.excerpt}\n</file_content_excerpt>\n` : "File content was not shared (only metadata).\n"
    }Suggest how to organise this file.`,
    image,
    schemaName: "file_suggestion",
    jsonSchema: SUGGESTION_JSON_SCHEMA,
    validate: SuggestionSchema,
  });
  return {
    ...data,
    folderPath: data.folderPath.map((p) => p.trim().slice(0, 60)).filter(Boolean).slice(0, 4),
    tags: data.tags.map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 8),
    confidence: Math.min(1, Math.max(0, data.confidence)),
    // Text "read" from an image by a provider that never saw the image would be invented.
    visibleText: image && (provider === "gemini" || provider === "anthropic") ? data.visibleText : null,
    provider,
    model,
  };
}

const SOURCES = ["MANUAL_UPLOAD", "WHATSAPP", "SHARE_SHEET", "EMAIL", "GOOGLE_DRIVE", "ONEDRIVE", "DROPBOX", "CAMERA_SCAN"] as const;
const KINDS = ["pdf", "document", "presentation", "spreadsheet", "image", "video", "audio", "text", "archive"] as const;

export const SearchFiltersSchema = z.object({
  keywords: z.string(),
  source: z.enum(SOURCES).nullable(),
  kinds: z.array(z.enum(KINDS)),
  category: z.string().nullable(),
  uploadedAfter: z.string().nullable(),
  uploadedBefore: z.string().nullable(),
});
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

const SEARCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["keywords", "source", "kinds", "category", "uploadedAfter", "uploadedBefore"],
  properties: {
    keywords: str("Words to full-text search for, without filler words; empty string if none"),
    source: { type: ["string", "null"], enum: [...SOURCES, null] },
    kinds: { type: "array", items: { type: "string", enum: [...KINDS] } },
    category: nullableStr("A category name, only if clearly requested"),
    uploadedAfter: nullableStr("YYYY-MM-DD"),
    uploadedBefore: nullableStr("YYYY-MM-DD"),
  },
};

/** Turns a natural-language query ("the PDF I got on WhatsApp last month") into structured filters. */
export async function interpretSearch(query: string, today: Date, categories: string[]): Promise<SearchFilters | null> {
  if (!aiEnabled()) return null;
  const { data } = await generateJson({
    system:
      "Convert a file-search request into filters. Only set a filter when the request clearly implies it. Keep topical words (subjects, document types like 'offer letter', 'certificate') in keywords. Respond with JSON matching the schema.",
    text: `Today is ${today.toISOString().slice(0, 10)}. Known categories: ${categories.join(", ")}.\n<query>${query}</query>`,
    schemaName: "search_filters",
    jsonSchema: SEARCH_JSON_SCHEMA,
    validate: SearchFiltersSchema,
  });
  return data;
}
