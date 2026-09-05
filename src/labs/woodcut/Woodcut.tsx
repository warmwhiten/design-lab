"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LabShell, { readURL, type Ctx, type Group } from "@/components/LabShell";
import { loadFont, registerUserFont, type FontDef } from "@/lib/font";
import {
  compose, FONTS as BASE_FONTS, layoutGlyphs, makeCanvas, parseNudges, pickGlyph,
  serializeNudges, TOOLS, type WoodcutState
} from "./engine";
import { toSVG } from "./svg";
import { DEFAULTS, DRAFT, PRESETS, PREVIEW } from "./config";

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const pct = (v: number) => Math.round(v * 100) + "%";

function exportName(C: WoodcutState, ext: string, size?: number) {
  const base = (C.text.split("\n")[0] || "woodcut").replace(/[^\w가-힣-]+/g, "_").slice(0, 28);
  return `${base}_${C.tool}${size ? "_" + size : ""}.${ext}`;
}

export default function Woodcut() {
  const [state, setState] = useState<WoodcutState>(DEFAULTS);
  const [fonts, setFonts] = useState<FontDef[]>(BASE_FONTS);
  const [meta, setMeta] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const userFontCount = useRef(0);
  const [active, setActive] = useState<number | null>(null);
  const dragRef = useRef<{ idx: number; x: number; y: number; dx: number; dy: number; rot: number; alt: boolean } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { setState((s) => ({ ...s, ...readURL(DEFAULTS) })); }, []);

  const onChange = useCallback((patch: Partial<WoodcutState>, draft: boolean) => {
    draftRef.current = draft;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  /* 드래그 중에는 저해상도 초안, 놓으면 고해상도 */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const S = draftRef.current ? DRAFT : PREVIEW;
      const t0 = performance.now();
      if (cv.width !== S) { cv.width = S; cv.height = S; }
      compose(cv, S, state, fonts, active);
      setMeta(`${S}px · 시드 ${state.seed} · ${(performance.now() - t0).toFixed(0)}ms`);
    });
  }, [state, fonts, active]);

  /* ---------- 활자 옮기기 ----------
     캔버스 위에서 글자를 집어 끈다. Alt 를 누른 채 좌우로 끌면 회전.
     보정값은 상태에 문자열로 들어가므로 링크 공유에도 그대로 실린다. */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    /* 화면 좌표 → 캔버스 크기와 무관한 천분율.
       드래그 중에는 초안 해상도로 캔버스가 줄어들기 때문에(1100 → 620)
       픽셀로 계산하면 도중에 좌표계가 바뀌어 이동량이 어긋난다. */
    const toNorm = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 1000, y: ((e.clientY - r.top) / r.height) * 1000 };
    };
    /** 천분율 좌표로 글자를 집는다 */
    const pickAt = (p: { x: number; y: number }) => {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 8;
      const pg = probe.getContext("2d") as CanvasRenderingContext2D;
      const S = 1000;
      const boxes = layoutGlyphs(pg, S, stateRef.current, fonts).boxes;
      return pickGlyph(boxes, p.x, p.y);
    };

    const down = (e: PointerEvent) => {
      const p = toNorm(e);
      const hit = pickAt(p);
      if (!hit) { setActive(null); return; }
      const cur = parseNudges(stateRef.current.nudge).get(hit.idx) ?? { dx: 0, dy: 0, rot: 0 };
      dragRef.current = { idx: hit.idx, x: p.x, y: p.y, dx: cur.dx, dy: cur.dy, rot: cur.rot, alt: e.altKey || e.shiftKey };
      setActive(hit.idx);
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const move = (e: PointerEvent) => {
      const p = toNorm(e);
      const d = dragRef.current;
      if (!d) {
        cv.style.cursor = pickAt(p) ? "grab" : "default";
        return;
      }
      const next = new Map(parseNudges(stateRef.current.nudge));
      /* 보조키는 누른 순간이 아니라 끄는 동안 매번 본다.
         끌다가 중간에 눌러도 회전으로 넘어가고, 떼면 다시 이동이다.
         둘 다 드래그 시작점에서 계산하므로 오가도 값이 튀지 않는다. */
      if (e.altKey || e.shiftKey || d.alt) {
        next.set(d.idx, { dx: d.dx, dy: d.dy, rot: d.rot + (p.x - d.x) * 0.24 });
      } else {
        next.set(d.idx, { dx: d.dx + (p.x - d.x), dy: d.dy + (p.y - d.y), rot: d.rot });
      }
      onChange({ nudge: serializeNudges(next) }, true);
      cv.style.cursor = "grabbing";
    };

    const up = (e: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      cv.style.cursor = "grab";
      try { cv.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      onChange({}, false); // 고해상도로 다시 그린다
    };

    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.style.touchAction = "none";
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
    };
  }, [fonts, onChange]);

  /* 웹폰트가 실제로 준비된 뒤 한 번 더 */
  useEffect(() => {
    let alive = true;
    Promise.all(BASE_FONTS.map((F) => loadFont(F, DEFAULTS.text)))
      .then(() => document.fonts.ready)
      .then(() => { if (alive) setState((s) => ({ ...s })); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const png = useCallback((ctx: Ctx<WoodcutState>, mult: number) => {
    const S = PREVIEW * mult;
    const cv = makeCanvas(S);
    compose(cv, S, ctx.state, fonts);
    cv.toBlob((blob) => { if (blob) ctx.download(blob, exportName(ctx.state, "png", S)); }, "image/png");
  }, [fonts]);

  const groups: Group<WoodcutState>[] = useMemo(() => [
    {
      label: "글자",
      controls: [
        { t: "textarea", k: "text", rows: 2, hint: "줄바꿈으로 여러 줄. 캔버스에서 글자를 끌어 옮기고, Alt(또는 Shift) 를 누른 채 끌면 돌아갑니다." },
        { t: "select", k: "font", options: fonts.map((f) => ({ value: f.id, label: f.label })) },
        {
          t: "file", label: "내 폰트 쓰기 (.ttf / .otf / .woff2)", accept: ".ttf,.otf,.woff,.woff2,font/*",
          onFile: async (file, ctx) => {
            try {
              const def = await registerUserFont(file, "Woodcut", ++userFontCount.current);
              setFonts((prev) => [...prev, def]);
              ctx.set({ font: def.id });
              ctx.toast("폰트를 불러왔어요");
            } catch {
              ctx.toast("이 폰트 파일은 브라우저가 읽지 못했어요");
            }
          }
        },
        { t: "range", k: "size", label: "크기", min: 0.4, max: 0.96, step: 0.01, fmt: pct },
        { t: "range", k: "track", label: "자간", min: -0.09, max: 0.2, step: 0.005, fmt: f3 },
        { t: "range", k: "lead", label: "줄간", min: -0.1, max: 0.5, step: 0.01, fmt: f2 }
      ]
    },
    {
      label: "조각",
      controls: [
        { t: "icons", k: "tool", options: TOOLS.map((t) => ({ value: t.value, label: t.label, icon: t.icon })) },
        { t: "chips", presets: PRESETS },
        { t: "range", k: "toolSize", label: "조각도 크기", min: 0, max: 0.16, step: 0.002, fmt: f3 },
        { t: "range", k: "wobble", label: "손떨림", min: 0, max: 0.6, step: 0.01, fmt: f2 },
        { t: "range", k: "chatter", label: "칼자국", min: 0, max: 0.4, step: 0.01, fmt: f2 },
        { t: "range", k: "jitter", label: "글자 흔들림", min: 0, max: 0.14, step: 0.005, fmt: f3 }
      ]
    },
    {
      label: "잉크 · 종이",
      controls: [
        { t: "range", k: "ink", label: "잉크량", min: -0.16, max: 0.16, step: 0.005, fmt: f3 },
        { t: "range", k: "starve", label: "잉크 결손", min: 0, max: 0.75, step: 0.01, fmt: f2 },
        { t: "range", k: "fibre", label: "종이결", min: 0, max: 0.14, step: 0.005, fmt: f3 },
        { t: "colors", items: [{ k: "cInk", label: "잉크" }, { k: "cPaper", label: "종이" }] },
        { t: "toggle", k: "transparent", label: "종이 없이 (PNG · SVG 투명)" }
      ]
    },
    {
      label: "판",
      controls: [
        {
          t: "buttons",
          items: [
            {
              label: "다시 새기기",
              primary: true,
              run: (ctx) => ctx.set({ seed: Math.floor(Math.random() * 99999) })
            },
            {
              label: "배치 되돌리기",
              run: (ctx) => {
                if (!ctx.state.nudge) { ctx.toast("옮긴 글자가 없어요"); return; }
                setActive(null);
                ctx.set({ nudge: "" });
                ctx.toast("글자 배치를 초기 상태로");
              }
            },
            {
              label: "랜덤 조합",
              run: (ctx) => {
                const r = (a: number, b: number) => a + Math.random() * (b - a);
                const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
                ctx.set({
                  tool: pick(TOOLS).value,
                  toolSize: r(0.015, 0.1), ink: r(-0.08, 0.09),
                  wobble: r(0.1, 0.45), chatter: r(0.03, 0.28),
                  jitter: r(0, 0.09), starve: r(0.08, 0.5), fibre: r(0.02, 0.09),
                  seed: Math.floor(Math.random() * 99999),
                  cInk: pick(["#26231f", "#1e1c1a", "#2d3a6b", "#6b2320", "#1d3a2b", "#3a2140"]),
                  cPaper: pick(["#f1eee4", "#faf8f2", "#e8e2d2", "#f0ece0", "#eae6dc"])
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
    <LabShell<WoodcutState>
      slug="woodcut"
      title="Woodcut Type Lab"
      tagline="글자를 파고 잉크를 올려 찍는다. 조각도·잉크량·손떨림을 만지면 판화 레터링이 실시간으로 나온다."
      defaults={DEFAULTS}
      state={state}
      onChange={onChange}
      groups={groups}
      canvasRef={canvasRef}
      meta={meta}
      actions={[
        {
          label: "SVG 저장 (판)", primary: true,
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
        { label: "3×", run: (ctx) => png(ctx, 3) }
      ]}
    />
  );
}
