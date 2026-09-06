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
  /** 글자별 손보정 — "인덱스:dx,dy,회전,크기,기울기" 를 세미콜론으로 이은 문자열 */
  nudge: string;
  /** 넣은 도형 — "종류:x,y,크기,회전,기울기" 를 세미콜론으로 이은 문자열 */
  shapes: string;
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
/** sc 는 전체 크기(%), scy 는 거기에 곱해지는 세로 배율(%).
 *  세로를 따로 두지 않고 곱셈으로 쌓아야 예전 링크(sc 만 있던 것)가
 *  균일 확대 그대로 열린다. sk/sky 는 가로/세로 기울기(°). */
export type Nudge = {
  dx: number; dy: number; rot: number; sc: number; sk: number; scy: number; sky: number;
};

export const NO_NUDGE: Nudge = { dx: 0, dy: 0, rot: 0, sc: 100, sk: 0, scy: 100, sky: 0 };

export function parseNudges(s: string): Map<number, Nudge> {
  const out = new Map<number, Nudge>();
  if (!s) return out;
  for (const part of s.split(";")) {
    const [i, rest] = part.split(":");
    if (rest === undefined) continue;
    const v = rest.split(",").map(Number);
    const idx = Number(i);
    if (!Number.isFinite(idx)) continue;
    /* 크기·기울기는 나중에 붙은 항목이라 없을 수 있다(예전 링크). 기본값으로 채운다. */
    out.set(idx, {
      dx: v[0] || 0, dy: v[1] || 0, rot: v[2] || 0,
      sc: Number.isFinite(v[3]) ? v[3] : 100,
      sk: v[4] || 0,
      scy: Number.isFinite(v[5]) ? v[5] : 100,
      sky: v[6] || 0
    });
  }
  return out;
}

const isPlain = (n: Nudge) =>
  !n.dx && !n.dy && !n.rot && !n.sk && !n.sky && n.sc === 100 && n.scy === 100;

export function serializeNudges(m: Map<number, Nudge>): string {
  const parts: string[] = [];
  for (const [i, n] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
    if (isPlain(n)) continue;
    const f = [n.dx, n.dy, n.rot, n.sc, n.sk, n.scy, n.sky].map((v) => Math.round(v));
    /* 세로 배율·세로 기울기가 기본값이면 뒤를 잘라 주소를 짧게 유지한다 */
    while (f.length > 5 && f[f.length - 1] === (f.length === 6 ? 100 : 0)) f.pop();
    parts.push(`${i}:${f.join(",")}`);
  }
  return parts.join(";");
}

/* ---------- 도형 ---------- */
export type ShapeKind =
  | "circle" | "ellipse" | "rect" | "tri" | "star" | "diamond" | "clover" | "heart";

/** x·y·s·sw 는 캔버스 크기 대비 천분율, rot·skew 는 도(°).
 *  fill·stroke 가 null 이면 그 부분은 찍지 않는다. */
export type Shape = {
  kind: ShapeKind; x: number; y: number; s: number; rot: number; skew: number;
  fill: string | null; stroke: string | null; sw: number;
  /** s 에 곱해지는 세로 배율(%) 과 세로 기울기(°) */
  sy: number; skewY: number;
};

export const SHAPES: { kind: ShapeKind; label: string; icon: string }[] = [
  { kind: "circle", label: "원", icon: '<circle cx="24" cy="24" r="16"/>' },
  { kind: "ellipse", label: "타원", icon: '<ellipse cx="24" cy="24" rx="18" ry="11"/>' },
  { kind: "rect", label: "직사각형", icon: '<rect x="7" y="13" width="34" height="22"/>' },
  { kind: "tri", label: "세모", icon: '<path d="M24 7l17 32H7z"/>' },
  { kind: "star", label: "별", icon: '<path d="M24 6l5.3 11.9 12.7 1.4-9.5 8.7 2.6 12.6L24 34.2 12.9 40.6l2.6-12.6L6 19.3l12.7-1.4z"/>' },
  { kind: "diamond", label: "다이아몬드", icon: '<path d="M24 6l13 18-13 18-13-18z"/>' },
  { kind: "clover", label: "클로버", icon: '<path d="M24 6a8 8 0 0 1 6.4 12.8A8 8 0 1 1 34 34a8.6 8.6 0 0 1-7-3.6l1.8 11.6H19.2L21 30.4A8.6 8.6 0 0 1 14 34a8 8 0 1 1 3.6-15.2A8 8 0 0 1 24 6z"/>' },
  { kind: "heart", label: "하트", icon: '<path d="M24 41C10 31 5 24 5 17.5A10.5 10.5 0 0 1 24 11a10.5 10.5 0 0 1 19 6.5C43 24 38 31 24 41z"/>' }
];

