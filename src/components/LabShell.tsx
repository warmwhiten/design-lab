"use client";

/* =============================================================
   LabShell — 모든 실험실이 공유하는 셸 (컨트롤드 컴포넌트).
   상태는 각 실험실이 소유하고, 셸은 그리기 · URL 동기화 · 내보내기만 맡는다.
   ============================================================= */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LABS } from "@/labs";

export type Ctx<S> = {
  state: S;
  set: (patch: Partial<S>, draft?: boolean) => void;
  reset: () => void;
  canvas: HTMLCanvasElement | null;
  download: (blob: Blob, filename: string) => void;
  toast: (msg: string) => void;
};

export type Ctl<S> =
  | { t: "textarea"; k: keyof S & string; rows?: number; hint?: string }
  | { t: "range"; k: keyof S & string; label: string; min: number; max: number; step: number; fmt?: (v: number) => string }
  | { t: "select"; k: keyof S & string; label?: string; options: { value: string; label: string }[] }
  | { t: "file"; label: string; accept: string; onFile: (f: File, ctx: Ctx<S>) => void }
  | { t: "icons"; k: keyof S & string; options: { value: string; label: string; icon: string }[] }
  | { t: "chips"; presets: Record<string, Partial<S>> }
  | { t: "colors"; items: { k: keyof S & string; label: string }[] }
  | { t: "toggle"; k: keyof S & string; label: string }
  | { t: "buttons"; items: { label: string; primary?: boolean; run: (ctx: Ctx<S>) => void }[] };

export type Group<S> = { label: string; controls: Ctl<S>[] };

type Props<S extends Record<string, any>> = {
  slug: string;
  title: string;
  tagline: string;
  defaults: S;
  state: S;
  onChange: (patch: Partial<S>, draft: boolean) => void;
  groups: Group<S>[];
  actions: { label: string; primary?: boolean; run: (ctx: Ctx<S>) => void }[];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  meta?: string;
};

/* ---------- 상태 ↔ 쿼리스트링 ---------- */
export function readURL<S extends Record<string, any>>(defaults: S): Partial<S> {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, any> = {};
  for (const k of Object.keys(defaults)) {
    if (!q.has(k)) continue;
    const raw = q.get(k) as string;
    const d = defaults[k];
    if (typeof d === "number") { const v = parseFloat(raw); if (!Number.isNaN(v)) out[k] = v; }
    else if (typeof d === "boolean") out[k] = raw === "1" || raw === "true";
    else out[k] = raw;
  }
  return out as Partial<S>;
}

function writeURL<S extends Record<string, any>>(state: S, defaults: S) {
  const q = new URLSearchParams();
  for (const k of Object.keys(defaults)) {
    const v = state[k], d = defaults[k];
    if (v === d) continue;
    if (typeof d === "number") q.set(k, String(Math.round(v * 10000) / 10000));
    else if (typeof d === "boolean") q.set(k, v ? "1" : "0");
    else q.set(k, String(v));
  }
  const s = q.toString();
  /* 일부 샌드박스는 replaceState 를 막는다 — 실패해도 도구는 계속 동작해야 한다 */
  try {
    window.history.replaceState(null, "", s ? `${window.location.pathname}?${s}` : window.location.pathname);
  } catch { /* noop */ }
}

