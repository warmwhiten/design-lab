/* =============================================================
   Dither 엔진 — 색을 줄이면서 잃어버린 만큼을 옆 픽셀에 떠넘기는 순수 캔버스 로직.

   디더링은 "없는 색을 눈에서 섞어 만드는" 기술이다. 회색 잉크가 없어도
   검은 점을 성기게 뿌리면 멀리서 회색으로 보인다. 신문 망점, 게임보이 화면,
   리소 인쇄가 전부 같은 원리다.

   방법은 크게 둘뿐이다.
   오차 확산 : 한 픽셀을 가장 가까운 색으로 반올림하고, 반올림하면서 버린
               차이를 아직 안 본 이웃 픽셀에 나눠 준다. 이웃은 그 빚을 안고
               반올림되므로 전체 평균이 원본과 맞는다. 결과는 불규칙하고
               사진처럼 보인다.
   정렬 디더 : 픽셀마다 기준값을 미리 정해둔 표(매트릭스)에서 읽어 자른다.
               이웃을 보지 않으니 병렬이고 빠르고, 결과에 규칙적인 무늬가 남는다.
               그 무늬가 곧 인쇄 스크린이고 게임기 화면의 그 느낌이다.

   이 파일은 그 둘을 하나의 루프로 돌린다. 다른 것은 '기준값을 어디서 얻느냐'뿐이다.
   ============================================================= */

/* ---------- 상태 ---------- */
export type AlgoId =
  | "none" | "random"
  | "bayer2" | "bayer4" | "bayer8" | "bayer16" | "cluster4" | "cluster8" | "lines" | "blue"
  | "fs" | "falsefs" | "jjn" | "stucki" | "burkes" | "sierra" | "sierra2" | "sierralite" | "atkinson";

export type PaletteId =
  | "ramp" | "rgb" | "gameboy" | "cga" | "riso" | "amber" | "news" | "teal";

export type CompareId = "off" | "band" | "quad";

export type DitherState = {
  algo: AlgoId;
  /** 출력 한 점의 크기. 크면 격자가 굵어지고 점이 눈에 보인다. */
  pixel: number;
  /** 오차를 얼마나 넘길지 · 매트릭스를 얼마나 세게 흔들지 (0이면 단순 임계값) */
  amount: number;
  /** 줄마다 방향을 뒤집어 훑는다 — 오차가 한쪽으로 흐르는 줄무늬를 없앤다 */
  serpentine: boolean;

  bright: number;
  contrast: number;
  gamma: number;
  /** 언샵 마스크. 디더는 대비를 먹으므로 미리 세워두면 형태가 산다. */
  sharp: number;
  soften: number;

  palette: PaletteId;
  /** 램프·컬러 팔레트의 단계 수. 2면 1비트. */
  levels: number;
  cInk: string;
  cPaper: string;
  invert: boolean;
  transparent: boolean;

  compare: CompareId;
  a2: AlgoId;
  a3: AlgoId;
  a4: AlgoId;
  labels: boolean;

  seed: number;
};

/* ---------- 알고리즘 목록 ----------
   kind 는 UI 의 분류가 아니라 계산 방식이다.
   diffuse = 이웃에게 빚을 넘긴다, ordered = 표에서 기준값을 읽는다. */
type Kernel = { dx: number; dy: number; w: number }[];

export type Algo = {
  value: AlgoId;
  label: string;
  kind: "diffuse" | "ordered" | "plain";
  /** 오차 확산 커널 (한 줄 앞을 기준으로 한 상대 좌표) */
  kernel?: Kernel;
  div?: number;
  /** 정렬 매트릭스 한 변 */
  n?: number;
  matrix?: () => Float32Array;
};

const K = (rows: [number, number, number][]): Kernel =>
  rows.map(([dx, dy, w]) => ({ dx, dy, w }));

/** Bayer 매트릭스는 재귀로 만든다.
 *  M(2n) = [[4M, 4M+2],[4M+3, 4M+1]] — 어느 크기든 같은 규칙에서 나온다. */
function bayer(n: number): Float32Array {
  let m = new Float32Array([0]);
  let size = 1;
  while (size < n) {
    const s2 = size * 2;
    const q = new Float32Array(s2 * s2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = m[y * size + x] * 4;
        q[y * s2 + x] = v;
        q[y * s2 + x + size] = v + 2;
        q[(y + size) * s2 + x] = v + 3;
        q[(y + size) * s2 + x + size] = v + 1;
      }
    }
    m = q; size = s2;
  }
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = (m[i] + 0.5) / (n * n);
  return out;
}

/** 정수 순위표 → 0~1 기준값. 값이 낮은 칸이 먼저 검어진다. */
function ranks(list: number[], n: number): Float32Array {
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = (list[i] + 0.5) / (n * n);
  return out;
}

/* 뭉친 점(clustered dot) — 신문·오프셋 인쇄의 망점 스크린.
   가운데부터 자라서 점 하나가 굵어지는 방식이라, 잉크가 번져도 안 무너진다.
   그래서 실제 인쇄가 이 방식을 쓴다. */