/* 색은 주소창에 실리므로 '#' 없이 여섯 자리로 적고, 없으면 '-' 로 둔다. */
const colIn = (s: string | undefined) => (!s || s === "-" ? null : "#" + s);
const colOut = (c: string | null) => (c ? c.replace("#", "") : "-");

export function parseShapes(s: string): Shape[] {
  if (!s) return [];
  const out: Shape[] = [];
  for (const part of s.split(";")) {
    const [kind, rest] = part.split(":");
    if (!rest || !SHAPES.some((h) => h.kind === kind)) continue;
    const v = rest.split(",");
    const num = (i: number, d: number) => (Number.isFinite(Number(v[i])) && v[i] !== "" ? Number(v[i]) : d);
    out.push({
      kind: kind as ShapeKind,
      x: num(0, 500), y: num(1, 500), s: num(2, 150), rot: num(3, 0), skew: num(4, 0),
      fill: colIn(v[5]), stroke: colIn(v[6]), sw: num(7, 0),
      sy: num(8, 100), skewY: num(9, 0)
    });
  }
  return out;
}

export function serializeShapes(list: Shape[]): string {
  return list
    .map((h) => {
      const head = `${h.kind}:${Math.round(h.x)},${Math.round(h.y)},${Math.round(h.s)},` +
        `${Math.round(h.rot)},${Math.round(h.skew)},${colOut(h.fill)},${colOut(h.stroke)},${Math.round(h.sw)}`;
      /* 세로 배율·세로 기울기가 기본값이면 붙이지 않는다 */
      if (Math.round(h.sy) === 100 && !Math.round(h.skewY)) return head;
      if (!Math.round(h.skewY)) return `${head},${Math.round(h.sy)}`;
      return `${head},${Math.round(h.sy)},${Math.round(h.skewY)}`;
    })
    .join(";");
}

/** 원점 중심, 반지름 r 로 도형 경로를 만든다. */
function shapePath(g: CanvasRenderingContext2D, kind: ShapeKind, r: number) {
  g.beginPath();
  switch (kind) {
    case "circle":
      g.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case "ellipse":
      g.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
      break;
    case "rect":
      g.rect(-r, -r * 0.66, r * 2, r * 1.32);
      break;
    case "tri":
      g.moveTo(0, -r); g.lineTo(r * 0.94, r * 0.74); g.lineTo(-r * 0.94, r * 0.74); g.closePath();
      break;
    case "diamond":
      g.moveTo(0, -r); g.lineTo(r * 0.72, 0); g.lineTo(0, r); g.lineTo(-r * 0.72, 0); g.closePath();
      break;
    case "star": {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? r * 0.44 : r;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      break;
    }
    case "heart":
      g.moveTo(0, r * 0.95);
      g.bezierCurveTo(-r * 1.42, r * 0.04, -r * 0.72, -r * 1.06, 0, -r * 0.34);
      g.bezierCurveTo(r * 0.72, -r * 1.06, r * 1.42, r * 0.04, 0, r * 0.95);
      g.closePath();
      break;
    case "clover": {
      /* 잎 반지름이 중심까지 닿아야 한다 — 모자라면 가운데에 구멍이 뚫린다 */
      const cr = r * 0.48;
      const lobes: [number, number][] = [[0, -r * 0.4], [-r * 0.45, r * 0.15], [r * 0.45, r * 0.15]];
      for (const [cx, cy] of lobes) { g.moveTo(cx + cr, cy); g.arc(cx, cy, cr, 0, Math.PI * 2); }
      g.moveTo(-r * 0.13, r * 0.1);
      g.lineTo(r * 0.13, r * 0.1);
      g.lineTo(r * 0.3, r); g.lineTo(-r * 0.3, r);
      g.closePath();
      break;
    }
  }
}

/** 판 위에 놓인 것 하나 — 글자든 도형이든 똑같이 집고 옮기고 돌린다.
 *  id 는 글자면 "g0", 도형이면 "s0". */
export type Item = {
  id: string;
  kind: "glyph" | "shape";
  ch: string;               // 글자면 문자, 도형이면 종류
  bx: number; by: number;   // 찍는 기준점 (글자는 가로 중앙·베이스라인, 도형은 중심)
  cx: number; cy: number;   // 집기 판정용 중심
  w: number; h: number;
  rot: number; size: number;
  sx: number; sy: number;   // 축별 배율
  skew: number; skewY: number; // 축별 기울기(라디안)
  fill: string | null; stroke: string | null; sw: number;
};

