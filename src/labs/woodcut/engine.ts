/* =============================================================
   Woodcut 엔진 — 판화의 물리를 이미지 연산 몇 개로 옮긴 순수 캔버스 로직.

   조각 : 글자를 블러한 뒤 임계값으로 자른다(= 모폴로지 클로즈).
          블러 반경이 곧 조각도의 크기다. 모서리가 깎이고, 카운터는
          타원으로 좁아지고, 가까운 획끼리는 매끈한 목으로 이어붙는다.
   손   : 그 임계값을 저주파 노이즈로 흔들면 손떨림,
          고주파 노이즈로 흔들면 칼자국이 된다.
   잉크 : 임계값 자체를 올리고 내리면 잉크가 마르거나 번진다.
   결손 : 잉크가 덜 묻는 자리는 가장자리에 몰린다. 안쪽은 꽉 차 있어야
          판화로 보이고, 균등하게 뿌리면 사포 질감이 된다.
   ============================================================= */

import { findFont, type FontDef } from "@/lib/font";

export type ToolId = "gouge" | "vknife" | "flat" | "stamp";

export type WoodcutState = {
  text: string;
  font: string;
  size: number;
  track: number;
  lead: number;
  tool: ToolId;
  toolSize: number;
  ink: number;
  wobble: number;
  chatter: number;
  jitter: number;
  starve: number;
  fibre: number;
  seed: number;
  /** 글자별 손보정 — "인덱스:dx,dy,회전" 을 세미콜론으로 이은 문자열 */
  nudge: string;
  cInk: string;
  cPaper: string;
  transparent: boolean;
};

/* 조각도 = 노이즈의 성격. 아이콘은 그 도구가 남기는 자국의 단면. */
type Tool = {
  value: ToolId; label: string; icon: string;
  blur: number;    // 조각도 크기 배수
  gain: number;    // fBm 감쇠 — 높을수록 거칠다
  ridged: boolean; // 능선 노이즈 → V 자로 파인 각진 자국
  chat: number;    // 칼자국 배수
};

export const TOOLS: Tool[] = [
  { value: "gouge",  label: "둥근 조각도", icon: '<rect x="7" y="16" width="34" height="16" rx="8"/>',
    blur: 1,    gain: 0.52, ridged: false, chat: 1 },
  { value: "vknife", label: "V 칼",        icon: '<path d="M24 10l15 28H9z"/>',
    blur: 0.55, gain: 0.72, ridged: true,  chat: 1.5 },
  { value: "flat",   label: "평도",         icon: '<rect x="7" y="18" width="34" height="12"/>',
    blur: 1.5,  gain: 0.42, ridged: false, chat: 0.6 },
  { value: "stamp",  label: "고무 스탬프",  icon: '<rect x="10" y="10" width="28" height="28" rx="6"/>',
    blur: 0.9,  gain: 0.58, ridged: false, chat: 0.8 }
];

export const findTool = (id: ToolId) => TOOLS.find((t) => t.value === id) ?? TOOLS[0];

export const FONTS: FontDef[] = [
  { id: "archivo", label: "Archivo Black", css: '"Archivo Black"', weight: 400 },
  { id: "anton", label: "Anton (좁은 폭)", css: '"Anton"', weight: 400 },
  { id: "bowlby", label: "Bowlby One (둥근)", css: '"Bowlby One"', weight: 400 },
  { id: "alfa", label: "Alfa Slab One (슬랩)", css: '"Alfa Slab One"', weight: 400 },
  { id: "titan", label: "Titan One", css: '"Titan One"', weight: 400 },
  { id: "blackhan", label: "Black Han Sans (한글)", css: '"Black Han Sans"', weight: 400 },
  { id: "jua", label: "Jua (한글)", css: '"Jua"', weight: 400 }
];

/* ---------- 시드 노이즈 ---------- */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRID = 256;
const noiseCache = new Map<number, Float32Array>();

function baseNoise(seed: number): Float32Array {
  const hit = noiseCache.get(seed);
  if (hit) return hit;
  const rnd = mulberry32(seed * 2654435761);
  const g = new Float32Array(GRID * GRID);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  if (noiseCache.size > 24) noiseCache.clear();
  noiseCache.set(seed, g);
  return g;
}

/** 격자 노이즈의 이중선형 보간 (smoothstep 가중, 경계는 순환) */
function snoise(g: Float32Array, x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const x0 = ((xi % GRID) + GRID) % GRID, y0 = ((yi % GRID) + GRID) % GRID;
  const x1 = (x0 + 1) % GRID, y1 = (y0 + 1) % GRID;
  const a = g[y0 * GRID + x0], b = g[y0 * GRID + x1];
  const c = g[y1 * GRID + x0], d = g[y1 * GRID + x1];
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(g: Float32Array, x: number, y: number, oct: number, gain: number, ridged: boolean) {
  let sum = 0, amp = 0.5, freq = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    let n = snoise(g, x * freq, y * freq);
    if (ridged) n = 1 - Math.abs(2 * n - 1); // 능선 → 날카로운 골
    sum += amp * n; tot += amp;
    freq *= 2; amp *= gain;
  }
  return sum / tot;
}