const CLUSTER4 = [
  12, 5, 6, 13,
  4, 0, 1, 7,
  11, 3, 2, 8,
  15, 10, 9, 14
];
const CLUSTER8 = [
  24, 10, 12, 26, 35, 47, 49, 37,
  8, 0, 2, 14, 45, 59, 61, 51,
  22, 6, 4, 16, 43, 57, 63, 53,
  30, 20, 18, 28, 33, 41, 55, 39,
  34, 46, 48, 36, 25, 11, 13, 27,
  44, 58, 60, 50, 9, 1, 3, 15,
  42, 56, 62, 52, 23, 7, 5, 17,
  32, 40, 54, 38, 31, 21, 19, 29
];
/* 가로줄 스크린 — 기준값이 y 에만 달렸다. 옛날 저해상도 화면의 그 줄무늬. */
const LINES4 = [
  0, 0, 0, 0,
  8, 8, 8, 8,
  4, 4, 4, 4,
  12, 12, 12, 12
];

export const ALGOS: Algo[] = [
  { value: "fs", label: "오차 확산 · Floyd–Steinberg", kind: "diffuse", div: 16,
    kernel: K([[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]]) },
  { value: "atkinson", label: "오차 확산 · Atkinson (초기 매킨토시)", kind: "diffuse", div: 8,
    kernel: K([[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]]) },
  { value: "jjn", label: "오차 확산 · Jarvis–Judice–Ninke", kind: "diffuse", div: 48,
    kernel: K([[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
    [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]]) },
  { value: "stucki", label: "오차 확산 · Stucki", kind: "diffuse", div: 42,
    kernel: K([[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
    [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]]) },
  { value: "burkes", label: "오차 확산 · Burkes", kind: "diffuse", div: 32,
    kernel: K([[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]]) },
  { value: "sierra", label: "오차 확산 · Sierra", kind: "diffuse", div: 32,
    kernel: K([[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
    [-1, 2, 2], [0, 2, 3], [1, 2, 2]]) },
  { value: "sierra2", label: "오차 확산 · Sierra 2줄", kind: "diffuse", div: 16,
    kernel: K([[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]]) },
  { value: "sierralite", label: "오차 확산 · Sierra Lite", kind: "diffuse", div: 4,
    kernel: K([[1, 0, 2], [-1, 1, 1], [0, 1, 1]]) },
  { value: "falsefs", label: "오차 확산 · False Floyd–Steinberg", kind: "diffuse", div: 8,
    kernel: K([[1, 0, 3], [0, 1, 3], [1, 1, 2]]) },

  { value: "bayer2", label: "정렬 · Bayer 2×2", kind: "ordered", n: 2, matrix: () => bayer(2) },
  { value: "bayer4", label: "정렬 · Bayer 4×4", kind: "ordered", n: 4, matrix: () => bayer(4) },
  { value: "bayer8", label: "정렬 · Bayer 8×8", kind: "ordered", n: 8, matrix: () => bayer(8) },
  { value: "bayer16", label: "정렬 · Bayer 16×16", kind: "ordered", n: 16, matrix: () => bayer(16) },
  { value: "cluster4", label: "정렬 · 망점 4×4", kind: "ordered", n: 4, matrix: () => ranks(CLUSTER4, 4) },
  { value: "cluster8", label: "정렬 · 망점 8×8", kind: "ordered", n: 8, matrix: () => ranks(CLUSTER8, 8) },
  { value: "lines", label: "정렬 · 가로줄", kind: "ordered", n: 4, matrix: () => ranks(LINES4, 4) },
  { value: "blue", label: "정렬 · 블루 노이즈 64×64", kind: "ordered", n: 64, matrix: () => blueNoise(64) },

  { value: "random", label: "임의 노이즈", kind: "plain" },
  { value: "none", label: "디더 없음 (그냥 자르기)", kind: "plain" }
];

export const findAlgo = (id: AlgoId) => ALGOS.find((a) => a.value === id) ?? ALGOS[0];

/* ---------- 블루 노이즈 ----------
   Bayer 는 규칙이 너무 또렷해서 사진에 격자무늬를 남긴다. 반대로 완전한 난수는
   덩어리가 지고 얼룩진다. 그 사이가 블루 노이즈다 — 점들이 서로 최대한 멀리
   떨어져 앉되 어떤 방향으로도 줄을 서지 않는 배치.

   Ulichney 의 void-and-cluster 로 만든다. 가장 빽빽한 곳(cluster)에서 한 점을
   빼고 가장 텅 빈 곳(void)에 한 점을 놓는 일을 반복하면 저절로 그렇게 된다.
   에너지는 각 점이 뿌리는 가우시안의 합이고, 점을 켜고 끌 때 그 커널만
   더하고 빼면 되므로 매 단계 전체를 다시 계산하지 않는다. */
let blueCache: Float32Array | null = null;

function blueNoise(n: number): Float32Array {
  if (blueCache && blueCache.length === n * n) return blueCache;

  const N = n * n;
  const R = 4, SIG = 1.5;
  const kw = R * 2 + 1;
  const kern = new Float32Array(kw * kw);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      kern[(dy + R) * kw + (dx + R)] = Math.exp(-(dx * dx + dy * dy) / (2 * SIG * SIG));
    }
  }

  const energy = new Float32Array(N);
  const stamp = (i: number, sign: number) => {
    const x0 = i % n, y0 = (i / n) | 0;
    for (let dy = -R; dy <= R; dy++) {
      const y = (y0 + dy + n) % n;
      for (let dx = -R; dx <= R; dx++) {
        const x = (x0 + dx + n) % n;
        energy[y * n + x] += sign * kern[(dy + R) * kw + (dx + R)];
      }
    }
  };
  const rebuild = (b: Uint8Array) => {
    energy.fill(0);
    for (let i = 0; i < N; i++) if (b[i]) stamp(i, 1);
  };
  /* 가장 빽빽한 점 / 가장 텅 빈 자리 */
  const tightest = (b: Uint8Array) => {
    let bi = -1, bv = -Infinity;
    for (let i = 0; i < N; i++) if (b[i] && energy[i] > bv) { bv = energy[i]; bi = i; }
    return bi;
  };
  const emptiest = (b: Uint8Array) => {
    let bi = -1, bv = Infinity;
    for (let i = 0; i < N; i++) if (!b[i] && energy[i] < bv) { bv = energy[i]; bi = i; }
    return bi;
  };

  /* 씨앗 패턴 — 10% 를 아무렇게나 뿌린 뒤 위 규칙으로 고르게 흔든다 */
  let seed = 20240912;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Math.max(8, Math.round(N * 0.1));
  const bin = new Uint8Array(N);
  for (let placed = 0; placed < M;) {
    const i = (rnd() * N) | 0;
    if (!bin[i]) { bin[i] = 1; placed++; }
  }
  rebuild(bin);
  for (let guard = 0; guard < N * 4; guard++) {
    const c = tightest(bin);
    bin[c] = 0; stamp(c, -1);
    const v = emptiest(bin);
    if (v === c) { bin[c] = 1; stamp(c, 1); break; }
    bin[v] = 1; stamp(v, 1);
  }

  const rank = new Int32Array(N).fill(-1);

  /* 1단계 — 씨앗에서 점을 하나씩 빼면서 뒤에서부터 순위를 매긴다 */
  const a = bin.slice();
  rebuild(a);
  for (let r = M - 1; r >= 0; r--) {
    const i = tightest(a);
    a[i] = 0; stamp(i, -1); rank[i] = r;
  }

  /* 2단계 — 씨앗을 되돌리고 빈 곳을 채우며 절반까지 */
  const b = bin.slice();
  rebuild(b);
  const half = (N / 2) | 0;
  for (let r = M; r < half; r++) {
    const i = emptiest(b);
    b[i] = 1; stamp(i, 1); rank[i] = r;
  }

  /* 3단계 — 절반을 넘으면 '빈 곳' 이 소수가 된다. 뒤집어서 같은 규칙을 이어 쓴다 */
  const c = new Uint8Array(N);
  for (let i = 0; i < N; i++) c[i] = b[i] ? 0 : 1;
  rebuild(c);
  for (let r = half; r < N; r++) {
    const i = tightest(c);
    c[i] = 0; stamp(i, -1); rank[i] = r;
  }

  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = (rank[i] + 0.5) / N;
  blueCache = out;
  return out;
}

/* ---------- 팔레트 ----------
   kind 가 계산 방식을 가른다.
   ramp    : 종이색 ↔ 잉크색 한 줄. 밝기 하나만 다루면 되므로 1채널로 돈다.
   channel : R·G·B 를 각각 단계로 자른다. 옛날 그래픽 카드가 하던 방식.
   list    : 정해진 색 몇 개. 매 픽셀 가장 가까운 색을 찾는다. */
export type Palette = {
  id: PaletteId;
  label: string;
  kind: "ramp" | "channel" | "list";
  colors?: string[];
  /** 목록 팔레트에서 '종이' 로 볼 색의 인덱스 — 투명 내보내기와 SVG 판 나누기에 쓴다 */
  paper?: number;
};

export const PALETTES: Palette[] = [
  { id: "ramp", label: "두 색 사이 (내 색)", kind: "ramp" },
  { id: "rgb", label: "컬러 · 채널마다 단계", kind: "channel" },
  { id: "gameboy", label: "게임보이 4색", kind: "list", paper: 3,
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] },
  { id: "cga", label: "CGA 4색", kind: "list", paper: 0,
    colors: ["#000000", "#55ffff", "#ff55ff", "#ffffff"] },
  { id: "riso", label: "리소 2도 (형광분홍 + 파랑)", kind: "list", paper: 0,
    colors: ["#f2efe4", "#ff48b0", "#0f5ce6", "#6b2fa0"] },
  { id: "amber", label: "앰버 터미널", kind: "list", paper: 0,
    colors: ["#100b02", "#ffb000"] },
  { id: "news", label: "신문 검정 + 빨강", kind: "list", paper: 0,
    colors: ["#efe9dc", "#191817", "#c0271b"] },
  { id: "teal", label: "청록 3도", kind: "list", paper: 0,
    colors: ["#f4f2ea", "#0e7c86", "#08313a"] }
];

