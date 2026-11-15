"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Crop, ImagePlus, Lock, Plus, RotateCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { detectDocument, enhance, rotate90, toCanvas, warpDocument, type EnhanceMode, type Quad } from "@/lib/scan/image";

type Page = {
  id: string;
  raw: HTMLCanvasElement;
  quad: Quad;
  detectedQuad: Quad | null;
  warped: HTMLCanvasElement;
  mode: EnhanceMode;
  turns: number;
  thumb: string;
};

const OCR_LANGS = [
  ["eng", "English"],
  ["hin", "Hindi"],
  ["eng+hin", "English + Hindi"],
  ["spa", "Spanish"],
  ["fra", "French"],
  ["deu", "German"],
] as const;

function finalCanvas(p: Pick<Page, "warped" | "mode" | "turns">) {
  let c = p.warped;
  for (let i = 0; i < p.turns % 4; i++) c = rotate90(c);
  return enhance(c, p.mode);
}

function thumbOf(p: Pick<Page, "warped" | "mode" | "turns">) {
  const c = finalCanvas(p);
  const s = 320 / Math.max(c.width, c.height);
  const t = document.createElement("canvas");
  t.width = Math.round(c.width * s);
  t.height = Math.round(c.height * s);
  t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.8);
}

// Local date and time, e.g. "Scan 2026-11-14 22:23".
const defaultTitle = () => `Scan ${new Date().toLocaleString("sv-SE").slice(0, 16)}`;

const blobOf = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't encode image"))), "image/jpeg", 0.85));

/** Corner editor: the photo with a draggable quadrilateral. */
function CornerEditor({ page, onApply, onCancel }: { page: Pick<Page, "raw" | "quad" | "detectedQuad">; onApply: (q: Quad) => void; onCancel: () => void }) {
  const [quad, setQuad] = useState<Quad>(page.quad);
  const wrap = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const url = useRef(page.raw.toDataURL("image/jpeg", 0.85));
  const W = page.raw.width, H = page.raw.height;

  const move = (e: React.PointerEvent) => {
    if (dragging.current === null || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    const x = Math.min(W, Math.max(0, ((e.clientX - r.left) / r.width) * W));
    const y = Math.min(H, Math.max(0, ((e.clientY - r.top) / r.height) * H));
    setQuad((q) => q.map((p, i) => (i === dragging.current ? { x, y } : p)) as Quad);
  };
  const handle = Math.max(W, H) * 0.022;

  return (
    <div className="space-y-4">
      {!page.detectedQuad && <Alert tone="info">Couldn&apos;t find the page edges automatically. Drag the four corners onto the page&apos;s corners.</Alert>}
      <div
        ref={wrap}
        className="relative mx-auto w-full max-w-2xl touch-none select-none overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerMove={move}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url.current} alt="Captured page" className="absolute inset-0 h-full w-full" draggable={false} />
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgb(45 212 191 / 0.18)" stroke="#2dd4bf" strokeWidth={Math.max(W, H) * 0.004} />
          {quad.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={handle}
              fill="#fff"
              stroke="#0d9488"
              strokeWidth={handle * 0.3}
              className="cursor-grab"
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                dragging.current = i;
              }}
              role="slider"
              aria-label={["Top-left", "Top-right", "Bottom-right", "Bottom-left"][i] + " corner"}
            />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        {page.detectedQuad && <Button variant="secondary" onClick={() => setQuad(page.detectedQuad!)}>Reset to detected</Button>}
        <Button variant="secondary" onClick={() => setQuad([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }])}>Use whole photo</Button>
        <Button onClick={() => onApply(quad)}><Crop className="h-4 w-4" /> Crop & straighten</Button>
      </div>
    </div>
  );
}

