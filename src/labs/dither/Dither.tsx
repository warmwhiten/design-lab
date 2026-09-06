"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LabShell, { readURL, type Ctx, type Group } from "@/components/LabShell";
import {
  ALGOS, PALETTES, activeAlgos, clearCache, compose, findPalette,
  gridCanvas, gridSize, makeCanvas, normalizeSource, sampleSource, shortName,
  type AlgoId, type DitherState, type Src
} from "./engine";
import { plates, toSVG } from "./svg";
import { DEFAULTS, DRAFT, PRESETS, PREVIEW } from "./config";

const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => Math.round(v * 100) + "%";
const px = (v: number) => v.toFixed(0) + "px";

const ALGO_OPTS = ALGOS.map((a) => ({ value: a.value, label: a.label }));

function exportName(C: DitherState, src: Src, ext: string, tail?: string) {
  const base = src.name.replace(/\.[^.]+$/, "").replace(/[^\w가-힣-]+/g, "_").slice(0, 28) || "dither";
  return `${base}_${C.algo}${tail ? "_" + tail : ""}.${ext}`;
}

/** 파일·붙여넣기·끌어놓기가 모두 여기로 모인다 */
async function readImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return normalizeSource(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Dither() {
  const [state, setState] = useState<DitherState>(DEFAULTS);
  const [src, setSrc] = useState<Src | null>(null);
  const [meta, setMeta] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const srcId = useRef(0);

  useEffect(() => { setState((s) => ({ ...s, ...readURL(DEFAULTS) })); }, []);

  /* 견본은 브라우저에서 그린다 — 내려받을 파일이 없으니 처음부터 바로 돌아간다 */
  useEffect(() => {
    setSrc({ cv: sampleSource(), id: ++srcId.current, name: "견본" });
  }, []);

  const onChange = useCallback((patch: Partial<DitherState>, draft: boolean) => {
    draftRef.current = draft;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const useSource = useCallback((cv: HTMLCanvasElement, name: string) => {
    clearCache();
    setSrc({ cv, id: ++srcId.current, name });
  }, []);

  /* 드래그 중에는 화면만 작게 — 격자는 그대로라 그림이 달라지지 않는다 */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !src) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const t0 = performance.now();
      const { cw, ch } = compose(cv, draftRef.current ? DRAFT : PREVIEW, state, src);
      const { gw, gh } = gridSize(src.cv.width, src.cv.height, state.pixel);
      setMeta(`격자 ${gw}×${gh} · 화면 ${cw}×${ch} · ${(performance.now() - t0).toFixed(0)}ms`);
    });
  }, [state, src]);

  /* 사진을 넣는 길을 세 갈래로 둔다 — 고르기 · 끌어놓기 · 붙여넣기.
     끌어놓기와 붙여넣기는 포인터·클립보드가 없으면 안 되므로,
     파일 고르기 컨트롤이 항상 남아 있어야 한다(키보드만으로도 넣을 수 있게). */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const mark = (color: string) => { cv.style.outline = color ? `3px dashed ${color}` : ""; };
    /* 여기서는 셸의 토스트에 손이 닿지 않는다. 읽지 못한 파일을 조용히 삼키면
       사용자는 자기가 잘못 놓은 줄 알고 다시 시도하므로, 테두리로라도 알린다. */
    const fail = () => { mark("#A32B22"); setTimeout(() => mark(""), 1200); };
    const take = (f: File, name: string) =>
      readImage(f).then((c) => useSource(c, name)).catch(fail);

    const over = (e: DragEvent) => { e.preventDefault(); mark("#1B3ECC"); };
    const leave = () => mark("");
    const drop = (e: DragEvent) => {
      e.preventDefault();
      mark("");
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) take(f, f.name);
      else if (e.dataTransfer?.files.length) fail();
    };
    const paste = (e: ClipboardEvent) => {
      const it = [...(e.clipboardData?.items ?? [])].find((x) => x.type.startsWith("image/"));
      const f = it?.getAsFile();
      if (f) take(f, f.name || "붙여넣은 사진");
    };

    cv.addEventListener("dragover", over);
    cv.addEventListener("dragleave", leave);
    cv.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      cv.removeEventListener("dragover", over);
      cv.removeEventListener("dragleave", leave);
      cv.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, [useSource]);

  const png = useCallback((ctx: Ctx<DitherState>, mult: number) => {
    if (!src) return;
    const cv = makeCanvas(8, 8);
    const { cw } = compose(cv, PREVIEW * mult, ctx.state, src);
    cv.toBlob((b) => { if (b) ctx.download(b, exportName(ctx.state, src, "png", String(cw))); }, "image/png");
  }, [src]);

  const P = findPalette(state.palette);
  const stepped = P.kind !== "list";     // 단계 수가 뜻을 갖는 팔레트인가
  const twoTone = P.kind === "ramp";     // 내 색 두 개를 쓰는가

  const groups: Group<DitherState>[] = useMemo(() => [
    {
      label: "사진",
      controls: [
        {
          t: "file", label: "사진 고르기 (캔버스에 끌어놓거나 붙여넣어도 됩니다)",
          accept: "image/*",
          onFile: async (file, ctx) => {
            try {
              useSource(await readImage(file), file.name);
              ctx.toast("사진을 불러왔어요");
            } catch {
              ctx.toast("이 이미지는 브라우저가 읽지 못했어요");
            }
          }
        },
        {
          t: "buttons",
          items: [{
            label: "견본으로 되돌리기",
            run: (ctx) => { useSource(sampleSource(), "견본"); ctx.toast("견본 그림으로"); }
          }]
        },
      ]
    },
    {
      label: "디더링",
      controls: [
        { t: "chips", presets: PRESETS },
        { t: "select", k: "algo", label: "알고리즘", options: ALGO_OPTS },
        { t: "range", k: "pixel", label: "점 크기", min: 1, max: 24, step: 1, fmt: px },
        { t: "range", k: "amount", label: "세기", min: 0, max: 1.4, step: 0.05, fmt: pct },
        {
          t: "toggle", k: "serpentine",
          label: "뱀 훑기 (오차 확산에서 줄무늬를 없앤다)"
        }
      ]
    },
    {
      /* 디더는 계조를 잡아먹는다 — 자르고 난 뒤에는 손댈 게 없어서
         앞손질이 도구의 절반이다. 그래서 따로 묶어 둔다. */
      label: "앞손질",
      controls: [
        { t: "range", k: "sharp", label: "선명하게", min: 0, max: 1.2, step: 0.02, fmt: f2 },
        { t: "range", k: "soften", label: "흐리게", min: 0, max: 1, step: 0.02, fmt: f2 },
        { t: "range", k: "bright", label: "밝기", min: -0.4, max: 0.4, step: 0.01, fmt: f2 },
        { t: "range", k: "contrast", label: "대비", min: -0.6, max: 0.9, step: 0.01, fmt: f2 },
        { t: "range", k: "gamma", label: "감마 (중간 톤)", min: 0.4, max: 2.4, step: 0.02, fmt: f2 }
      ]
    },
    {
      label: "색",
      controls: [
        {
          t: "select", k: "palette", label: "팔레트",
          options: PALETTES.map((p) => ({ value: p.id, label: p.label }))
        },
        ...(stepped
          ? [{
            t: "range" as const, k: "levels" as const, label: twoTone ? "단계 수" : "채널마다 단계",
            min: 2, max: 8, step: 1, fmt: (v: number) => v.toFixed(0) + "단계"
          }]
          : []),
        ...(twoTone
          ? [{ t: "colors" as const, items: [{ k: "cInk" as const, label: "잉크" }, { k: "cPaper" as const, label: "종이" }] }]
          : []),
        { t: "toggle", k: "invert", label: "명암 뒤집기" },
        { t: "toggle", k: "transparent", label: "종이 없이 (PNG · SVG 투명)" }
      ]
    },
    {
      label: "나란히 비교",
      controls: [
        {
          t: "select", k: "compare", label: "한 장을 칸으로 잘라 칸마다 다르게 찍는다",
          options: [
            { value: "off", label: "끄기 — 한 가지로만" },
            { value: "band", label: "세로 띠 셋" },
            { value: "quad", label: "네 칸" }
          ]
        },
        ...(state.compare !== "off"
          ? [
            { t: "select" as const, k: "a2" as const, label: "둘째 칸", options: ALGO_OPTS },
            { t: "select" as const, k: "a3" as const, label: "셋째 칸", options: ALGO_OPTS },
            ...(state.compare === "quad"
              ? [{ t: "select" as const, k: "a4" as const, label: "넷째 칸", options: ALGO_OPTS }]
              : []),
            { t: "toggle" as const, k: "labels" as const, label: "칸에 이름표 넣기" }
          ]
          : [])
      ]
    },
    {
      label: "조합",
      controls: [
        {
          t: "buttons",
          items: [
            {
              label: "무작위로 조합",
              primary: true,
              run: (ctx) => {
                const r = (a: number, b: number) => a + Math.random() * (b - a);
                const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
                ctx.set({
                  algo: pick(ALGOS.filter((a) => a.kind !== "plain")).value,
                  palette: pick(PALETTES).id,
                  pixel: Math.round(r(1, 9)),
                  levels: Math.round(r(2, 5)),
                  amount: r(0.7, 1.2),
                  contrast: r(0, 0.4), sharp: r(0, 0.5), gamma: r(0.8, 1.4),
                  seed: Math.floor(Math.random() * 99999)
                });
              }
            },
            { label: "초기화", run: (ctx) => ctx.reset() }
          ]
        }
      ]
    }
  ], [stepped, twoTone, state.compare, useSource]);

  const algoLabel = shortName(state.algo);
  /* 캔버스 자리는 미리 잡아 둔다 — 사진이 바뀔 때 레이아웃이 덜컹거리지 않게 */
  const grid = src ? gridSize(src.cv.width, src.cv.height, state.pixel) : null;

  return (
    <LabShell<DitherState>
      slug="dither"
      title="Dither Studio"
      tagline="사진의 색을 몇 개로 줄이고, 잃어버린 계조를 점으로 되돌린다. 알고리즘을 나란히 놓고 비교한다."
      defaults={DEFAULTS}
      state={state}
      onChange={onChange}
      groups={groups}
      canvasRef={canvasRef}
      meta={meta}
      aspect={grid ? `${grid.gw} / ${grid.gh}` : "4 / 3"}
      canvasLabel={
        `«${src?.name ?? "사진"}» 을 ${algoLabel} 로 디더링` +
        ` · ${findPalette(state.palette).label}` +
        (state.compare !== "off"
          ? ` · ${activeAlgos(state).map(shortName).join(" / ")} 비교`
          : "")
      }
      actions={[
        {
          label: "SVG 저장 (판)", primary: true,
          run: (ctx) => {
            if (!src) return;
            ctx.toast("네모를 합치는 중…");
            setTimeout(() => {
              const { svg, rects } = toSVG(ctx.state, src);
              const n = plates(ctx.state, src).length;
              ctx.download(new Blob([svg], { type: "image/svg+xml" }), exportName(ctx.state, src, "svg"));
              ctx.toast(
                `판 ${n}장 · 네모 ${rects.toLocaleString("ko-KR")}개` +
                (ctx.state.compare !== "off" ? " (비교는 화면에서만, SVG 는 첫째 칸 기준)" : "")
              );
            }, 30);
          }
        },
        { label: "PNG 1×", run: (ctx) => png(ctx, 1) },
        { label: "2×", run: (ctx) => png(ctx, 2) },
        {
          label: "격자 그대로",
          run: (ctx) => {
            if (!src) return;
            const cv = gridCanvas(ctx.state, src);
            cv.toBlob((b) => {
              if (b) ctx.download(b, exportName(ctx.state, src, "png", `${cv.width}x${cv.height}`));
            }, "image/png");
          }
        }
      ]}
    />
  );
}