export const findPalette = (id: PaletteId) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

const hex2rgb = (h: string): [number, number, number] => {
  const s = h.replace("#", "");
  const v = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 실제로 찍히는 색 목록 — 어느 팔레트든 이 배열로 정리해서 하나의 코드가 다룬다. */
export function paletteColors(C: DitherState): { rgb: [number, number, number]; hex: string }[] {
  const P = findPalette(C.palette);
  if (P.kind === "list") return P.colors!.map((h) => ({ rgb: hex2rgb(h), hex: h }));
  if (P.kind === "ramp") {
    /* 램프는 어두운 쪽(잉크가 다 덮인 곳)부터 밝은 쪽(종이만 남은 곳)으로 놓는다.
       밝기를 그대로 칸 번호로 쓸 수 있어야 하므로 순서가 뒤집히면 안 된다. */
    const a = hex2rgb(C.cInk), b = hex2rgb(C.cPaper);
    const n = Math.max(2, Math.round(C.levels));
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const rgb: [number, number, number] = [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
      ];
      return { rgb, hex: rgb2hex(rgb) };
    });
  }
  /* 채널 팔레트는 색이 n³ 개라 목록으로 펼치지 않는다 (SVG 판 나누기에서만 실제로 센다) */
  return [];
}

export const rgb2hex = (c: [number, number, number]) =>
  "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** 화면·내보내기의 바탕색 — 판이 아니라 종이인 색. */
