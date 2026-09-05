/* =============================================================
   Framefit 엔진 — React 와 무관한 순수 캔버스 로직.
   프레임은 "가로 위치 x 에서 도형의 세로 구간 [위, 아래]" 를 돌려주는 함수 하나로 정의된다.
   글자는 캔버스에 한 번 그린 뒤 세로 1픽셀 열 단위로 잘라 그 구간에 맞춰 늘려 붙인다.
   덕분에 원형·웨이브·블롭·아치·삼각이 전부 같은 코드로 처리되고,
   새 프레임은 rawSpan() 에 case 하나만 추가하면 된다.
   ============================================================= */

/* 폰트 정의·로딩은 실험실 공통 유틸로 옮겼다. 기존 import 경로를 지키려고 여기서 다시 내보낸다. */
import { findFont, loadFont, type FontDef } from "@/lib/font";
export { findFont, loadFont };
export type { FontDef };

export type FrameId = "circle" | "wave" | "blob" | "arch" | "tri" | "square";

export type FramefitState = {
  text: string;
  frame: FrameId;
  font: string;
  weight: number;
  fillX: number;
  fillY: number;
  track: number;
  lead: number;
  warp: number;
  curve: number;
  divider: number;
  out: number;
  depth: number;
  angle: number;
  cFill: string;
  cOut: string;
  cShadow: string;
  cBg: string;
  transparent: boolean;
  guides: boolean;
};

export const FRAME_OPTS: { value: FrameId; label: string; icon: string }[] = [
  { value: "circle", label: "원형", icon: '<circle cx="24" cy="24" r="20"/>' },
  { value: "wave", label: "웨이브", icon: '<path d="M2 30c8-16 14 4 22-6s14 4 22-8v14c-8 12-14-2-22 8S10 26 2 40z"/>' },
  { value: "blob", label: "블롭", icon: '<path d="M4 24c0-9 8-13 20-13s20 4 20 13-8 13-20 13S4 33 4 24z"/>' },
  { value: "arch", label: "아치", icon: '<path d="M4 42V26C4 14 13 6 24 6s20 8 20 20v16z"/>' },
  { value: "tri", label: "삼각", icon: '<path d="M3 6h42L24 44z"/>' },
  { value: "square", label: "사각", icon: '<rect x="4" y="6" width="40" height="36"/>' }
];

export const FONTS: FontDef[] = [
  { id: "bowlby", label: "Bowlby One", css: '"Bowlby One"', weight: 400 },
  { id: "titan", label: "Titan One", css: '"Titan One"', weight: 400 },
  { id: "baloo", label: "Baloo 2", css: '"Baloo 2"', weight: 800 },
  { id: "fredoka", label: "Fredoka", css: '"Fredoka"', weight: 700 },
  { id: "lilita", label: "Lilita One", css: '"Lilita One"', weight: 400 },
  { id: "alfa", label: "Alfa Slab One", css: '"Alfa Slab One"', weight: 400 },
  { id: "bungee", label: "Bungee", css: '"Bungee"', weight: 400 },
  { id: "blackhan", label: "Black Han Sans (한글)", css: '"Black Han Sans"', weight: 400 },
  { id: "jua", label: "Jua (한글)", css: '"Jua"', weight: 400 }
];

type Span = [number, number];

function rawSpan(frame: FrameId, x: number, C: FramefitState): Span {
  switch (frame) {
    case "circle": {
      const d = (x - 0.5) * 2;
      const s = Math.sqrt(Math.max(0, 1 - d * d)) / 2;
      return [0.5 - s, 0.5 + s];
    }
    case "wave": {
      const A = 0.17 * C.curve;
      const c = 0.5 + A * Math.sin(Math.PI * 2 * x);
      const h = 0.62;
      return [c - h / 2, c + h / 2];
    }
    case "blob": {
      const A = 0.09 * C.curve;
      const c = 0.5 + A * Math.sin(Math.PI * 2 * x);
      const h = 0.46 + 0.34 * Math.sin(Math.PI * x) * Math.min(1.2, C.curve);
      return [c - h / 2, c + h / 2];
    }
    case "arch": {
      const d = (x - 0.5) * 2;
      const dome = Math.sqrt(Math.max(0, 1 - d * d));
      const c = 0.55 - 0.24 * C.curve * dome;
      const h = 0.56 * (1 + 0.3 * dome * Math.min(1.2, C.curve));
      return [c - h / 2, c + h / 2];
    }
    case "tri": {
      const yb = Math.min(1, 2 * Math.min(x, 1 - x));
      return [0, 1 - (1 - yb) * Math.min(1, C.curve)];
    }
    default:
      return [0, 1];
  }
}

/** 왜곡 강도 = 평평한 정사각(0..1)과 프레임 도형 사이의 보간 */
export function span(x: number, C: FramefitState): Span {
  const s = rawSpan(C.frame, x, C);
  const w = C.warp;
  return [s[0] * w, 1 + (s[1] - 1) * w];
}

