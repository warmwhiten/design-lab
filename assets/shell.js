/* =============================================================
   LabShell — 모든 실험실이 공유하는 셸
     · 상단 바(실험실 전환 메뉴 포함) / 컨트롤 레일 / 스테이지 / 내보내기 바
     · 선언형 컨트롤 스펙 → DOM 자동 생성
     · 상태 ↔ URL 쿼리스트링 동기화 (링크로 조합 공유)
     · 드래그 중 저해상도 초안, 놓으면 고해상도 렌더
     · 다운로드 + 샌드박스 폴백
   ============================================================= */
window.LabShell = (function () {
  "use strict";

  var api = {};
  var state = {};
  var defaults = {};
  var cfg = null;
  var els = {};
  var queued = false, draftNext = false, urlTimer = null;

  /* ---------- 유틸 ---------- */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("on");
    clearTimeout(els.toast._t);
    els.toast._t = setTimeout(function () { els.toast.classList.remove("on"); }, 1800);
  }

  /* ---------- URL 동기화 ---------- */
  function readURL() {
    var q = new URLSearchParams(location.search), out = {};
    Object.keys(defaults).forEach(function (k) {
      if (!q.has(k)) return;
      var raw = q.get(k), d = defaults[k];
      if (typeof d === "number") { var v = parseFloat(raw); if (!isNaN(v)) out[k] = v; }
      else if (typeof d === "boolean") out[k] = raw === "1" || raw === "true";
      else out[k] = raw;
    });
    return out;
  }
  function writeURL() {
    var q = new URLSearchParams();
    Object.keys(defaults).forEach(function (k) {
      var v = state[k], d = defaults[k];
      if (v === d) return;
      if (typeof d === "number") q.set(k, String(Math.round(v * 10000) / 10000));
      else if (typeof d === "boolean") q.set(k, v ? "1" : "0");
      else q.set(k, v);
    });
    var s = q.toString();
    /* 일부 샌드박스(iframe 미리보기 등)는 replaceState 를 막는다 — 실패해도 도구는 계속 동작해야 한다 */
    try { history.replaceState(null, "", s ? location.pathname + "?" + s : location.pathname); }
    catch (e) { /* noop */ }
  }
  function queueURL() { clearTimeout(urlTimer); urlTimer = setTimeout(writeURL, 350); }

  /* ---------- 렌더 스케줄 ---------- */
  function schedule(draft) {
    draftNext = !!draft;
    queueURL();
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      if (cfg && cfg.onChange) cfg.onChange(state, draftNext);
    });
  }

  /* ---------- 컨트롤 빌더 ---------- */
  var build = {
    textarea: function (c, g) {
      var t = el("textarea", "ta");
      t.rows = c.rows || 2;
      t.spellcheck = false;
      t.value = state[c.k];
      t.addEventListener("input", function () { state[c.k] = t.value; schedule(false); });
      g.appendChild(t);
      if (c.hint) g.appendChild(el("p", "hint", c.hint));
      return { set: function (v) { t.value = v; } };
    },

    range: function (c, g) {
      var w = el("div", "ctl");
      var lab = el("span", "ctl-l", c.label);
      var val = el("span", "ctl-v");
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = c.min; inp.max = c.max; inp.step = c.step;
      inp.value = state[c.k];
      inp.setAttribute("aria-label", c.label);
      var fmt = c.fmt || function (v) { return v.toFixed(2); };
      val.textContent = fmt(state[c.k]);
      inp.addEventListener("input", function () {
        state[c.k] = parseFloat(inp.value); val.textContent = fmt(state[c.k]); schedule(true);
      });
      inp.addEventListener("change", function () { schedule(false); });
      w.append(lab, val, inp);
      g.appendChild(w);
      return { set: function (v) { inp.value = v; val.textContent = fmt(v); } };
    },

    select: function (c, g) {
      if (c.label) g.appendChild(el("p", "hint", c.label));
      var s = el("select", "sel");
      function fill(options) {
        s.innerHTML = "";
        options.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o.value; op.textContent = o.label;
          s.appendChild(op);
        });
        s.value = state[c.k];
      }
      fill(c.options);
      s.addEventListener("change", function () {
        state[c.k] = s.value;
        if (c.onPick) c.onPick(s.value, api);
        schedule(false);
      });
      g.appendChild(s);
      return { set: function (v) { s.value = v; }, fill: fill };
    },

    file: function (c, g) {
      if (c.label) {
        var l = el("p", "hint", c.label);
        g.appendChild(l);
      }
      var f = document.createElement("input");
      f.type = "file"; f.accept = c.accept || "";
      f.addEventListener("change", function () {
        var file = f.files && f.files[0];
        if (file && c.onFile) c.onFile(file, api);
      });
      g.appendChild(f);
      return {};
    },

    icons: function (c, g) {
      var wrap = el("div", "icons");
      c.options.forEach(function (o) {
        var b = el("button", "icon-b");
        b.type = "button"; b.title = o.label;
        b.setAttribute("aria-label", o.label);
        b.dataset.v = o.value;
        b.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><g class="sh">' + o.icon + "</g></svg>";
        b.addEventListener("click", function () {
          state[c.k] = o.value;
          sync(wrap, o.value);
          schedule(false);
        });
        wrap.appendChild(b);
      });
      function sync(w, v) {
        Array.prototype.forEach.call(w.children, function (n) {
          n.setAttribute("aria-pressed", String(n.dataset.v === v));
        });
      }
      sync(wrap, state[c.k]);
      g.appendChild(wrap);
      return { set: function (v) { sync(wrap, v); } };
    },

    chips: function (c, g) {
      var wrap = el("div", "chips");
      Object.keys(c.presets).forEach(function (name) {
        var b = el("button", "chip", name);
        b.type = "button";
        b.addEventListener("click", function () { api.setState(c.presets[name], true); });
        wrap.appendChild(b);
      });
      g.appendChild(wrap);
      return {};
    },

    colors: function (c, g) {
      var wrap = el("div", "swatches");
      var inputs = {};
      c.items.forEach(function (it) {
        var l = el("label", "sw");
        l.appendChild(el("span", null, it.label));
        var i = document.createElement("input");
        i.type = "color"; i.value = state[it.k];
        i.setAttribute("aria-label", it.label);
        i.addEventListener("input", function () { state[it.k] = i.value; schedule(true); });
        i.addEventListener("change", function () { schedule(false); });
        l.appendChild(i);
        wrap.appendChild(l);
        inputs[it.k] = i;
      });
      g.appendChild(wrap);
      return { set: function (_, all) { c.items.forEach(function (it) { inputs[it.k].value = all[it.k]; }); } };
    },

    toggle: function (c, g) {
      var l = el("label", "tog");
      var i = document.createElement("input");
      i.type = "checkbox"; i.checked = !!state[c.k];
      i.addEventListener("change", function () { state[c.k] = i.checked; schedule(false); });
      l.append(i, document.createTextNode(" " + c.label));
      g.appendChild(l);
      return { set: function (v) { i.checked = !!v; } };
    },

    buttons: function (c, g) {
      var r = el("div", "row");
      c.items.forEach(function (it) {
        var b = el("button", "btn" + (it.primary ? " pri" : ""), it.label);
        b.type = "button";
        b.addEventListener("click", function () { it.run(api); });
        r.appendChild(b);
      });
      g.appendChild(r);
      return {};
    }
  };

  /* ---------- 상단 바 ---------- */
  function topBar() {
    var top = el("header", "top");
    var brand = el("a", "brand", '<span class="dot"></span>design-lab');
    brand.href = cfg.root + "index.html";
    top.appendChild(brand);
    top.appendChild(el("div", "sep"));
    top.appendChild(el("div", "lab-title", cfg.title));
    top.appendChild(el("p", "lab-tag", cfg.tagline));

    var tools = el("div", "top-tools");
    if (window.LABS) {
      var sel = el("select", "sel");
      sel.style.width = "auto";
      sel.setAttribute("aria-label", "실험실 전환");
      window.LABS.forEach(function (L) {
        var o = document.createElement("option");
        o.value = L.slug;
        o.textContent = L.title + (L.status === "soon" ? " (준비 중)" : "");
        o.disabled = L.status === "soon" && L.slug !== cfg.slug;
        sel.appendChild(o);
      });
      sel.value = cfg.slug;
      sel.addEventListener("change", function () {
        location.href = cfg.root + "lab/" + sel.value + "/";
      });
      tools.appendChild(sel);
    }
    var share = el("button", "btn sm", "링크 복사");
    share.type = "button";
    share.addEventListener("click", function () {
      writeURL();
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { toast("현재 조합 링크를 복사했어요"); },
          function () { prompt("이 주소를 복사하세요", url); }
        );
      } else prompt("이 주소를 복사하세요", url);
    });
    tools.appendChild(share);
    top.appendChild(tools);
    return top;
  }

  /* ---------- 마운트 ---------- */
  api.mount = function (config) {
    cfg = config;
    cfg.root = cfg.root || "../../";
    defaults = Object.assign({}, cfg.defaults);
    state = Object.assign({}, defaults, readURL());

    var shell = el("div", "shell");
    shell.appendChild(topBar());
    var main = el("div", "main");
    var rail = el("div", "rail");
    var setters = {};

    cfg.groups.forEach(function (grp) {
      var g = el("section", "grp");
      g.appendChild(el("div", "grp-h", grp.label));
      grp.controls.forEach(function (c) {
        var made = build[c.t](c, g);
        if (c.k) setters[c.k] = made;
        if (c.t === "colors") setters.__colors = made;
        if (c.t === "select" && c.k) setters[c.k] = made;
      });
      rail.appendChild(g);
    });

    var stage = el("div", "stage");
    var wrap = el("div", "canvas-wrap");
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = cfg.previewSize || 1200;
    wrap.appendChild(canvas);
    stage.appendChild(wrap);

    var bar = el("div", "bar");
    (cfg.exports || []).forEach(function (x) {
      var b = el("button", "btn" + (x.primary ? " pri" : ""), x.label);
      b.type = "button";
      b.addEventListener("click", function () { x.run(api); });
      bar.appendChild(b);
    });
    var meta = el("span", "meta");
    bar.appendChild(meta);
    stage.appendChild(bar);

    var slot = el("div", "save-slot");
    var img = document.createElement("img");
    img.alt = "내보낸 파일 미리보기";
    var side = el("div");
    side.appendChild(el("p", null,
      "<strong>다운로드가 막힌 환경</strong>이면 이 이미지를 길게 눌러(또는 우클릭) 저장하세요."));
    var close = el("button", "btn sm", "닫기");
    close.type = "button";
    close.addEventListener("click", function () { slot.classList.remove("on"); });
    side.appendChild(close);
    slot.append(img, side);
    stage.appendChild(slot);

    main.append(rail, stage);
    shell.appendChild(main);
    document.body.appendChild(shell);

    els.toast = el("div", "toast");
    document.body.appendChild(els.toast);

    els = Object.assign(els, { canvas: canvas, meta: meta, slot: slot, img: img, setters: setters });
    api.state = state;
    api.canvas = canvas;
    return api;
  };

  /* ---------- 공개 메서드 ---------- */
  api.setState = function (patch, resetToDefaults) {
    if (resetToDefaults) state = Object.assign(state, defaults);
    Object.assign(state, patch);
    api.state = state;
    Object.keys(els.setters).forEach(function (k) {
      var s = els.setters[k];
      if (s && s.set && k !== "__colors") s.set(state[k], state);
    });
    if (els.setters.__colors) els.setters.__colors.set(null, state);
    schedule(false);
  };
  api.setOptions = function (key, options) {
    var s = els.setters[key];
    if (s && s.fill) s.fill(options);
  };
  api.refresh = function (draft) { schedule(draft); };
  api.setMeta = function (text) { els.meta.textContent = text; };
  api.toast = toast;

  api.download = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    if (/^image\//.test(blob.type)) {
      els.img.src = url;
      els.slot.classList.add("on");
    }
    toast(filename + " 저장");
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  };

  return api;
})();