export function paperOf(C: DitherState): string {
  const P = findPalette(C.palette);
  if (P.kind === "list") return P.colors![P.paper ?? 0];
  if (P.kind === "ramp") return C.cPaper;
  return "#ffffff";
}

/* ---------- 캔버스 유틸 ---------- */
const mk = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
const ctx2d = (c: HTMLCanvasElement) =>
  c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number) { return mk(w, h); }

/* ---------- 격자 크기 ----------
   디더의 무늬는 '격자 한 칸' 에 붙어 있다. 화면 크기를 바꿀 때마다 격자를 다시
   잡으면 미리보기와 저장본이 다른 그림이 되므로, 격자는 늘 이 기준 변에서만
   계산하고 화면·내보내기는 그것을 정수배로 늘려 보여주기만 한다. */
export const BASE = 1000;

export function gridSize(iw: number, ih: number, pixel: number) {
  const a = iw / Math.max(1, ih);
  const p = Math.max(1, pixel);
  let gw: number, gh: number;
  if (a >= 1) { gw = Math.max(8, Math.round(BASE / p)); gh = Math.max(8, Math.round(gw / a)); }
  else { gh = Math.max(8, Math.round(BASE / p)); gw = Math.max(8, Math.round(gh * a)); }
  return { gw, gh };
}

/* ---------- 앞손질 ----------
   디더는 계조를 잡아먹는다. 자르고 난 뒤에 대비를 올릴 수는 없으므로
   자르기 전에 손을 봐야 한다. 순서도 뜻이 있다 — 흐림·선명은 이웃을 보는
   공간 연산이라 먼저, 밝기·대비·감마는 픽셀 하나짜리라 나중에 건다. */
function preprocess(src: CanvasImageSource, iw: number, ih: number, C: DitherState) {
  const { gw, gh } = gridSize(iw, ih, C.pixel);
  const cv = mk(gw, gh);
  const g = ctx2d(cv);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, gw, gh);

  const img = g.getImageData(0, 0, gw, gh);
  const d = img.data;
  const N = gw * gh;
  const buf = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    buf[i * 3] = d[i * 4] / 255;
    buf[i * 3 + 1] = d[i * 4 + 1] / 255;
    buf[i * 3 + 2] = d[i * 4 + 2] / 255;
  }

  if (C.soften > 0.001) boxBlur(buf, gw, gh, C.soften);
  if (C.sharp > 0.001) unsharp(buf, gw, gh, C.sharp);

  const inv = C.invert;
  const gam = Math.max(0.05, C.gamma);
  const k = Math.tan(((Math.min(0.98, C.contrast) + 1) * Math.PI) / 4); // -1~1 → 기울기
  for (let i = 0; i < N * 3; i++) {
    let v = buf[i];
    v = Math.pow(Math.max(0, v), 1 / gam);
    v = (v - 0.5) * k + 0.5 + C.bright;
    if (inv) v = 1 - v;
    buf[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return { buf, gw, gh };
}

/** 반지름 1의 박스 블러를 amount 만큼 섞는다 (분리형 2패스) */
function boxBlur(buf: Float32Array, w: number, h: number, amount: number) {
  const tmp = new Float32Array(buf.length);
  const at = (x: number, y: number) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) tmp[o + c] = (buf[at(x - 1, y) + c] + buf[at(x, y) + c] + buf[at(x + 1, y) + c]) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const v = (tmp[at(x, y - 1) + c] + tmp[at(x, y) + c] + tmp[at(x, y + 1) + c]) / 3;
        buf[o + c] += (v - buf[o + c]) * amount;
      }
    }
  }
}