/* 도형은 글자 흐름 밖에 따로 놓인다. 글자보다 앞에 두어 아래에 깔린다
   — 보통 배지·바탕으로 쓰이고 글자가 그 위에 얹히기 때문. */
function shapeItems(C: WoodcutState, S: number): Item[] {
  return parseShapes(C.shapes).map((h, i) => {
    const r = ((h.s / 1000) * S) / 2;
    return {
      id: `s${i}`, kind: "shape" as const, ch: h.kind,
      bx: (h.x / 1000) * S, by: (h.y / 1000) * S,
      cx: (h.x / 1000) * S, cy: (h.y / 1000) * S,
      w: r * 2, h: r * 2 * (h.sy / 100),
      rot: (h.rot * Math.PI) / 180, size: r * 2,
      sx: 1, sy: h.sy / 100,
      skew: (h.skew * Math.PI) / 180, skewY: (h.skewY * Math.PI) / 180,
      fill: h.fill, stroke: h.stroke, sw: (h.sw / 1000) * S
    };
  });
}

/** 판은 한 글자씩 따로 새긴다 — 글자마다 조금씩 어긋나야 판화로 보인다.
 *  그리지 않고 자리만 계산해 돌려준다(집기 판정과 그리기가 같은 값을 쓰도록).
 *  도형이 앞, 글자가 뒤에 담긴다. */
export function layoutGlyphs(
  g: CanvasRenderingContext2D, S: number, C: WoodcutState, fonts: FontDef[]
): { items: Item[]; size: number } {
  const F = findFont(C.font, fonts);
  const lines = C.text.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return { items: shapeItems(C, S), size: 0 };

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
  const items: Item[] = [];
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

      const n = nudges.get(idx) ?? NO_NUDGE;
      const sx = js * (n.sc / 100);
      const sy = sx * (n.scy / 100);
      const bx = penX + w / 2 + (n.dx / 1000) * S;
      const byy = by + jy * js + (n.dy / 1000) * S;

      items.push({
        id: `g${idx}`, kind: "glyph", ch, bx, by: byy,
        cx: bx, cy: byy - (asc * scale * sy) / 2,   // 글자 몸통의 대략적 중심
        w: Math.max(w, size * 0.34) * sx,
        h: (asc + dsc) * scale * sy,
        rot: jr + (n.rot * Math.PI) / 180, size,
        sx, sy,
        skew: (n.sk * Math.PI) / 180, skewY: (n.sky * Math.PI) / 180,
        fill: C.cInk, stroke: null, sw: 0
      });

      penX += w + C.track * size;
      idx++;
    });
  });

  return { items: [...shapeItems(C, S), ...items], size };
}

/* 한 번의 붓질 = 한 가지 색. 색이 다르면 판을 따로 판다. */
type Stroke = { color: string; item: Item; outline: boolean };

/** 항목들을 "색별 붓질" 로 펼친다. 도형은 채움과 선이 서로 다른 판에 갈 수 있다. */
function strokesOf(items: Item[]): Stroke[] {
  const out: Stroke[] = [];
  for (const b of items) {
    if (b.fill) out.push({ color: b.fill, item: b, outline: false });
    if (b.stroke && b.sw > 0.2) out.push({ color: b.stroke, item: b, outline: true });
  }
  return out;
}

/** 한 판에 속한 붓질들을 흰색으로 찍는다 (이후 블러·임계값을 먹인다). */
function paintStrokes(
  g: CanvasRenderingContext2D, list: Stroke[], C: WoodcutState, fonts: FontDef[]
) {
  const F = findFont(C.font, fonts);
  g.textBaseline = "alphabetic";
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const { item: b, outline } of list) {
    g.save();
    applyItemTransform(g, b);
    if (b.kind === "glyph") {
      g.font = `${F.weight} ${b.size}px ${F.css}, system-ui, sans-serif`;
      g.scale(b.sx, b.sy);
      g.fillText(b.ch, 0, 0);
    } else {
      g.scale(b.sx, b.sy);
      shapePath(g, b.ch as ShapeKind, b.size / 2);
      if (outline) { g.lineWidth = b.sw; g.stroke(); } else g.fill();
    }
    g.restore();
  }
  g.textAlign = "left";
}

