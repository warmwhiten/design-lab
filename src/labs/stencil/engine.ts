/* =============================================================
   Stencil 엔진 — React 와 무관한 순수 캔버스 로직.

   레퍼런스로 삼은 실크스크린 · 색연필 판화는 전부 같은 레시피다.
     종이  →  잉크 필드  →  마스크로 뚫기  →  질감
   그래서 코드도 한 겹씩 그리지 않고, 픽셀 하나마다 네 값을 구해 한 번에 섞는다.

   모든 노이즈 주파수는 캔버스 짧은 변(unit) 기준이라
   미리보기(1100px)와 3배 내보내기(3300px)가 정확히 같은 그림이 된다.
   ============================================================= */
import { clamp01, fbm, fiberNoise, hash2, smooth } from "./noise";
import { sampleMask, type Mask } from "./mask";

export type Ratio = "1:1" | "4:5" | "3:4";
export type CellShape = "square" | "oval" | "round";
export type InkKind = "pencil" | "stipple" | "print";
export type FieldKind = "flat" | "linear" | "radial" | "cloud";

export type StencilState = {
  /* 입력 */
  src: "text" | "photo";
  text: string;
  font: string;
  /* 실루엣 뽑기 */
  mode: "fill" | "line";
  thresh: number;
  soften: number;
  clean: number;
  lineW: number;
  invert: boolean;
  /* 배치 */
  layout: "single" | "grid";
  cols: number;
  cell: CellShape;
  gap: number;
  vary: number;
  fill: number;
  /* 잉크 필드 */
  field: FieldKind;
  fangle: number;
  /* 질감 */
  ink: InkKind;
  grain: number;
  gscale: number;
  bleed: number;
  fiber: number;
  dot: number;
  /* 색 */
  c1: string; c2: string; c3: string; cPaper: string;
  /* 기타 */
  sparkle: number;
  ratio: Ratio;
  seed: number;
};

export const RATIOS: Record<Ratio, number> = { "1:1": 1, "4:5": 0.8, "3:4": 0.75 };

export const INK_OPTS: { value: InkKind; label: string; icon: string }[] = [
  { value: "pencil", label: "색연필", icon: '<path d="M6 38c6-14 12-20 20-26 6-4 12-6 16-6-2 6-6 12-12 18C22 32 14 38 6 42z"/><path d="M6 44h36v3H6z"/>' },
  { value: "stipple", label: "점묘", icon: '<g><circle cx="10" cy="12" r="4.2"/><circle cx="24" cy="10" r="3.2"/><circle cx="38" cy="13" r="2.2"/><circle cx="11" cy="26" r="3.4"/><circle cx="25" cy="25" r="2.4"/><circle cx="38" cy="27" r="1.5"/><circle cx="10" cy="39" r="2.4"/><circle cx="24" cy="38" r="1.6"/><circle cx="38" cy="39" r="1"/></g>' },
  { value: "print", label: "판화", icon: '<path d="M5 6h38v36H5z M12 13h6v22h-6z M22 13h4v22h-4z M30 13h7v9h-7z M30 26h7v9h-7z" fill-rule="evenodd"/>' }
];

export const CELL_OPTS: { value: CellShape; label: string; icon: string }[] = [
  { value: "square", label: "사각", icon: '<rect x="5" y="5" width="38" height="38"/>' },
  { value: "oval", label: "타원", icon: '<ellipse cx="24" cy="24" rx="15" ry="19"/>' },
  { value: "round", label: "둥근 사각", icon: '<rect x="5" y="5" width="38" height="38" rx="11"/>' }
];

export const FIELD_OPTS: { value: FieldKind; label: string }[] = [
  { value: "flat", label: "단색 1도" },
  { value: "linear", label: "선형 그라디언트" },
  { value: "radial", label: "방사형 (셀 중심)" },
  { value: "cloud", label: "구름 (메시 느낌)" }
];

/* ---------- 색 ---------- */

type RGB = [number, number, number];