/** 언샵 마스크 — 흐린 판을 빼서 가장자리만 세운다 */
function unsharp(buf: Float32Array, w: number, h: number, amount: number) {
  const blurred = buf.slice();
  boxBlur(blurred, w, h, 1);
  for (let i = 0; i < buf.length; i++) buf[i] += (buf[i] - blurred[i]) * amount * 3;
}

/* ---------- 색 줄이기 ----------
   양자화기는 "이 색에 가장 가까운, 찍을 수 있는 색" 을 돌려주는 함수 하나다.
   팔레트 종류가 달라도 디더 루프는 이 함수만 부르므로 아래 루프는 하나뿐이다. */
type Quant = {
  /** in[0..2] 를 읽어 out[0..2] 에 찍을 색을 쓴다 */
  fn: (inp: Float32Array, io: number, out: Float32Array, oo: number) => void;
  /** 팔레트 색 사이의 평균 간격 — 정렬 디더가 기준값을 얼마나 흔들지의 기준 */
  spread: number;
};

function quantizer(C: DitherState): Quant {
  const P = findPalette(C.palette);
  const n = Math.max(2, Math.round(C.levels));

  if (P.kind === "channel") {
    const step = 1 / (n - 1);
    return {
      spread: step,
      fn: (inp, io, out, oo) => {
        for (let c = 0; c < 3; c++) {
          const v = inp[io + c];
          out[oo + c] = Math.round(Math.max(0, Math.min(1, v)) / step) * step;
        }
      }
    };
  }

  if (P.kind === "ramp") {
    const step = 1 / (n - 1);
    return {
      spread: step,
      fn: (inp, io, out, oo) => {
        /* 램프는 한 줄이므로 밝기 하나로 자른다. 세 채널을 따로 다루면
           검정·흰색 사이에서 색이 어긋나 무지개가 낀다. */
        const l = 0.2126 * inp[io] + 0.7152 * inp[io + 1] + 0.0722 * inp[io + 2];
        const k = Math.max(0, Math.min(n - 1, Math.round(l / step)));
        const t = k * step;
        out[oo] = t; out[oo + 1] = t; out[oo + 2] = t;
        /* 실제 색은 나중에 램프에서 꺼낸다 — 오차는 밝기 축에서만 흐르게 둔다 */
        out[oo + 3] = k;
      }
    };
  }

  const cols = P.colors!.map(hex2rgb).map((c) => [c[0] / 255, c[1] / 255, c[2] / 255] as const);
  /* 색 사이 평균 최단거리 — 정렬 디더의 흔들 폭 */
  let sum = 0;
  for (let i = 0; i < cols.length; i++) {
    let best = Infinity;
    for (let j = 0; j < cols.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(cols[i][0] - cols[j][0], cols[i][1] - cols[j][1], cols[i][2] - cols[j][2]);
      if (d < best) best = d;
    }
    sum += best;
  }
  const spread = (sum / cols.length) * 0.9;

  return {
    spread,
    fn: (inp, io, out, oo) => {
      const r = inp[io], g = inp[io + 1], b = inp[io + 2];
      let bi = 0, bd = Infinity;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        /* 사람 눈에 가까운 무게를 실은 거리 — 녹색 차이가 가장 크게 보인다 */
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
        if (d < bd) { bd = d; bi = i; }
      }
      out[oo] = cols[bi][0]; out[oo + 1] = cols[bi][1]; out[oo + 2] = cols[bi][2];
      out[oo + 3] = bi;
    }
  };
}

/* ---------- 디더 한 판 ----------
   오차 확산과 정렬 디더의 차이는 '기준값을 어디서 얻느냐' 하나뿐이라
   루프도 하나다. 정렬 디더는 자르기 전에 매트릭스로 값을 흔들고,
   오차 확산은 자른 뒤에 남은 차이를 이웃에게 넘긴다. */
export type Grid = {
  w: number; h: number;
  /** 각 칸이 어느 팔레트 색으로 찍혔는지 (목록·램프 팔레트에서만 의미 있다) */
  idx: Int16Array;
  data: ImageData;
  /** 그릴 준비가 끝난 격자 — 캐시에 함께 얹어 매 프레임 다시 만들지 않는다 */
  tile: HTMLCanvasElement;
};

