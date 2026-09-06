"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LabShell, { readURL, type Ctx, type Group } from "@/components/LabShell";
import { loadFont, registerUserFont, type FontDef } from "@/lib/font";
import {
  compose, FONTS as BASE_FONTS, handlePoints, layoutGlyphs, makeCanvas, NO_NUDGE,
  parseNudges, parseShapes, pickItem, serializeNudges, serializeShapes, SHAPES, TOOLS,
  toLocalDelta, ROT_STALK,
  type BoxHandleId, type HandleId, type Nudge, type Shape, type WoodcutState
} from "./engine";
import { toSVG } from "./svg";
import { DEFAULTS, DRAFT, PRESETS, PREVIEW } from "./config";

/* 핸들의 로컬 방향과 커서 — 엔진의 HANDLE_DIR 과 짝을 이룬다 */
const HANDLE_DIR_UI: Record<BoxHandleId, [number, number]> = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0],
  se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0]
};
const CURSOR: Record<HandleId, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
  rot: "grab"
};
const clampDeg = (v: number) => Math.max(-70, Math.min(70, v));
/** 회전은 순환값이라 -180°~180° 로 접어 둔다 (슬라이더 범위와 맞춘다) */
const wrapDeg = (v: number) => ((v + 180) % 360 + 360) % 360 - 180;

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
  const [active, setActive] = useState<string | null>(null);
  const [skewMode, setSkewMode] = useState(false);
  type Drag = {
    id: string;
    mode: "move" | "rotate" | HandleId;
    x: number; y: number;          // 잡은 지점 (천분율)
    start: Sel;                    // 잡은 순간의 값
    w0: number; h0: number;        // 잡은 순간의 상자 크기
    rot0: number;                  // 회전(라디안)
    cx0: number; cy0: number;      // 잡은 순간의 중심 — 회전은 이 점을 축으로 돈다
    a0: number;                    // 중심에서 잡은 지점을 본 각도
  };
  const dragRef = useRef<Drag | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const skewRef = useRef(false);
  skewRef.current = skewMode;

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

  /* ---------- 선택된 항목 읽기 · 쓰기 ----------
     글자의 보정값은 nudge 문자열에, 도형은 shapes 문자열에 들어있다.
     둘 다 "위치(천분율) · 회전(°) · 크기 · 기울기(°)" 라는 같은 네 가지를 갖도록
     맞춰 두어서, 슬라이더와 드래그가 종류를 가리지 않고 같은 코드로 돌아간다. */
  const selKind = active ? (active[0] === "g" ? "glyph" : "shape") : null;

  type Sel = {
    x: number; y: number; rot: number;
    size: number; sizeY: number; skew: number; skewY: number;
  };

  const readSel = useCallback((s: WoodcutState, id: string | null): Sel | null => {
    if (!id) return null;
    if (id[0] === "g") {
      const n = parseNudges(s.nudge).get(Number(id.slice(1))) ?? NO_NUDGE;
      return { x: n.dx, y: n.dy, rot: n.rot, size: n.sc, sizeY: n.scy, skew: n.sk, skewY: n.sky };
    }
    const h = parseShapes(s.shapes)[Number(id.slice(1))];
    return h
      ? { x: h.x, y: h.y, rot: h.rot, size: h.s, sizeY: h.sy, skew: h.skew, skewY: h.skewY }
      : null;
  }, []);

  const writeSel = useCallback((id: string | null, patch: Partial<Sel>, draft: boolean) => {
    if (!id) return;
    const s = stateRef.current;
    if (id[0] === "g") {
      const i = Number(id.slice(1));
      const map = new Map(parseNudges(s.nudge));
      const cur: Nudge = map.get(i) ?? { ...NO_NUDGE };
      map.set(i, {
        dx: patch.x ?? cur.dx, dy: patch.y ?? cur.dy, rot: patch.rot ?? cur.rot,
        sc: patch.size ?? cur.sc, sk: patch.skew ?? cur.sk,
        scy: patch.sizeY ?? cur.scy, sky: patch.skewY ?? cur.sky
      });
      onChange({ nudge: serializeNudges(map) }, draft);
    } else {
      const i = Number(id.slice(1));
      const list = parseShapes(s.shapes);
      const cur = list[i];
      if (!cur) return;
      list[i] = {
        ...cur,
        x: patch.x ?? cur.x, y: patch.y ?? cur.y, rot: patch.rot ?? cur.rot,
        s: patch.size ?? cur.s, skew: patch.skew ?? cur.skew,
        sy: patch.sizeY ?? cur.sy, skewY: patch.skewY ?? cur.skewY
      };
      onChange({ shapes: serializeShapes(list) }, draft);
    }
  }, [onChange]);

  /* ---------- 활자 옮기기 ----------
     캔버스 위에서 글자·도형을 집어 끈다. Alt 를 누른 채 좌우로 끌면 회전.
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
    const layoutNow = () => {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 8;
      const pg = probe.getContext("2d") as CanvasRenderingContext2D;
      return layoutGlyphs(pg, 1000, stateRef.current, fonts).items;
    };

    /* 핸들은 화면에서 24px 는 잡혀야 한다. 캔버스는 축소돼 표시되므로
       화면 픽셀을 천분율로 환산해서 판정 반경을 잡는다. */
    const handleRadius = () => {
      const w = cv.getBoundingClientRect().width || 1;
      return Math.max(14, (24 / 2 / w) * 1000);
    };

    const findHandle = (p: { x: number; y: number }, items: ReturnType<typeof layoutNow>) => {
      const id = activeRef.current;
      if (!id) return null;
      const it = items.find((i) => i.id === id);
      if (!it) return null;
      const r = handleRadius();
      let best: { id: HandleId; d: number } | null = null;
      for (const q of handlePoints(it, 1000 * ROT_STALK)) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= r && (!best || d < best.d)) best = { id: q.id, d };
      }
      return best ? { item: it, handle: best.id } : null;
    };

    const begin = (id: string, mode: Drag["mode"], p: { x: number; y: number },
      it: { w: number; h: number; rot: number; cx: number; cy: number }) => {
      const s = readSel(stateRef.current, id);
      if (!s) return false;
      dragRef.current = {
        id, mode, x: p.x, y: p.y, start: s,
        w0: it.w, h0: it.h, rot0: it.rot, cx0: it.cx, cy0: it.cy,
        a0: Math.atan2(p.y - it.cy, p.x - it.cx)
      };
      return true;
    };

    /* 포인터가 이미 놓인 뒤라면 캡처는 던진다. 잡지 못해도 드래그 자체는
       계속돼야 하므로 삼킨다(해제 쪽과 같은 이유). */
    const capture = (e: PointerEvent) => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const down = (e: PointerEvent) => {
      const p = toNorm(e);
      const items = layoutNow();

      /* 핸들이 항목보다 먼저다 — 겹칠 때 조작이 우선 */
      const h = findHandle(p, items);
      if (h) {
        if (begin(h.item.id, h.handle, p, h.item)) {
          capture(e);
          e.preventDefault();
        }
        return;
      }

      const hit = pickItem(items, p.x, p.y);
      if (!hit) { setActive(null); return; }
      const mode: Drag["mode"] = (e.altKey || e.shiftKey) ? "rotate" : "move";
      if (begin(hit.id, mode, p, hit)) {
        setActive(hit.id);
        capture(e);
        e.preventDefault();
      }
    };

    const move = (e: PointerEvent) => {
      const p = toNorm(e);
      const d = dragRef.current;
      if (!d) {
        const items = layoutNow();
        const h = findHandle(p, items);
        cv.style.cursor = h ? CURSOR[h.handle] : (pickItem(items, p.x, p.y) ? "grab" : "default");
        return;
      }
      const gx = p.x - d.x, gy = p.y - d.y;

      /* 본체 드래그: 보조키를 끄는 동안 매번 봐서 도중에 회전으로 넘어갈 수 있다 */
      if (d.mode === "move" || d.mode === "rotate") {
        if (e.altKey || e.shiftKey || d.mode === "rotate") {
          writeSel(d.id, { rot: d.start.rot + gx * 0.24 }, true);
        } else {
          writeSel(d.id, { x: d.start.x + gx, y: d.start.y + gy }, true);
        }
        cv.style.cursor = "grabbing";
        return;
      }

      /* 회전 손잡이: 중심에서 본 각도의 변화를 그대로 각도에 더한다.
         한 프레임에 반 바퀴 넘게 튀는 일은 없으므로 차이를 (-180°,180°] 로
         감아 경계를 넘어가도 값이 뒤집히지 않게 한다. */
      if (d.mode === "rot") {
        const a = Math.atan2(p.y - d.cy0, p.x - d.cx0);
        let dd = ((a - d.a0) * 180) / Math.PI;
        dd = ((dd + 180) % 360 + 360) % 360 - 180;
        writeSel(d.id, { rot: wrapDeg(d.start.rot + dd) }, true);
        cv.style.cursor = "grabbing";
        return;
      }

      /* 핸들 드래그 — 화면 이동량을 항목의 로컬 축으로 되돌려 계산한다 */
      const L = toLocalDelta(d.rot0, gx, gy);
      const dir = HANDLE_DIR_UI[d.mode];
      const hw0 = d.w0 / 2, hh0 = d.h0 / 2;
      const corner = d.mode.length === 2;

      if (skewRef.current && !corner) {
        /* 기울이기: 위·아래 변을 가로로 끌면 가로 기울기, 좌·우 변을 세로로 끌면 세로 기울기 */
        if (dir[1] !== 0) {
          const k = (Math.atan2(dir[1] * L.x, hh0) * 180) / Math.PI;
          writeSel(d.id, { skew: clampDeg(d.start.skew + k) }, true);
        } else {
          const k = (Math.atan2(dir[0] * L.y, hw0) * 180) / Math.PI;
          writeSel(d.id, { skewY: clampDeg(d.start.skewY + k) }, true);
        }
        return;
      }

      /* 크기: 반대쪽 변을 고정한 채 늘린다 */
      let rw = 1, rh = 1;
      if (dir[0] !== 0) rw = Math.max(0.08, (d.w0 + dir[0] * L.x) / d.w0);
      if (dir[1] !== 0) rh = Math.max(0.08, (d.h0 + dir[1] * L.y) / d.h0);
      if (corner) { const k = (rw + rh) / 2; rw = k; rh = k; } // 모서리는 비율 유지

      /* 고정한 쪽이 제자리에 남도록 중심을 절반만큼 민다 */
      const shiftX = (dir[0] * (rw - 1) * hw0);
      const shiftY = (dir[1] * (rh - 1) * hh0);
      const cos = Math.cos(d.rot0), sin = Math.sin(d.rot0);
      writeSel(d.id, {
        size: Math.max(4, d.start.size * rw),
        sizeY: Math.max(8, (d.start.sizeY * rh) / rw),
        x: d.start.x + shiftX * cos - shiftY * sin,
        y: d.start.y + shiftX * sin + shiftY * cos
      }, true);
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
  }, [fonts, onChange, readSel, writeSel]);

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

  /* 고를 수 있는 항목 목록 — 도형이 아래에 깔리므로 먼저 놓는다 */
  const itemList = useMemo(() => {
    const shapes = parseShapes(state.shapes).map((h, i) => ({
      value: `s${i}`,
      label: `도형 ${i + 1} · ${SHAPES.find((x) => x.kind === h.kind)?.label ?? h.kind}`
    }));
    const chars = state.text.split("\n").map((s) => s.trim()).filter(Boolean).join("");
    const glyphs = [...chars].map((ch, i) => ({ value: `g${i}`, label: `글자 ${i + 1} · ${ch}` }));
    return [...shapes, ...glyphs];
  }, [state.shapes, state.text]);

  /* 선택된 도형의 색·선 읽기 쓰기 */
  const selShape = (s: WoodcutState): Shape | null =>
    active && active[0] === "s" ? parseShapes(s.shapes)[Number(active.slice(1))] ?? null : null;

  const patchShape = useCallback((patch: Partial<Shape>, draft = false) => {
    if (!active || active[0] !== "s") return;
    const list = parseShapes(stateRef.current.shapes);
    const i = Number(active.slice(1));
    if (!list[i]) return;
    list[i] = { ...list[i], ...patch };
    onChange({ shapes: serializeShapes(list) }, draft);
  }, [active, onChange]);

  const addShape = useCallback((kind: Shape["kind"], ctx: Ctx<WoodcutState>) => {
    const list = parseShapes(ctx.state.shapes);
    /* 넣을 때마다 살짝 어긋나게 놓아 먼저 넣은 것에 완전히 겹치지 않게 한다 */
    const off = (list.length % 5) * 26;
    list.push({
      kind, x: 500 + off, y: 500 + off, s: 200, rot: 0, skew: 0,
      fill: ctx.state.cInk, stroke: null, sw: 0, sy: 100, skewY: 0
    });
    onChange({ shapes: serializeShapes(list) }, false);
    setActive(`s${list.length - 1}`);
  }, [onChange]);

  const groups: Group<WoodcutState>[] = useMemo(() => [
    {
      label: "글자",
      controls: [
        { t: "textarea", k: "text", rows: 2, hint: "줄바꿈으로 여러 줄. 캔버스에서 글자·도형을 집으면 조작 핸들이 붙습니다 — 모서리는 비율 유지, 변 가운데는 한 축, 윗변에서 뻗은 둥근 손잡이는 회전." },
        { t: "select", k: "font", label: "폰트", options: fonts.map((f) => ({ value: f.id, label: f.label })) },
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
      label: "배치",
      controls: [
        /* 캔버스 드래그만 있으면 포인터 없이는 배치를 못 한다.
           고르기와 옮기기를 네이티브 폼 컨트롤로도 열어 둔다. */
        {
          t: "vselect", label: "고를 항목 (캔버스에서 직접 집어도 됩니다)",
          options: [{ value: "", label: "선택 안 함" }, ...itemList],
          get: () => active ?? "",
          set: (v) => setActive(v || null)
        },
        {
          t: "vtoggle", label: "기울임 도구 — 변 핸들이 기울임으로 바뀝니다 (회전은 둥근 손잡이)",
          get: () => skewMode,
          set: (v) => setSkewMode(v)
        },
        /* 도형은 절대 좌표, 글자는 자동 배치에서의 이동량이라 범위가 다르다 */
        ...(active ? [
          {
            t: "vrange" as const, label: selKind === "shape" ? "가로 위치" : "가로 이동",
            min: selKind === "shape" ? 0 : -500, max: selKind === "shape" ? 1000 : 500, step: 1,
            get: (s: WoodcutState) => readSel(s, active)?.x ?? 0,
            set: (v: number) => writeSel(active, { x: v }, true),
            fmt: (v: number) => v.toFixed(0)
          },
          {
            t: "vrange" as const, label: selKind === "shape" ? "세로 위치" : "세로 이동",
            min: selKind === "shape" ? 0 : -500, max: selKind === "shape" ? 1000 : 500, step: 1,
            get: (s: WoodcutState) => readSel(s, active)?.y ?? 0,
            set: (v: number) => writeSel(active, { y: v }, true),
            fmt: (v: number) => v.toFixed(0)
          }
        ] : [])
      ]
    },
    {
      label: "도형 넣기",
      controls: [
        {
          t: "iconbuttons",
          options: SHAPES.map((h) => ({
            label: h.label, icon: h.icon,
            run: (ctx) => addShape(h.kind, ctx)
          }))
        }
      ]
    },
    ...(active
      ? [{
        label: selKind === "shape" ? "선택한 도형" : `선택한 글자 「${active}」`,
        controls: [
          {
            t: "vrange" as const, label: "크기",
            min: selKind === "shape" ? 20 : 25, max: selKind === "shape" ? 900 : 320, step: 1,
            get: (s: WoodcutState) => readSel(s, active)?.size ?? 100,
            set: (v: number) => writeSel(active, { size: v }, true),
            fmt: (v: number) => (selKind === "shape" ? (v / 10).toFixed(0) + "%" : v.toFixed(0) + "%")
          },
          {
            t: "vrange" as const, label: "세로 크기", min: 20, max: 400, step: 1,
            get: (s: WoodcutState) => readSel(s, active)?.sizeY ?? 100,
            set: (v: number) => writeSel(active, { sizeY: v }, true),
            fmt: (v: number) => v.toFixed(0) + "%"
          },
          {
            t: "vrange" as const, label: "가로 기울기", min: -70, max: 70, step: 1,
            get: (s: WoodcutState) => readSel(s, active)?.skew ?? 0,
            set: (v: number) => writeSel(active, { skew: v }, true),
            fmt: (v: number) => v.toFixed(0) + "°"
          },
          {
            t: "vrange" as const, label: "세로 기울기", min: -70, max: 70, step: 1,
            get: (s: WoodcutState) => readSel(s, active)?.skewY ?? 0,
            set: (v: number) => writeSel(active, { skewY: v }, true),
            fmt: (v: number) => v.toFixed(0) + "°"
          },
          {
            t: "vrange" as const, label: "회전", min: -180, max: 180, step: 1,
            get: (s: WoodcutState) => readSel(s, active)?.rot ?? 0,
            set: (v: number) => writeSel(active, { rot: v }, true),
            fmt: (v: number) => v.toFixed(0) + "°"
          },
          ...(selKind === "shape" ? [
            {
              t: "vtoggle" as const, label: "안쪽 채우기",
              get: (s: WoodcutState) => !!selShape(s)?.fill,
              set: (v: boolean, ctx: Ctx<WoodcutState>) =>
                patchShape({ fill: v ? ctx.state.cInk : null })
            },
            {
              t: "vtoggle" as const, label: "윤곽선",
              get: (s: WoodcutState) => !!selShape(s)?.stroke,
              set: (v: boolean, ctx: Ctx<WoodcutState>) =>
                patchShape({ stroke: v ? ctx.state.cInk : null, sw: v ? 14 : 0 })
            },
            {
              t: "vrange" as const, label: "선 두께", min: 2, max: 70, step: 1,
              get: (s: WoodcutState) => selShape(s)?.sw ?? 0,
              set: (v: number) => patchShape({ sw: v }, true),
              fmt: (v: number) => v.toFixed(0)
            },
            {
              t: "vcolors" as const,
              items: [
                {
                  label: "채움",
                  get: (s: WoodcutState) => selShape(s)?.fill ?? "#26231f",
                  set: (v: string) => patchShape({ fill: v }, true)
                },
                {
                  label: "선",
                  get: (s: WoodcutState) => selShape(s)?.stroke ?? "#26231f",
                  set: (v: string) => patchShape({ stroke: v, sw: selShape(stateRef.current)?.sw || 14 }, true)
                }
              ]
            }
          ] : []),
          {
            t: "buttons" as const,
            items: [
              {
                label: selKind === "shape" ? "이 도형 지우기" : "이 글자 되돌리기",
                run: (ctx: Ctx<WoodcutState>) => {
                  if (!active) return;
                  if (active[0] === "s") {
                    const list = parseShapes(ctx.state.shapes);
                    list.splice(Number(active.slice(1)), 1);
                    onChange({ shapes: serializeShapes(list) }, false);
                  } else {
                    const map = new Map(parseNudges(ctx.state.nudge));
                    map.delete(Number(active.slice(1)));
                    onChange({ nudge: serializeNudges(map) }, false);
                  }
                  setActive(null);
                }
              },
              { label: "선택 해제", run: () => setActive(null) }
            ]
          }
        ]
      } as Group<WoodcutState>]
      : []),
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
  ], [fonts, active, selKind, skewMode, itemList, addShape, patchShape, readSel, writeSel, onChange]);

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
      canvasLabel={
        `판화 질감으로 새긴 «${state.text.replace(/\n/g, " ") || "글자 없음"}»` +
        ` · ${TOOLS.find((t) => t.value === state.tool)?.label}` +
        (parseShapes(state.shapes).length ? ` · 도형 ${parseShapes(state.shapes).length}개` : "")
      }
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