/* 손떨림은 저주파라 1/4 해상도 격자에 미리 깔고 이중선형으로 읽는다.
   픽셀마다 fBm 을 3옥타브씩 돌리면 1200² 에서만 200ms 가 넘는다. */
type Field = { w: number; h: number; d: Float32Array; step: number };

function buildField(S: number, seed: number, cell: number, gain: number, ridged: boolean): Field {
  const step = 4;
  const w = Math.ceil(S / step) + 2, h = w;
  const d = new Float32Array(w * h);
  const g = baseNoise(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      d[y * w + x] = fbm(g, (x * step) / cell, (y * step) / cell, 3, gain, ridged);
    }
  }
  return { w, h, d, step };
}

function readField(f: Field, x: number, y: number) {
  const fx = x / f.step, fy = y / f.step;
  const xi = Math.min(f.w - 2, Math.floor(fx)), yi = Math.min(f.h - 2, Math.floor(fy));
  const ux = fx - xi, uy = fy - yi;
  const a = f.d[yi * f.w + xi], b = f.d[yi * f.w + xi + 1];
  const c = f.d[(yi + 1) * f.w + xi], e = f.d[(yi + 1) * f.w + xi + 1];
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + e * ux) * uy;
}

/* ---------- 캔버스 유틸 ---------- */
const mk = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

const scratch: Record<string, HTMLCanvasElement> = {};
function pool(name: string, w: number, h: number) {
  let c = scratch[name];
  if (!c) { c = scratch[name] = mk(w, h); }
  else if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  else { const g = ctx2d(c); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); }
  return c;
}

export function makeCanvas(S: number) { return mk(S, S); }

/* ---------- 손으로 옮긴 활자 ---------- */
/* 자동 배치 위에 글자별 손보정을 얹는다. 활판의 활자를 하나씩 집어
   옮기고 돌리는 것과 같아서, 슬라이더(자간·줄간·크기)는 그대로 살아있고
   보정값은 그 위에 따라다닌다.
   저장 형식: "인덱스:dx,dy,회전" 을 세미콜론으로. 건드린 글자만 담는다.
   dx·dy 는 캔버스 크기 대비 천분율, 회전은 도(°). */
export type Nudge = { dx: number; dy: number; rot: number };

export function parseNudges(s: string): Map<number, Nudge> {
  const out = new Map<number, Nudge>();
  if (!s) return out;
  for (const part of s.split(";")) {
    const [i, rest] = part.split(":");
    if (rest === undefined) continue;
    const [dx, dy, rot] = rest.split(",").map(Number);
    const idx = Number(i);
    if (!Number.isFinite(idx)) continue;
    out.set(idx, { dx: dx || 0, dy: dy || 0, rot: rot || 0 });
  }
  return out;
}

export function serializeNudges(m: Map<number, Nudge>): string {
  const parts: string[] = [];
  for (const [i, n] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
    if (!n.dx && !n.dy && !n.rot) continue;
    parts.push(`${i}:${Math.round(n.dx)},${Math.round(n.dy)},${Math.round(n.rot)}`);
  }
  return parts.join(";");
}

/** 배치된 글자 하나. cx·cy 는 글자 중심, w·h 는 집기 판정용 상자. */
export type GlyphBox = {
  idx: number; ch: string;
  bx: number; by: number;   // 글자를 찍는 기준점 (가로 중앙 · 베이스라인)
  cx: number; cy: number;   // 집기 판정용 중심
  w: number; h: number;
  rot: number; scale: number; size: number;
};

/** 판은 한 글자씩 따로 새긴다 — 글자마다 조금씩 어긋나야 판화로 보인다.
 *  그리지 않고 자리만 계산해 돌려준다(집기 판정과 그리기가 같은 값을 쓰도록). */
