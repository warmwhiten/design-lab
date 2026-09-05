/* =============================================================
   Stencil — 질감의 원료. 해시 하나에서 노이즈 · fBm · 종이 섬유가 전부 나온다.
   외부 의존성 없이, 같은 좌표에는 언제나 같은 값 (= 미리보기와 4배 내보내기가 일치).
   ============================================================= */

/* 순열 표 — 해시를 곱셈·나눗셈 체인으로 계산하면 픽셀당 수십 번이라 그것만으로 1초를 먹는다.
   1024칸짜리 표를 두 번 훑는 고전적인 방식이 같은 품질에 10배 가까이 빠르다.
   표는 고정 셔플이고, 시드는 표 안의 자리를 옮기는 데 쓴다. */
const N = 1024, M = N - 1, INV = 1 / M;
const TAB = new Uint16Array(N);
(() => {
  const a = new Uint16Array(N);
  for (let i = 0; i < N; i++) a[i] = i;
  let x = 0x2545f491;
  for (let i = N - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x |= 0;
    const j = (x >>> 0) % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  TAB.set(a);
})();

/** 정수 좌표 → 0..1. 1024칸 주기라 그보다 넓은 격자를 쓰면 무늬가 반복된다
 *  (그레인 최대 주파수가 그 아래라 실제로는 보이지 않는다). */
export function hash2(x: number, y: number, s: number): number {
  return TAB[(TAB[(x + s * 373) & M] + y + s * 619) & M] * INV;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** 값 노이즈 — 격자 난수를 부드럽게 보간한 것. 연필 자국의 기본 단위. */
export function vnoise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/** 옥타브를 겹친 노이즈 — 굵은 얼룩과 미세한 결이 동시에 생긴다. */
export function fbm(x: number, y: number, s: number, oct = 3): number {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f, s + i * 101);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return v / norm;
}

/** 종이 섬유 — 불규칙한 얼룩이 주이고, 한 방향으로 늘어난 결은 거들기만 한다.
 *  늘어난 노이즈 둘을 직각으로 겹치면 직조된 천처럼 격자무늬가 뚜렷하게 보인다. */
export function fiberNoise(x: number, y: number, s: number): number {
  return fbm(x * 0.9, y * 0.9, s + 19, 2) * 0.68
       + vnoise(x * 0.45, y * 2.3, s) * 0.32;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0..1 구간의 부드러운 계단. e0 > e1 이면 뒤집힌다. */
export function smooth(e0: number, e1: number, v: number): number {
  const t = clamp01((v - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}
