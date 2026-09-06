/* =============================================================
   Stencil — 마스크. 사진이든 글씨든 여기서 "실루엣 1장" 으로 통일된다.
   마스크에서 1 인 곳은 잉크가 올라가지 않고 종이가 그대로 드러난다.
   (스텐실·실크스크린의 원리 그대로. 흰 도형을 위에 덮는 게 아니라 잉크를 뚫는다.)
   ============================================================= */
import { clamp01, smooth } from "./noise";

export type Mask = { w: number; h: number; a: Uint8Array };

/** 마스크 해상도 상한. 이 위로는 올려도 질감 노이즈에 묻혀 보이지 않는다. */
export const MASK_LONG = 1400;

/* ---------- 샘플링 ---------- */

/** (u,v) 0..1 을 이중선형으로 읽는다. 바깥은 0 — 셀 밖으로 나간 주제는 사라진다. */
export function sampleMask(m: Mask, u: number, v: number): number {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const x = u * (m.w - 1), y = v * (m.h - 1);
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 + 1 < m.w ? x0 + 1 : x0;
  const y1 = y0 + 1 < m.h ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = m.a, w = m.w;
  const t = a[y0 * w + x0] + (a[y0 * w + x1] - a[y0 * w + x0]) * fx;
  const b = a[y1 * w + x0] + (a[y1 * w + x1] - a[y1 * w + x0]) * fx;
  return (t + (b - t) * fy) / 255;
}

/* ---------- 픽셀 필터 ---------- */

/** 오츠 — 히스토그램만 보고 "여기서 자르면 앞뒤가 가장 잘 갈린다" 는 값을 찾는다.
 *  사진을 올리자마자 그럴듯한 실루엣이 나오게 하는 기본값. */
export function otsu(gray: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[Math.min(255, (gray[i] * 255) | 0)]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, at = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; at = i; }
  }
  return at / 255;
}

/** 분리 가능 박스 블러 — 누적합으로 반지름과 무관하게 O(n). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = src[o] * (r + 1);
    for (let i = 1; i <= r; i++) acc += src[o + Math.min(w - 1, i)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc / n;
      acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = tmp[x] * (r + 1);
    for (let i = 1; i <= r; i++) acc += tmp[Math.min(h - 1, i) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** 3×3 다수결 — 외톨이 점은 지우고 바늘구멍은 메운다. 연결요소 분석보다 훨씬 싸다. */
function majority(bin: Float32Array, w: number, h: number, times: number): Float32Array {
  let cur = bin;
  for (let t = 0; t < times; t++) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
        let c = 0;
        for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (cur[j * w + i] > 0.5) c++;
        out[y * w + x] = c >= 5 ? 1 : 0;
      }
    }
    cur = out;
  }
  return cur;
}

/** 소벨 기울기 크기 — "선 따기" 모드의 재료. 밝기가 급하게 변하는 곳이 곧 윤곽이다. */
function sobel(g: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  let max = 1e-6;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1];
      const d = g[i - 1], f = g[i + 1];
      const p = g[i + w - 1], q = g[i + w], r = g[i + w + 1];
      const gx = (c + 2 * f + r) - (a + 2 * d + p);
      const gy = (p + 2 * q + r) - (a + 2 * b + c);
      const m = Math.sqrt(gx * gx + gy * gy);
      out[i] = m;
      if (m > max) max = m;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

/** 원판(disk) 팽창 — 선 굵기용. 반지름이 작아서 순진한 구현으로 충분하다. */
function dilate(bin: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return bin;
  const out = new Float32Array(w * h);
  const rr = r * r;
  const offs: number[] = [];
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= rr) offs.push(j * w + i);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      const i = y * w + x;
      if (bin[i] < 0.5) continue;
      for (const o of offs) out[i + o] = 1;
    }
  }
  return out;
}

/* ---------- 파이프라인 ---------- */

export type MaskOpts = {
  mode: "fill" | "line";
  /** 오츠가 찾은 값에서 얼마나 밀지. -0.45 ~ 0.45 */
  thresh: number;
  smooth: number;
  clean: number;
  lineW: number;
  invert: boolean;
  /** 사진은 어두운 쪽이 주제, 글씨는 칠해진 쪽이 주제 */
  darkIsSubject: boolean;
};

