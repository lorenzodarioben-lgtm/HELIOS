/* Liquid cursor lab: Mode C engineering readout. Builds its rows once and repaints text on a timer
   (CFG.debug.panelRefreshMs), never from the animation loop. Rates are measured, not estimated. */
"use strict";
(function () {
  const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const yes = (b) => (b ? "yes" : "no");
  const LD = () => window.LiquidDroplet;
  function describe(el) {
    if (!el) return "none";
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return label ? `${s} “${label}”` : s;
  }

  const ROWS = [
    ["Status", (S) => (S.active ? (S.suspended ? `suspended: ${S.suspended}` : "rendering") : `off: ${S.disabledReasons}`)],
    ["FPS inst / avg", (S) => (S.loopRunning ? `${f(S.instFps, 0)} / ${f(S.avgFps, 1)}` : "loop stopped")],
    ["Frame dt · worst", (S, x) => `${f(S.dtMs, 2)} ms · ${f(x.worst, 2)} ms`],
    ["Clamped frames", (S) => String(S.clampedFrames)],
    ["Draws / s", (S, x) => f(x.drawRate, 0)],
    // ---- Phases 3 and 4: droplets
    ["Droplets", (S, x) => (x.engine.dropletsOn() ? "on" : "off") + " · " + (S.dropletPreset || "–") + (S.dropNatural ? "" : " · natural emissions OFF")],
    // pool (Phase 4)
    ["Pool", (S) => { const D = S.drop; if (!D) return "–"; const cap = LD().capacity(S.params); return `${S.poolPreset || "–"} · capacity ${cap} · ${D.live} live (${D.attachedNow} attached, ${D.live - D.attachedNow} free, ${cap - D.live} slots open)`; }],
    // Phase 4.5 rich goo
    ["Rich goo", (S) => { const D = S.drop, P = S.params; if (!D) return "–"; if (!LD().rich(P, LD().capacity(P))) return "off (Phase 3 / Phase 4 rules)";
      return `budget ${D.tokens < 0 ? P.gooBudget : D.tokens.toFixed(2)}/${P.gooBudget} pieces (+1 per ${P.gooRefillMs} ms) · ${LD().scheduled(D)} scheduled · cooldown ${f(D.cooldown, 0)} ms · taper ${f(D.tp, 3)}`; }],
    ["Reference goo", (S) => { const D = S.drop, P = S.params; if (!D) return "–"; if (!LD().spineOn(P, LD().capacity(P))) return "off"; const Sp = D.spine, O = D.tailOut;
      return `${Sp.on ? "on" : "idle"} · energy ${f(Sp.E, 2)} (peak ${f(Sp.ePeak, 2)}) · tail ${f(Sp.L, 0)}/${f(P.spineLength, 0)} px · radii ${Array.from(O.r, (x) => f(x, 1)).join("/")} px · beads shed ${Sp.shed} · stress ${f(Sp.stress, 2)}/${f(Sp.th, 2)} · history ${Sp.hn} samples · material ${D.material}`; }],
    ["Connected goo", (S) => { const D = S.drop, P = S.params; if (!D) return "–"; if (!LD().wakeOn(P, LD().capacity(P))) return "off (droplet rules)"; const W = D.wake;
      return `tail ${W.state}${W.state !== "IDLE" ? ` ${f(W.age, 0)} ms · length ${f(W.len, 0)}/${f(W.lenMax, 0)} px · bulb r ${f(W.r[4], 1)} · neck ${f(100 * W.neck, 0)}% · strength ${f(W.strength, 2)} · ${W.cause}` : ""} · tails ${D.tails} (pinched ${D.pinches}, rejoined ${D.tailMerges}) · catches ${D.catches} · material ${D.material}`; }],
    ["Pieces by class", (S) => { const D = S.drop; if (!D) return "–"; const n = [0, 0, 0]; for (const s of D.slots) if (s.state !== "IDLE") n[LD().classOf(s.kind)]++;
      return `PRIMARY ${n[0]} · SECONDARY ${n[1]} · MICRO ${n[2]} · residuals ${D.residuals} (wake ${D.wakes}) · skipped ${D.skipped} · last source ${D.lastSource || "–"}`; }],
    ["Trigger strength", (S) => (S.drop ? `signal ${f(S.drop.trig.signal, 2)} · swing ${f(S.drop.trig.rImpulse, 2)}× · peak signal ${f(S.drop.peakSignal, 2)} · secondary ≥ ${f(S.params.gooSecSwing, 2)}×, micro ≥ ${f(S.params.gooMicroSwing, 2)}×` : "–")],
    ["Visible count", (S) => { const D = S.drop; if (!D || !D.liveFrames) return "–"; const h = D.liveHist, n = D.liveFrames;
      return `mean ${f(D.liveSum / n, 2)} · peak ${D.peakLive} · time with 0/1/2/3/4/5: ${Array.from(h, (x) => f(100 * x / n, 0)).join("/")} %`; }],
    ["Burst budget", (S) => { const D = S.drop; if (!D) return "–"; const since = D.clock - D.lastEmit; return `${D.burst}/${S.params.poolBurst} this burst · last emission ${since > 1e8 ? "never" : f(since, 0) + " ms ago"} · ${LD().recentCount(D, 2000)} in 2 s`; }],
    ["Follow-up gate", (S) => { const D = S.drop; if (!D) return "–"; const P = S.params, n = D.live; if (LD().capacity(P) <= 1) return "Phase 3: one droplet, then the cooldown";
      return n === 0 ? `first event: signal ≥ 1, cooldown ${f(D.cooldown, 0)} ms` : `signal ≥ ${f(1 + P.poolStep * n, 2)} and ${f(P.poolSpacingMs * (1 + P.poolSpacingGrowth * (n - 1)), 0)} ms since the last`; }],
    ["Satellite gate", (S) => { const D = S.drop; if (!D) return "–"; const P = S.params, since = D.clock - D.satLast;
      return P.poolSatellite > 0 ? `swing ≥ ${f(P.poolSatSwing, 2)}× · last ${since > 1e8 ? "never" : f(since, 0) + " ms ago"} (wait ${P.poolSatCooldownMs}) · ${D.satellites} so far` : "off"; }],
    ["Suppressed", (S) => { const D = S.drop; if (!D) return "–"; const w = D.why; return `${D.suppressed} · full ${w.full} · neck ${w.attached} · cooldown ${w.cooldown} · burst ${w.burst} · spacing ${w.spacing} · strength ${w.strength}${D.lastSuppress ? " · last: " + D.lastSuppress : ""}`; }],
    ["Active count", (S) => { const D = S.drop; return D ? `peak ${D.peakLive} · mean ${f(D.liveFrames ? D.liveSum / D.liveFrames : 0, 3)} over ${D.liveFrames} frames · merges ${D.merges} · seed 0x${(D.seed0 >>> 0).toString(16)}` : "–"; }],
    ...[0, 1, 2, 3, 4].map((i) => [`Slot ${i + 1}`, (S) => { const D = S.drop, d = D && D.slots[i]; if (!d) return "–"; if (d.state === "IDLE") return i < LD().capacity(S.params) ? "free" : "· (over capacity)";
      return `#${d.id} ${LD().CLASSES[LD().classOf(d.kind)]} (${d.kind}${d.src ? ", " + d.src : ""}) ${d.state} ${f(d.t, 0)} ms · ${d.released ? `age ${f(d.age, 0)}/${f(d.life, 0)}` : "attached"} · ${f(d.x, 0)},${f(d.y, 0)} · ${f(Math.hypot(d.vx, d.vy), 0)} px/s · r ${f(d.r, 1)} α ${f(d.alpha, 2)} · gap to body ${f(d.gap, 1)} px · ${d.cause} · ${d.layer}${d.tile >= 0 ? " " + (d.tile + 1) : ""}${d.kc > 0 ? " · cohesive" : ""}${d.absorbed ? " · merging" : ""}`; }]),
    ["Focus droplet", (S) => (S.drop ? `${S.drop.d.state}${S.drop.d.cause ? " · " + S.drop.d.cause : ""} · layer ${S.drop.layer}` : "unavailable")],
    ["Trigger signal", (S) => (S.drop ? `${f(S.drop.trig.signal, 2)} (fires at 1) · armed ${f(S.drop.trig.armedMs, 0)}/${S.params.dropArmMs} ms` : "–")],
    ["Swing / threshold", (S) => (S.drop ? `${f(S.drop.trig.impulse, 0)} / ${S.params.dropImpulse} px/s` : "–")],
    ["Accel peak / thr", (S) => (S.drop ? `${f(S.drop.trig.aPeak / 1000, 1)}k / ${f(S.params.dropAccel / 1000, 0)}k px/s²` : "–")],
    ["Jerk peak / thr", (S) => (S.drop ? `${f(S.drop.trig.jPeak / 1e6, 2)}M / ${f(S.params.dropJerk / 1e6, 2)}M px/s³` : "–")],
    ["Speed / min", (S) => (S.drop ? `${f(S.drop.trig.speed, 0)} / ${S.params.dropMinSpeed} px/s` : "–")],
    ["Direction change", (S) => (S.drop ? f(S.drop.trig.turnDeg, 0) + "°" : "–")],
    ["Cooldown left", (S) => (S.drop ? f(S.drop.cooldown, 0) + " ms" : "–")],
    ["Attachment dir", (S) => (S.drop && S.drop.d.state !== "IDLE" ? f(Math.atan2(S.drop.d.uy, S.drop.d.ux) * 180 / Math.PI, 0) + "°" : "–")],
    ["Neck", (S) => { const d = S.drop && S.drop.d; return d && d.state !== "IDLE" ? `${d.connected ? "connected" : "separate"} · width ${f(100 * d.neck, 0)}% · union ${f(d.k, 1)} px · gap ${f(d.gap, 1)} px` : "–"; }],
    ["Bead position", (S) => { const d = S.drop && S.drop.d; return d && d.state !== "IDLE" ? `${f(d.x)}, ${f(d.y)}` : "–"; }],
    ["Bead velocity", (S) => { const d = S.drop && S.drop.d; return d && d.released ? `${f(d.vx, 0)}, ${f(d.vy, 0)} (${f(Math.hypot(d.vx, d.vy), 0)} px/s)` : d && d.state !== "IDLE" ? "attached: rides the body" : "–"; }],
    ["Bead radius · alpha", (S) => { const d = S.drop && S.drop.d; return d && d.state !== "IDLE" ? `${f(d.r, 2)} px (r0 ${f(d.r0, 2)}) · ${f(d.alpha, 2)}` : "–"; }],
    ["Age · remaining", (S) => { const d = S.drop && S.drop.d; return d && d.released ? `${f(d.age, 0)} · ${f(d.life - d.age, 0)} ms` : d && d.state !== "IDLE" ? `attached ${f(d.t, 0)} ms in ${d.state}` : "–"; }],
    ["Bead tiles", (S) => { const L = S.bead; if (!L) return "not created"; let n = 0; for (const T of L.tiles) if (T.visible) n++;
      return `${n} of ${L.tiles.length} visible · ${L.backing}² px each · ${L.mode}${L.ok ? "" : " · " + (L.error || "no WebGL2")}`; }],
    ["Near canvas edge", (S) => (S.dropNearEdge || S.radiusClamped ? "YES" : "no")],
    ["Events · blocked", (S) => (S.drop ? `${S.drop.events} · ${S.drop.blocked} blocked frames` : "–")],
    ["Droplet step (EMA)", (S) => f(S.dropWorkMs, 4) + " ms"],
    ["Droplet draw (EMA)", (S) => f(S.dropDrawMs, 4) + " ms (layout, uniforms, tiles; CPU)"],
    ["Raw pointer", (S) => (S.hasPointer ? `${f(S.rawX)}, ${f(S.rawY)}` : "–")],
    ["Render pos", (S) => (S.hasPointer ? `${f(S.renderX)}, ${f(S.renderY)}` : "–")],
    ["Render lag", (S) => f(Math.hypot(S.rawX - S.renderX, S.rawY - S.renderY), 2) + " px"],
    ["Raw velocity", (S) => `${f(S.vx, 0)}, ${f(S.vy, 0)} px/s`],
    ["Raw speed", (S) => f(S.speed, 0) + " px/s"],
    ["Smoothed velocity", (S) => `${f(S.body.svx, 0)}, ${f(S.body.svy, 0)} px/s`],
    ["Smoothed speed", (S) => f(S.body.sspeed, 0) + " px/s"],
    ["Deformation · target", (S) => `${f(S.body.def.x, 3)} · ${f(S.body.amount, 3)}`],
    ["Stretch · compression", (S) => `${f(S.body.stretch, 3)} · ${f(S.body.compression, 3)} (area ${f(S.body.stretch * S.body.compression, 3)})`],
    ["Deformation axis", (S) => f(Math.atan2(S.body.ay, S.body.ax) * 180 / Math.PI, 1) + "°"],
    ["Recovery state", (S) => S.body.state],
    ["Hover scale · progress", (S) => `${f(S.body.hov.x, 3)} · ${f(S.body.hoverProgress, 2)}`],
    ["Click scale", (S) => f(S.body.clk.x, 3)],
    ["Radius", (S) => f(S.params.radius * S.body.radiusScale, 1) + " px" + (S.radiusClamped ? " (clamped to canvas)" : "")],
    ["Compression model", (S) => `stretch^-${f(S.params.compressionExponent, 2)}` + (S.params.compressionExponent === 1 ? " (exact area)" : " (not area-preserving)")],
    ["Membrane model", (S) => (S.params.membrane === "harmonic" ? `harmonic k ${S.params.noiseFrequency}` : `field ${f(S.params.noiseScale, 0)} px`)],
    ["Noise amp · life", (S) => `${f(S.body.noiseAmp, 2)} px · ${f(S.body.life, 2)}`],
    ["Presence", (S) => f(S.presence, 2)],
    ["Preset", (S) => S.preset || "–"],
    ["Frame work (EMA)", (S) => f(S.workMs, 3) + " ms"],
    ["Samples / s", (S, x) => `${f(x.sampleRate, 0)} (${f(x.eventRate, 0)} events, last ×${S.lastCoalesced})`],
    ["Coalesced events", (S) => yes(S.coalescedSupported)],
    ["Pointer type · buttons", (S) => `${S.pointerType || "–"} · ${S.buttons}`],
    ["DPR device / backing", (S) => `${f(S.dpr, 3)} / ${f(S.effDpr, 3)}`],
    ["Canvas CSS", (S) => `${S.cssSize} × ${S.cssSize} px`],
    ["Canvas backing", (S) => `${S.backingW} × ${S.backingH} px`],
    ["Viewport", (S) => `${S.vw} × ${S.vh} px`],
    ["WebGL2", (S) => (S.webgl2 ? "available" : `NO ${S.glError}`)],
    ["GL renderer", (S) => S.glRenderer || "–"],
    ["Mask / blend", (S, x) => `${S.mask} / ${x.blend}`],
    ["Pointer fine", (S) => yes(S.finePointer)],
    ["Reduced motion", (S) => yes(S.reducedMotion)],
    ["Forced colours", (S) => yes(S.forcedColors)],
    ["Interactive target", (S) => describe(S.interactiveEl)],
    ["Ignored target", (S) => describe(S.ignoreEl)],
    ["Visibility", (S) => S.visibility],
    ["Context", (S) => (location.protocol === "file:" ? "file://" : location.host) + (window.isSecureContext ? " · secure" : "")],
  ];

  function create(engine, panel, CFG) {
    const S = engine.state, dl = document.createElement("dl"), cells = [];
    ROWS.forEach(([k]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dl.append(dt, dd); cells.push(dd); });
    // trigger-signal sparkline (last 240 frames, the dashed line is the firing level), above the rows
    const spark = document.createElement("canvas"); spark.className = "spark"; spark.width = 376; spark.height = 36; spark.setAttribute("aria-hidden", "true");
    panel.append(spark, dl);
    const sctx = spark.getContext("2d");
    function drawSpark() {
      const D = S.drop; if (!D) return;
      const w = spark.width, h = spark.height, n = D.history.length, y = (v) => h - 2 - Math.min(2, v) / 2 * (h - 4);
      sctx.clearRect(0, 0, w, h); sctx.strokeStyle = "#9aa4ad"; sctx.setLineDash([3, 3]); sctx.beginPath(); sctx.moveTo(0, y(1)); sctx.lineTo(w, y(1)); sctx.stroke();
      sctx.setLineDash([]); sctx.strokeStyle = "#5fd1c6"; sctx.beginPath();
      for (let i = 0; i < n; i++) { const v = D.history[(D.hIndex + i) % n], px = i / (n - 1) * w; if (i) sctx.lineTo(px, y(v)); else sctx.moveTo(px, y(v)); }
      sctx.stroke();
    }
    const x = { worst: NaN, drawRate: NaN, sampleRate: NaN, eventRate: NaN, blend: "", engine };
    let t0 = performance.now(), d0 = S.draws, s0 = S.samples, e0 = S.moveEvents, timer = 0;
    function refresh() {
      const now = performance.now(), secs = (now - t0) / 1000;
      if (secs > 0) { x.drawRate = (S.draws - d0) / secs; x.sampleRate = (S.samples - s0) / secs; x.eventRate = (S.moveEvents - e0) / secs; }
      t0 = now; d0 = S.draws; s0 = S.samples; e0 = S.moveEvents;
      let w = 0; for (let i = 0; i < S.ftCount; i++) if (S.frameTimes[i] > w) w = S.frameTimes[i];
      x.worst = S.ftCount ? w : NaN;
      x.blend = engine.canvas.style.mixBlendMode || "normal";
      ROWS.forEach(([, fn], i) => { const v = fn(S, x); if (cells[i].textContent !== v) cells[i].textContent = v; });
      drawSpark();
    }
    return {
      show(on) {
        panel.hidden = !on; clearInterval(timer);
        if (on) { refresh(); timer = setInterval(refresh, CFG.debug.panelRefreshMs); }
      },
    };
  }
  window.LiquidCursorDebug = { create };
})();
