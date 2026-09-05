/* =============================================================
   Framefit Type Lab
   프레임 = "가로 위치 x에서 도형의 세로 구간 [위,아래]" 를 돌려주는 함수 하나.
   글자는 세로 1픽셀 열 단위로 잘라 그 구간에 맞춰 늘려 붙인다.
   덕분에 원형·웨이브·아치·삼각이 전부 같은 코드로 처리되고,
   새 프레임은 함수 하나만 추가하면 된다.
   ============================================================= */
(function () {
  "use strict";

  /* ---------- 1. 프레임 ---------- */
  var FRAME_OPTS = [
    { value: "circle", label: "원형", icon: '<circle cx="24" cy="24" r="20"/>' },
    { value: "wave", label: "웨이브", icon: '<path d="M2 30c8-16 14 4 22-6s14 4 22-8v14c-8 12-14-2-22 8S10 26 2 40z"/>' },
    { value: "blob", label: "블롭", icon: '<path d="M4 24c0-9 8-13 20-13s20 4 20 13-8 13-20 13S4 33 4 24z"/>' },
    { value: "arch", label: "아치", icon: '<path d="M4 42V26C4 14 13 6 24 6s20 8 20 20v16z"/>' },
    { value: "tri", label: "삼각", icon: '<path d="M3 6h42L24 44z"/>' },
    { value: "square", label: "사각", icon: '<rect x="4" y="6" width="40" height="36"/>' }
  ];

  function rawSpan(frame, x, C) {
    var d, s, A, c, h, dome, rise, yb, k;
    switch (frame) {
      case "circle":
        d = (x - 0.5) * 2;
        s = Math.sqrt(Math.max(0, 1 - d * d)) / 2;
        return [0.5 - s, 0.5 + s];
      case "wave":
        A = 0.17 * C.curve;
        c = 0.5 + A * Math.sin(Math.PI * 2 * x);
        h = 0.62;
        return [c - h / 2, c + h / 2];
      case "blob":
        A = 0.09 * C.curve;
        c = 0.5 + A * Math.sin(Math.PI * 2 * x);
        h = 0.46 + 0.34 * Math.sin(Math.PI * x) * Math.min(1.2, C.curve);
        return [c - h / 2, c + h / 2];
      case "arch":
        d = (x - 0.5) * 2;
        dome = Math.sqrt(Math.max(0, 1 - d * d));
        rise = 0.24 * C.curve;
        c = 0.55 - rise * dome;
        h = 0.56 * (1 + 0.30 * dome * Math.min(1.2, C.curve));
        return [c - h / 2, c + h / 2];
      case "tri":
        yb = Math.min(1, 2 * Math.min(x, 1 - x));
        k = Math.min(1, C.curve);
        return [0, 1 - (1 - yb) * k];
      default:
        return [0, 1];
    }
  }

  /* 왜곡 강도 = 평평한 정사각(0..1)과 프레임 도형 사이의 보간 */
  function span(x, C) {
    var s = rawSpan(C.frame, x, C), w = C.warp;
    return [s[0] * w, 1 + (s[1] - 1) * w];
  }

  function bandFns(i, n, C) {
    var seg = 1 / n, g = C.lead, fy = C.fillY;
    var sq = function (v) { return 0.5 + (v - 0.5) * fy; };
    var a = sq(i * seg + (i > 0 ? g / 2 : 0));
    var b = sq((i + 1) * seg - (i < n - 1 ? g / 2 : 0));
    var dv = function (x) { return C.divider * 0.11 * fy * Math.sin(Math.PI * (x - 0.5)); };
    return {
      top: function (x) { var s = span(x, C), f = a + (i > 0 ? dv(x) : 0); return s[0] + (s[1] - s[0]) * f; },
      bot: function (x) { var s = span(x, C), f = b + (i < n - 1 ? dv(x) : 0); return s[0] + (s[1] - s[0]) * f; }
    };
  }

  /* ---------- 2. 폰트 ---------- */
  var FONTS = [
    { id: "bowlby", label: "Bowlby One", css: '"Bowlby One"', weight: 400 },
    { id: "titan", label: "Titan One", css: '"Titan One"', weight: 400 },
    { id: "baloo", label: "Baloo 2", css: '"Baloo 2"', weight: 800 },
    { id: "fredoka", label: "Fredoka", css: '"Fredoka"', weight: 700 },
    { id: "lilita", label: "Lilita One", css: '"Lilita One"', weight: 400 },
    { id: "alfa", label: "Alfa Slab One", css: '"Alfa Slab One"', weight: 400 },
    { id: "bungee", label: "Bungee", css: '"Bungee"', weight: 400 },
    { id: "blackhan", label: "Black Han Sans (한글)", css: '"Black Han Sans"', weight: 400 },
    { id: "jua", label: "Jua (한글)", css: '"Jua"', weight: 400 }
  ];
  var userFontCount = 0;
  function fontOpts() { return FONTS.map(function (f) { return { value: f.id, label: f.label }; }); }
  function currentFont(C) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === C.font) return FONTS[i];
    return FONTS[0];
  }

  /* ---------- 3. 캔버스 유틸 ---------- */
  function mk(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  var scratch = {};
  function pool(name, w, h) {
    var c = scratch[name];
    if (!c) { c = scratch[name] = mk(w, h); }
    else if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    else { c.getContext("2d").clearRect(0, 0, w, h); }
    return c;
  }
  function tint(src, color, name) {
    var o = pool(name, src.width, src.height), g = o.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, o.width, o.height);
    g.globalCompositeOperation = "source-over";
    return o;
  }
  function dilate(src, r, name) {
    if (r < 0.6) return src;
    var o = pool(name, src.width, src.height), g = o.getContext("2d");
    var steps = Math.max(12, Math.min(28, Math.ceil(r * 1.6)));
    for (var i = 0; i < steps; i++) {
      var a = i / steps * Math.PI * 2;
      g.drawImage(src, Math.cos(a) * r, Math.sin(a) * r);
    }
    g.drawImage(src, 0, 0);
    return o;
  }

  /* ---------- 4. 한 줄을 소스 캔버스에 꽉 차게 ---------- */
  var SW = 2048, SH = 620;
  var srcA = mk(SW, SH), tmpA = mk(8, 8);

  function buildSource(line, C) {
    var g = srcA.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, SW, SH);
    var F = currentFont(C), size = 400;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    if ("letterSpacing" in g) g.letterSpacing = (C.track * size).toFixed(2) + "px";
    g.font = F.weight + " " + size + "px " + F.css + ", system-ui, sans-serif";

    var m = g.measureText(line), pad = C.weight * size;
    var bl = m.actualBoundingBoxLeft != null ? m.actualBoundingBoxLeft : 0;
    var br = m.actualBoundingBoxRight != null ? m.actualBoundingBoxRight : m.width;
    var asc = m.actualBoundingBoxAscent || size * 0.72;
    var dsc = m.actualBoundingBoxDescent || size * 0.02;
    var x0 = -bl - pad, x1 = br + pad, y0 = -asc - pad, y1 = dsc + pad;
    var bw = x1 - x0, bh = y1 - y0;
    if (!(bw > 1) || !(bh > 1)) return false;

    g.setTransform(SW / bw, 0, 0, SH / bh, -x0 * SW / bw, -y0 * SH / bh);
    g.fillStyle = "#fff"; g.strokeStyle = "#fff";
    g.lineJoin = "round"; g.lineCap = "round"; g.miterLimit = 2;
    if (pad > 0) { g.lineWidth = pad * 2; g.strokeText(line, 0, 0); }
    g.fillText(line, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  }

  /* ---------- 5. 마스크 (열 단위 수직 워프) ---------- */
  function buildMask(S, C) {
    var mask = pool("mask", S, S), mg = mask.getContext("2d");
    mg.imageSmoothingEnabled = true;
    mg.imageSmoothingQuality = "high";

    var lines = C.text.split("\n").map(function (s) { return s.replace(/\s+$/, ""); })
      .filter(function (s) { return s.length; });
    var bands = [];
    if (!lines.length) return { mask: mask, bands: bands };
    var n = lines.length;

    for (var i = 0; i < n; i++) {
      var fns = bandFns(i, n, C);
      var N = 512, hs = new Float64Array(N + 1), hmax = 0, k, x;
      for (k = 0; k <= N; k++) {
        x = k / N;
        hs[k] = Math.max(0, fns.bot(x) - fns.top(x));
        if (hs[k] > hmax) hmax = hs[k];
      }
      if (hmax <= 0.001) continue;
      var thr = hmax * 0.34, best = [0, -1], cur = -1;
      for (k = 0; k <= N; k++) {
        if (hs[k] >= thr) { if (cur < 0) cur = k; }
        else if (cur >= 0) { if (k - 1 - cur > best[1] - best[0]) best = [cur, k - 1]; cur = -1; }
      }
      if (cur >= 0 && N - cur > best[1] - best[0]) best = [cur, N];
      if (best[1] <= best[0]) continue;

      var xa = best[0] / N, xb = best[1] / N;
      var mid = (xa + xb) / 2, half = (xb - xa) / 2 * C.fillX;
      xa = mid - half; xb = mid + half;

      var cols = Math.max(2, Math.round((xb - xa) * S)), maxH = 0, c2;
      for (c2 = 0; c2 < cols; c2++) {
        x = xa + (xb - xa) * ((c2 + 0.5) / cols);
        maxH = Math.max(maxH, (fns.bot(x) - fns.top(x)) * S);
      }
      if (maxH < 2 || !buildSource(lines[i], C)) continue;

      var tH = Math.max(8, Math.min(1600, Math.ceil(maxH)));
      if (tmpA.width !== cols || tmpA.height !== tH) { tmpA.width = cols; tmpA.height = tH; }
      var tg = tmpA.getContext("2d");
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.clearRect(0, 0, cols, tH);
      tg.imageSmoothingEnabled = true;
      tg.imageSmoothingQuality = "high";
      tg.drawImage(srcA, 0, 0, SW, SH, 0, 0, cols, tH);

      for (c2 = 0; c2 < cols; c2++) {
        x = xa + (xb - xa) * ((c2 + 0.5) / cols);
        var t = fns.top(x) * S, b = fns.bot(x) * S, hh = b - t;
        if (hh <= 0.6) continue;
        mg.drawImage(tmpA, c2, 0, 1, tH, xa * S + c2 - 0.2, t, 1.4, hh);
      }
      bands.push(fns);
    }
    return { mask: mask, bands: bands };
  }

  /* 채움 / 외곽 / 그림자 세 개의 실루엣을 한 번에 만든다 (PNG·SVG 공용) */
  function buildLayers(S, C) {
    var r = buildMask(S, C);
    var outR = C.out * S;
    var sil = outR > 0.6 ? dilate(r.mask, outR, "dil") : r.mask;
    var shadow = null;
    var depth = C.depth * S;
    if (depth > 0.5) {
      var a = C.angle * Math.PI / 180;
      var dx = Math.cos(a) * depth, dy = Math.sin(a) * depth;
      var steps = Math.max(2, Math.min(40, Math.round(depth / 1.5)));
      shadow = pool("shadowU", S, S);
      var sg = shadow.getContext("2d");
      for (var k = 0; k <= steps; k++) sg.drawImage(sil, dx * k / steps, dy * k / steps);
    }
    return { mask: r.mask, sil: outR > 0.6 ? sil : null, shadow: shadow, bands: r.bands };
  }

  /* ---------- 6. 캔버스 합성 ---------- */
  function compose(target, S, C, withGuides) {
    var g = target.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    if (!C.transparent) { g.fillStyle = C.cBg; g.fillRect(0, 0, S, S); }

    var L = buildLayers(S, C);
    if (L.shadow) g.drawImage(tint(L.shadow, C.cShadow, "shadowT"), 0, 0);
    if (L.sil) g.drawImage(tint(L.sil, C.cOut, "outT"), 0, 0);
    g.drawImage(tint(L.mask, C.cFill, "fillT"), 0, 0);

    if (withGuides && C.guides) {
      g.save();
      g.globalAlpha = 0.85;
      g.lineWidth = Math.max(1, S / 700);
      g.setLineDash([S / 110, S / 110]);
      var trace = function (fn) {
        g.beginPath();
        for (var k = 0; k <= 240; k++) {
          var x = k / 240, y = fn(x) * S;
          if (k) g.lineTo(x * S, y); else g.moveTo(x * S, y);
        }
        g.stroke();
      };
      g.strokeStyle = "#1B3ECC";
      trace(function (x) { return span(x, C)[0]; });
      trace(function (x) { return span(x, C)[1]; });
      g.globalAlpha = 0.45;
      g.strokeStyle = "#D9930A";
      L.bands.forEach(function (b) { trace(b.top); trace(b.bot); });
      g.restore();
    }
    return L;
  }

  /* ---------- 7. SVG 내보내기 (마칭 스퀘어 윤곽 추적) ---------- */
  var PT = [
    function (x, y) { return [x + 0.5, y]; },      // T
    function (x, y) { return [x + 1, y + 0.5]; },  // R
    function (x, y) { return [x + 0.5, y + 1]; },  // B
    function (x, y) { return [x, y + 0.5]; }       // L
  ];
  var TABLE = {
    1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[1, 0]],
    5: [[3, 0], [1, 2]], 6: [[2, 0]], 7: [[3, 0]], 8: [[0, 3]],
    9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[0, 1]], 12: [[1, 3]],
    13: [[1, 2]], 14: [[2, 3]]
  };

  function traceRings(cv) {
    var w = cv.width, h = cv.height;
    var data = cv.getContext("2d").getImageData(0, 0, w, h).data;
    /* 캔버스 가장자리에 빈 1px 테두리를 둘러 모든 윤곽이 닫히도록 한다.
       (없으면 가장자리에 걸친 도형이 열린 선으로 남아 직선 아티팩트가 생긴다) */
    var W = w + 2, H = h + 2;
    var bin = new Uint8Array(W * H);
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        bin[(yy + 1) * W + (xx + 1)] = data[(yy * w + xx) * 4 + 3] > 128 ? 1 : 0;
      }
    }

    var segs = new Map();
    var key = function (pt) { return (Math.round(pt[0] * 2) + 4) * 1000000 + (Math.round(pt[1] * 2) + 4); };
    for (var y = 0; y < H - 1; y++) {
      for (var x = 0; x < W - 1; x++) {
        var a = bin[y * W + x], b = bin[y * W + x + 1],
            c = bin[(y + 1) * W + x + 1], d = bin[(y + 1) * W + x];
        var idx = a * 8 + b * 4 + c * 2 + d;
        if (idx === 0 || idx === 15) continue;
        var list = TABLE[idx];
        for (var s = 0; s < list.length; s++) {
          var P = PT[list[s][0]](x - 1, y - 1), Q = PT[list[s][1]](x - 1, y - 1);
          segs.set(key(P), [P, Q]);
        }
      }
    }

    var rings = [];
    while (segs.size) {
      var it = segs.keys().next().value;
      var seg = segs.get(it);
      segs.delete(it);
      var ring = [seg[0]], cur = seg[1], guard = 0;
      while (guard++ < 4000000) {
        var k = key(cur);
        if (k === it) break;
        var nx = segs.get(k);
        if (!nx) break;
        segs.delete(k);
        ring.push(cur);
        cur = nx[1];
      }
      if (ring.length > 6) rings.push(ring);
    }
    return rings;
  }

  function smoothRing(ring, passes) {
    var p = ring;
    for (var it = 0; it < passes; it++) {
      var n = p.length, q = new Array(n);
      for (var i = 0; i < n; i++) {
        var A = p[(i - 1 + n) % n], B = p[i], Cc = p[(i + 1) % n];
        q[i] = [A[0] * 0.25 + B[0] * 0.5 + Cc[0] * 0.25, A[1] * 0.25 + B[1] * 0.5 + Cc[1] * 0.25];
      }
      p = q;
    }
    return p;
  }

  function rdp(pts, tol) {
    var n = pts.length;
    if (n < 3) return pts;
    var keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    var stack = [[0, n - 1]];
    while (stack.length) {
      var seg = stack.pop(), s = seg[0], e = seg[1];
      if (e <= s + 1) continue;
      var ax = pts[s][0], ay = pts[s][1], bx = pts[e][0], by = pts[e][1];
      var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
      var maxD = -1, maxI = -1;
      for (var i = s + 1; i < e; i++) {
        var dist = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
        if (dist > maxD) { maxD = dist; maxI = i; }
      }
      if (maxD > tol) { keep[maxI] = 1; stack.push([s, maxI], [maxI, e]); }
    }
    var out = [];
    for (var j = 0; j < n; j++) if (keep[j]) out.push(pts[j]);
    return out;
  }

  function simplifyClosed(ring, tol) {
    var n = ring.length;
    var half = Math.floor(n / 2);
    var a = rdp(ring.slice(0, half + 1), tol);
    var b = rdp(ring.slice(half).concat([ring[0]]), tol);
    return a.concat(b.slice(1, b.length - 1));
  }

  function ringsToPath(cv, scale, tol) {
    var rings = traceRings(cv), out = [];
    for (var i = 0; i < rings.length; i++) {
      var r = simplifyClosed(smoothRing(rings[i], 3), tol);
      if (r.length < 3) continue;
      var d = "M";
      for (var j = 0; j < r.length; j++) {
        d += (j ? "L" : "") + (r[j][0] * scale).toFixed(2) + " " + (r[j][1] * scale).toFixed(2);
      }
      out.push(d + "Z");
    }
    return out.join("");
  }

  function toSVG(C, S) {
    var L = buildLayers(S, C);
    var scale = 1000 / S, tol = 0.75;
    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">');
    parts.push('<title>' + esc(C.text.replace(/\n/g, " ")) + '</title>');
    if (!C.transparent) parts.push('<rect width="1000" height="1000" fill="' + C.cBg + '"/>');
    if (L.shadow) parts.push('<path fill="' + C.cShadow + '" fill-rule="evenodd" d="' + ringsToPath(L.shadow, scale, tol) + '"/>');
    if (L.sil) parts.push('<path fill="' + C.cOut + '" fill-rule="evenodd" d="' + ringsToPath(L.sil, scale, tol) + '"/>');
    parts.push('<path fill="' + C.cFill + '" fill-rule="evenodd" d="' + ringsToPath(L.mask, scale, tol) + '"/>');
    parts.push("</svg>");
    return parts.join("\n");
  }
  function esc(s) {
    return s.replace(/[&<>]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]; });
  }

  /* ---------- 8. 셸에 연결 ---------- */
  var DEFAULTS = {
    text: "FRAME\nFIT", frame: "circle", font: "bowlby",
    weight: 0.026, fillX: 0.95, fillY: 0.97, track: 0, lead: 0.045,
    warp: 1, curve: 1, divider: 0.45,
    out: 0.011, depth: 0, angle: 48,
    cFill: "#17181d", cOut: "#f5f3ec", cShadow: "#17181d", cBg: "#ecebe4",
    transparent: false, guides: false
  };
  var PRESETS = {
    "서클 로고": { frame: "circle", text: "POMELO", warp: 1, curve: 1, weight: 0.03, fillX: 0.95, fillY: 0.96, lead: 0.03, out: 0, depth: 0, track: 0 },
    "2단 서클": { frame: "circle", text: "POMELO\nSTUDIO", warp: 1, curve: 1, divider: 0.55, weight: 0.026, fillX: 0.96, fillY: 0.97, lead: 0.045, out: 0.012, depth: 0 },
    "웨이브 스티커": { frame: "wave", text: "CREATES", warp: 1, curve: 1, weight: 0.045, fillX: 0.9, fillY: 0.8, out: 0.016, depth: 0.026, angle: 118, track: 0.01 },
    "블롭 배지": { frame: "blob", text: "소프트\n블롭", font: "blackhan", warp: 1, curve: 1.1, weight: 0.02, fillX: 0.9, fillY: 0.92, lead: 0.05, out: 0.014, depth: 0, track: 0.02 },
    "아치 배너": { frame: "arch", text: "WORKSHOP", warp: 1, curve: 1.1, weight: 0.035, fillX: 0.92, fillY: 0.9, out: 0, depth: 0.02, angle: 90 },
    "역삼각": { frame: "tri", text: "DOWN\nHILL\nGO", warp: 1, curve: 1, weight: 0.03, fillX: 0.94, fillY: 0.95, lead: 0.05, out: 0.01, depth: 0 }
  };

  var f3 = function (v) { return v.toFixed(3); };
  var f2 = function (v) { return v.toFixed(2); };
  var PREVIEW = 1200, DRAFT = 760;
  var shell;

  function exportName(C, ext, size) {
    var base = (C.text.split("\n")[0] || "framefit").replace(/[^\w가-힣-]+/g, "_").slice(0, 28);
    return base + "_" + C.frame + (size ? "_" + size : "") + "." + ext;
  }

  function loadFont(F, text) {
    var fam = F.css.replace(/"/g, "");
    return document.fonts.load(F.weight + ' 200px "' + fam + '"', (text || "") + "ABC가나다")
      .catch(function () { });
  }

  shell = LabShell.mount({
    slug: "framefit",
    title: "Framefit Type Lab",
    tagline: "글자를 프레임 안에 흘려 넣고 왜곡·아웃라인·입체 그림자까지 실시간으로 조작하는 레터링 실험실.",
    defaults: DEFAULTS,
    previewSize: PREVIEW,
    groups: [
      {
        label: "텍스트", controls: [
          { t: "textarea", k: "text", rows: 2, hint: "줄바꿈 = 줄 나누기. 2줄 이상이면 프레임이 자동으로 분할됩니다." }
        ]
      },
      {
        label: "프레임", controls: [
          { t: "icons", k: "frame", options: FRAME_OPTS },
          { t: "chips", presets: PRESETS }
        ]
      },
      {
        label: "레터폼", controls: [
          {
            t: "select", k: "font", options: fontOpts(),
            onPick: function (id, a) {
              var F = currentFont({ font: id });
              loadFont(F, a.state.text).then(function () { a.refresh(false); });
            }
          },
          {
            t: "file", label: "내 폰트 쓰기 (.ttf / .otf / .woff2)",
            accept: ".ttf,.otf,.woff,.woff2,font/*",
            onFile: function (file, a) {
              file.arrayBuffer().then(function (buf) {
                var fam = "FramefitUser" + (++userFontCount);
                var ff = new FontFace(fam, buf);
                return ff.load().then(function () {
                  document.fonts.add(ff);
                  FONTS.push({ id: "user" + userFontCount, label: "내 폰트 · " + file.name.replace(/\.[^.]+$/, ""), css: '"' + fam + '"', weight: 400 });
                  a.setOptions("font", fontOpts());
                  a.setState({ font: "user" + userFontCount });
                });
              }).catch(function () {
                a.toast("이 폰트 파일은 브라우저가 읽지 못했어요");
              });
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
        label: "왜곡", controls: [
          { t: "range", k: "warp", label: "왜곡 강도", min: 0, max: 1, step: 0.01, fmt: f2 },
          { t: "range", k: "curve", label: "곡률", min: 0, max: 1.6, step: 0.02, fmt: f2 },
          { t: "range", k: "divider", label: "분할선 기울기", min: -1, max: 1, step: 0.02, fmt: f2 }
        ]
      },
      {
        label: "아웃라인 · 입체", controls: [
          { t: "range", k: "out", label: "아웃라인 두께", min: 0, max: 0.035, step: 0.001, fmt: f3 },
          { t: "range", k: "depth", label: "그림자 깊이", min: 0, max: 0.07, step: 0.002, fmt: f3 },
          { t: "range", k: "angle", label: "그림자 각도", min: 0, max: 360, step: 1, fmt: function (v) { return v.toFixed(0) + "°"; } }
        ]
      },
      {
        label: "색", controls: [
          {
            t: "colors", items: [
              { k: "cFill", label: "채움" }, { k: "cOut", label: "선" },
              { k: "cShadow", label: "그림자" }, { k: "cBg", label: "배경" }
            ]
          },
          { t: "toggle", k: "transparent", label: "배경 투명 (PNG · SVG)" }
        ]
      },
      {
        label: "기타", controls: [
          { t: "toggle", k: "guides", label: "가이드 보기" },
          {
            t: "buttons", items: [
              {
                label: "랜덤 조합", run: function (a) {
                  var r = function (x, y) { return x + Math.random() * (y - x); };
                  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
                  var dark = pick(["#17181d", "#1d2a4a", "#3a1f14", "#12281f", "#2b1533"]);
                  var light = pick(["#f5f3ec", "#ffffff", "#ffe9c9", "#e6f0ff"]);
                  a.setState({
                    frame: pick(FRAME_OPTS).value, font: pick(FONTS).id,
                    weight: r(0.005, 0.075), fillX: r(0.8, 1), fillY: r(0.82, 1),
                    track: r(-0.03, 0.09), lead: r(0.01, 0.09),
                    warp: r(0.6, 1), curve: r(0.5, 1.4), divider: r(-0.8, 0.8),
                    out: Math.random() < 0.5 ? 0 : r(0.006, 0.024),
                    depth: Math.random() < 0.5 ? 0 : r(0.012, 0.05), angle: r(0, 360),
                    cFill: dark, cOut: light, cShadow: dark, cBg: light
                  });
                }
              },
              { label: "초기화", run: function (a) { a.setState({}, true); } }
            ]
          }
        ]
      }
    ],
    exports: [
      {
        label: "SVG 저장", primary: true, run: function (a) {
          a.toast("윤곽선 추적 중…");
          setTimeout(function () {
            var svg = toSVG(a.state, 1200);
            a.download(new Blob([svg], { type: "image/svg+xml" }), exportName(a.state, "svg"));
          }, 30);
        }
      },
      { label: "PNG 1×", run: function (a) { png(a, 1); } },
      { label: "2×", run: function (a) { png(a, 2); } },
      { label: "4×", run: function (a) { png(a, 4); } }
    ],
    onChange: function (C, draft) {
      var S = draft ? DRAFT : PREVIEW;
      var t0 = performance.now();
      if (shell.canvas.width !== S) { shell.canvas.width = shell.canvas.height = S; }
      compose(shell.canvas, S, C, true);
      var lines = C.text.split("\n").filter(function (s) { return s.trim(); }).length;
      shell.setMeta(S + "px · " + lines + "줄 · " + (performance.now() - t0).toFixed(0) + "ms");
    }
  });

  function png(a, mult) {
    var S = 1200 * mult, cv = mk(S, S);
    compose(cv, S, a.state, false);
    cv.toBlob(function (blob) { a.download(blob, exportName(a.state, "png", S)); }, "image/png");
  }

  /* 초기 렌더 → 폰트 로드 후 재렌더 */
  shell.refresh(false);
  Promise.all(FONTS.map(function (F) { return loadFont(F, shell.state.text); }))
    .then(function () { return document.fonts.ready; })
    .then(function () { shell.refresh(false); })
    .catch(function () { });
})();