export default function LabShell<S extends Record<string, any>>({
  slug, title, tagline, defaults, state, onChange, groups, actions, canvasRef, meta
}: Props<S>) {
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(""), 1800);
  }, []);

  const download = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (blob.type.startsWith("image/")) setSaved(url);
    toast(`${filename} 저장`);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }, [toast]);

  const set = useCallback((patch: Partial<S>, draft = false) => onChange(patch, draft), [onChange]);
  const reset = useCallback(() => onChange({ ...defaults }, false), [onChange, defaults]);

  const ctx: Ctx<S> = { state, set, reset, canvas: canvasRef.current, download, toast };

  useEffect(() => {
    const t = setTimeout(() => writeURL(state, defaults), 350);
    return () => clearTimeout(t);
  }, [state, defaults]);

  const share = () => {
    writeURL(state, defaults);
    const url = window.location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => toast("현재 조합 링크를 복사했어요"),
        () => window.prompt("이 주소를 복사하세요", url)
      );
    } else window.prompt("이 주소를 복사하세요", url);
  };

  return (
    <div className="shell">
      <header className="top">
        <Link className="brand" href="/"><span className="dot" />design-lab</Link>
        <div className="sep" />
        <div className="lab-title">{title}</div>
        <p className="lab-tag">{tagline}</p>
        <div className="top-tools">
          <select
            className="sel" style={{ width: "auto" }} aria-label="실험실 전환" value={slug}
            onChange={(e) => { window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/lab/${e.target.value}/`; }}
          >
            {LABS.map((L) => (
              <option key={L.slug} value={L.slug} disabled={L.status === "soon" && L.slug !== slug}>
                {L.title}{L.status === "soon" ? " (준비 중)" : ""}
              </option>
            ))}
          </select>
          <button type="button" className="btn sm" onClick={share}>링크 복사</button>
        </div>
      </header>

      <div className="main">
        <div className="rail">
          {groups.map((g) => (
            <section className="grp" key={g.label}>
              <div className="grp-h">{g.label}</div>
              {g.controls.map((c, i) => <Control key={i} c={c} ctx={ctx} />)}
            </section>
          ))}
        </div>

        <div className="stage">
          <div className="canvas-wrap"><canvas ref={canvasRef} /></div>
          <div className="bar">
            {actions.map((x) => (
              <button key={x.label} type="button" className={"btn" + (x.primary ? " pri" : "")}
                onClick={() => x.run(ctx)}>{x.label}</button>
            ))}
            <span className="meta">{meta}</span>
          </div>
          <div className={"save-slot" + (saved ? " on" : "")}>
            {saved && <img src={saved} alt="내보낸 파일 미리보기" />}
            <div>
              <p><strong>다운로드가 막힌 환경</strong>이면 이 이미지를 길게 눌러(또는 우클릭) 저장하세요.</p>
              <button type="button" className="btn sm" onClick={() => setSaved(null)}>닫기</button>
            </div>
          </div>
        </div>
      </div>

      <div className={"toast" + (msg ? " on" : "")} role="status">{msg}</div>
    </div>
  );
}

/* ---------- 컨트롤 ---------- */
function Control<S extends Record<string, any>>({ c, ctx }: { c: Ctl<S>; ctx: Ctx<S> }) {
  const { state, set } = ctx;

  switch (c.t) {
    case "textarea":
      return (
        <>
          <textarea className="ta" rows={c.rows ?? 2} spellCheck={false} value={state[c.k]}
            aria-label="텍스트"
            onChange={(e) => set({ [c.k]: e.target.value } as Partial<S>)} />
          {c.hint && <p className="hint">{c.hint}</p>}
        </>
      );

    case "range": {
      const fmt = c.fmt ?? ((v: number) => v.toFixed(2));
      return (
        <div className="ctl">
          <span className="ctl-l">{c.label}</span>
          <span className="ctl-v">{fmt(state[c.k])}</span>
          <input type="range" min={c.min} max={c.max} step={c.step} value={state[c.k]} aria-label={c.label}
            onChange={(e) => set({ [c.k]: parseFloat(e.target.value) } as Partial<S>, true)}
            onPointerUp={() => set({} as Partial<S>, false)}
            onKeyUp={() => set({} as Partial<S>, false)} />
        </div>
      );
    }

    case "select":
      return (
        <>
          {c.label && <p className="hint">{c.label}</p>}
          <select className="sel" value={state[c.k]} aria-label={c.label ?? c.k}
            onChange={(e) => set({ [c.k]: e.target.value } as Partial<S>)}>
            {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </>
      );

    case "file":
      return (
        <>
          <p className="hint">{c.label}</p>
          <input type="file" accept={c.accept} aria-label={c.label}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) c.onFile(f, ctx); }} />
        </>
      );

    case "icons":
      return (
        <div className="icons">
          {c.options.map((o) => (
            <button key={o.value} type="button" className="icon-b" title={o.label} aria-label={o.label}
              aria-pressed={state[c.k] === o.value}
              onClick={() => set({ [c.k]: o.value } as Partial<S>)}>
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <g className="sh" dangerouslySetInnerHTML={{ __html: o.icon }} />
              </svg>
            </button>
          ))}
        </div>
      );

    case "chips":
      return (
        <div className="chips">
          {Object.entries(c.presets).map(([name, patch]) => (
            <button key={name} type="button" className="chip"
              onClick={() => set(patch as Partial<S>)}>{name}</button>
          ))}
        </div>
      );

    case "colors":
      return (
        <div className="swatches">
          {c.items.map((it) => (
            <label className="sw" key={it.k}>
              <span>{it.label}</span>
              <input type="color" value={state[it.k]} aria-label={it.label}
                onChange={(e) => set({ [it.k]: e.target.value } as Partial<S>, true)}
                onBlur={() => set({} as Partial<S>, false)} />
            </label>
          ))}
        </div>
      );

    case "toggle":
      return (
        <label className="tog">
          <input type="checkbox" checked={!!state[c.k]}
            onChange={(e) => set({ [c.k]: e.target.checked } as Partial<S>)} />
          {" " + c.label}
        </label>
      );

    case "buttons":
      return (
        <div className="row">
          {c.items.map((it) => (
            <button key={it.label} type="button" className={"btn" + (it.primary ? " pri" : "")}
              onClick={() => it.run(ctx)}>{it.label}</button>
          ))}
        </div>
      );
  }
}
