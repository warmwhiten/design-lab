import type { DitherState } from "./engine";

export const DEFAULTS: DitherState = {
  algo: "fs",
  pixel: 3,
  amount: 1,
  serpentine: true,

  bright: 0,
  contrast: 0.12,
  gamma: 1,
  sharp: 0.18,
  soften: 0,

  palette: "ramp",
  levels: 2,
  cInk: "#16171c",
  cPaper: "#f2f0e8",
  invert: false,
  transparent: false,

  compare: "off",
  a2: "bayer4",
  a3: "atkinson",
  a4: "blue",
  labels: true,

  seed: 12
};

/* 프리셋 = 실제로 존재했던 화면과 인쇄물. 알고리즘·팔레트·앞손질이 함께 움직인다.
   각각이 왜 그 조합인지가 결과에 그대로 보인다. */
export const PRESETS: Record<string, Partial<DitherState>> = {
  "초기 매킨토시": {
    algo: "atkinson", palette: "ramp", levels: 2, pixel: 2, amount: 1,
    contrast: 0.2, sharp: 0.3, cInk: "#1c1c1c", cPaper: "#fbfbf7"
  },
  "게임보이": {
    algo: "bayer4", palette: "gameboy", pixel: 6, amount: 1,
    contrast: 0.24, sharp: 0.3, gamma: 1.1
  },
  "신문 망점": {
    algo: "cluster8", palette: "ramp", levels: 2, pixel: 2, amount: 1.15,
    contrast: 0.18, sharp: 0.35, cInk: "#191817", cPaper: "#efe9dc"
  },
  "리소 2도": {
    algo: "blue", palette: "riso", pixel: 4, amount: 1,
    contrast: 0.1, sharp: 0.2, gamma: 1.05
  },
  "앰버 터미널": {
    algo: "bayer8", palette: "amber", pixel: 5, amount: 1,
    contrast: 0.3, sharp: 0.25, gamma: 0.9
  },
  "픽셀 아트": {
    algo: "bayer2", palette: "rgb", levels: 3, pixel: 10, amount: 0.85,
    contrast: 0.26, sharp: 0.5
  },
  "블루 노이즈 사진": {
    algo: "blue", palette: "ramp", levels: 4, pixel: 2, amount: 1,
    contrast: 0.06, sharp: 0.12, cInk: "#14151a", cPaper: "#f4f3ee"
  },
  "가로줄 화면": {
    algo: "lines", palette: "teal", pixel: 4, amount: 1.1,
    contrast: 0.22, sharp: 0.2
  }
};

/** 미리보기 긴 변. 격자는 여기에 좌우되지 않는다 (engine 의 BASE 참고). */
export const PREVIEW = 1100;
export const DRAFT = 640;