export function ditherGrid(
  src: { buf: Float32Array; gw: number; gh: number }, C: DitherState, algoId: AlgoId
): Grid {
  const { gw, gh } = src;
  const buf = src.buf.slice();          // 오차를 더해가며 망가뜨리므로 사본에서 돈다
  const A = findAlgo(algoId);
  const Q = quantizer(C);
  const P = findPalette(C.palette);
  const rampCols = P.kind === "ramp" ? paletteColors(C).map((c) => c.rgb) : null;

  const out = new ImageData(gw, gh);
  const px = out.data;
  const idx = new Int16Array(gw * gh);

  const quantIn = new Float32Array(3);
  const quantOut = new Float32Array(4);

  const amt = Math.max(0, C.amount);
  const mat = A.kind === "ordered" ? A.matrix!() : null;
  const mn = A.n ?? 1;

  /* 임의 노이즈는 시드로 재현되게 — 같은 링크는 같은 그림이어야 한다 */
  let rs = (C.seed | 0) * 2654435761;
  const rnd = () => {
    rs |= 0; rs = (rs + 0x6d2b79f5) | 0;
    let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let y = 0; y < gh; y++) {
    /* 뱀 훑기 — 줄마다 방향을 뒤집으면 오차가 한쪽으로만 흘러 생기는
       사선 줄무늬가 사라진다. 오차 확산에서만 뜻이 있다. */
    const rev = C.serpentine && A.kind === "diffuse" && y % 2 === 1;
    for (let s = 0; s < gw; s++) {
      const x = rev ? gw - 1 - s : s;
      const i = y * gw + x;
      const o = i * 3;

      let shift = 0;
      if (mat) shift = (mat[(y % mn) * mn + (x % mn)] - 0.5) * Q.spread * amt;
      else if (algoId === "random") shift = (rnd() - 0.5) * Q.spread * amt;

      quantIn[0] = buf[o] + shift;
      quantIn[1] = buf[o + 1] + shift;
      quantIn[2] = buf[o + 2] + shift;
      quantOut[3] = -1;
      Q.fn(quantIn, 0, quantOut, 0);

      const k = quantOut[3];
      idx[i] = k;

      let r: number, g: number, b: number;
      if (rampCols && k >= 0) {
        const c = rampCols[Math.min(rampCols.length - 1, Math.max(0, k))];
        r = c[0]; g = c[1]; b = c[2];
      } else {
        r = quantOut[0] * 255; g = quantOut[1] * 255; b = quantOut[2] * 255;
      }
      px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;

      if (A.kind === "diffuse" && amt > 0.001) {
        /* 반올림하며 버린 차이. 흔든 값이 아니라 원래 값과의 차이를 넘겨야
           빚이 정확하다 (정렬 디더의 shift 는 여기서 0 이다). */
        const er = buf[o] - quantOut[0];
        const eg = buf[o + 1] - quantOut[1];
        const eb = buf[o + 2] - quantOut[2];
        const kern = A.kernel!, div = A.div!;
        for (let n = 0; n < kern.length; n++) {
          const kx = rev ? -kern[n].dx : kern[n].dx;
          const nx = x + kx, ny = y + kern[n].dy;
          if (nx < 0 || nx >= gw || ny >= gh) continue;
          const no = (ny * gw + nx) * 3;
          const wgt = (kern[n].w / div) * amt;
          buf[no] += er * wgt;
          buf[no + 1] += eg * wgt;
          buf[no + 2] += eb * wgt;
        }
      }
    }
  }

  const tile = mk(gw, gh);
  ctx2d(tile).putImageData(out, 0, 0);
  return { w: gw, h: gh, idx, data: out, tile };
}

/* ---------- 캐시 ----------
   비교 모드는 같은 사진을 알고리즘 수만큼 돌린다. 앞손질(축소·대비·선명)은
   알고리즘과 무관하므로 한 번만 하고, 디더 결과는 알고리즘별로 들고 있는다.
   그래야 알고리즘만 바꿀 때 앞손질을 다시 하지 않는다. */
type Cache = { key: string; pre: { buf: Float32Array; gw: number; gh: number } | null; grids: Map<string, Grid> };
const cache: Cache = { key: "", pre: null, grids: new Map() };

const preKey = (C: DitherState, srcId: number) =>
  [srcId, C.pixel, C.bright, C.contrast, C.gamma, C.sharp, C.soften, C.invert].join("|");
const gridKey = (C: DitherState, algo: AlgoId) =>
  [algo, C.palette, C.levels, C.cInk, C.cPaper, C.amount, C.serpentine, C.seed].join("|");

function gridFor(src: Src, C: DitherState, algo: AlgoId): Grid {
  const pk = preKey(C, src.id);
  if (cache.key !== pk) {
    cache.key = pk;
    cache.pre = preprocess(src.cv, src.cv.width, src.cv.height, C);
    cache.grids.clear();
  }
  const gk = gridKey(C, algo);
  const hit = cache.grids.get(gk);
  if (hit) return hit;
  const g = ditherGrid(cache.pre!, C, algo);
  if (cache.grids.size > 8) cache.grids.clear();
  cache.grids.set(gk, g);
  return g;
}

export function clearCache() { cache.key = ""; cache.pre = null; cache.grids.clear(); }

/* ---------- 원본 ---------- */
export type Src = { cv: HTMLCanvasElement; id: number; name: string };

/** 비교 모드에서 실제로 쓰이는 알고리즘 — 화면 · 이름표 · 내보내기가 같은 목록을 본다 */
export function activeAlgos(C: DitherState): AlgoId[] {
  if (C.compare === "band") return [C.algo, C.a2, C.a3];
  if (C.compare === "quad") return [C.algo, C.a2, C.a3, C.a4];
  return [C.algo];
}

/* ---------- 합성 ----------
   격자를 만든 뒤 화면 크기로 늘린다. 늘릴 때 절대 부드럽게 하지 않는다 —
   디더의 전부가 점 하나하나의 경계에 있기 때문에 보간하면 그냥 원본 사진의
   흐린 사본이 된다. */
