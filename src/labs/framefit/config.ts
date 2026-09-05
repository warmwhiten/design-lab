import type { FramefitState } from "./engine";

export const DEFAULTS: FramefitState = {
  text: "FRAME\nFIT",
  frame: "circle",
  font: "bowlby",
  weight: 0.026,
  fillX: 0.95,
  fillY: 0.97,
  track: 0,
  lead: 0.045,
  warp: 1,
  curve: 1,
  divider: 0.45,
  out: 0.011,
  depth: 0,
  angle: 48,
  cFill: "#17181d",
  cOut: "#f5f3ec",
  cShadow: "#17181d",
  cBg: "#ecebe4",
  transparent: false,
  guides: false
};

export const PRESETS: Record<string, Partial<FramefitState>> = {
  "서클 로고": { frame: "circle", text: "POMELO", warp: 1, curve: 1, weight: 0.03, fillX: 0.95, fillY: 0.96, lead: 0.03, out: 0, depth: 0, track: 0 },
  "2단 서클": { frame: "circle", text: "POMELO\nSTUDIO", warp: 1, curve: 1, divider: 0.55, weight: 0.026, fillX: 0.96, fillY: 0.97, lead: 0.045, out: 0.012, depth: 0 },
  "웨이브 스티커": { frame: "wave", text: "CREATES", warp: 1, curve: 1, weight: 0.045, fillX: 0.9, fillY: 0.8, out: 0.016, depth: 0.026, angle: 118, track: 0.01 },
  "블롭 배지": { frame: "blob", text: "소프트\n블롭", font: "blackhan", warp: 1, curve: 1.1, weight: 0.02, fillX: 0.9, fillY: 0.92, lead: 0.05, out: 0.014, depth: 0, track: 0.02 },
  "아치 배너": { frame: "arch", text: "WORKSHOP", warp: 1, curve: 1.1, weight: 0.035, fillX: 0.92, fillY: 0.9, out: 0, depth: 0.02, angle: 90 },
  "역삼각": { frame: "tri", text: "DOWN\nHILL\nGO", warp: 1, curve: 1, weight: 0.03, fillX: 0.94, fillY: 0.95, lead: 0.05, out: 0.01, depth: 0 }
};

export const PREVIEW = 1200;
export const DRAFT = 760;