export function layoutGlyphs(
  g: CanvasRenderingContext2D, S: number, C: WoodcutState, fonts: FontDef[]
): { boxes: GlyphBox[]; size: number } {
  const F = findFont(C.font, fonts);
  const lines = C.text.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return { boxes: [], size: 0 };

  const REF = 100;
  g.font = `${F.weight} ${REF}px ${F.css}, system-ui, sans-serif`;
  g.textBaseline = "alphabetic";

  const measured = lines.map((line) => {
    const chars = [...line];
    const widths = chars.map((ch) => g.measureText(ch).width);
    const w = widths.reduce((a, b) => a + b, 0) + C.track * REF * Math.max(0, chars.length - 1);
    return { chars, widths, w };
  });

  const m0 = g.measureText(lines[0]);
  const asc = m0.actualBoundingBoxAscent || REF * 0.72;
  const dsc = m0.actualBoundingBoxDescent || REF * 0.05;
  const lineH = (asc + dsc) * (1 + C.lead);
  const blockH = lineH * lines.length;
  const maxW = Math.max(...measured.map((m) => m.w), 1);

  const avail = S * C.size;
  const scale = Math.min(avail / maxW, avail / blockH);
  const size = REF * scale;

  g.font = `${F.weight} ${size}px ${F.css}, system-ui, sans-serif`;

  const rnd = mulberry32(C.seed * 7919 + 13);
  const topY = (S - blockH * scale) / 2 + asc * scale;
  const nudges = parseNudges(C.nudge);
  const boxes: GlyphBox[] = [];
  let idx = 0;

  lines.forEach((_, li) => {
    const m = measured[li];
    let penX = (S - m.w * scale) / 2;
    const by = topY + li * lineH * scale;
    m.chars.forEach((ch, i) => {
      const w = m.widths[i] * scale;
      /* 시드 난수는 글자 순서대로 뽑아야 같은 시드에서 같은 흔들림이 나온다 */
      const jr = (rnd() - 0.5) * C.jitter;
      const js = 1 + (rnd() - 0.5) * C.jitter * 0.6;
      const jy = (rnd() - 0.5) * C.jitter * size * 0.55;

      const n = nudges.get(idx);
      const dx = n ? (n.dx / 1000) * S : 0;
      const dy = n ? (n.dy / 1000) * S : 0;
      const rot = jr + (n ? (n.rot * Math.PI) / 180 : 0);

      const bx = penX + w / 2 + dx;
      const byy = by + jy * js + dy;
      boxes.push({
        idx, ch, bx, by: byy,
        cx: bx, cy: byy - (asc * scale * js) / 2,   // 글자 몸통의 대략적 중심
        w: Math.max(w, size * 0.34) * js,
        h: (asc + dsc) * scale * js,
        rot, scale: js, size
      });

      penX += w + C.track * size;
      idx++;
    });
  });

  return { boxes, size };
}

/** 계산된 자리에 실제로 글자를 찍는다. */
function paintGlyphs(
  g: CanvasRenderingContext2D, boxes: GlyphBox[], S: number, C: WoodcutState, fonts: FontDef[]
) {
  if (!boxes.length) return;
  const F = findFont(C.font, fonts);
  g.font = `${F.weight} ${boxes[0].size}px ${F.css}, system-ui, sans-serif`;
  g.textBaseline = "alphabetic";
  g.textAlign = "center";
  g.fillStyle = "#fff";
  for (const b of boxes) {
    g.save();
    g.translate(b.bx, b.by);
    g.rotate(b.rot);
    g.scale(b.scale, b.scale);
    g.fillText(b.ch, 0, 0);
    g.restore();
  }
  g.textAlign = "left";
}

/** 캔버스 좌표에서 글자를 집는다. 잉크가 번져 서로 붙기 때문에
 *  잉크 모양이 아니라 글자 상자 기준으로 판정한다. */
