# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Unit marker and lecturer (SIT315 Concurrent Programming, Deakin):** watch a recorded 11 to 13 minute 1920×1080 demonstration video. Their job is to judge whether the parallel-computing work is real, correct, measured honestly and understood.
- **Future GitHub and portfolio visitors:** technical readers deciding in seconds whether the project is serious engineering; the Observatory may later be hosted publicly (not now).
- **The author (Lorenzo Dario Ben):** drives the Observatory on camera, jumping between evidence by keyboard and deep link.

## Product Purpose

Helios is an adaptive hybrid distributed rendering engine: a deterministic C++20 CPU ray tracer for Monte Carlo light transport whose image is bit-identical across seven execution backends (sequential, OpenMP, static and dynamic MPI, three hybrid MPI + OpenMP modes including throughput-adaptive batching). The Helios Observatory is its offline evidence explorer: it presents real renders, recorded scheduler traces, per-tile telemetry, formal benchmark results, correctness checks, the stress-test DNF and the provenance of every headline number. Success: a viewer understands what Helios renders, why its workload is irregular, how the schedulers behave, how performance changed after debugging, how correctness was proved, and can trace any number back to its evidence.

## Positioning

Nothing on screen is invented: every value is parsed from saved Protocol V2 evidence on the frozen source `e2c13e2`, scheduler replays come from recorded dispatch traces, and every visual carries its evidence class. A neighbouring student project could show charts; it could not show a replay of its own recorded MPI traces next to a bit-identical seven-backend image and a source-to-report evidence chain.

## Operating Context

Driven locally in Edge or Chrome from `python scripts/observatory/serve.py` (or `index.html` from disk), in recording mode for the video (an author tool with no public control) and the Guided Tour (← →) for a curated sequence; keyboard shortcuts 1–9, 0, P, T. Screenshots and the demo MP4 are captured with headless Edge. Built by `scripts/observatory/build_observatory.py`, validated by `validate_observatory.py`.

## Capabilities and Constraints

- Ten sections: Overview, Render Lab, Workload Microscope, Scheduler Lab (the centrepiece), Hardware & Hybrid, Performance Lab (with the hybrid-anomaly case file), Correctness, Stress & Limits, Provenance, Technical Q&A. Deep links for every state, trace inspector, live pixel difference, the Guided Tour and recording mode.
- Offline only: plain HTML, CSS and vanilla JavaScript; no framework, CDN, remote font, analytics or runtime network request. Data is bundled in `data/bundle.js`.
- Frozen boundaries: `src/`, `include/`, `tests/`, `results/` and the final report are never modified by Observatory work; no benchmark or stress rerun; no invented measurement, trace event or timing.
- Primary target 1920×1080 desktop recording; usable at 1440×900; mobile only needs to remain usable.
- Not deployed anywhere; local operation is authoritative.

## Brand Commitments

- Name: **HELIOS**, subtitle "Adaptive Hybrid Distributed Rendering Engine". Public wording uses ray tracing and Monte Carlo light transport; "Monte Carlo path tracing" names the algorithm only where that precision matters. No GPU, real-time, hardware ray-tracing or multi-node claims.
- Credit: "Lorenzo Dario Ben · SIT315 Concurrent Programming", shown quietly (hero and closing screen).
- Fonts: Windows-installed faces first; an open-licence face already installed on the author's machine is bundled in the repository as the portable fallback. No downloaded or remote fonts.
- Evidence classes are part of the identity and always visible where ambiguity matters: FORMAL, DIAGNOSTIC, HISTORICAL, PRESENTATION, ILLUSTRATIVE.

## Evidence on Hand

- Real renders from the frozen binary: `assets/showcase/gallery/*-hero.png` (six scenes, 1920×1080, 1024 SPP), `hero/helios-hero-wide.png`, convergence frames 1–256 SPP, seven-backend correctness thumbnails.
- Generated data: `assets/observatory/data/*.json` (workload, scheduler traces, performance, correctness, stress, provenance, experiments, technical Q&A (`defence.json`), snippets).
- Final report `report/HELIOS_FINAL_REPORT.pdf`; recorded end-to-end terminal screenshot `assets/helios-hybrid-adaptive-run-screenshot.png`.
- Absent and not to be fabricated: cluster/multi-node results, GPU results, testimonials, users, deployments.

## Product Principles

1. Evidence before decoration: a visual either shows recorded data, a real render, or is labelled illustrative.
2. Honesty is visible: caveats and historical status stay on screen, never hidden for polish.
3. The engine is the subject: C++20, MPI, OpenMP and the scheduler lead; the Observatory is supporting tooling.
4. Built to be presented: every state reachable by key or deep link, legible on a 1080p recording.

## Accessibility & Inclusion

Keyboard operable throughout (including navigation), visible focus, reduced-motion support with pausable motion, no flashing, worker colours always paired with text labels, high text contrast.
