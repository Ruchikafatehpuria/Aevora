/**
 * Browser-side document scan processing on canvases: page detection, perspective correction and enhancement.
 * Everything runs locally; images never leave the device during processing.
 */

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // top-left, top-right, bottom-right, bottom-left

function gray(data: Uint8ClampedArray, n: number) {
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = (data[i * 4]! * 77 + data[i * 4 + 1]! * 150 + data[i * 4 + 2]! * 29) >> 8;
  return g;
}

function otsu(g: Uint8Array) {
  const hist = new Array(256).fill(0);
  for (const v of g) hist[v]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Finds the page as the largest bright region (paper is usually lighter than the surface under it) and
 * returns its four extreme corners. `detected` is false when no convincing page was found.
 */
export function detectDocument(source: HTMLCanvasElement): { quad: Quad; detected: boolean } {
  const scale = Math.min(1, 360 / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const g = gray(ctx.getImageData(0, 0, w, h).data, w * h);
  const t = otsu(g);

  // Largest 4-connected component above the threshold.
  const label = new Int32Array(w * h).fill(-1);
  let bestSize = 0, bestLabel = -1;
  const stack: number[] = [];
  for (let start = 0, id = 0; start < w * h; start++) {
    if (g[start]! <= t || label[start] !== -1) continue;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && label[q] === -1 && g[q]! > t) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = id;
    }
    id++;
  }

  const fallback = (): Quad => {
    const mx = source.width * 0.06, my = source.height * 0.06;
    return [
      { x: mx, y: my },
      { x: source.width - mx, y: my },
      { x: source.width - mx, y: source.height - my },
      { x: mx, y: source.height - my },
    ];
  };
  // Too small, or the whole frame (no visible background): not a confident detection.
  if (bestLabel < 0 || bestSize < w * h * 0.12 || bestSize > w * h * 0.97) return { quad: fallback(), detected: false };

  let tl = { s: Infinity, x: 0, y: 0 }, br = { s: -Infinity, x: 0, y: 0 }, tr = { s: -Infinity, x: 0, y: 0 }, bl = { s: Infinity, x: 0, y: 0 };
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== bestLabel) continue;
    const x = p % w, y = (p / w) | 0;
    if (x + y < tl.s) tl = { s: x + y, x, y };
    if (x + y > br.s) br = { s: x + y, x, y };
    if (x - y > tr.s) tr = { s: x - y, x, y };
    if (x - y < bl.s) bl = { s: x - y, x, y };
  }
  const up = (p: { x: number; y: number }) => ({ x: (p.x + 0.5) / scale, y: (p.y + 0.5) / scale });
  return { quad: [up(tl), up(tr), up(br), up(bl)], detected: true };
}

/** Solves for the homography mapping the unit rectangle (0..W, 0..H) onto the quad. */
function homography(W: number, H: number, q: Quad) {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const { x: u, y: v } = q[i]!;
    A.push([x!, y!, 1, 0, 0, 0, -u * x!, -u * y!]);
    b.push(u);
    A.push([0, 0, 0, x!, y!, 1, -v * x!, -v * y!]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    [A[col], A[piv]] = [A[piv]!, A[col]!];
    [b[col], b[piv]] = [b[piv]!, b[col]!];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r]![col]! / A[col]![col]!;
      for (let k = col; k < 8; k++) A[r]![k]! -= f * A[col]![k]!;
      b[r]! -= f * b[col]!;
    }
  }
  return b.map((v, i) => v / A[i]![i]!);
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Perspective-corrects the quad region into an upright rectangle. */
export function warpDocument(source: HTMLCanvasElement, quad: Quad, maxSide = 2000): HTMLCanvasElement {
  let W = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  let H = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  const s = Math.min(1, maxSide / Math.max(W, H));
  W = Math.max(1, Math.round(W * s));
  H = Math.max(1, Math.round(H * s));
  const m = homography(W, H, quad);
  const sctx = source.getContext("2d", { willReadFrequently: true })!;
  const sw = source.width, sh = source.height;
  const src = sctx.getImageData(0, 0, sw, sh).data;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const den = m[6]! * x + m[7]! * y + 1;
      const u = (m[0]! * x + m[1]! * y + m[2]!) / den;
      const v = (m[3]! * x + m[4]! * y + m[5]!) / den;
      const x0 = Math.min(sw - 2, Math.max(0, Math.floor(u))), y0 = Math.min(sh - 2, Math.max(0, Math.floor(v)));
      const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        d[o + c] = (src[i00 + c]! * (1 - fx) + src[i10 + c]! * fx) * (1 - fy) + (src[i01 + c]! * (1 - fx) + src[i11 + c]! * fx) * fy;
      }
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export type EnhanceMode = "original" | "enhanced" | "bw";

/** Returns a new canvas with the chosen enhancement applied. */
export function enhance(source: HTMLCanvasElement, mode: EnhanceMode): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  if (mode === "original") return out;
  const { width: w, height: h } = out;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  if (mode === "enhanced") {
    // Per-channel auto-levels between the 1st and 99th percentiles: lifts grey paper to white, deepens ink.
    for (let c = 0; c < 3; c++) {
      const hist = new Array(256).fill(0);
      for (let i = c; i < d.length; i += 4) hist[d[i]!]++;
      const n = w * h;
      let lo = 0, hi = 255, acc = 0;
      for (let v = 0; v < 256; v++) if ((acc += hist[v]) > n * 0.01) { lo = v; break; }
      acc = 0;
      for (let v = 255; v >= 0; v--) if ((acc += hist[v]) > n * 0.01) { hi = v; break; }
      const range = Math.max(1, hi - lo);
      for (let i = c; i < d.length; i += 4) d[i] = Math.min(255, Math.max(0, ((d[i]! - lo) * 255) / range));
    }
  } else {
    // Adaptive threshold (local mean over an integral image) handles uneven lighting and shadows.
    const g = gray(d, w * h);
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
      let row = 0;
      for (let x = 1; x <= w; x++) {
        row += g[(y - 1) * w + (x - 1)]!;
        integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x]! + row;
      }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 32));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        const sum = integral[y1 * (w + 1) + x1]! - integral[y0 * (w + 1) + x1]! - integral[y1 * (w + 1) + x0]! + integral[y0 * (w + 1) + x0]!;
        const mean = sum / ((x1 - x0) * (y1 - y0));
        const v = g[y * w + x]! < mean - 10 ? 0 : 255;
        const o = (y * w + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = v;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function rotate90(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.height;
  out.height = source.width;
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  return out;
}

/** Draws an image/video frame into a canvas, capping the longest side to keep processing fast. */
export function toCanvas(src: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number }, maxSide = 2400) {
  const sw = src.videoWidth || src.naturalWidth || (src.width as number);
  const sh = src.videoHeight || src.naturalHeight || (src.height as number);
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * s);
  c.height = Math.round(sh * s);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