export function hex2rgb(h: string): RGB {
  const s = h.replace("#", "");
  const n = s.length === 3
    ? parseInt(s.split("").map((c) => c + c).join(""), 16)
    : parseInt(s.padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- 캔버스 ---------- */

export function sizeFor(long: number, ratio: Ratio) {
  const a = RATIOS[ratio];
  return a >= 1
    ? { w: long, h: Math.round(long / a) }
    : { w: Math.round(long * a), h: long };
}

export function makeCanvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return cv;
}

/* ---------- 별 ---------- */

type Spark = { x: number; y: number; rx: number; ry: number };

function sparks(W: number, H: number, n: number, seed: number): Spark[] {
  const U = Math.min(W, H);
  const out: Spark[] = [];
  for (let k = 0; k < n; k++) {
    const a = hash2(k, 1, seed + 41), b = hash2(k, 2, seed + 41), c = hash2(k, 3, seed + 41);
    /* 가운데 주제를 가리지 않도록 좌우 가장자리 쪽으로 민다 */
    const ex = a < 0.5 ? a * 0.36 : 1 - (1 - a) * 0.36;
    /* 세로는 층을 나눠 배치한다 — 순수 난수로 두면 서너 개가 한자리에 뭉친다 */
    out.push({
      x: ex * W,
      y: ((k + 0.18 + b * 0.64) / n) * H,
      rx: (0.042 + 0.045 * c) * U,
      ry: (0.058 + 0.07 * c) * U
    });
  }
  return out;
}

/* ---------- 저주파 필드 ---------- */

/** 구름 그라디언트는 캔버스만 한 크기의 무늬라 픽셀마다 계산할 이유가 없다.
 *  성긴 격자에서 구해 이중선형으로 펴면 눈에 띄는 차이 없이 수십 배 빨라진다. */
type Coarse = { a: Float32Array; cw: number; step: number };

function coarse(W: number, H: number, step: number, fn: (x: number, y: number) => number): Coarse {
  const cw = Math.ceil(W / step) + 2, chh = Math.ceil(H / step) + 2;
  const a = new Float32Array(cw * chh);
  for (let j = 0; j < chh; j++) {
    for (let i = 0; i < cw; i++) a[j * cw + i] = fn(i * step, j * step);
  }
  return { a, cw, step };
}

function sampleCoarse(C: Coarse, x: number, y: number): number {
  const fx = x / C.step, fy = y / C.step;
  const i = fx | 0, j = fy | 0;
  const tx = fx - i, ty = fy - j;
  const o = j * C.cw + i;
  const t = C.a[o] + (C.a[o + 1] - C.a[o]) * tx;
  const b = C.a[o + C.cw] + (C.a[o + C.cw + 1] - C.a[o + C.cw]) * tx;
  return t + (b - t) * ty;
}

/* ---------- 셀 모양 ---------- */

function cellAlpha(shape: CellShape, u: number, v: number, gap: number): number {
  const e = 0.008;
  if (shape === "square") {
    return Math.min(
      smooth(gap - e, gap + e, u), smooth(1 - gap + e, 1 - gap - e, u),
      smooth(gap - e, gap + e, v), smooth(1 - gap + e, 1 - gap - e, v)
    );
  }
  const hx = 0.5 - gap, hy = 0.5 - gap;
  if (hx <= 0 || hy <= 0) return 0;
  if (shape === "oval") {
    const dx = (u - 0.5) / hx, dy = (v - 0.5) / hy;
    return 1 - smooth(1 - 0.02, 1 + 0.02, Math.sqrt(dx * dx + dy * dy));
  }
  const rad = 0.34 * Math.min(hx, hy);
  const qx = Math.abs(u - 0.5) - (hx - rad);
  const qy = Math.abs(v - 0.5) - (hy - rad);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
  return 1 - smooth(-e, e, d);
}

/* =============================================================
   렌더 — 픽셀 하나마다 (셀, 마스크, 필드, 질감) 네 값을 구해 종이 위에 얹는다.
   DOM 을 전혀 건드리지 않으므로 Node 에서도 그대로 돌릴 수 있다 (OG 이미지 생성).
   ============================================================= */
export function render(W: number, H: number, C: StencilState, mask: Mask | null): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));

  const U = Math.min(W, H);
  const seed = Math.round(C.seed) | 0;
  const paper = hex2rgb(C.cPaper);
  const P1 = hex2rgb(C.c1), P2 = hex2rgb(C.c2), P3 = hex2rgb(C.c3);

  const cols = C.layout === "grid" ? Math.max(1, Math.round(C.cols)) : 1;
  const rows = cols;
  const cw = W / cols, ch = H / rows;
  const ar = cw / ch;

  const SP = C.sparkle > 0 ? sparks(W, H, Math.round(C.sparkle), seed) : [];

  /* 질감 주파수 — 전부 U 기준이라 해상도를 바꿔도 그림이 같다 */
  const gf = 190 / C.gscale / U;
  const gU = gf * U;                       // 캔버스 크기와 무관한 그레인 주파수
  const bf = (C.ink === "print" ? 34 : C.ink === "stipple" ? 17 : 8) / U;
  const bAmp = C.bleed * 0.032;
  /* 점 간격. 아래 클램프는 초안 해상도에서 점이 픽셀보다 작아져 뭉개지는 것만 막는다 —
     너무 높이 잡으면 초안과 미리보기의 질감이 달라 보인다. */
  const dotSp = Math.max(1.5, U * C.dot);
  const fieldRad = (C.fangle * Math.PI) / 180;
  const fcos = Math.cos(fieldRad), fsin = Math.sin(fieldRad);
  const diag = Math.abs(W * fcos) + Math.abs(H * fsin) || 1;

  /* 구름 — 도메인 워프한 fBm 에 "중앙이 밝고 모서리가 깊은" 구조를 얹는다.
     순수 노이즈만 쓰면 매번 우연한 얼룩이 되고, 이 한 겹이 있어야 구도가 잡힌다. */
  const cloud = C.field === "cloud"
    ? coarse(W, H, 6, (x, y) => {
        const cnx = x / U, cny = y / U;
        const wx = fbm(cnx * 1.6, cny * 1.6, seed + 91, 2) - 0.5;
        const wy = fbm(cnx * 1.6, cny * 1.6, seed + 97, 2) - 0.5;
        const n = fbm(cnx * 1.9 + wx * 1.4, cny * 1.9 + wy * 1.4, seed + 83, 3);
        const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
        const vig = 1 - Math.min(1, Math.hypot(dx, dy) / 1.32);
        return clamp01((n - 0.5) * 1.5 + vig * 0.72 - 0.02);
      })
    : null;

  /* 색연필의 "누르는 힘" 얼룩도 저주파다 */
  const press = C.ink === "pencil"
    ? coarse(W, H, 5, (x, y) => {
        const sx = (x / U * 0.82 + y / U * 0.57) * gU * 0.12;
        const sy = (y / U * 0.82 - x / U * 0.57) * gU * 0.12;
        return fbm(sx, sy, seed + 3, 2);
      })
    : null;

  for (let y = 0; y < H; y++) {
    const ny = y / U;
    for (let x = 0; x < W; x++) {
      const nx = x / U;

      /* 1. 어느 셀인가 */
      const cx = Math.min(cols - 1, (x / cw) | 0);
      const cy = Math.min(rows - 1, (y / ch) | 0);
      const u = (x - cx * cw) / cw;
      const v = (y - cy * ch) / ch;

      let a = cellAlpha(C.cell, u, v, C.gap);

      if (a > 0.001) {
        /* 2. 셀마다 조금씩 다르게 — 회전 · 크기 · 색 자리 */
        const r1 = hash2(cx, cy, seed + 5);
        const r2 = hash2(cx, cy, seed + 17);
        const r3 = hash2(cx, cy, seed + 29);
        const rot = (r1 - 0.5) * 0.6 * C.vary;
        const sc = C.fill * (1 + (r2 - 0.5) * 0.34 * C.vary);

        /* 3. 주제 마스크 — 셀 안쪽 좌표로 변환해 샘플 */
        let m = 0;
        if (mask && sc > 0.02) {
          const dx = (u - 0.5) * ar, dy = v - 0.5;
          const cs = Math.cos(rot), sn = Math.sin(rot);
          let su = (dx * cs - dy * sn) / (ar * sc) + 0.5;
          let sv = (dx * sn + dy * cs) / sc + 0.5;
          if (bAmp > 0) {
            /* 잉크 번짐 — 마스크를 흔들어 읽으면 경계가 손으로 오려낸 듯 일렁인다 */
            su += (fbm(x * bf, y * bf, seed + 61, 2) - 0.5) * bAmp;
            sv += (fbm(x * bf, y * bf, seed + 73, 2) - 0.5) * bAmp;
          }
          m = sampleMask(mask, su, sv);
        }
        a *= 1 - m;

        /* 4. 별도 잉크를 뚫는다 */
        if (a > 0.001 && SP.length) {
          let s = 0;
          for (let i = 0; i < SP.length; i++) {
            const p = SP[i];
            const ddx = Math.abs(x - p.x) / p.rx; if (ddx > 1.1) continue;
            const ddy = Math.abs(y - p.y) / p.ry; if (ddy > 1.1) continue;
            const d = Math.pow(ddx, 0.45) + Math.pow(ddy, 0.45);
            if (d < 1.07) { const val = 1 - smooth(0.93, 1.07, d); if (val > s) s = val; }
          }
          a *= 1 - s;
        }

        /* 5. 질감 — 잉크가 어떻게 얹혔는가 */
        if (a > 0.001 && C.ink === "pencil") {
          /* 색연필은 한 방향으로 그어진다 — 좌표를 기울여 늘이면 결이 생긴다 */
          const sx = (nx * 0.82 + ny * 0.57) * gU;
          const sy = (ny * 0.82 - nx * 0.57) * gU * 0.62;
          const g = fbm(sx, sy, seed + 11, 3);
          const tex = (1 - 0.44 * (1 - g)) * (0.82 + 0.36 * sampleCoarse(press!, x, y));
          a *= 1 + C.grain * (tex - 1);
        } else if (a > 0.001 && C.ink === "print") {
          /* 잉크는 단단하게 앉고, 종이 결이 그 위로 뚫고 올라온다.
             여기에 방향성 있는 노이즈를 쓰면 스캔라인처럼 줄이 가므로 등방성 fBm 을 쓴다. */
          const hard = smooth(0.3, 0.62, a);
          const f = fbm(nx * gU * 2.4, ny * gU * 2.4, seed + 17, 2);
          a = hard * (1 - C.grain * 0.44 * (1 - smooth(0.24, 0.72, f)));
        } else if (a > 0.001 && C.ink === "stipple") {
          /* 점묘는 점의 "밀도" 가 아니라 "크기" 로 농담을 만든다.
             그레인을 반지름 계산 전에 먹여야 점이 실제로 작아진다. */
          const dens = clamp01(a * (1 - C.grain * 0.6 * (1 - fbm(nx * gU * 0.22, ny * gU * 0.22, seed + 11, 2))));
          const gx = Math.floor(x / dotSp), gy = Math.floor(y / dotSp);
          /* 반지름을 간격의 절반 근처로 두면 점이 다 붙어 면이 되지 않고
             사이로 종이가 비쳐 점묘다운 공기가 생긴다. */
          const r = dotSp * 0.54 * Math.sqrt(dens);
          let cov = 0;
          dots: for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const ax = gx + i, ay = gy + j;
              const jx = (ax + 0.5 + (hash2(ax, ay, seed) - 0.5) * 0.86) * dotSp;
              const jy = (ay + 0.5 + (hash2(ax, ay, seed + 13) - 0.5) * 0.86) * dotSp;
              const d = Math.hypot(x - jx, y - jy);
              /* 원 경계의 픽셀 덮임을 그대로 근사한다 — 경계 폭이 반지름에 비례하면
                 점이 2px 안팎으로 작아졌을 때 안티에일리어싱이 무너져 각진 덩어리가 된다.
                 여기서는 반지름과 무관하게 항상 1.4px 폭이라 아무리 잘아도 부드럽다. */
              const c = (r - d) * 0.72 + 0.5;
              if (c > cov) { if (c >= 1) { cov = 1; break dots; } cov = c; }
            }
          }
          a = cov;
        }

        /* 6. 잉크 색 — 필드에서 팔레트 위치 t 를 구한다 */
        let t = 0;
        if (C.field === "linear") {
          t = clamp01((((x - W / 2) * fcos + (y - H / 2) * fsin) / diag) + 0.5);
        } else if (C.field === "radial") {
          /* 팔레트 전체를 셀 하나가 다 훑으면 아홉 칸이 전부 같은 색이 된다.
             셀 안에서는 절반 폭의 음영만 주고, 어느 색인지는 아래 vary 가 정한다. */
          const dx = (u - 0.5) * ar, dy = v - 0.5;
          t = 0.26 + 0.48 * clamp01(Math.sqrt(dx * dx + dy * dy) / (0.5 * Math.hypot(ar, 1)));
        } else if (C.field === "cloud") {
          t = sampleCoarse(cloud!, x, y);
        }
        if (C.vary > 0) t = clamp01(t + (r3 - 0.5) * C.vary * 1.05);

        const A = clamp01(a);
        let cr: number, cg: number, cb: number;
        if (t < 0.5) {
          const k = t * 2;
          cr = P1[0] + (P2[0] - P1[0]) * k;
          cg = P1[1] + (P2[1] - P1[1]) * k;
          cb = P1[2] + (P2[2] - P1[2]) * k;
        } else {
          const k = (t - 0.5) * 2;
          cr = P2[0] + (P3[0] - P2[0]) * k;
          cg = P2[1] + (P3[1] - P2[1]) * k;
          cb = P2[2] + (P3[2] - P2[2]) * k;
        }

        /* 7. 종이 위에 얹기 + 섬유 */
        let R = paper[0] + (cr - paper[0]) * A;
        let G = paper[1] + (cg - paper[1]) * A;
        let B = paper[2] + (cb - paper[2]) * A;
        if (C.fiber > 0) {
          const k = (fiberNoise(nx * 120, ny * 120, seed + 23) - 0.5) * C.fiber * 26;
          R += k; G += k; B += k;
        }
        const o = (y * W + x) * 4;
        px[o] = R < 0 ? 0 : R > 255 ? 255 : R;
        px[o + 1] = G < 0 ? 0 : G > 255 ? 255 : G;
        px[o + 2] = B < 0 ? 0 : B > 255 ? 255 : B;
        px[o + 3] = 255;
        continue;
      }

      /* 잉크가 없는 곳 — 종이만 */
      let R = paper[0], G = paper[1], B = paper[2];
      if (C.fiber > 0) {
        const k = (fiberNoise(nx * 120, ny * 120, seed + 23) - 0.5) * C.fiber * 26;
        R += k; G += k; B += k;
      }
      const o = (y * W + x) * 4;
      px[o] = R < 0 ? 0 : R > 255 ? 255 : R;
      px[o + 1] = G < 0 ? 0 : G > 255 ? 255 : G;
      px[o + 2] = B < 0 ? 0 : B > 255 ? 255 : B;
      px[o + 3] = 255;
    }
  }

  return px;
}

/** 캔버스에 얹는 얇은 껍데기. 픽셀 계산 자체는 render() 가 하고 DOM 을 모른다. */
export function compose(cv: HTMLCanvasElement, W: number, H: number, C: StencilState, mask: Mask | null) {
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  cv.getContext("2d")!.putImageData(new ImageData(render(W, H, C, mask), W, H), 0, 0);
}
