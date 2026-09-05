"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LabShell, { readURL, type Ctx, type Group } from "@/components/LabShell";
import {
  compose, FONTS as BASE_FONTS, FRAME_OPTS, loadFont, makeCanvas,
  type FontDef, type FramefitState
} from "./engine";
import { toSVG } from "./svg";
import { DEFAULTS, DRAFT, PRESETS, PREVIEW } from "./config";

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);

function exportName(C: FramefitState, ext: string, size?: number) {
  const base = (C.text.split("\n")[0] || "framefit").replace(/[^\w가-힣-]+/g, "_").slice(0, 28);
  return `${base}_${C.frame}${size ? "_" + size : ""}.${ext}`;
}

export default function Framefit() {
  const [state, setState] = useState<FramefitState>(DEFAULTS);
  const [fonts, setFonts] = useState<FontDef[]>(BASE_FONTS);
  const [meta, setMeta] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const userFontCount = useRef(0);

  /* 링크로 들어온 조합을 복원 */
  useEffect(() => { setState((s) => ({ ...s, ...readURL(DEFAULTS) })); }, []);

  const onChange = useCallback((patch: Partial<FramefitState>, draft: boolean) => {
    draftRef.current = draft;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  /* 그리기 — 드래그 중에는 저해상도 초안, 놓으면 고해상도 */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const S = draftRef.current ? DRAFT : PREVIEW;
      const t0 = performance.now();
      if (cv.width !== S) { cv.width = S; cv.height = S; }
      compose(cv, S, state, fonts, true);
      const lines = state.text.split("\n").filter((s) => s.trim()).length;
      setMeta(`${S}px · ${lines}줄 · ${(performance.now() - t0).toFixed(0)}ms`);
    });
  }, [state, fonts]);

  /* 웹폰트가 실제로 준비된 뒤 한 번 더 */
  useEffect(() => {
    let alive = true;
    Promise.all(BASE_FONTS.map((F) => loadFont(F, DEFAULTS.text)))
      .then(() => document.fonts.ready)
      .then(() => { if (alive) setState((s) => ({ ...s })); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const png = useCallback((ctx: Ctx<FramefitState>, mult: number) => {
    const S = PREVIEW * mult;
    const cv = makeCanvas(S);
    compose(cv, S, ctx.state, fonts, false);
    cv.toBlob((blob) => { if (blob) ctx.download(blob, exportName(ctx.state, "png", S)); }, "image/png");
  }, [fonts]);

  const groups: Group<FramefitState>[] = useMemo(() => [
    {
      label: "텍스트",
      controls: [{ t: "textarea", k: "text", rows: 2, hint: "줄바꿈 = 줄 나누기. 2줄 이상이면 프레임이 자동으로 분할됩니다." }]
    },
    {
      label: "프레임",
      controls: [
        { t: "icons", k: "frame", options: FRAME_OPTS },
        { t: "chips", presets: PRESETS }
      ]
    },
    {
      label: "레터폼",
      controls: [
        { t: "select", k: "font", options: fonts.map((f) => ({ value: f.id, label: f.label })) },
        {
          t: "file", label: "내 폰트 쓰기 (.ttf / .otf / .woff2)", accept: ".ttf,.otf,.woff,.woff2,font/*",
          onFile: async (file, ctx) => {
            try {
              const buf = await file.arrayBuffer();
              const n = ++userFontCount.current;
              const family = `FramefitUser${n}`;
              const ff = new FontFace(family, buf);
              await ff.load();
              document.fonts.add(ff);
              const def: FontDef = {
                id: `user${n}`,
                label: "내 폰트 · " + file.name.replace(/\.[^.]+$/, ""),
                css: `"${family}"`,
                weight: 400
              };
              setFonts((prev) => [...prev, def]);
              ctx.set({ font: def.id });
            } catch {
              ctx.toast("이 폰트 파일은 브라우저가 읽지 못했어요");
            }
          }
        },
        { t: "range", k: "weight", label: "굵기", min: 0, max: 0.13, step: 0.002, fmt: f3 },
        { t: "range", k: "fillX", label: "가로 채움", min: 0.45, max: 1, step: 0.01, fmt: f2 },
        { t: "range", k: "fillY", label: "세로 채움", min: 0.4, max: 1, step: 0.01, fmt: f2 },
        { t: "range", k: "track", label: "자간", min: -0.07, max: 0.25, step: 0.005, fmt: f3 },
        { t: "range", k: "lead", label: "줄간", min: 0, max: 0.16, step: 0.004, fmt: f3 }
      ]
    },
    {
      label: "왜곡",
      controls: [
        { t: "range", k: "warp", label: "왜곡 강도", min: 0, max: 1, step: 0.01, fmt: f2 },
        { t: "range", k: "curve", label: "곡률", min: 0, max: 1.6, step: 0.02, fmt: f2 },
        { t: "range", k: "divider", label: "분할선 기울기", min: -1, max: 1, step: 0.02, fmt: f2 }
      ]
    },
    {
      label: "아웃라인 · 입체",
      controls: [
        { t: "range", k: "out", label: "아웃라인 두께", min: 0, max: 0.035, step: 0.001, fmt: f3 },
        { t: "range", k: "depth", label: "그림자 깊이", min: 0, max: 0.07, step: 0.002, fmt: f3 },
        { t: "range", k: "angle", label: "그림자 각도", min: 0, max: 360, step: 1, fmt: (v) => v.toFixed(0) + "°" }
      ]
    },
    {
      label: "색",
      controls: [
        {
          t: "colors",
          items: [
            { k: "cFill", label: "채움" }, { k: "cOut", label: "선" },
            { k: "cShadow", label: "그림자" }, { k: "cBg", label: "배경" }
          ]
        },
        { t: "toggle", k: "transparent", label: "배경 투명 (PNG · SVG)" }
      ]
    },
    {
      label: "기타",
      controls: [
        { t: "toggle", k: "guides", label: "가이드 보기" },
        {
          t: "buttons",
          items: [
            {
              label: "랜덤 조합",
              run: (ctx) => {
                const r = (a: number, b: number) => a + Math.random() * (b - a);
                const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
                const dark = pick(["#17181d", "#1d2a4a", "#3a1f14", "#12281f", "#2b1533"]);
                const light = pick(["#f5f3ec", "#ffffff", "#ffe9c9", "#e6f0ff"]);
                ctx.set({
                  frame: pick(FRAME_OPTS).value, font: pick(fonts).id,
                  weight: r(0.005, 0.075), fillX: r(0.8, 1), fillY: r(0.82, 1),
                  track: r(-0.03, 0.09), lead: r(0.01, 0.09),
                  warp: r(0.6, 1), curve: r(0.5, 1.4), divider: r(-0.8, 0.8),
                  out: Math.random() < 0.5 ? 0 : r(0.006, 0.024),
                  depth: Math.random() < 0.5 ? 0 : r(0.012, 0.05), angle: r(0, 360),
                  cFill: dark, cOut: light, cShadow: dark, cBg: light
                });
              }
            },
            { label: "초기화", run: (ctx) => ctx.reset() }
          ]
        }
      ]
    }
  ], [fonts]);

  return (
    <LabShell<FramefitState>
      slug="framefit"
      title="Framefit Type Lab"
      tagline="글자를 프레임 안에 흘려 넣고 왜곡·아웃라인·입체 그림자까지 실시간으로 조작하는 레터링 실험실."
      defaults={DEFAULTS}
      state={state}
      onChange={onChange}
      groups={groups}
      canvasRef={canvasRef}
      meta={meta}
      actions={[
        {
          label: "SVG 저장", primary: true,
          run: (ctx) => {
            ctx.toast("윤곽선 추적 중…");
            setTimeout(() => {
              const svg = toSVG(ctx.state, fonts, PREVIEW);
              ctx.download(new Blob([svg], { type: "image/svg+xml" }), exportName(ctx.state, "svg"));
            }, 30);
          }
        },
        { label: "PNG 1×", run: (ctx) => png(ctx, 1) },
        { label: "2×", run: (ctx) => png(ctx, 2) },
        { label: "4×", run: (ctx) => png(ctx, 4) }
      ]}
    />
  );
}