/** 밝기장(0..1) 하나를 받아 실루엣 마스크로 만든다. 사진과 글씨가 공유하는 유일한 경로. */
function toMask(gray: Float32Array, w: number, h: number, o: MaskOpts): Mask {
  const unit = Math.min(w, h);
  let bin: Float32Array;

  if (o.mode === "line") {
    const edge = sobel(boxBlur(gray, w, h, Math.max(1, Math.round(unit * 0.0022))), w, h);
    const k = clamp01(0.16 - o.thresh * 0.3);
    bin = new Float32Array(w * h);
    for (let i = 0; i < edge.length; i++) bin[i] = edge[i] > k ? 1 : 0;
    bin = dilate(bin, w, h, Math.round(unit * o.lineW));
  } else {
    const base = o.darkIsSubject ? otsu(gray) : 0.5;
    const t = clamp01(base + o.thresh);
    bin = new Float32Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      const on = o.darkIsSubject ? gray[i] < t : gray[i] > t;
      bin[i] = on ? 1 : 0;
    }
  }

  if (o.clean > 0) bin = majority(bin, w, h, Math.min(3, Math.round(o.clean * 3)));

  /* 블러 → 좁은 계단. 경계가 매끈해지면서 계단현상 없이 떨어진다. */
  const r = Math.round(o.smooth * unit * 0.02);
  const soft = r >= 1 ? boxBlur(bin, w, h, r) : bin;
  const edgeW = r >= 1 ? 0.16 : 0.5;

  const a = new Uint8Array(w * h);
  for (let i = 0; i < soft.length; i++) {
    let v = r >= 1 ? smooth(0.5 - edgeW, 0.5 + edgeW, soft[i]) : soft[i];
    if (o.invert) v = 1 - v;
    a[i] = (v * 255) | 0;
  }
  return { w, h, a };
}

/** 마스크 캔버스 크기 — 긴 변을 long 에 맞추고 셀 비율을 따른다.
 *  드래그 중에는 작은 long 으로 만들어 슬라이더가 끊기지 않게 한다. */
export function maskSize(aspect: number, long = MASK_LONG) {
  return aspect >= 1
    ? { w: long, h: Math.round(long / aspect) }
    : { w: Math.round(long * aspect), h: long };
}

function scratch(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return cv;
}

function grayOf(cv: HTMLCanvasElement, useAlpha: boolean): Float32Array {
  const { width: w, height: h } = cv;
  const d = cv.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = useAlpha
      ? d[p + 3] / 255
      : (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255;
  }
  return g;
}

/** 글씨 → 마스크. 캔버스에 그린 글자의 알파가 이미 완벽한 이진 실루엣이라
 *  사진 파이프라인의 마지막 단계에 그대로 꽂으면 된다. */
export function textMask(text: string, font: { css: string; weight: number }, aspect: number, o: MaskOpts, long = MASK_LONG): Mask {
  const { w, h } = maskSize(aspect, long);
  const cv = scratch(w, h);
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return { w, h, a: new Uint8Array(w * h) };

  const probe = 100;
  const face = `${font.weight} %SIZE%px ${font.css}, system-ui, sans-serif`;
  ctx.font = face.replace("%SIZE%", String(probe));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let maxW = 1;
  for (const L of lines) maxW = Math.max(maxW, ctx.measureText(L).width);
  const lead = 1.02;
  const blockH = probe * lead * lines.length;
  const size = Math.min((w * 0.98) / maxW, (h * 0.98) / blockH) * probe;

  ctx.font = face.replace("%SIZE%", String(size));
  ctx.fillStyle = "#fff";
  const step = size * lead;
  const top = h / 2 - (step * (lines.length - 1)) / 2;
  lines.forEach((L, i) => ctx.fillText(L, w / 2, top + step * i));

  return toMask(grayOf(cv, true), w, h, { ...o, darkIsSubject: false });
}

/** 사진 → 마스크. 셀 비율에 맞춰 cover 로 채운 뒤 밝기장을 뽑는다. */
export function photoMask(img: CanvasImageSource, iw: number, ih: number, aspect: number, o: MaskOpts, long = MASK_LONG): Mask {
  const { w, h } = maskSize(aspect, long);
  const cv = scratch(w, h);
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return toMask(grayOf(cv, false), w, h, { ...o, darkIsSubject: true });
}