/** 회전 + 두 축 기울임. 크기 배율은 글자와 도형이 달라서 호출한 쪽에서 건다. */
function applyItemTransform(g: CanvasRenderingContext2D, b: Item) {
  g.translate(b.bx, b.by);
  g.rotate(b.rot);
  if (b.skew || b.skewY) {
    // (x, y) → (x + tan(skewX)·y, tan(skewY)·x + y)
    g.transform(1, Math.tan(b.skewY), Math.tan(b.skew), 1, 0, 0);
  }
}

/* ---------- 조작 핸들 ---------- */
/** 회전 손잡이가 윗변에서 떨어진 거리 (캔버스 크기 대비) */
export const ROT_STALK = 0.055;

export type BoxHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
/** rot 은 윗변에서 대가 뻗어 나온 끝의 손잡이 — 빙 돌려 각도를 준다 */
export type HandleId = BoxHandleId | "rot";

/** 각 핸들의 로컬 좌표(상자 반치수 기준) */
const HANDLE_DIR: Record<BoxHandleId, [number, number]> = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0],
  se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0]
};

/** 항목의 회전·기울임을 먹인 뒤 핸들이 화면에서 실제로 놓이는 자리.
 *  stalk 가 0보다 크면 회전 손잡이를 그만큼 윗변 바깥에 얹어 함께 돌려준다. */
export function handlePoints(b: Item, stalk = 0): { id: HandleId; x: number; y: number }[] {
  const hw = b.w / 2, hh = b.h / 2;
  const tx = Math.tan(b.skew), ty = Math.tan(b.skewY);
  const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
  /* 상자는 중심(cx, cy) 기준이고 그리기 기준점(bx, by)과 다르므로 중심에서 푼다 */
  const place = (lx: number, ly: number) => {
    const sxv = lx + tx * ly, syv = ty * lx + ly;   // 기울임
    return { x: b.cx + sxv * cos - syv * sin, y: b.cy + sxv * sin + syv * cos };
  };
  const out = (Object.keys(HANDLE_DIR) as BoxHandleId[]).map((id) => {
    const [dx, dy] = HANDLE_DIR[id];
    return { id: id as HandleId, ...place(dx * hw, dy * hh) };
  });
  if (stalk > 0) out.push({ id: "rot" as HandleId, ...place(0, -hh - stalk) });
  return out;
}