export function pickGlyph(boxes: GlyphBox[], x: number, y: number): GlyphBox | null {
  let best: GlyphBox | null = null;
  let bestD = Infinity;
  for (const b of boxes) {
    const dx = Math.abs(x - b.cx) / (b.w / 2);
    const dy = Math.abs(y - b.cy) / (b.h / 2);
    if (dx > 1.25 || dy > 1.25) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

/* ---------- 조각 → 잉킹 ---------- */
/** 잉크가 앉은 자리만 불투명한 마스크. withGrain=false 면 결손 없는 '판' 그대로. */
export function buildMask(
  S: number, C: WoodcutState, fonts: FontDef[], withGrain = true
): HTMLCanvasElement {
  const raw = pool("glyph", S, S);
  const rg = ctx2d(raw);
  rg.setTransform(1, 0, 0, 1, 0, 0);
  rg.clearRect(0, 0, S, S);
  const { boxes, size } = layoutGlyphs(rg, S, C, fonts);
  paintGlyphs(rg, boxes, S, C, fonts);

  const out = pool("mask", S, S);
  const og = ctx2d(out);
  og.setTransform(1, 0, 0, 1, 0, 0);
  og.clearRect(0, 0, S, S);
  if (!size) return out;

  const T = findTool(C.tool);
  const blurPx = C.toolSize * size * T.blur;

  // 블러 = 조각도. 이 한 번이 모서리 라운딩·카운터 타원화·획 융합을 전부 만든다.
  const soft = pool("soft", S, S);
  const sg = ctx2d(soft);
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.clearRect(0, 0, S, S);
  if (blurPx > 0.4) sg.filter = `blur(${blurPx.toFixed(2)}px)`;
  sg.drawImage(raw, 0, 0);
  sg.filter = "none";

  const src = sg.getImageData(0, 0, S, S).data;
  const img = og.createImageData(S, S);
  const dst = img.data;

  // 손떨림 결은 조각도 크기를 따라간다 — 큰 끌은 크게, 작은 칼은 잘게 흔들린다
  const cell = Math.max(7, blurPx * 3.4 + size * 0.05);
  const wobF = C.wobble > 0.001 ? buildField(S, C.seed, cell, T.gain, T.ridged) : null;
  const g = baseNoise(C.seed);
  const chatAmp = C.chatter * T.chat;
  const base = 0.5 - C.ink;
  const EDGE = 0.17;

  /* 노이즈 결의 크기는 전부 글자 크기에 비례해야 한다.
     픽셀 절대값으로 두면 2×·3× 로 내보낼 때 질감만 잘게 변해서
     미리보기와 다른 그림이 나온다. */
  const chatCell = Math.max(1.6, size * 0.018);
  const starveCell = Math.max(2.4, size * 0.045);
  /* 결손이 안쪽까지 고르게 퍼지면 판화가 아니라 사포가 된다.
     안쪽 바닥값은 아주 낮게 두고 가장자리에서만 확 올린다. */
  const FLOOR = 0.05;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const v = src[i + 3] / 255;
      if (v <= 0.002) continue;

      let t = base;
      if (wobF) t += C.wobble * (readField(wobF, x, y) - 0.5);
      if (chatAmp > 0.001) {
        let n = snoise(g, x / chatCell + 311, y / chatCell + 733);
        if (T.ridged) n = 1 - Math.abs(2 * n - 1);
        t += chatAmp * (n - 0.5);
      }
      if (v <= t) continue;

      // 잉크 결손 — 가장자리에 몰리고 안쪽은 꽉 찬다
      if (withGrain && C.starve > 0.001) {
        const edge = Math.max(0, 1 - (v - t) / EDGE);
        const p = C.starve * (FLOOR + (1 - FLOOR) * edge * edge);
        if (snoise(g, x / starveCell + 907, y / starveCell + 1201) > 1 - p) continue;
      }
      dst[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

/** 종이 + 잉크로 최종 합성.
 *  active 는 드래그 중인 글자 표시 — 화면에서만 그리고 내보내기에는 절대 넣지 않는다. */
export function compose(
  target: HTMLCanvasElement, S: number, C: WoodcutState, fonts: FontDef[], active?: number | null
) {
  const g = ctx2d(target);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);

  if (!C.transparent) {
    g.fillStyle = C.cPaper;
    g.fillRect(0, 0, S, S);
    if (C.fibre > 0.001) {
      const n = baseNoise(C.seed + 77);
      const img = g.getImageData(0, 0, S, S);
      const d = img.data;
      const amp = C.fibre * 255;
      const cell = Math.max(1.2, S * 0.0016); // 종이결도 해상도에 비례
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          const k = (snoise(n, x / cell + 61, y / cell + 29) - 0.5) * amp;
          d[i] += k; d[i + 1] += k; d[i + 2] += k;
        }
      }
      g.putImageData(img, 0, 0);
    }
  }

  const mask = buildMask(S, C, fonts, true);
  const ink = pool("ink", S, S);
  const ig = ctx2d(ink);
  ig.setTransform(1, 0, 0, 1, 0, 0);
  ig.clearRect(0, 0, S, S);
  ig.drawImage(mask, 0, 0);
  ig.globalCompositeOperation = "source-in";
  ig.fillStyle = C.cInk;
  ig.fillRect(0, 0, S, S);
  ig.globalCompositeOperation = "source-over";
  g.drawImage(ink, 0, 0);

  if (active != null) {
    /* 자리 계산은 글자 폭 측정만 쓰므로 작은 캔버스로 충분하다 */
    const pg = ctx2d(pool("probe", 8, 8));
    const b = layoutGlyphs(pg, S, C, fonts).boxes.find((x) => x.idx === active);
    if (b) {
      g.save();
      g.strokeStyle = "#1B3ECC";
      g.lineWidth = Math.max(1.5, S / 480);
      g.setLineDash([S / 90, S / 90]);
      g.globalAlpha = 0.9;
      g.translate(b.cx, b.cy);
      g.rotate(b.rot);
      const pad = b.size * 0.1;
      g.strokeRect(-b.w / 2 - pad, -b.h / 2 - pad, b.w + pad * 2, b.h + pad * 2);
      g.restore();
    }
  }
}