export function compose(target: HTMLCanvasElement, S: number, C: DitherState, src: Src) {
  /* 화면 크기는 격자의 정수배로만 잡는다. 1.4배 같은 어중간한 배율로 늘리면
     어떤 점은 한 픽셀, 옆의 점은 두 픽셀로 찍혀 격자가 울퉁불퉁해진다.
     디더는 점이 고르게 놓여야 계조로 보이므로 그것만은 지켜야 한다. */
  const { gw, gh } = gridSize(src.cv.width, src.cv.height, C.pixel);
  const k = Math.max(1, Math.round(S / Math.max(gw, gh)));
  const cw = gw * k, ch = gh * k;
  if (target.width !== cw || target.height !== ch) { target.width = cw; target.height = ch; }

  const g = ctx2d(target);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cw, ch);
  g.imageSmoothingEnabled = false;

  /* 비교는 사진을 여러 장 늘어놓는 대신 한 장을 칸으로 잘라 각 칸을 다르게 찍는다.
     늘어놓으면 사진이 작아지면서 격자가 화면 픽셀과 어긋나 점이 고르지 않게 되고,
     무엇보다 서로 다른 계조를 견주게 된다. 잘라 놓으면 같은 자리의 같은 계조가
     경계를 사이에 두고 맞닿아서, 보이는 차이가 전부 알고리즘의 차이다. */
  const algos = activeAlgos(C);
  const panes = paneRects(C, cw, ch);
  panes.forEach((p, i) => {
    const grid = gridFor(src, C, algos[Math.min(i, algos.length - 1)]);
    g.save();
    g.beginPath();
    g.rect(p.x, p.y, p.w, p.h);
    g.clip();
    g.drawImage(grid.tile, 0, 0, cw, ch);
    g.restore();
  });

  if (panes.length > 1) {
    drawSeams(g, C, S, panes);
    if (C.labels) {
      panes.forEach((p, i) => drawLabel(g, shortName(algos[i]), p, C, S));
    }
  }
  return { cw, ch };
}

export type Pane = { x: number; y: number; w: number; h: number };

/** 비교 칸의 자리. 띠는 세로로 셋, 네 칸은 2×2. */
export function paneRects(C: DitherState, cw: number, ch: number): Pane[] {
  if (C.compare === "off") return [{ x: 0, y: 0, w: cw, h: ch }];
  if (C.compare === "quad") {
    const hw = Math.round(cw / 2), hh = Math.round(ch / 2);
    return [
      { x: 0, y: 0, w: hw, h: hh },
      { x: hw, y: 0, w: cw - hw, h: hh },
      { x: 0, y: hh, w: hw, h: ch - hh },
      { x: hw, y: hh, w: cw - hw, h: ch - hh }
    ];
  }
  const n = 3;
  const edge = (i: number) => Math.round((cw * i) / n);
  return Array.from({ length: n }, (_, i) => ({ x: edge(i), y: 0, w: edge(i + 1) - edge(i), h: ch }));
}

/** 이름표는 결과물의 일부다 — 비교 시트로 저장하면 그대로 실린다. */
function drawLabel(
  g: CanvasRenderingContext2D, text: string, p: Pane, C: DitherState, S: number
) {
  const pad = Math.round(S * 0.012);
  const fs = Math.max(11, Math.round(S * 0.022));
  g.save();
  g.font = `600 ${fs}px "Archivo", system-ui, sans-serif`;
  g.textBaseline = "alphabetic";
  const tw = g.measureText(text).width;
  const bw = tw + pad * 2, bh = fs + pad * 1.2;
  const bx = p.x + pad, by = p.y + p.h - bh - pad;
  g.fillStyle = paperOf(C);
  g.globalAlpha = 0.92;
  g.fillRect(bx, by, bw, bh);
  g.globalAlpha = 1;
  g.fillStyle = inkOf(C);
  g.fillText(text, bx + pad, by + bh - pad * 0.9);
  g.restore();
}

/** 이름표 글자색 — 팔레트에서 종이와 가장 멀리 떨어진 색을 고른다 */
export function inkOf(C: DitherState): string {
  const P = findPalette(C.palette);
  if (P.kind === "ramp") return C.cInk;
  if (P.kind === "channel") return "#111111";
  const cols = P.colors!.map(hex2rgb);
  const p = cols[P.paper ?? 0];
  let bi = 0, bd = -1;
  cols.forEach((c, i) => {
    const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
    if (d > bd) { bd = d; bi = i; }
  });
  return P.colors![bi];
}

/** 비교 경계선 — 어디까지가 어느 알고리즘인지 눈으로 끊어 준다 */
function drawSeams(g: CanvasRenderingContext2D, C: DitherState, S: number, panes: Pane[]) {
  g.save();
  g.strokeStyle = inkOf(C);
  g.globalAlpha = 0.45;
  g.lineWidth = Math.max(1, S / 700);
  g.beginPath();
  for (const p of panes) g.rect(p.x, p.y, p.w, p.h);
  g.stroke();
  g.restore();
}

