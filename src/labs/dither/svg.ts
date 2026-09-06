/* Dither SVG 내보내기 — 색마다 판 하나.

   디더는 격자에 찍힌 네모의 모음이라 윤곽을 따는 것이 아니라 네모를 합치는 일이다.
   같은 색 네모를 하나씩 적으면 파일이 금세 수십만 개가 되므로 두 번 합친다.
   먼저 가로로 이어 붙이고(런 렝스), 그 다음 바로 아래 줄에 시작점과 길이가 똑같은
   토막이 있으면 세로로 늘린다. 하늘처럼 평평한 곳은 큰 네모 몇 개로 줄어들고,
   점이 흩뿌려진 곳만 낱개로 남는다.

   판을 색깔로 나누는 이유는 목판화와 같다 — 실크스크린이나 리소는 색마다 판을
   따로 뽑아야 하고, 벡터 편집기에서도 색깔별로 집어 쓸 수 있어야 한다. */
import { escXML } from "@/lib/trace";
import { mainGrid, paperOf, rgb2hex, type DitherState, type Grid, type Src } from "./engine";

type Rect = { x: number; y: number; w: number; h: number };

/** 한 색이 차지한 칸들을 최소한의 네모로 덮는다 */
function mergeRects(grid: Grid, want: (i: number) => boolean): Rect[] {
  const { w, h } = grid;
  const out: Rect[] = [];
  /* 직전 줄에서 만든 토막들 — 같은 자리·같은 길이면 늘리기만 한다 */
  let prev = new Map<string, Rect>();
  for (let y = 0; y < h; y++) {
    const cur = new Map<string, Rect>();
    let x = 0;
    while (x < w) {
      if (!want(y * w + x)) { x++; continue; }
      let e = x;
      while (e < w && want(y * w + e)) e++;
      const key = `${x}:${e - x}`;
      const up = prev.get(key);
      if (up && up.y + up.h === y) { up.h++; cur.set(key, up); }
      else { const r = { x, y, w: e - x, h: 1 }; out.push(r); cur.set(key, r); }
      x = e;
    }
    prev = cur;
  }
  return out;
}

const pathOf = (rects: Rect[], k: number) =>
  rects
    .map((r) => {
      const x = +(r.x * k).toFixed(2), y = +(r.y * k).toFixed(2);
      const w = +(r.w * k).toFixed(2), h = +(r.h * k).toFixed(2);
      return `M${x} ${y}h${w}v${h}h${-w}z`;
    })
    .join("");

/** 칸마다 '몇 번째 색인가' 만 남긴 표. 색 세기와 판 뽑기가 같은 표를 본다. */
function colorMap(grid: Grid) {
  const d = grid.data.data;
  const N = grid.w * grid.h;
  const code = new Int16Array(N);
  const hex: string[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const h = rgb2hex([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    let c = seen.get(h);
    if (c === undefined) { c = hex.length; hex.push(h); seen.set(h, c); }
    code[i] = c;
  }
  const count = new Int32Array(hex.length);
  for (let i = 0; i < N; i++) count[code[i]]++;
  return { code, hex, count };
}

/** 판 목록 — 넓게 깔린 색부터. 종이색은 판이 아니라 바탕이라 빠진다. */
export function plates(C: DitherState, src: Src): { color: string; count: number }[] {
  const m = colorMap(mainGrid(C, src));
  const paper = paperOf(C).toLowerCase();
  return m.hex
    .map((color, i) => ({ color, count: m.count[i] }))
    .filter((p) => p.color.toLowerCase() !== paper)
    .sort((a, b) => b.count - a.count);
}

export function toSVG(C: DitherState, src: Src): { svg: string; rects: number } {
  const grid = mainGrid(C, src);
  const m = colorMap(grid);
  const paper = paperOf(C).toLowerCase();
  const long = Math.max(grid.w, grid.h);
  const k = 1000 / long;                      // 긴 변이 1000 이 되게
  const W = +(grid.w * k).toFixed(2), H = +(grid.h * k).toFixed(2);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<title>${escXML(src.name)} · 디더</title>`,
    /* 칸 사이에 머리카락 같은 흰 줄이 보이는 것을 막는다 */
    '<g shape-rendering="crispEdges">'
  ];
  if (!C.transparent) parts.push(`<rect width="${W}" height="${H}" fill="${paperOf(C)}"/>`);

  let total = 0;
  const order = m.hex
    .map((color, i) => ({ color, i, count: m.count[i] }))
    .filter((p) => p.color.toLowerCase() !== paper)
    .sort((a, b) => b.count - a.count);
  for (const { color, i } of order) {
    const rects = mergeRects(grid, (n) => m.code[n] === i);
    if (!rects.length) continue;
    total += rects.length;
    parts.push(`<path fill="${color}" d="${pathOf(rects, k)}"/>`);
  }
  parts.push("</g>", "</svg>");
  return { svg: parts.join("\n"), rects: total };
}
