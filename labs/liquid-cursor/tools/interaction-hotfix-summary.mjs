// Summarise an interaction-hotfix sidebar result per variant: frame pacing, long tasks, cursor cost and source work.
// node labs/liquid-cursor/tools/interaction-hotfix-summary.mjs NAME   (reads evidence/interaction-hotfix/NAME.json)
import { readFileSync, writeFileSync } from "node:fs";
const name = process.argv[2], j = JSON.parse(readFileSync(`labs/liquid-cursor/evidence/interaction-hotfix/${name}.json`, "utf8"));
const groups = {}; for (const r of j.rows) { if (!r.frame) continue; const k = r.label.startsWith("sidebar fast after") ? "sidebar after navigation" : r.label; (groups[k] ||= {})[r.variant] ||= []; groups[k][r.variant].push(r); }
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : 0; };
const sum = (a) => a.reduce((n, x) => n + x, 0);
const out = {};
for (const [k, vs] of Object.entries(groups)) { out[k] = {};
  for (const [v, rs] of Object.entries(vs)) out[k][v] = { runs: rs.length, p95: med(rs.map((r) => r.frame.p95)), p99: med(rs.map((r) => r.frame.p99)), maxFrame: Math.max(...rs.map((r) => r.frame.max)),
    over50: sum(rs.map((r) => r.frame.over50)), longTasks: sum(rs.map((r) => r.longTasks.length)), longTaskMs: sum(rs.map((r) => r.longTasks.reduce((n, l) => n + l[1], 0))),
    cursorScriptMsPerRun: +med(rs.map((r) => r.cursorMs)).toFixed(1), rippleCaptures: sum(rs.map((r) => r.cursor ? r.cursor.rippleCaptures : 0)), heroCaptures: sum(rs.map((r) => r.cursor ? r.cursor.heroCaptures : 0)),
    sourceCancellations: sum(rs.map((r) => r.cursor ? r.cursor.rippleCancellations : 0)), gpuBusyMs: rs.some((r) => r.trace) ? med(rs.filter((r) => r.trace).map((r) => r.trace.busyMs.gpu || 0)) : null }; }
writeFileSync(`labs/liquid-cursor/evidence/interaction-hotfix/${name}-summary.json`, JSON.stringify(out, null, 1));
for (const [k, vs] of Object.entries(out)) { console.log(k); for (const [v, s] of Object.entries(vs)) console.log(`  ${v.padEnd(5)} p95 ${s.p95} p99 ${s.p99} max ${s.maxFrame} >50ms ${s.over50} longTasks ${s.longTasks}/${s.longTaskMs}ms cursorScript ${s.cursorScriptMsPerRun}ms captures ${s.rippleCaptures}/${s.heroCaptures} cancels ${s.sourceCancellations} gpu ${s.gpuBusyMs}`); }
