"""Static checks of the Observatory's liquid cursor (assets/observatory/liquid-cursor.js).

The production runtime is the visually approved "Reference goo · balanced" cursor of the liquid cursor lab
(labs/liquid-cursor at 9cce8a5). These checks guard its integration contract without a browser; the behavioural and
pixel checks live in labs/liquid-cursor/tools/check-observatory.mjs and verify-production.mjs.

    python -m unittest discover -s scripts/observatory -p "test_*.py"
"""
import re
import unittest
from pathlib import Path

OBS = Path(__file__).resolve().parents[2] / "assets" / "observatory"


def code_only(js):
    """The script without its comments (block and line), so wording in comments cannot satisfy or break a check."""
    js = re.sub(r"/\*[\s\S]*?\*/", "", js)
    return re.sub(r"(?m)^\s*//.*$|(?<=[;{},)])\s*//[^\n]*", "", js)


class LiquidCursorIntegration(unittest.TestCase):
    html = (OBS / "index.html").read_text(encoding="utf-8")
    css = (OBS / "styles.css").read_text(encoding="utf-8")
    js = (OBS / "liquid-cursor.js").read_text(encoding="utf-8")
    code = code_only(js)

    def test_loaded_once_after_the_app(self):
        tags = re.findall(r'<script src="([^"]+)"></script>', self.html)
        self.assertEqual(tags, ["data/bundle.js", "app.js", "liquid-cursor.js"])

    def test_classic_offline_script(self):
        self.assertTrue(self.js.lstrip().startswith("/*"))
        self.assertIn('"use strict";\n(function () {', self.js)
        # (the two XML namespace names of the hero's SVG snapshot are identifiers, never fetched)
        code = self.code.replace('"http://www.w3.org/2000/svg"', "").replace('"http://www.w3.org/1999/xhtml"', "")
        self.assertNotRegex(code, r"https?://|fetch\(|XMLHttpRequest|import\s*\(|\bimport\s+|\bexport\s+|@import|new Worker")

    def test_kill_switch_runs_before_anything_is_created(self):
        off = self.code.index('if (SW === "off")')
        self.assertLess(off, self.code.index("document.createElement"))
        self.assertLess(off, self.code.index("classList.toggle"))
        self.assertIn('QS.get("cursor")', self.code)

    def test_recording_mode_keeps_the_native_cursor(self):
        self.assertIn('QS.get("mode") === "recording" && SW !== "on"', self.code)

    def test_native_cursor_hidden_only_while_running_with_a_pointer(self):
        toggles = re.findall(r'classList\.toggle\("lc-hide-native", ([^)]*\))', self.code)
        self.assertEqual(toggles, ['S.active && S.hasPointer && S.pointerType !== "touch")'])
        self.assertIn('classList.remove("lc-active", "lc-hide-native")', self.code)  # every failure restores it

    def test_layers_never_take_input_and_sit_above_the_page(self):
        self.assertGreaterEqual(self.code.count('pointerEvents = "none"'), 2)  # the body canvas and the bead tiles
        self.assertGreaterEqual(self.code.count('mixBlendMode = "difference"'), 2)
        z = int(re.search(r"zIndex: (\d+),", self.code).group(1))
        page = max(int(v) for v in re.findall(r"z-index:\s*(\d+)", self.css))
        self.assertGreater(z, page)
        self.assertIn("document.body.appendChild(canvas)", self.code)

    def test_accessibility_fallbacks(self):
        for q in ("(pointer: fine)", "(prefers-reduced-motion: reduce)", "(forced-colors: active)"):
            self.assertIn(f'matchMedia("{q}")', self.code)
        self.assertIn('"webglcontextlost"', self.code)
        self.assertIn("catch (err) { fail(", self.code)

    def test_observer_only(self):
        # the only preventDefault calls are the three webglcontextlost handlers (required to get the context back)
        self.assertNotIn("preventDefault()", self.code.replace("e.preventDefault(); S.contextLost", "").replace("e.preventDefault(); L.ok", "").replace("e.preventDefault(); M.ok", "").replace("e.preventDefault(); state.ready", ""))
        self.assertNotIn("stopPropagation", self.code)
        self.assertNotRegex(self.code, r"keydown|keyup|keypress")
        for ev in ("pointermove", "pointerdown", "pointerup", "scroll"):
            self.assertRegex(self.code, rf'on\(window, "{ev}", \w+, \{{ capture: true, passive: true \}}\)')

    def test_media_safe_material(self):
        """Over artwork the same geometry is clear water with normal compositing: no inversion, blur, glow or shadow."""
        self.assertIn('media: "[data-cursor-media]"', self.code)
        fade = float(re.search(r"mediaFadeMs: (\d+)", self.code).group(1))
        self.assertTrue(80 <= fade <= 140, fade)
        water = dict(re.findall(r"(match1|target|max): Object\.freeze\(\{ ([^}]*) \}\)", self.code))
        self.assertEqual(sorted(water), ["match1", "max", "target"])
        for name, body in water.items():
            v = {k: float(x) for k, x in re.findall(r"(\w+): ([\d.]+)", body)}
            self.assertLessEqual(v["body"], 0.1, name)  # mostly clear
            self.assertLessEqual(v["edge"], 0.12, name)  # the ink outline stays faint
            self.assertLessEqual(v["bend"], 0.55, name)  # the user-authorised stronger rim refraction is still bounded
        self.assertEqual(self.code.count('mixBlendMode = "difference"'), 2)  # the difference canvas and its tiles only
        self.assertIn('if (!media) cs.mixBlendMode = "difference";', self.code)
        for banned in ("backdropFilter", "backdrop-filter", ".filter =", "boxShadow", "box-shadow", "textShadow", "drop-shadow", "html2canvas"):
            self.assertNotIn(banned, self.code)
        # the difference shaders are used as they are; the water variants are derived from them, so the geometry is one
        self.assertIn("outColor = vec4(vec3(m), m); // premultiplied", self.js)
        self.assertIn("outColor = vec4(vec3(a), a);", self.js)
        self.assertIn("const FS_MEDIA = variant(FS, [", self.code)
        self.assertIn("const BFS_MEDIA = variant(BFS, [", self.code)
        # refraction samples only a render's own image (no page capture)
        self.assertIn("createImageBitmap(src", self.code)
        # The cursor sources stay isolated; only the new click overlay may capture visible charts/renders.
        cursor = self.code[:self.code.index("function viewportRipple(")]
        self.assertNotRegex(cursor, r"elementsFromPoint\([^)]*\)\.map|toDataURL|drawWindow|captureStream")
        # the dark smear fix: the far-side depth is capped and never stacks with the outline; the normal is never undefined
        self.assertIn("float ink = max(depth, ", self.code)
        self.assertRegex(self.code, r"float depth = min\(pow\(tilt, 2\.0\)[^;]*, 0\.05\);")
        self.assertIn("max(h * 1.15, 0.05)", self.code)
        for name, body in water.items():
            v = {k: float(x) for k, x in re.findall(r"(\w+): ([\d.]+)", body)}
            self.assertTrue(1.0 <= v["mag"] <= 1.16, name)  # stronger central lensing, below the reference's default

    def test_channel_separation_has_source_bounds_and_a_physical_reach_limit(self):
        self.assertIn('QS.get("glass")', self.code)
        self.assertIn('WQ : "target"', self.code)
        self.assertIn("sourceAt(f + red).r, sourceAt(f + off).g, sourceAt(f + blue).b", self.code)
        self.assertIn("co = clamp(co, uBox.xy + 0.5, uBox.zw - 0.5);", self.code)
        self.assertIn("v * min(1.0, reach / max(length(v), 1e-4))", self.code)
        self.assertIn("Math.min(WM.reach, C.refractMaxPx) * eff", self.code)
        reach = float(re.search(r"refractMaxPx: ([\d.]+)", self.code).group(1))
        self.assertEqual(reach, 48)

    def test_dispersion_is_ordered_curvature_driven_and_attenuated_on_thin_liquid(self):
        candidates = dict(re.findall(r"(match1|target|max): Object\.freeze\(\{ ([^}]*) \}\)", self.code))
        values = {name: {k: float(v) for k, v in re.findall(r"(\w+): ([\d.]+)", body)} for name, body in candidates.items()}
        self.assertLess(values["match1"]["dispersion"], values["target"]["dispersion"])
        self.assertLess(values["target"]["dispersion"], values["max"]["dispersion"])
        self.assertIn("smoothstep(0.25, 0.9, r01) * pow(r01, 0.7) * thickness", self.code)
        self.assertIn("mix(0.25, 1.0, smoothstep(0.15, 1.0, W / uDome))", self.code)
        self.assertIn("bend * (1.0 + spread)", self.code)
        self.assertIn("bend * (1.0 - spread)", self.code)

    def test_hero_optics_are_snapshotted_not_captured_per_frame(self):
        """The hero's overlay is rasterised only when it changes (idle time, throttled); the frames are sampled live."""
        self.assertIn("if (!fits || H.dirty) {", self.code)
        self.assertIn("if (wait <= 0) captureHero(o.z);", self.code)  # never while the page scrolls or resizes
        settle = float(re.search(r"heroSettleMs: (\d+)", self.code).group(1))
        self.assertTrue(100 <= settle <= 300, settle)
        self.assertIn("performance.now() - H.last < C.heroOpticMinMs", self.code)
        self.assertIn("requestIdleCallback(run", self.code)
        self.assertIn("new MutationObserver(", self.code)
        self.assertNotIn("captureHero(", self.code[self.code.index("function frame(ts)"): self.code.index("function draw()")])
        self.assertIn("UNPACK_PREMULTIPLY_ALPHA_WEBGL, true", self.code)  # premultiplied: no dark fringe at text edges
        # the rules Chromium serializes as empty longhands (a var() shorthand beside one of its longhands) are restored from
        # the computed style, so the snapshot's text lies exactly on the page's (no doubled stroke inside the drop)
        self.assertIn('r.cssText.includes(": ;")', self.code)
        self.assertIn("if (H.fix) inlineComputed(z, clone, H.fix);", self.code)

    def test_hero_is_one_artwork_zone(self):
        self.assertIn('zone: \'[data-cursor-media="zone"]\'', self.code)
        self.assertIn('chrome: "#edge"', self.code)
        self.assertIn("if (md && md.matches(SEL.zone)) S.mediaEl = md;", self.code)  # controls inside the hero stay water too
        app = (OBS / "app.js").read_text(encoding="utf-8")
        self.assertIn('<div class="hero" id="hero" data-cursor-media="zone"', app)

    def test_material_never_reaches_the_simulation(self):
        core = self.code[self.code.index("const FIELD_PERIOD"): self.code.index("api.core =")]  # the simulation functions
        for word in ("mat", "matForce", "media", "mediaEl", "Media", "shownU"):
            self.assertNotRegex(core, rf"(?<![A-Za-z_]){word}(?![A-Za-z_])")
        self.assertIn("inp.hover = !!S.interactiveEl;", self.code)
        # hovering an ordinary control never disarms the goo (only a press, a hidden body or touch input do)
        self.assertIn('dropPtr.allowed = S.visible && !inp.pressed && S.pointerType !== "touch";', self.code)
        self.assertNotRegex(self.code, r"dropPtr\.allowed = [^;]*(inp\.hover|hoverProgress)")
        self.assertIn("step(D, dropBody, dropPtr, dt, F.maxSubstep);\n      stepMaterial(dt);", self.code)  # after the simulation

    def test_marked_render_surfaces(self):
        """data-cursor-media marks the real renders (and the hero, as one zone) only: not controls elsewhere, not data images."""
        app = (OBS / "app.js").read_text(encoding="utf-8")
        marks = ['<div class="hero" id="hero" data-cursor-media="zone"', '<div class="frame" data-cursor-media><img id="rl-img"', 'loading="lazy" data-cursor-media>',
                 '<canvas id="cv-loupe" data-cursor-media', '<div class="frame" data-cursor-media><img id="cx-big"', '<canvas id="cx-ca" data-cursor-media', '<canvas id="cx-cb" data-cursor-media']
        for m in marks:
            self.assertEqual(app.count(m), 1, m)
        self.assertEqual(app.count("data-cursor-media"), len(marks))
        self.assertNotIn('cv-view" data-cursor-media', app)
        self.assertNotIn('<canvas id="cx-cd" data-cursor-media', app)

    def test_no_lab_interface(self):
        for lab in ("liquidCursorLab", "setParams", "poolPresets", "triggerDroplet", "Tuning", "tune-", "Mode C"):
            self.assertNotIn(lab, self.code)

    def test_deformed_optics_reads_the_same_body(self):
        core = self.code[self.code.index("const FIELD_PERIOD"):self.code.index("api.core =")]
        self.assertNotIn("Coupled", core)
        self.assertNotIn("ripple", core)
        self.assertIn("${BODY_DOME}", self.code)
        self.assertIn("float bodyR = clamp(lr / max(uRadius, 1.0)", self.code)
        self.assertIn("uAxis * local.x / uStretch + perpendicular * local.y / uCompress", self.code)

    def test_overview_index_retains_difference_and_local_hover_policy(self):
        policy = self.code[self.code.index("function resolveCursorPresentation()"):self.code.index("function stepMaterial(")]
        self.assertIn('index: "#sec-overview > section.index"', self.code)
        self.assertIn('if (S.mediaEl) return { mode: "mediaGlass", material: 1 }', policy)
        self.assertIn('return { mode: "difference", material: 0 }', policy)
        self.assertNotIn("S.indexEl", policy)
        self.assertNotIn('"globalGlass"', policy)
        self.assertNotIn('"overviewIndexGlass"', self.code)
        self.assertIn('link.querySelectorAll(".n, .t, .d, .k")', self.code)
        self.assertIn('chrome: "#edge"', self.code)
        self.assertNotIn('chrome: "#edge, #nav"', self.code)

    def test_hero_invalidates_readiness_and_generation(self):
        stale = self.code[self.code.index("function staleHero("):self.code.index("const COMPUTED =")]
        self.assertIn("H.ok = false", stale)
        self.assertIn("H.gen++", stale)
        self.assertIn("R.mix = R.want = 0", stale)

    def test_ripple_soft_changes_do_not_clear_wave(self):
        invalidation = self.code[self.code.index("function invalidate(reason, hard"):self.code.index("function init()", self.code.index("function invalidate(reason, hard"))]
        self.assertIn("if (hard)", invalidation)
        self.assertIn('invalidate("MINOR_STYLE", false)', self.code)
        self.assertIn("scrollThreshold: 8", self.code)
        self.assertIn("float recovery =", self.code)
        self.assertIn("float attack = smoothstep", self.code)

    def test_ripple_lifecycle_is_bounded_and_passive(self):
        ripple = self.code[self.code.index("function viewportRipple("):]
        self.assertIn('location.protocol !== "file:"', ripple)
        self.assertIn('pointer-events:none;z-index:99', ripple)
        self.assertIn('max: 8', ripple)
        self.assertIn('waves.shift()', ripple)
        self.assertIn('cancelAnimationFrame(frameId)', ripple)
        self.assertIn('canvas.style.display = "none"', ripple)
        self.assertIn('g.deleteTexture(texture)', ripple)
        self.assertIn('observer.disconnect()', ripple)
        self.assertNotRegex(ripple, r"stopPropagation|preventDefault\(\)(?!; state.ready)")

    def test_ripple_frame_never_recaptures_or_uploads(self):
        ripple = self.code[self.code.index("function viewportRipple("):]
        draw = ripple[ripple.index("function draw(now)"):ripple.index("async function trigger(")]
        self.assertNotRegex(draw, r"capture\(|texImage2D|drawImage|toDataURL")
        self.assertIn("if (!frozen) frameId = requestAnimationFrame(draw)", draw)
        self.assertIn('clamp((pixel + displacement) / uViewport', ripple)
        self.assertIn('if (generation !== epoch', ripple)

    def test_the_approved_preset(self):
        self.assertIn('const VERSION = "reference-goo-balanced@9cce8a5";', self.code)
        for v in ("spineLength: 70", "spineNodes: 4", "spineVOn: 1500", "spineVFull: 3200", "spineBulb: 0.9", "spineRoot: 0.85", "spineNeck: 0.42",
                  "spineTerminal: 0.46", "spineSplashCount: 5", "radius: 34", "maxStretch: 1.42", "hoverScale: 1.27", "clickCompression: 0.1"):
            self.assertIn(v, self.code)


if __name__ == "__main__":
    unittest.main()