type BandFns = { top: (x: number) => number; bot: (x: number) => number };

function bandFns(i: number, n: number, C: FramefitState): BandFns {
  const seg = 1 / n;
  const fy = C.fillY;
  const sq = (v: number) => 0.5 + (v - 0.5) * fy;
  const a = sq(i * seg + (i > 0 ? C.lead / 2 : 0));
  const b = sq((i + 1) * seg - (i < n - 1 ? C.lead / 2 : 0));
  const dv = (x: number) => C.divider * 0.11 * fy * Math.sin(Math.PI * (x - 0.5));
  return {
    top: (x) => { const s = span(x, C); const f = a + (i > 0 ? dv(x) : 0); return s[0] + (s[1] - s[0]) * f; },
    bot: (x) => { const s = span(x, C); const f = b + (i < n - 1 ? dv(x) : 0); return s[0] + (s[1] - s[0]) * f; }
  };
}

/* ---------- 캔버스 유틸 ---------- */
const mk = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d") as CanvasRenderingContext2D;

const scratch: Record<string, HTMLCanvasElement> = {};
function pool(name: string, w: number, h: number) {
  let c = scratch[name];
  if (!c) { c = scratch[name] = mk(w, h); }
  else if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  else { ctx2d(c).clearRect(0, 0, w, h); }
  return c;
}
function tint(src: HTMLCanvasElement, color: string, name: string) {
  const o = pool(name, src.width, src.height);
  const g = ctx2d(o);
  g.globalCompositeOperation = "source-over";
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, o.width, o.height);
  g.globalCompositeOperation = "source-over";
  return o;
}
function dilate(src: HTMLCanvasElement, r: number, name: string) {
  if (r < 0.6) return src;
  const o = pool(name, src.width, src.height);
  const g = ctx2d(o);
  const steps = Math.max(12, Math.min(28, Math.ceil(r * 1.6)));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    g.drawImage(src, Math.cos(a) * r, Math.sin(a) * r);
  }
  g.drawImage(src, 0, 0);
  return o;
}

/* ---------- 한 줄을 소스 캔버스에 꽉 차게 ---------- */
const SW = 2048, SH = 620;
let srcA: HTMLCanvasElement | null = null;
let tmpA: HTMLCanvasElement | null = null;

function buildSource(line: string, C: FramefitState, fonts: FontDef[]) {
  if (!srcA) srcA = mk(SW, SH);
  const g = ctx2d(srcA);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, SW, SH);

  const F = findFont(C.font, fonts);
  const size = 400;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  if ("letterSpacing" in g) (g as any).letterSpacing = (C.track * size).toFixed(2) + "px";
  g.font = `${F.weight} ${size}px ${F.css}, system-ui, sans-serif`;

  const m = g.measureText(line);
  const pad = C.weight * size;
  const bl = m.actualBoundingBoxLeft ?? 0;
  const br = m.actualBoundingBoxRight ?? m.width;
  const asc = m.actualBoundingBoxAscent || size * 0.72;
  const dsc = m.actualBoundingBoxDescent || size * 0.02;
  const x0 = -bl - pad, x1 = br + pad, y0 = -asc - pad, y1 = dsc + pad;
  const bw = x1 - x0, bh = y1 - y0;
  if (!(bw > 1) || !(bh > 1)) return null;

  g.setTransform(SW / bw, 0, 0, SH / bh, (-x0 * SW) / bw, (-y0 * SH) / bh);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineJoin = "round";
  g.lineCap = "round";
  g.miterLimit = 2;
  if (pad > 0) { g.lineWidth = pad * 2; g.strokeText(line, 0, 0); }
  g.fillText(line, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return srcA;
}