export function shortName(id: AlgoId): string {
  const L = findAlgo(id).label;
  return L.replace(/^(오차 확산|정렬) · /, "");
}

/** 격자 그대로의 이미지 — 1칸이 1픽셀. 픽셀 아트로 쓸 때 이게 원본이다. */
export function gridCanvas(C: DitherState, src: Src): HTMLCanvasElement {
  const grid = gridFor(src, C, C.algo);
  const cv = mk(grid.w, grid.h);
  ctx2d(cv).putImageData(grid.data, 0, 0);
  return cv;
}

/** SVG · 색 세기 용 — 화면과 같은 격자를 그대로 넘긴다 */
export function mainGrid(C: DitherState, src: Src): Grid {
  return gridFor(src, C, C.algo);
}

/* ---------- 견본 사진 ----------
   업로드 전에도 도구가 비어 있으면 안 된다. 그리고 아무 사진이나 넣는 것보다,
   디더가 무엇을 잘하고 무엇을 못 하는지가 한눈에 드러나는 그림이 낫다.
   그래서 인쇄 시험지처럼 만들었다.
     · 매끈한 그라데이션  — 계조를 어떻게 쪼개는지 (띠가 생기는지)
     · 구와 그림자        — 부드러운 곡면에서 점이 어떻게 퍼지는지
     · 딱 떨어지는 도형   — 가장자리가 살아남는지
     · 좁아지는 줄무늬    — 정렬 디더가 무늬끼리 부딪혀 만드는 모아레
   링크에는 사진이 실리지 않으므로, 기본 상태의 공유 링크는 이 그림으로 열린다. */
export function sampleSource(w = 1200, h = 900): HTMLCanvasElement {
  const cv = mk(w, h);
  const g = ctx2d(cv);

  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#f2f2ef");
  bg.addColorStop(0.55, "#8f8f93");
  bg.addColorStop(1, "#191a1f");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  /* 바닥에 깔린 계조 띠 — 왼쪽 끝이 완전한 검정, 오른쪽 끝이 완전한 흰색 */
  const ramp = g.createLinearGradient(0, 0, w, 0);
  ramp.addColorStop(0, "#000");
  ramp.addColorStop(1, "#fff");
  g.fillStyle = ramp;
  g.fillRect(0, h * 0.86, w, h * 0.14);

  /* 좁아지는 줄무늬 — 오른쪽으로 갈수록 촘촘해진다 */
  g.save();
  g.globalAlpha = 0.5;
  g.fillStyle = "#fff";
  for (let x = w * 0.62; x < w * 0.97;) {
    const t = (x - w * 0.62) / (w * 0.35);
    const bar = Math.max(1.5, 16 * (1 - t) + 1.5);
    g.fillRect(x, h * 0.07, bar, h * 0.2);
    x += bar * 2;
  }
  g.restore();

  /* 구 — 부드러운 곡면. 디더가 가장 티 나는 곳이다. */
  const cx = w * 0.36, cy = h * 0.46, r = Math.min(w, h) * 0.29;
  const sh = g.createRadialGradient(cx + r * 0.1, cy + r * 1.02, r * 0.05, cx, cy + r * 1.06, r * 1.25);
  sh.addColorStop(0, "rgba(0,0,0,.55)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh;
  g.beginPath();
  g.ellipse(cx, cy + r * 1.05, r * 1.2, r * 0.24, 0, 0, Math.PI * 2);
  g.fill();

  const sphere = g.createRadialGradient(cx - r * 0.36, cy - r * 0.42, r * 0.05, cx, cy, r);
  sphere.addColorStop(0, "#ffffff");
  sphere.addColorStop(0.16, "#e6e6e2");
  sphere.addColorStop(0.62, "#75757c");
  sphere.addColorStop(1, "#14151a");
  g.fillStyle = sphere;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();

  /* 딱 떨어지는 도형 둘 — 가장자리가 무너지는지 본다 */
  g.fillStyle = "#f6f5f1";
  g.beginPath();
  g.moveTo(w * 0.78, h * 0.36);
  g.lineTo(w * 0.93, h * 0.66);
  g.lineTo(w * 0.63, h * 0.66);
  g.closePath();
  g.fill();

  g.strokeStyle = "#101116";
  g.lineWidth = Math.max(3, w * 0.012);
  g.beginPath();
  g.arc(w * 0.78, h * 0.52, r * 0.34, 0, Math.PI * 2);
  g.stroke();

  return cv;
}

/** 파일·붙여넣기로 들어온 이미지를 다루기 좋은 크기의 캔버스로 정리한다 */
export function normalizeSource(img: HTMLImageElement | ImageBitmap, max = 1600): HTMLCanvasElement {
  const iw = img.width, ih = img.height;
  const k = Math.min(1, max / Math.max(iw, ih));
  const cv = mk(Math.max(1, Math.round(iw * k)), Math.max(1, Math.round(ih * k)));
  const g = ctx2d(cv);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(img as CanvasImageSource, 0, 0, cv.width, cv.height);
  return cv;
}