/** 화면 이동량을 회전한 항목의 로컬 축(가로·세로)으로 되돌린다 — 크기 조절 계산용 */
export function toLocalDelta(rot: number, dx: number, dy: number) {
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** 캔버스 좌표에서 항목을 집는다. 잉크가 번져 서로 붙기 때문에
 *  잉크 모양이 아니라 상자 기준으로 판정한다.
 *  뒤에 놓인 것(= 나중에 넣은 도형)이 먼저 잡히도록 뒤에서부터 본다. */
export function pickItem(items: Item[], x: number, y: number): Item | null {
  let best: Item | null = null;
  let bestD = Infinity;
  for (let i = items.length - 1; i >= 0; i--) {
    const b = items[i];
    const dx = Math.abs(x - b.cx) / (b.w / 2);
    const dy = Math.abs(y - b.cy) / (b.h / 2);
    if (dx > 1.25 || dy > 1.25) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

/* ---------- 조각 → 잉킹 ---------- */
/** 색 하나에 판 하나. 같은 색끼리는 한 판에서 번져 붙고, 다른 색은 따로 찍혀 겹친다. */
export type Block = { color: string; mask: HTMLCanvasElement };

/** 찍을 판들을 색 순서대로 만든다. withGrain=false 면 결손 없는 '판' 그대로. */
export function buildBlocks(
  S: number, C: WoodcutState, fonts: FontDef[], withGrain = true
): Block[] {
  const probe = ctx2d(pool("probe", 8, 8));
  const { items, size } = layoutGlyphs(probe, S, C, fonts);
  if (!items.length) return [];

  /* 색이 나온 순서대로 판을 나눈다 — 먼저 나온 색이 아래에 깔린다 */
  const order: string[] = [];
  const byColor = new Map<string, Stroke[]>();
  for (const st of strokesOf(items)) {
    let g = byColor.get(st.color);
    if (!g) { g = []; byColor.set(st.color, g); order.push(st.color); }
    g.push(st);
  }
  if (!order.length) return [];

  /* 글자가 없고 도형만 있을 때도 조각 크기 기준이 필요하다 */
  const ref = size || items.reduce((a, b) => Math.max(a, b.h), 0) || S * 0.2;
  return order.map((color, i) => ({
    color,
    mask: carve(S, C, fonts, byColor.get(color)!, ref, withGrain, i)
  }));
}

/** 붓질 한 묶음을 판 하나로 새긴다. */
function carve(
  S: number, C: WoodcutState, fonts: FontDef[], list: Stroke[],
  ref: number, withGrain: boolean, slot: number
): HTMLCanvasElement {
  const raw = pool("glyph", S, S);
  const rg = ctx2d(raw);
  rg.setTransform(1, 0, 0, 1, 0, 0);
  rg.clearRect(0, 0, S, S);
  paintStrokes(rg, list, C, fonts);

  const out = pool(`mask${slot}`, S, S);
  const og = ctx2d(out);
  og.setTransform(1, 0, 0, 1, 0, 0);
  og.clearRect(0, 0, S, S);

  const T = findTool(C.tool);
  const blurPx = C.toolSize * ref * T.blur;

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
  const cell = Math.max(7, blurPx * 3.4 + ref * 0.05);
  const wobF = C.wobble > 0.001 ? buildField(S, C.seed, cell, T.gain, T.ridged) : null;
  const g = baseNoise(C.seed);
  const chatAmp = C.chatter * T.chat;
  const base = 0.5 - C.ink;
  const EDGE = 0.17;

  /* 노이즈 결의 크기는 전부 글자 크기에 비례해야 한다.
     픽셀 절대값으로 두면 2×·3× 로 내보낼 때 질감만 잘게 변해서
     미리보기와 다른 그림이 나온다. */
  const chatCell = Math.max(1.6, ref * 0.018);
  const starveCell = Math.max(2.4, ref * 0.045);
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
  target: HTMLCanvasElement, S: number, C: WoodcutState, fonts: FontDef[], active?: string | null
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

  /* 판을 색 순서대로 겹쳐 찍는다 */
  for (const b of buildBlocks(S, C, fonts, true)) {
    const ink = pool("ink", S, S);
    const ig = ctx2d(ink);
    ig.setTransform(1, 0, 0, 1, 0, 0);
    ig.clearRect(0, 0, S, S);
    ig.drawImage(b.mask, 0, 0);
    ig.globalCompositeOperation = "source-in";
    ig.fillStyle = b.color;
    ig.fillRect(0, 0, S, S);
    ig.globalCompositeOperation = "source-over";
    g.drawImage(ink, 0, 0);
  }

  if (active) {
    /* 자리 계산은 글자 폭 측정만 쓰므로 작은 캔버스로 충분하다 */
    const pg = ctx2d(pool("probe", 8, 8));
    const b = layoutGlyphs(pg, S, C, fonts).items.find((x) => x.id === active);
    if (b) {
      const pts = handlePoints(b, S * ROT_STALK);
      const line = Math.max(1.5, S / 620);
      g.save();
      g.strokeStyle = "#1B3ECC";
      g.lineWidth = line;
      g.globalAlpha = 0.95;

      /* 회전 손잡이: 윗변 가운데에서 대를 뽑고 끝에 동그란 점 */
      const nP = pts.find((q) => q.id === "n")!;
      const rP = pts.find((q) => q.id === "rot")!;
      g.beginPath();
      g.moveTo(nP.x, nP.y);
      g.lineTo(rP.x, rP.y);
      g.stroke();

      /* 상자는 핸들 여덟 점을 이어 그린다 — 기울임까지 그대로 반영된다 */
      const ring: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
      g.beginPath();
      ring.forEach((id, i) => {
        const p = pts.find((q) => q.id === id)!;
        if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
      });
      g.closePath();
      g.setLineDash([S / 110, S / 110]);
      g.stroke();

      /* 핸들: 모서리는 채운 사각, 변 가운데는 빈 사각 — 하는 일이 달라서 모양도 다르다 */
      g.setLineDash([]);
      const r = Math.max(3.5, S / 175);
      const hollow = C.transparent ? "#ffffff" : C.cPaper;
      for (const p of pts) {
        g.beginPath();
        if (p.id === "rot") {
          g.arc(p.x, p.y, r * 1.25, 0, Math.PI * 2);   // 회전은 둥근 손잡이
          g.fillStyle = hollow;
        } else {
          g.rect(p.x - r, p.y - r, r * 2, r * 2);
          /* 모서리는 채우고 변 가운데는 비운다 — 하는 일이 달라서 모양도 다르다 */
          g.fillStyle = p.id.length === 2 ? "#1B3ECC" : hollow;
        }
        g.fill();
        g.stroke();
      }
      g.restore();
    }
  }
}
