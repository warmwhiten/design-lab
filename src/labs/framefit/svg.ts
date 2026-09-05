/* =============================================================
   픽셀 마스크 → 벡터 경로
   마칭 스퀘어로 윤곽을 따고, 이동 평균으로 계단을 다듬은 뒤,
   Ramer–Douglas–Peucker 로 점을 줄인다.
   ============================================================= */
import { buildLayers, type FontDef, type FramefitState } from "./engine";

type Pt = [number, number];

/* 셀 네 꼭짓점(TL,TR,BR,BL)의 채움 여부로 만든 4비트 인덱스 → 방향이 일관된 선분 */
const PT: ((x: number, y: number) => Pt)[] = [
  (x, y) => [x + 0.5, y],       // T
  (x, y) => [x + 1, y + 0.5],   // R
  (x, y) => [x + 0.5, y + 1],   // B
  (x, y) => [x, y + 0.5]        // L
];
const TABLE: Record<number, [number, number][]> = {
  1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[1, 0]],
  5: [[3, 0], [1, 2]], 6: [[2, 0]], 7: [[3, 0]], 8: [[0, 3]],
  9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[0, 1]], 12: [[1, 3]],
  13: [[1, 2]], 14: [[2, 3]]
};

function traceRings(cv: HTMLCanvasElement): Pt[][] {
  const w = cv.width, h = cv.height;
  const data = (cv.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, w, h).data;

  /* 가장자리에 빈 1px 테두리를 둘러 모든 윤곽이 닫히게 한다.
     (없으면 캔버스 경계에 걸친 도형이 열린 선으로 남아 직선 아티팩트가 생긴다) */
  const W = w + 2, H = h + 2;
  const bin = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      bin[(y + 1) * W + (x + 1)] = data[(y * w + x) * 4 + 3] > 128 ? 1 : 0;
    }
  }

  const segs = new Map<number, [Pt, Pt]>();
  const key = (p: Pt) => (Math.round(p[0] * 2) + 4) * 1_000_000 + (Math.round(p[1] * 2) + 4);

  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const a = bin[y * W + x], b = bin[y * W + x + 1];
      const c = bin[(y + 1) * W + x + 1], d = bin[(y + 1) * W + x];
      const idx = a * 8 + b * 4 + c * 2 + d;
      if (idx === 0 || idx === 15) continue;
      for (const [s, e] of TABLE[idx]) {
        const P = PT[s](x - 1, y - 1), Q = PT[e](x - 1, y - 1);
        segs.set(key(P), [P, Q]);
      }
    }
  }

  const rings: Pt[][] = [];
  while (segs.size) {
    const first = segs.keys().next().value as number;
    const seg = segs.get(first)!;
    segs.delete(first);
    const ring: Pt[] = [seg[0]];
    let cur = seg[1];
    let guard = 0;
    while (guard++ < 4_000_000) {
      const k = key(cur);
      if (k === first) break;
      const nx = segs.get(k);
      if (!nx) break;
      segs.delete(k);
      ring.push(cur);
      cur = nx[1];
    }
    if (ring.length > 6) rings.push(ring);
  }
  return rings;
}

function smoothRing(ring: Pt[], passes: number): Pt[] {
  let p = ring;
  for (let it = 0; it < passes; it++) {
    const n = p.length;
    const q: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const A = p[(i - 1 + n) % n], B = p[i], C = p[(i + 1) % n];
      q[i] = [A[0] * 0.25 + B[0] * 0.5 + C[0] * 0.25, A[1] * 0.25 + B[1] * 0.5 + C[1] * 0.25];
    }
    p = q;
  }
  return p;
}

function rdp(pts: Pt[], tol: number): Pt[] {
  const n = pts.length;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    if (e <= s + 1) continue;
    const ax = pts[s][0], ay = pts[s][1];
    const dx = pts[e][0] - ax, dy = pts[e][1] - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = -1, maxI = -1;
    for (let i = s + 1; i < e; i++) {
      const dist = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (dist > maxD) { maxD = dist; maxI = i; }
    }
    if (maxD > tol) { keep[maxI] = 1; stack.push([s, maxI], [maxI, e]); }
  }
  const out: Pt[] = [];
  for (let j = 0; j < n; j++) if (keep[j]) out.push(pts[j]);
  return out;
}

function simplifyClosed(ring: Pt[], tol: number): Pt[] {
  const n = ring.length;
  const half = Math.floor(n / 2);
  const a = rdp(ring.slice(0, half + 1), tol);
  const b = rdp(ring.slice(half).concat([ring[0]]), tol);
  return a.concat(b.slice(1, b.length - 1));
}

function ringsToPath(cv: HTMLCanvasElement, scale: number, tol: number): string {
  const rings = traceRings(cv);
  const out: string[] = [];
  for (const raw of rings) {
    const r = simplifyClosed(smoothRing(raw, 3), tol);
    if (r.length < 3) continue;
    let d = "M";
    for (let j = 0; j < r.length; j++) {
      d += (j ? "L" : "") + (r[j][0] * scale).toFixed(2) + " " + (r[j][1] * scale).toFixed(2);
    }
    out.push(d + "Z");
  }
  return out.join("");
}

const esc = (s: string) =>
  s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));

export function toSVG(C: FramefitState, fonts: FontDef[], S = 1200): string {
  const L = buildLayers(S, C, fonts);
  const scale = 1000 / S;
  const tol = 0.75;
  const parts: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">',
    `<title>${esc(C.text.replace(/\n/g, " "))}</title>`
  ];
  if (!C.transparent) parts.push(`<rect width="1000" height="1000" fill="${C.cBg}"/>`);
  if (L.shadow) parts.push(`<path fill="${C.cShadow}" fill-rule="evenodd" d="${ringsToPath(L.shadow, scale, tol)}"/>`);
  if (L.sil) parts.push(`<path fill="${C.cOut}" fill-rule="evenodd" d="${ringsToPath(L.sil, scale, tol)}"/>`);
  parts.push(`<path fill="${C.cFill}" fill-rule="evenodd" d="${ringsToPath(L.mask, scale, tol)}"/>`);
  parts.push("</svg>");
  return parts.join("\n");
}
