// Liquid cursor lab tooling: page-side helpers for deterministic trajectories and silhouette measurement.
// installHelpers() is serialised with toString() and evaluated in the lab page (window.__lc). It needs the engine's
// lab instrumentation: setFrozen, advance, feed, resetBody, readMask and readUniforms.
export function installHelpers() {
  const E = window.liquidCursorLab.engine, DT = 1000 / 120, H = (window.__lc = { t: 0 });
  // Freeze real-time integration; every later step is an exact 120 Hz frame with one synthetic mouse sample.
  H.begin = () => { E.setFrozen(true); if (!H.t) H.t = performance.now(); return 1; };
  // H.onFrame, when set, runs after every scripted frame (recorders for the droplet checks)
  H.feed = (x, y) => { H.t += DT; E.feed(x, y, H.t); E.advance(DT, DT); if (H.onFrame) H.onFrame(DT); };
  H.hold = (ms) => { let left = ms; while (left > 1e-6) { const h = Math.min(DT, left); E.advance(h, DT); left -= h; if (H.onFrame) H.onFrame(h); } H.t += ms; return 1; };
  // A pointer path from segments [{ dx, dy, v, ms, ramp }] (unit direction, px/s, duration, optional smoothstep ease-in
  // from rest in ms), shifted so it ends exactly at (x1, y1). One sample per frame, like a 120 Hz mouse.
  // An optional `turn` (radians) rotates the direction steadily over the segment (a rounded turn or an arc).
  H.points = (segs, x1, y1) => { // the path as absolute per-frame samples, and where it starts
    const pts = []; let x = 0, y = 0;
    for (const g of segs) {
      const nf = Math.round(g.ms / DT);
      for (let f = 1; f <= nf; f++) {
        const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1, v = g.v * k * k * (3 - 2 * k) / 1000;
        const a = (g.turn || 0) * f / nf, dx = g.dx * Math.cos(a) - g.dy * Math.sin(a), dy = g.dx * Math.sin(a) + g.dy * Math.cos(a);
        x += dx * v * DT; y += dy * v * DT; pts.push([x, y]);
      }
    }
    const ox = x1 - x, oy = y1 - y;
    return { start: [ox, oy], pts: pts.map(([px, py]) => [px + ox, py + oy]) };
  };
  H.path = (segs, x1, y1) => {
    const { start, pts } = H.points(segs, x1, y1);
    if (H.armed) H.ready(start[0], start[1]); else H.start(start[0], start[1]);
    for (const [px, py] of pts) H.feed(px, py);
    return pts.length;
  };
  // Phase 3 frame-by-frame stepping for captures: seq(frames) with frames = [[x, y] | null (pointer still)], then step()
  // advances one 120 Hz frame and reports the droplet and the body
  H.seq = (frames) => { H.frames = frames; H.fi = 0; return frames.length; };
  H.step = () => {
    const p = H.frames[H.fi++]; if (p) H.feed(p[0], p[1]); else H.hold(DT);
    const S = E.state, D = S.drop, d = D ? D.d : null, B = S.body;
    return { i: H.fi, state: d ? d.state : "", t: d ? d.t : 0, age: d ? d.age : 0, r: d ? d.r : 0, alpha: d ? d.alpha : 0, gap: d ? d.gap : 0, k: d ? d.k : 0,
      connected: d ? d.connected : false, neck: d ? d.neck : 0, x: d ? d.x : 0, y: d ? d.y : 0, vx: d ? d.vx : 0, vy: d ? d.vy : 0, bodyX: S.renderX, bodyY: S.renderY,
      stretch: B.stretch, layer: D ? D.layer : "", signal: D ? D.trig.signal : 0, events: D ? D.events : 0, cooldown: D ? D.cooldown : 0, done: H.fi >= H.frames.length,
      live: D ? D.live : 0, attached: D ? D.attachedNow : 0, suppressed: D ? D.suppressed : 0 };
  };
  // Phase 4: every live slot of the droplet pool (state, kind, position, size, opacity, drawing surface)
  H.pool = () => { const D = E.state.drop; return D ? D.slots.filter((s) => s.state !== "IDLE").map((s) => ({ slot: s.slot, id: s.id, state: s.state, kind: s.kind, cause: s.cause,
    x: s.x, y: s.y, r: s.r, r0: s.r0, alpha: s.alpha, vx: s.vx, vy: s.vy, age: s.age, life: s.life, layer: s.layer, tile: s.tile, absorbed: s.absorbed })) : []; };
  // Park the pointer at (x, y) with no velocity (a sample after a > 120 ms gap restarts velocity), let the position
  // settle, then reset the body: round, still, membrane clock at zero. Every scenario starts from this same state.
  H.start = (x, y) => { H.hold(200); H.feed(x, y); H.hold(200); E.resetBody(); };
  // Phase 3: like start, then hold long enough for the droplet trigger to arm (a real pointer resting before a flick)
  H.ready = (x, y) => { H.start(x, y); return H.hold(E.params.dropArmMs + 20); };
  // Settle at a point with the membrane alive (held ms after the reset).
  H.rest = (x, y, ms) => { H.start(x, y); return H.hold(ms); };
  // An ordinary human pointing movement: the minimum-jerk profile (Flash & Hogan, 1985) from (x0, y0) to (x1, y1) in ms.
  H.minJerk = (x0, y0, x1, y1, ms) => {
    if (H.armed) H.ready(x0, y0); else H.start(x0, y0);
    const n = Math.round(ms / DT);
    for (let f = 1; f <= n; f++) { const t = f / n, s = t * t * t * (10 - 15 * t + 6 * t * t); H.feed(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s); }
    return n;
  };
  // Sustained circular motion around (cx, cy): orbitStart parks on the circle, orbitRun advances it (speed eases in
  // over the first 120 ms of the orbit), so a strip can be captured between runs.
  H.orbitStart = (cx, cy, r) => { H.orb = { cx, cy, r, ang: 0, t: 0 }; if (H.armed) H.ready(cx + r, cy); else H.start(cx + r, cy); return 1; };
  H.orbitRun = (v, ms) => {
    const o = H.orb;
    for (let f = 0; f < Math.round(ms / DT); f++) {
      o.t += DT; const k = Math.min(1, o.t / 120); o.ang += v * k * k * (3 - 2 * k) / 1000 * DT / o.r;
      H.feed(o.cx + o.r * Math.cos(o.ang), o.cy + o.r * Math.sin(o.ang));
    }
    return 1;
  };

  // ---- Phase 3 mask measurements on the body canvas (device px)
  // connected pieces of liquid (alpha >= 50%, 4-connected, at least 3 px): 1 while attached, 2 once the bead is free
  H.components = () => {
    const m = E.readMask(), w = m.w, h = m.h, a = m.px, seen = new Uint8Array(w * h), stack = new Int32Array(w * h); let n = 0;
    for (let s0 = 0; s0 < w * h; s0++) {
      if (seen[s0] || a[s0 * 4 + 3] < 128) continue;
      let top = 0, size = 0; stack[top++] = s0; seen[s0] = 1;
      while (top) { const q = stack[--top], x = q % w, y = (q - x) / w; size++;
        for (const nq of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (nq >= 0 && !seen[nq] && a[nq * 4 + 3] >= 128) { seen[nq] = 1; stack[top++] = nq; } }
      if (size >= 3) n++;
    }
    return n;
  };
  // narrowest cross-section of the liquid between the body centre and the attached bud, measured across the attachment
  // direction (device px); 0 once the bridge has broken
  H.neck = () => {
    const m = E.readMask(), u = E.readUniforms(), w = m.w, h = m.h, a = m.px;
    if (!(u.uDrop[2] > 0)) return null;
    const A = (x, y) => { const i = Math.round(x - 0.5), j = Math.round(y - 0.5); return i < 0 || j < 0 || i >= w || j >= h ? 0 : a[(j * w + i) * 4 + 3] / 255; };
    const [cx, cy] = u.uCenter, bx = u.uDrop[0], by = u.uDrop[1], L = Math.hypot(bx - cx, by - cy), ux = (bx - cx) / L, uy = (by - cy) / L, px = -uy, py = ux;
    let minW = Infinity;
    for (let s = L * 0.5; s <= L; s += 0.5) {
      const ox = cx + ux * s, oy = cy + uy * s;
      if (A(ox, oy) < 0.5) return { width: 0, broken: true, lengthPx: L };
      let wv = 0.5; for (const sg of [1, -1]) for (let t = 0.5; t < 3 * u.uDrop[2] + 10; t += 0.5) { if (A(ox + px * t * sg, oy + py * t * sg) < 0.5) break; wv += 0.5; }
      minW = Math.min(minW, wv);
    }
    return { width: minW, broken: false, lengthPx: L };
  };

  // ---- silhouette measurement on the actual shader output (alpha of the mask, device px, GL window space)
  H.analyse = (o = {}) => {
    const m = E.readMask(), u = E.readUniforms(), e = E.state.effDpr, w = m.w, h = m.h, px = m.px;
    const g = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : px[(j * w + i) * 4 + 3] / 255);
    const A = (x, y) => { const fx = x - 0.5, fy = y - 0.5, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty; };
    const [cx, cy] = u.uCenter, R = u.uRadius, s = u.uStretch, c = u.uCompress, amp = u.uNoiseAmp;
    const phi = Math.atan2(u.uAxis[1], u.uAxis[0]), a = R * s, b = R * c;
    const N = o.n || 1440, K = o.k || 32, rMax = Math.max(a, b) + amp + 8, step = 0.2;
    const cross = (th, level) => { // outermost crossing of an alpha level along a ray from the centre
      const dx = Math.cos(th), dy = Math.sin(th); let pa = A(cx, cy), pr = 0, hit = NaN;
      for (let r = step; r <= rMax; r += step) { const v = A(cx + dx * r, cy + dy * r); if (pa >= level && v < level) hit = pr + (pa - level) / (pa - v) * (r - pr); pa = v; pr = r; }
      return hit;
    };
    const ellR = (th) => { const ca = Math.cos(th - phi), sa = Math.sin(th - phi); return 1 / Math.sqrt((ca / a) ** 2 + (sa / b) ** 2); };
    const r = new Float64Array(N), re = new Float64Array(N), en = new Float64Array(N), arc = new Float64Array(N + 1);
    for (let k = 0; k < N; k++) {
      const th = 2 * Math.PI * k / N, ri = ellR(th), rr = cross(th, 0.5);
      // the SDF displaces along the ellipse normal: project the radial error onto it
      const lx = ri * Math.cos(th - phi), ly = ri * Math.sin(th - phi), nx = lx / (a * a), ny = ly / (b * b);
      r[k] = rr; re[k] = ri; en[k] = (rr - ri) * (lx * nx + ly * ny) / (ri * Math.hypot(nx, ny));
    }
    for (let k = 0; k < N; k++) { const k1 = (k + 1) % N, t0 = 2 * Math.PI * k / N, t1 = t0 + 2 * Math.PI / N; arc[k + 1] = arc[k] + Math.hypot(re[k1] * Math.cos(t1) - re[k] * Math.cos(t0), re[k1] * Math.sin(t1) - re[k] * Math.sin(t0)); }
    const L = arc[N];
    // residual resampled at uniform arc length, so "k lobes" means k equal bumps along the outline, stretched or not
    const M = N, ea = new Float64Array(M), sectorOf = new Int8Array(M), kap = new Float64Array(M);
    for (let q = 0, k = 0; q < M; q++) {
      const sq = L * q / M; while (arc[k + 1] < sq) k++;
      const f = (sq - arc[k]) / Math.max(1e-9, arc[k + 1] - arc[k]); ea[q] = en[k] * (1 - f) + en[(k + 1) % N] * f;
      const th = 2 * Math.PI * (k + f) / N, rel = (((th - phi) % Math.PI) + Math.PI) % Math.PI, deg = rel * 180 / Math.PI;
      sectorOf[q] = deg < 30 || deg > 150 ? 1 : Math.abs(deg - 90) < 30 ? 2 : 0; // 1 tip, 2 flank
      const ri = ellR(th), x = ri * Math.cos(th - phi), y = ri * Math.sin(th - phi);
      kap[q] = a * b / Math.pow((a * a * y * y) / (b * b) + (b * b * x * x) / (a * a), 1.5); // ellipse curvature there
    }
    const re_ = [], im_ = [], amps = [];
    for (let k = 1; k <= K; k++) { let sr = 0, si = 0; for (let j = 0; j < M; j++) { const t = 2 * Math.PI * k * j / M; sr += ea[j] * Math.cos(t); si -= ea[j] * Math.sin(t); } re_.push(2 * sr / M); im_.push(2 * si / M); amps.push(2 * Math.hypot(sr, si) / M); }
    // k = 1 is a sub-pixel shift of the whole outline, not a shape: shape shares and the dominant harmonic use k >= 2
    const pow = amps.map((x, i) => (i ? x * x : 0)), tot = pow.reduce((x, y) => x + y, 0) || 1e-12;
    const order = amps.map((x, i) => [i + 1, x]).filter(([k]) => k >= 2).sort((p, q) => q[1] - p[1]);
    // local wavenumber of the residual on the tips vs the flanks (low-passed at K): about 1 when features have one size;
    // curvature change along the outline from the same series (K <= 24): dk = -e'' - k_ellipse^2 e, per mean curvature
    const de = new Float64Array(M), el = new Float64Array(M), dk = new Float64Array(M), KC = Math.min(K, 24), kMean = 2 * Math.PI / L;
    for (let j = 0; j < M; j++) {
      let v = 0, d = 0, v24 = 0, d2 = 0;
      for (let k = 1; k <= K; k++) {
        const t = 2 * Math.PI * k * j / M, w0 = 2 * Math.PI * k / L, cs = Math.cos(t), sn = Math.sin(t), p = re_[k - 1] * cs - im_[k - 1] * sn;
        v += p; d += -w0 * (re_[k - 1] * sn + im_[k - 1] * cs);
        if (k <= KC) { v24 += p; d2 += -w0 * w0 * p; }
      }
      el[j] = v; de[j] = d; dk[j] = (-d2 - kap[j] * kap[j] * v24) / kMean;
    }
    const kloc = (sec) => { let n = 0, dd = 0; for (let j = 0; j < M; j++) if (sectorOf[j] === sec) { n += el[j] * el[j]; dd += de[j] * de[j]; } return n > 1e-12 ? Math.sqrt(dd / n) : NaN; };
    let cmax = 0, csum = 0, peaks = 0;
    for (let j = 0; j < M; j++) { const d = dk[j]; cmax = Math.max(cmax, Math.abs(d)); csum += d * d; if (d > 0.15 && d >= dk[(j + M - 1) % M] && d > dk[(j + 1) % M]) peaks++; }
    // second moments of the alpha mask: orientation and elongation independent of the analysis above
    let m0 = 0, mx = 0, my = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = px[(j * w + i) * 4 + 3]; if (v) { m0 += v; mx += v * (i + 0.5); my += v * (j + 0.5); } }
    mx /= m0; my /= m0; let m20 = 0, m02 = 0, m11 = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = px[(j * w + i) * 4 + 3]; if (v) { const dx = i + 0.5 - mx, dy = j + 0.5 - my; m20 += v * dx * dx; m02 += v * dy * dy; m11 += v * dx * dy; } }
    const ori = 0.5 * Math.atan2(2 * m11, m20 - m02), tr = (m20 + m02) / 2, dt = Math.sqrt(((m20 - m02) / 2) ** 2 + m11 * m11);
    let maxAbs = 0, ss = 0, bad = 0; for (let j = 0; j < N; j++) { if (!Number.isFinite(en[j])) bad++; else { maxAbs = Math.max(maxAbs, Math.abs(en[j])); ss += en[j] * en[j]; } }
    const along = cross(phi, 0.5) + cross(phi + Math.PI, 0.5), across = cross(phi + Math.PI / 2, 0.5) + cross(phi - Math.PI / 2, 0.5);
    const aa = (th) => cross(th, 0.1) - cross(th, 0.9);
    // antialiasing without resampling: partially covered pixels on the pixel row / column through the centre, per edge
    // (only when the axis is horizontal, so that row and column are the tips and the flanks)
    const partial = (dx, dy) => { const i0 = Math.floor(cx), j0 = Math.floor(cy); let n = 0;
      for (let t = 0; t < rMax + 2; t++) { const v = g(i0 + dx * t, j0 + dy * t) * 255; if (v > 5 && v < 250) n++; } return n; };
    const edgePx = Math.abs(Math.sin(phi)) < 0.02 ? { tip: Math.max(partial(1, 0), partial(-1, 0)), flank: Math.max(partial(0, 1), partial(0, -1)) } : null;
    const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : x), css = (x) => r3(x / e);
    return {
      effDpr: e, radiusCss: css(R), stretch: r3(s), compression: r3(c), ampCss: css(amp), nonFinite: bad,
      meanRadiusCss: css(r.reduce((x, y) => x + y, 0) / N), maxResidualCss: css(maxAbs), rmsResidualCss: css(Math.sqrt(ss / N)),
      // harmonic k of the residual along the outline; pct is relative to the rest-equivalent radius sqrt(a b)
      top: order.slice(0, 5).map(([k, x]) => ({ k, css: css(x), pct: r3(100 * x / Math.sqrt(a * b)) })),
      topShare: r3(pow[order[0][0] - 1] / tot), top3Share: r3(order.slice(0, 3).reduce((x, [k]) => x + pow[k - 1], 0) / tot),
      spectrumCss: amps.map(css), shiftCss: css(amps[0]),
      // curvature bumps in units of the outline's mean curvature: 0 is a perfect ellipse, 1 doubles the mean curvature
      curvature: { maxDev: r3(cmax), rmsDev: r3(Math.sqrt(csum / M)), peaksOver15pct: peaks },
      profile: o.profile ? Array.from({ length: 360 }, (_, i) => r3(ea[Math.floor(i * M / 360)] / e)) : undefined,
      aspect: { measured: r3(along / across), expected: r3(s / c), alongCss: css(along), acrossCss: css(across) },
      orientationDeg: r3(-ori * 180 / Math.PI), axisDeg: r3(-phi * 180 / Math.PI), elongation: r3(Math.sqrt((tr + dt) / (tr - dt))),
      areaCss: r3(m0 / 255 / (e * e)), areaVsEllipse: r3(m0 / 255 / (Math.PI * a * b)),
      aaDevicePx: { tip: r3(aa(phi)), flank: r3(aa(phi + Math.PI / 2)) }, edgePartialPx: edgePx,
      tipFlankWavenumber: s > 1.15 ? r3(kloc(1) / kloc(2)) : null,
    };
  };
  return 1;
}