export function Scanner() {
  const [pages, setPages] = useState<Page[]>([]);
  const [editing, setEditing] = useState<{ index: number | null; draft: Pick<Page, "raw" | "quad" | "detectedQuad"> } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [title, setTitle] = useState(() => defaultTitle());
  const [sensitive, setSensitive] = useState(false);
  const [ocr, setOcr] = useState(true);
  const [lang, setLang] = useState("eng");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; duplicate: boolean } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOn(false);
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser can't open the camera here (camera access needs HTTPS). Use “Take or choose photo” instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = stream.current;
          void video.current.play();
        }
      });
    } catch (e) {
      const name = (e as DOMException).name;
      setCameraError(
        name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser settings, or use “Take or choose photo”." : name === "NotFoundError" ? "No camera was found. Use “Take or choose photo” instead." : "The camera couldn't be started. Use “Take or choose photo” instead.",
      );
    }
  };

  const beginEdit = (raw: HTMLCanvasElement) => {
    const { quad, detected } = detectDocument(raw);
    setEditing({ index: null, draft: { raw, quad, detectedQuad: detected ? quad : null } });
  };

  const capture = () => {
    if (!video.current?.videoWidth) return;
    const raw = toCanvas(video.current);
    stopCamera();
    beginEdit(raw);
  };

  const onPick = async (fileList: FileList | null) => {
    // Copy first: the input's FileList is live and gets cleared right after this handler starts.
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const bmp = await createImageBitmap(f).catch(() => null);
      if (!bmp) {
        setError(`${f.name} couldn't be opened as an image.`);
        continue;
      }
      const raw = toCanvas(bmp as unknown as HTMLImageElement);
      if (files.length === 1) return beginEdit(raw);
      // Several photos: auto-crop each and add straight to the review list.
      const { quad, detected } = detectDocument(raw);
      const warped = warpDocument(raw, quad);
      const base = { warped, mode: "enhanced" as EnhanceMode, turns: 0 };
      setPages((ps) => [...ps, { id: crypto.randomUUID(), raw, quad, detectedQuad: detected ? quad : null, ...base, thumb: thumbOf(base) }]);
    }
  };

  const applyCrop = (quad: Quad) => {
    if (!editing) return;
    const warped = warpDocument(editing.draft.raw, quad);
    if (editing.index === null) {
      const base = { warped, mode: "enhanced" as EnhanceMode, turns: 0 };
      setPages((ps) => [...ps, { id: crypto.randomUUID(), ...editing.draft, quad, ...base, thumb: thumbOf(base) }]);
    } else {
      const i = editing.index;
      setPages((ps) => ps.map((p, j) => (j === i ? { ...p, quad, warped, thumb: thumbOf({ ...p, warped }) } : p)));
    }
    setEditing(null);
  };

  const updatePage = (i: number, patch: Partial<Pick<Page, "mode" | "turns">>) =>
    setPages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch, thumb: thumbOf({ ...p, ...patch }) } : p)));
  const movePage = (i: number, d: -1 | 1) =>
    setPages((ps) => {
      const n = [...ps];
      [n[i], n[i + d]] = [n[i + d]!, n[i]!];
      return n;
    });

  const save = async () => {
    setError(null);
    try {
      const canvases = pages.map(finalCanvas);
      const texts: string[] = [];
      if (ocr) {
        setStatus("Loading the text reader…");
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker(lang);
        for (let i = 0; i < canvases.length; i++) {
          setStatus(`Reading text on page ${i + 1} of ${canvases.length}…`);
          const { data } = await worker.recognize(canvases[i]!);
          texts.push(data.text ?? "");
        }
        await worker.terminate();
      }
      setStatus("Building PDF…");
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      pdf.setTitle(title);
      pdf.setProducer("Syncly scanner");
      for (const c of canvases) {
        const img = await pdf.embedJpg(new Uint8Array(await (await blobOf(c)).arrayBuffer()));
        const width = 595.28; // A4 width in points; height follows the page's own proportions
        const page = pdf.addPage([width, (width * c.height) / c.width]);
        page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      }
      const bytes = await pdf.save();
      setStatus("Saving to My Files…");
      const form = new FormData();
      form.append("file", new Blob([bytes as BlobPart], { type: "application/pdf" }), "scan.pdf");
      form.append("meta", JSON.stringify({ title: title.trim() || "Scan", sensitive, ocrPages: texts }));
      const res = await fetch("/api/locker/scan", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Saving failed (${res.status})`);
      setSaved(body);
      setPages([]);
    } catch (e) {
      setError((e as Error).message || "Something went wrong while saving the scan.");
    } finally {
      setStatus(null);
    }
  };

  if (saved) {
    return (
      <Card className="flex flex-col items-center px-6 py-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="mt-3 font-display text-lg font-semibold text-ink">Scan saved</p>
        <p className="mt-1 text-sm text-ink-2">{saved.duplicate ? "It's identical to a file you already have, so it's waiting in Duplicates." : "It's in your Everything Inbox as a camera scan."}</p>
        <div className="mt-5 flex gap-2">
          <Link href={saved.duplicate ? "/locker/inbox?section=duplicates" : `/locker/files/${saved.id}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink">
            {saved.duplicate ? "Review duplicate" : "Open scan"}
          </Link>
          <Button variant="secondary" onClick={() => (setSaved(null), setTitle(defaultTitle()))}>Scan another</Button>
        </div>
      </Card>
    );
  }

  if (editing) {
    return (
      <Card className="p-5">
        <CornerEditor page={editing.draft} onApply={applyCrop} onCancel={() => setEditing(null)} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="p-5">
        {cameraOn ? (
          <div className="space-y-3">
            <video ref={video} playsInline muted className="mx-auto max-h-[60vh] w-full rounded-lg bg-black object-contain" />
            <div className="flex justify-center gap-2">
              <Button variant="ghost" onClick={stopCamera}><X className="h-4 w-4" /> Close camera</Button>
              <Button size="lg" onClick={capture}><Camera className="h-5 w-5" /> Capture page</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <Camera className="h-10 w-10 text-ink-3" />
            <p className="mt-3 font-display text-base font-semibold text-ink">{pages.length ? "Add another page" : "Scan notes, certificates, receipts or documents"}</p>
            <p className="mt-1 max-w-md text-sm text-ink-2">Place the page on a darker surface for the best edge detection. You can adjust the corners after each capture.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={startCamera}><Camera className="h-4 w-4" /> Use camera</Button>
              <Button variant="secondary" onClick={() => picker.current?.click()}><ImagePlus className="h-4 w-4" /> Take or choose photo</Button>
            </div>
            <input ref={picker} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => (void onPick(e.target.files), (e.target.value = ""))} />
            {cameraError && <p className="mt-3 max-w-md text-sm text-danger">{cameraError}</p>}
          </div>
        )}
      </Card>

      {pages.length > 0 && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink">{pages.length} page{pages.length > 1 ? "s" : ""}</p>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pages.map((p, i) => (
              <li key={p.id} className="rounded-xl border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={`Page ${i + 1}`} className="mx-auto h-40 w-full rounded-md bg-surface-2 object-contain" />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-2">Page {i + 1}</span>
                  <div className="flex">
                    <button className="rounded p-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => movePage(i, -1)} aria-label="Move page earlier"><ArrowLeft className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === pages.length - 1} onClick={() => movePage(i, 1)} aria-label="Move page later"><ArrowRight className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 text-ink-3 hover:text-ink" onClick={() => updatePage(i, { turns: p.turns + 1 })} aria-label="Rotate page"><RotateCw className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 text-ink-3 hover:text-ink" onClick={() => setEditing({ index: i, draft: p })} aria-label="Adjust corners"><Crop className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 text-ink-3 hover:text-danger" onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))} aria-label="Delete page"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div role="radiogroup" aria-label={`Page ${i + 1} look`} className="mt-2 grid grid-cols-3 gap-1">
                  {(["original", "enhanced", "bw"] as const).map((m) => (
                    <button
                      key={m}
                      role="radio"
                      aria-checked={p.mode === m}
                      onClick={() => updatePage(i, { mode: m })}
                      className={cn("rounded-md py-1 text-[11px]", p.mode === m ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:bg-surface-2")}
                    >
                      {m === "original" ? "Original" : m === "enhanced" ? "Enhanced" : "B&W"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            <li>
              <button onClick={() => picker.current?.click()} className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-ink-2 hover:border-primary hover:text-primary">
                <Plus className="h-5 w-5" /> Add page
              </button>
            </li>
          </ul>

          <div className="mt-6 grid gap-4 border-t border-border pt-5 md:grid-cols-2">
            <Field label="Name" htmlFor="scan-title">
              <Input id="scan-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
            </Field>
            <div className="space-y-3">
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span>
                  <span className="font-medium text-ink">Read the text (OCR)</span>
                  <span className="block text-xs text-ink-3">Makes the scan searchable. Runs in your browser; the first time downloads the text-reading engine (about 10 MB).</span>
                </span>
              </label>
              {ocr && (
                <Select value={lang} onChange={(e) => setLang(e.target.value)} className="h-9 max-w-56" aria-label="Text language">
                  {OCR_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              )}
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span>
                  <span className="flex items-center gap-1 font-medium text-ink"><Lock className="h-3.5 w-3.5 text-warning" /> Identity or financial document</span>
                  <span className="block text-xs text-ink-3">Requires your password to open, and its contents are never sent to AI.</span>
                </span>
              </label>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-3">
            {status && <p className="text-sm text-ink-2" aria-live="polite">{status}</p>}
            <Button size="lg" loading={!!status} onClick={save}>Save {pages.length} page{pages.length > 1 ? "s" : ""} as PDF</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