/* ---------- 마스크 (열 단위 수직 워프) ---------- */
function buildMask(S: number, C: FramefitState, fonts: FontDef[]) {
  const mask = pool("mask", S, S);
  const mg = ctx2d(mask);
  mg.imageSmoothingEnabled = true;
  mg.imageSmoothingQuality = "high";

  const lines = C.text.split("\n").map((s) => s.replace(/\s+$/, "")).filter((s) => s.length);
  const bands: BandFns[] = [];
  if (!lines.length) return { mask, bands };
  const n = lines.length;

  for (let i = 0; i < n; i++) {
    const fns = bandFns(i, n, C);

    // 세로 두께가 충분한 가장 넓은 가로 구간을 찾는다
    const N = 512;
    const hs = new Float64Array(N + 1);
    let hmax = 0;
    for (let k = 0; k <= N; k++) {
      const x = k / N;
      hs[k] = Math.max(0, fns.bot(x) - fns.top(x));
      if (hs[k] > hmax) hmax = hs[k];
    }
    if (hmax <= 0.001) continue;
    const thr = hmax * 0.34;
    let best: [number, number] = [0, -1];
    let cur = -1;
    for (let k = 0; k <= N; k++) {
      if (hs[k] >= thr) { if (cur < 0) cur = k; }
      else if (cur >= 0) { if (k - 1 - cur > best[1] - best[0]) best = [cur, k - 1]; cur = -1; }
    }
    if (cur >= 0 && N - cur > best[1] - best[0]) best = [cur, N];
    if (best[1] <= best[0]) continue;

    let xa = best[0] / N, xb = best[1] / N;
    const mid = (xa + xb) / 2, half = ((xb - xa) / 2) * C.fillX;
    xa = mid - half; xb = mid + half;

    const cols = Math.max(2, Math.round((xb - xa) * S));
    let maxH = 0;
    for (let c = 0; c < cols; c++) {
      const x = xa + (xb - xa) * ((c + 0.5) / cols);
      maxH = Math.max(maxH, (fns.bot(x) - fns.top(x)) * S);
    }
    if (maxH < 2) continue;
    const src = buildSource(lines[i], C, fonts);
    if (!src) continue;

    const tH = Math.max(8, Math.min(1600, Math.ceil(maxH)));
    if (!tmpA) tmpA = mk(cols, tH);
    if (tmpA.width !== cols || tmpA.height !== tH) { tmpA.width = cols; tmpA.height = tH; }
    const tg = ctx2d(tmpA);
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.clearRect(0, 0, cols, tH);
    tg.imageSmoothingEnabled = true;
    tg.imageSmoothingQuality = "high";
    tg.drawImage(src, 0, 0, SW, SH, 0, 0, cols, tH);

    for (let c = 0; c < cols; c++) {
      const x = xa + (xb - xa) * ((c + 0.5) / cols);
      const t = fns.top(x) * S, b = fns.bot(x) * S;
      const h = b - t;
      if (h <= 0.6) continue;
      mg.drawImage(tmpA, c, 0, 1, tH, xa * S + c - 0.2, t, 1.4, h);
    }
    bands.push(fns);
  }
  return { mask, bands };
}

export type Layers = {
  mask: HTMLCanvasElement;
  sil: HTMLCanvasElement | null;
  shadow: HTMLCanvasElement | null;
  bands: BandFns[];
};

/** 채움 / 외곽 / 그림자 실루엣을 한 번에 만든다 (PNG · SVG 공용) */
export function buildLayers(S: number, C: FramefitState, fonts: FontDef[]): Layers {
  const r = buildMask(S, C, fonts);
  const outR = C.out * S;
  const dil = outR > 0.6 ? dilate(r.mask, outR, "dil") : r.mask;
  let shadow: HTMLCanvasElement | null = null;
  const depth = C.depth * S;
  if (depth > 0.5) {
    const a = (C.angle * Math.PI) / 180;
    const dx = Math.cos(a) * depth, dy = Math.sin(a) * depth;
    const steps = Math.max(2, Math.min(40, Math.round(depth / 1.5)));
    shadow = pool("shadowU", S, S);
    const sg = ctx2d(shadow);
    for (let k = 0; k <= steps; k++) sg.drawImage(dil, (dx * k) / steps, (dy * k) / steps);
  }
  return { mask: r.mask, sil: outR > 0.6 ? dil : null, shadow, bands: r.bands };
}

export function compose(
  target: HTMLCanvasElement, S: number, C: FramefitState, fonts: FontDef[], withGuides: boolean
): Layers {
  const g = ctx2d(target);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  if (!C.transparent) { g.fillStyle = C.cBg; g.fillRect(0, 0, S, S); }

  const L = buildLayers(S, C, fonts);
  if (L.shadow) g.drawImage(tint(L.shadow, C.cShadow, "shadowT"), 0, 0);
  if (L.sil) g.drawImage(tint(L.sil, C.cOut, "outT"), 0, 0);
  g.drawImage(tint(L.mask, C.cFill, "fillT"), 0, 0);

  if (withGuides && C.guides) {
    g.save();
    g.globalAlpha = 0.85;
    g.lineWidth = Math.max(1, S / 700);
    g.setLineDash([S / 110, S / 110]);
    const trace = (fn: (x: number) => number) => {
      g.beginPath();
      for (let k = 0; k <= 240; k++) {
        const x = k / 240, y = fn(x) * S;
        if (k) g.lineTo(x * S, y); else g.moveTo(x * S, y);
      }
      g.stroke();
    };
    g.strokeStyle = "#1B3ECC";
    trace((x) => span(x, C)[0]);
    trace((x) => span(x, C)[1]);
    g.globalAlpha = 0.45;
    g.strokeStyle = "#D9930A";
    L.bands.forEach((b) => { trace(b.top); trace(b.bot); });
    g.restore();
  }
  return L;
}

export function makeCanvas(S: number) { return mk(S, S); }
