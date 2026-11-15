"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import type { OrganizeMode } from "@prisma/client";
import { addCategory, addRule, deleteCategory, deleteRule, updateLockerSettings } from "@/lib/locker/actions";
import type { FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MODES: { value: OrganizeMode; title: string; body: string }[] = [
  { value: "ASK", title: "Ask me before organizing", body: "AI suggests a folder, category and tags. Nothing moves until you approve." },
  { value: "AUTO", title: "Organize automatically when confident", body: "Confident suggestions are applied right away; uncertain ones still wait for you." },
  { value: "MANUAL", title: "Save everything in the Inbox", body: "No AI suggestions. Only your own rules run." },
];

export function OrganizeSettings({
  initial,
  providers,
}: {
  initial: { organizeMode: OrganizeMode; aiReadsContent: boolean; autoApplyMinConfidence: number };
  providers: string[];
}) {
  const aiAvailable = providers.length > 0;
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const save = (next: typeof v) => {
    setV(next);
    setSaved(false);
    start(async () => (await updateLockerSettings(next), setSaved(true)));
  };
  return (
    <div className="space-y-5">
      {aiAvailable ? (
        <p className="text-sm text-ink-2">
          AI provider{providers.length > 1 ? "s, tried in this order" : ""}: <span className="font-medium text-ink">{providers.join(" → ")}</span>
        </p>
      ) : (
        <Alert tone="info">
          AI features are off: no AI provider is configured on the server. Add a Gemini, Groq or Cloudflare Workers AI key to <code>.env</code> (see the README). Until then, files stay in the Inbox unless a rule matches.
        </Alert>
      )}
      <div role="radiogroup" aria-label="Organization mode" className="grid gap-3 md:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            role="radio"
            aria-checked={v.organizeMode === m.value}
            onClick={() => save({ ...v, organizeMode: m.value })}
            className={cn("rounded-xl border p-4 text-left transition-colors", v.organizeMode === m.value ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong")}
          >
            <p className={cn("text-sm font-semibold", v.organizeMode === m.value ? "text-primary" : "text-ink")}>{m.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{m.body}</p>
          </button>
        ))}
      </div>
      {v.organizeMode === "AUTO" && (
        <label className="block max-w-md text-sm text-ink">
          Apply automatically at {Math.round(v.autoApplyMinConfidence * 100)}% confidence or higher
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={v.autoApplyMinConfidence}
            onChange={(e) => setV({ ...v, autoApplyMinConfidence: Number(e.target.value) })}
            onMouseUp={() => save(v)}
            onKeyUp={() => save(v)}
            className="mt-2 w-full accent-[var(--primary)]"
          />
        </label>
      )}
      <label className="flex max-w-2xl items-start gap-3 rounded-xl border border-border p-4">
        <input type="checkbox" checked={v.aiReadsContent} onChange={(e) => save({ ...v, aiReadsContent: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
        <span>
          <span className="block text-sm font-semibold text-ink">Let AI read file contents</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">
            Off: AI only sees the filename, type and size. On: a text excerpt (and small images, for reading text in photos) is sent to the AI provider listed above to improve suggestions (images only to providers that can read them). Files marked sensitive
            still go through this step when they&apos;re first imported, so turn this off if you&apos;ll upload ID or financial documents.
          </span>
        </span>
      </label>
      <p className="h-4 text-xs text-ink-3" aria-live="polite">{pending ? "Saving…" : saved ? "Saved" : ""}</p>
    </div>
  );
}

export function RulesEditor({ rules }: { rules: { id: string; matchField: string; matchValue: string; folderPath: string; category: string | null }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addRule, {});
  const [, start] = useTransition();
  const [field, setField] = useState("filename");
  const e = state.fieldErrors ?? {};
  const fieldLabel = { filename: "Filename contains", extension: "Extension is", source: "Source is" } as Record<string, string>;
  return (
    <div className="space-y-4">
      {rules.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="text-ink-2">{fieldLabel[r.matchField]}</span>
              <Badge>{r.matchValue}</Badge>
              <span className="text-ink-3">→</span>
              <span className="font-medium text-ink">{r.folderPath}</span>
              {r.category && <Badge tone="primary">{r.category}</Badge>}
              <button onClick={() => start(() => deleteRule(r.id))} className="ml-auto rounded p-1 text-ink-3 hover:text-danger" aria-label="Delete rule">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="grid items-end gap-3 md:grid-cols-[10rem_1fr_1fr_10rem_auto]" key={state.success}>
        <Field label="When" htmlFor="matchField">
          <Select id="matchField" name="matchField" value={field} onChange={(ev) => setField(ev.target.value)}>
            <option value="filename">Filename contains</option>
            <option value="extension">Extension is</option>
            <option value="source">Source is</option>
          </Select>
        </Field>
        <Field label="Value" htmlFor="matchValue" error={e.matchValue}>
          {field === "source" ? (
            <Select id="matchValue" name="matchValue">
              <option value="WHATSAPP">WhatsApp</option>
              <option value="MANUAL_UPLOAD">Upload</option>
              <option value="SHARE_SHEET">Share menu</option>
            </Select>
          ) : (
            <Input id="matchValue" name="matchValue" placeholder={field === "extension" ? "pdf" : "invoice"} />
          )}
        </Field>
        <Field label="Move to folder" htmlFor="folderPath" error={e.folderPath}>
          <Input id="folderPath" name="folderPath" placeholder="Finance / Invoices" />
        </Field>
        <Field label="Category" htmlFor="category">
          <Input id="category" name="category" placeholder="Optional" />
        </Field>
        <Button type="submit" variant="secondary" loading={pending}>Add rule</Button>
      </form>
      {state.success && <p className="text-xs text-success">{state.success}</p>}
    </div>
  );
}

export function CategoriesEditor({ custom }: { custom: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {custom.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
            {c.name}
            <button onClick={() => start(() => deleteCategory(c.id))} aria-label={`Remove ${c.name}`} className="rounded-full p-0.5 hover:bg-primary/15"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {custom.length === 0 && <p className="text-sm text-ink-3">No custom categories yet.</p>}
      </div>
      <form
        className="flex max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => (await addCategory(name), setName("")));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hackathons" aria-label="New category" />
        <Button type="submit" variant="secondary" loading={pending} disabled={!name.trim()}>Add</Button>
      </form>
    </div>
  );
}
