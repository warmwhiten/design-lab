"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LabShell, { readURL, type Ctx, type Group } from "@/components/LabShell";
import {
  CELL_OPTS, FIELD_OPTS, FONTS, INK_OPTS, RATIOS,
  compose, makeCanvas, sizeFor, type StencilState
} from "./engine";
import { MASK_LONG, photoMask, textMask, type Mask } from "./mask";
import { DEFAULTS, DRAFT, PRESETS, PREVIEW } from "./config";

const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => Math.round(v * 100) + "%";

/** 마스크를 다시 뽑아야 하는 값들. 나머지는 합성만 다시 하면 된다. */
const MASK_KEYS = ["src", "text", "font", "mode", "thresh", "soften", "clean", "lineW", "invert", "ratio"] as const;
const maskKey = (C: StencilState, ver: number) =>
  MASK_KEYS.map((k) => String(C[k])).join("|") + "|" + ver;

function exportName(C: StencilState, w: number) {
  const base = C.src === "photo"
    ? "stencil"
    : (C.text.split("\n")[0] || "stencil").replace(/[^\w가-힣-]+/g, "_").slice(0, 24);
  return `${base}_${C.ink}_${w}.png`;
}

export default function Stencil() {
  const [state, setState] = useState<StencilState>(DEFAULTS);
  const [mask, setMask] = useState<Mask | null>(null);
  const [meta, setMeta] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgVer, setImgVer] = useState(0);

  /* 링크로 들어온 조합을 복원 */
  useEffect(() => { setState((s) => ({ ...s, ...readURL(DEFAULTS) })); }, []);

  const onChange = useCallback((patch: Partial<StencilState>, draft: boolean) => {
    draftRef.current = draft;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  /* ---------- 마스크 ---------- */
  const buildMask = useCallback((C: StencilState, long: number): Mask | null => {
    const aspect = RATIOS[C.ratio];
    const o = {
      mode: C.mode, thresh: C.thresh, smooth: C.soften, clean: C.clean,
      lineW: C.lineW, invert: C.invert, darkIsSubject: true
    };
    const img = imgRef.current;
    if (C.src === "photo" && img) return photoMask(img, img.naturalWidth, img.naturalHeight, aspect, o, long);
    const font = FONTS.find((f) => f.id === C.font) ?? FONTS[0];
    return textMask(C.text, font.css, aspect, o, long);
  }, []);

  const key = maskKey(state, imgVer);
  useEffect(() => {
    /* 슬라이더를 잡고 있는 동안은 저해상도 마스크로 따라가고, 놓으면 제대로 다시 뽑는다 */
    const long = draftRef.current ? 640 : MASK_LONG;
    const t = setTimeout(() => setMask(buildMask(state, long)), draftRef.current ? 0 : 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, buildMask]);

  /* 웹폰트가 실제로 준비된 뒤 한 번 더 — 첫 화면이 대체 폰트로 굳는 걸 막는다 */
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => { if (alive) setState((s) => ({ ...s })); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  /* ---------- 합성 ---------- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const draw = () => {
      const { w, h } = sizeFor(draftRef.current ? DRAFT : PREVIEW, state.ratio);
      const t0 = performance.now();
      compose(cv, w, h, state, mask);
      setMeta(`${w}×${h} · ${(performance.now() - t0).toFixed(0)}ms`);
    };
    /* 배경 탭에서는 rAF 가 아예 멈춘다 — 링크를 새 탭으로 열어두면 빈 캔버스가 되므로
       그때는 타이머로 대신 그린다. */
    if (document.hidden) {
      const t = setTimeout(draw, 0);
      return () => clearTimeout(t);
    }
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [state, mask]);

  /* ---------- 내보내기 ---------- */
  const png = useCallback((ctx: Ctx<StencilState>, mult: number) => {
    const { w, h } = sizeFor(PREVIEW * mult, ctx.state.ratio);
    ctx.toast(`${w}×${h} 인쇄 중…`);
    setTimeout(() => {
      const cv = makeCanvas(w, h);
      compose(cv, w, h, ctx.state, buildMask(ctx.state, MASK_LONG));
      cv.toBlob((blob) => { if (blob) ctx.download(blob, exportName(ctx.state, w)); }, "image/png");
    }, 30);
  }, [buildMask]);

  const groups: Group<StencilState>[] = useMemo(() => [
    {
      label: "프리셋",
      controls: [{ t: "chips", presets: PRESETS }]
    },
    {
      label: "입력",
      controls: [
        { t: "select", k: "src", options: [{ value: "text", label: "글씨" }, { value: "photo", label: "사진" }] },
        { t: "textarea", k: "text", rows: 2, hint: "줄바꿈으로 여러 줄. 사진 모드에서는 무시됩니다." },
        { t: "select", k: "font", options: FONTS.map((f) => ({ value: f.id, label: f.label })) },
        {
          t: "file", label: "사진 올리기 (브라우저 안에서만 처리됩니다)", accept: "image/*",
          onFile: (file, ctx) => {
            const url = URL.createObjectURL(file);
            const im = new Image();
            im.onload = () => {
              imgRef.current = im;
              setImgVer((v) => v + 1);
              ctx.set({ src: "photo" });
              URL.revokeObjectURL(url);
            };
            im.onerror = () => { URL.revokeObjectURL(url); ctx.toast("이 이미지는 브라우저가 읽지 못했어요"); };
            im.src = url;
          }
        }
      ]
    },
    {
      label: "실루엣 뽑기",
      controls: [
        { t: "select", k: "mode", label: "무엇을 딸 것인가", options: [{ value: "fill", label: "채움 — 덩어리 실루엣" }, { value: "line", label: "선 — 윤곽선만" }] },
        { t: "range", k: "thresh", label: "기준값", min: -0.42, max: 0.42, step: 0.01, fmt: (v) => (v > 0 ? "+" : "") + f2(v) },
        { t: "range", k: "soften", label: "경계 부드럽게", min: 0, max: 1, step: 0.02, fmt: f2 },
        { t: "range", k: "clean", label: "티끌 제거", min: 0, max: 1, step: 0.05, fmt: f2 },
        { t: "range", k: "lineW", label: "선 굵기", min: 0.001, max: 0.02, step: 0.0005, fmt: (v) => v.toFixed(3) },
        { t: "toggle", k: "invert", label: "안팎 뒤집기" }
      ]
    },
    {
      label: "배치",
      controls: [
        { t: "select", k: "layout", options: [{ value: "single", label: "한 판" }, { value: "grid", label: "격자 반복" }] },
        { t: "range", k: "cols", label: "격자", min: 2, max: 5, step: 1, fmt: (v) => `${v} × ${v}` },
        { t: "icons", k: "cell", options: CELL_OPTS },
        { t: "range", k: "gap", label: "여백", min: 0, max: 0.24, step: 0.004, fmt: pct },
        { t: "range", k: "fill", label: "주제 크기", min: 0.2, max: 1.1, step: 0.01, fmt: pct },
        { t: "range", k: "vary", label: "칸마다 흔들기", min: 0, max: 1, step: 0.02, fmt: f2 },
        { t: "select", k: "ratio", label: "비율", options: Object.keys(RATIOS).map((r) => ({ value: r, label: r })) }
      ]
    },
    {
      label: "잉크",
      controls: [
        { t: "icons", k: "ink", options: INK_OPTS },
        { t: "range", k: "grain", label: "그레인", min: 0, max: 1, step: 0.02, fmt: f2 },
        { t: "range", k: "gscale", label: "그레인 크기", min: 0.3, max: 3, step: 0.05, fmt: f2 },
        { t: "range", k: "bleed", label: "번짐", min: 0, max: 1, step: 0.02, fmt: f2 },
        { t: "range", k: "dot", label: "점 간격 (점묘)", min: 0.004, max: 0.035, step: 0.0005, fmt: (v) => v.toFixed(3) },
        { t: "range", k: "fiber", label: "종이 섬유", min: 0, max: 1, step: 0.02, fmt: f2 }
      ]
    },
    {
      label: "색",
      controls: [
        { t: "select", k: "field", label: "잉크 필드", options: FIELD_OPTS },
        { t: "range", k: "fangle", label: "그라디언트 각도", min: 0, max: 360, step: 1, fmt: (v) => v.toFixed(0) + "°" },
        { t: "colors", items: [{ k: "c1", label: "잉크 1" }, { k: "c2", label: "잉크 2" }, { k: "c3", label: "잉크 3" }, { k: "cPaper", label: "종이" }] },
        { t: "range", k: "sparkle", label: "별", min: 0, max: 9, step: 1, fmt: (v) => v.toFixed(0) + "개" }
      ]
    },
    {
      label: "기타",
      controls: [
        { t: "range", k: "seed", label: "씨앗", min: 0, max: 999, step: 1, fmt: (v) => v.toFixed(0) },
        {
          t: "buttons",
          items: [
            {
              label: "랜덤 인쇄",
              run: (ctx) => {
                const r = (a: number, b: number) => a + Math.random() * (b - a);
                const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
                const P = pick(Object.values(PRESETS));
                ctx.set({
                  ...P,
                  seed: Math.floor(Math.random() * 1000),
                  gscale: r(0.6, 2.2),
                  bleed: r(0.15, 0.75),
                  grain: r(0.35, 0.85),
                  fangle: r(0, 360)
                });
              }
            },
            { label: "초기화", run: (ctx) => ctx.reset() }
          ]
        }
      ]
    }
  ], []);

  const ar = RATIOS[state.ratio];

  return (
    <LabShell<StencilState>
      slug="stencil"
      title="Stencil Print Lab"
      tagline="사진이나 글씨에서 실루엣을 따고, 그 뒤를 색연필·점묘·판화 질감으로 채우는 인쇄 실험실."
      defaults={DEFAULTS}
      state={state}
      onChange={onChange}
      groups={groups}
      canvasRef={canvasRef}
      meta={meta}
      aspect={`${ar} / 1`}
      canvasLabel={
        (state.src === "photo"
          ? "올린 사진에서 딴 실루엣"
          : `«${state.text.replace(/\n/g, " ") || "글자 없음"}»`) +
        ` · ${INK_OPTS.find((o) => o.value === state.ink)?.label} 질감` +
        ` · ${state.layout === "grid" ? `${state.cols}×${state.cols} 격자` : "한 판"}` +
        (state.mode === "line" ? " · 선 모드" : "")
      }
      actions={[
        { label: "PNG 1×", primary: true, run: (ctx) => png(ctx, 1) },
        { label: "2×", run: (ctx) => png(ctx, 2) },
        { label: "3×", run: (ctx) => png(ctx, 3) }
      ]}
    />
  );
}
