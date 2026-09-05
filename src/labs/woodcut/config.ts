import type { WoodcutState } from "./engine";

export const DEFAULTS: WoodcutState = {
  text: "handmade",
  font: "archivo",
  size: 0.82,
  track: 0.02,
  lead: 0.12,
  tool: "gouge",
  toolSize: 0.028,
  ink: 0,
  wobble: 0.28,
  chatter: 0.12,
  jitter: 0.05,
  starve: 0.3,
  fibre: 0.05,
  seed: 7,
  cInk: "#26231f",
  cPaper: "#f1eee4",
  transparent: false
};

/* 프리셋 = 실제 판재와 잉킹의 차이. 도구·번짐·결손이 함께 움직인다. */
export const PRESETS: Record<string, Partial<WoodcutState>> = {
  "리노컷": {
    tool: "gouge", toolSize: 0.03, ink: 0.015, wobble: 0.26, chatter: 0.1,
    jitter: 0.045, starve: 0.28, fibre: 0.05, track: 0.02,
    cInk: "#26231f", cPaper: "#f1eee4"
  },
  "고무 스탬프": {
    tool: "stamp", toolSize: 0.022, ink: 0.03, wobble: 0.18, chatter: 0.08,
    jitter: 0.075, starve: 0.5, fibre: 0.06, track: 0.03,
    cInk: "#2b2320", cPaper: "#f5f2e8"
  },
  "거친 목판": {
    tool: "vknife", toolSize: 0.018, ink: -0.03, wobble: 0.4, chatter: 0.22,
    jitter: 0.07, starve: 0.46, fibre: 0.07, track: 0.03,
    cInk: "#1e1c1a", cPaper: "#e8e2d2"
  },
  "레터프레스": {
    tool: "flat", toolSize: 0.016, ink: 0.005, wobble: 0.09, chatter: 0.04,
    jitter: 0.015, starve: 0.14, fibre: 0.025, track: 0.02,
    cInk: "#1a1a1c", cPaper: "#faf8f2"
  },
  "잉크 과다": {
    tool: "gouge", toolSize: 0.075, ink: 0.075, wobble: 0.22, chatter: 0.06,
    jitter: 0.05, starve: 0.16, fibre: 0.04, track: -0.03,
    cInk: "#221f1c", cPaper: "#efece2"
  },
  "등사기": {
    tool: "flat", toolSize: 0.026, ink: -0.045, wobble: 0.2, chatter: 0.14,
    jitter: 0.035, starve: 0.6, fibre: 0.08, track: 0.03,
    cInk: "#2d3a6b", cPaper: "#f4f1e6"
  }
};

export const PREVIEW = 1100;
export const DRAFT = 620;
