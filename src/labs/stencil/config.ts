import type { StencilState } from "./engine";

/** 기본값 = 레퍼런스 1번(색연필 구름 + 별) 을 글씨로 재현한 상태.
 *  도구를 처음 열자마자 결과가 보이도록 사진 없이도 완성형이어야 한다. */
export const DEFAULTS: StencilState = {
  src: "text",
  text: "STENCIL",
  font: "bowlby",

  mode: "fill",
  thresh: 0,
  soften: 0.34,
  clean: 0.3,
  lineW: 0.006,
  invert: false,

  layout: "single",
  cols: 3,
  cell: "square",
  gap: 0,
  vary: 0,
  fill: 0.82,

  field: "cloud",
  fangle: 45,

  ink: "pencil",
  grain: 0.72,
  gscale: 1,
  bleed: 0.45,
  fiber: 0.34,
  dot: 0.012,

  c1: "#7E9AC6",
  c2: "#9EC7A6",
  c3: "#DDE98C",
  cPaper: "#FAF8EC",

  sparkle: 4,
  ratio: "4:5",
  seed: 7
};

/** 프리셋은 입력(글씨 · 사진)을 건드리지 않는다 — 같은 그림에 다른 인쇄를 입혀 보는 용도.
 *  대신 어느 하나가 건드리는 값은 전부가 명시해야 한다. 하나만 빠뜨리면
 *  "라인 아트 → 색연필 구름" 처럼 눌렀을 때 앞 프리셋의 선 모드가 그대로 남는다. */
export const PRESETS: Record<string, Partial<StencilState>> = {
  "색연필 구름": {
    mode: "fill", invert: false, soften: 0.34, clean: 0.3, lineW: 0.006,
    layout: "single", gap: 0, fill: 0.82, field: "cloud", ink: "pencil",
    grain: 0.72, gscale: 1, bleed: 0.45, fiber: 0.34, sparkle: 4, ratio: "4:5", vary: 0,
    c1: "#7E9AC6", c2: "#9EC7A6", c3: "#DDE98C", cPaper: "#FAF8EC"
  },
  "9칸 타원": {
    mode: "fill", invert: false, soften: 0.3, clean: 0.3, lineW: 0.006,
    layout: "grid", cols: 3, cell: "oval", gap: 0.09, fill: 0.72, vary: 0.78,
    field: "radial", ink: "pencil", grain: 0.62, gscale: 1.1, bleed: 0.35,
    fiber: 0.3, sparkle: 0, ratio: "4:5",
    c1: "#7FA9CE", c2: "#93C089", c3: "#CFE0AA", cPaper: "#FCFAEE"
  },
  "세이지 판화": {
    mode: "fill", invert: false, clean: 0.3, lineW: 0.006,
    layout: "grid", cols: 3, cell: "square", gap: 0.012, fill: 0.72, vary: 0.9,
    soften: 0.12, field: "flat", ink: "print", grain: 0.55, gscale: 1, bleed: 0.5,
    fiber: 0.4, sparkle: 0, ratio: "1:1",
    c1: "#A9B79A", c2: "#A9B79A", c3: "#A9B79A", cPaper: "#EFF0F3"
  },
  "블루 리소": {
    mode: "fill", invert: false, clean: 0.3, lineW: 0.006,
    layout: "grid", cols: 3, cell: "square", gap: 0.02, fill: 0.74, vary: 0.9,
    soften: 0.14, field: "flat", ink: "print", grain: 0.62, gscale: 1.3, bleed: 0.68,
    fiber: 0.46, sparkle: 0, ratio: "1:1",
    c1: "#A6C0DC", c2: "#A6C0DC", c3: "#A6C0DC", cPaper: "#F7E9C6"
  },
  "점묘 그라디언트": {
    mode: "fill", invert: false, soften: 0.3, clean: 0.3, lineW: 0.006,
    layout: "single", gap: 0.03, fill: 0.8, field: "linear", fangle: 60,
    ink: "stipple", dot: 0.0105, grain: 0.4, bleed: 0.2, fiber: 0.28,
    sparkle: 0, ratio: "1:1",
    c1: "#2F3C6E", c2: "#C4577B", c3: "#F0C46A", cPaper: "#FBF6EA"
  },
  "라인 아트": {
    mode: "line", lineW: 0.005, soften: 0.12, clean: 0,
    layout: "single", gap: 0.04, fill: 0.86, field: "flat", ink: "print",
    grain: 0.4, gscale: 1, bleed: 0.3, fiber: 0.4, sparkle: 0, invert: true,
    c1: "#1D2733", c2: "#1D2733", c3: "#1D2733", cPaper: "#F2EDE1"
  }
};

/** 긴 변 기준. 드래그 중에는 DRAFT 로 떨어뜨려 슬라이더가 끊기지 않게 한다. */
export const PREVIEW = 1080;
export const DRAFT = 600;
