# Video script: Helios (SIT315 M4.T1D)

Target about 12:40. Plan, item map and expected output: [VIDEO_PLAN.md](VIDEO_PLAN.md). Setup: [VIDEO_RECORDING_CHECKLIST.md](VIDEO_RECORDING_CHECKLIST.md).

The main window is the **Helios Observatory** in recording mode with the Guided Tour running. "O3" is tour item 3; press → for the next item. Clicks inside a page (tabs, bars, tiles) use the mouse and do not change the item number.

How to use this: the WHAT I SAY blocks are a guide, not something to memorise word for word. Say them in your own words, keep the numbers exact, and slow down at the **bold** moments. The narration is about 1,550 words, which fits the slots at about 130 to 145 words a minute. The live demo is in **segment 7, at about 6:00**.

---

## 1. Introduction and problem

**TIME** 0:00 to 0:40
**ON SCREEN** O1: Observatory overview, the hero montage of real renders, the edge line and the evidence strip.
**ACTION** Start on O1. At "exactly the same image", point at the edge line at the top right (frozen source, VERIFIED).

**WHAT I SAY**
> Hi, I'm Lorenzo, and this is Helios, my SIT315 project. Helios is a distributed rendering engine I wrote in C++: a CPU ray tracer for Monte Carlo light transport, and the point isn't just nice pictures. It's a testbed for comparing parallel strategies.
>
> The same image can be rendered seven ways: sequentially, with OpenMP, with static and dynamic MPI, and with three hybrid MPI-plus-OpenMP modes, one of which adapts its batch sizes as it runs. All seven have to produce exactly the same image. Everything on this dashboard is read from my saved experiment files; nothing here is rerun or typed in by hand.

---

## 2. Why Monte Carlo ray tracing is expensive

**TIME** 0:40 to 1:30
**ON SCREEN** O2: Render Lab, convergence autoplaying; then the rendering pipeline.
**ACTION** Press →. Let the convergence play; click a glass sphere to move the 2× detail window onto it. At "millions of ray queries", scroll down to the pipeline and click **BVH traversal**.

**WHAT I SAY**
> A Monte Carlo ray tracer estimates each pixel by averaging lots of random light paths. These are nine separate Helios renders of the same scene, where only the samples per pixel change: at one sample it's mostly noise, and it cleans up as the samples double. The detail window shows the noise at pixel level.
>
> Every sample shoots a ray, bounces it and fires shadow rays, and each of those is a query against the scene's bounding volume hierarchy. That's millions of ray queries per image, and this pipeline is the loop they all go through. It's labelled illustrative because it explains the code; it isn't a measurement.

---

## 3. Architecture and hybrid layers

**TIME** 1:30 to 2:30
**ON SCREEN** O3: Hardware & Hybrid, parallelism layers; then the *OpenMP 4*, *MPI 4×1* and *Hybrid 2×2* tabs.
**ACTION** Press →. Run down the layers top to bottom. At "on this laptop", click *OpenMP 4*, then *MPI 4×1*, then *Hybrid 2×2*.

**WHAT I SAY**
> The key design decision is that there's **one** function that actually renders, `render_tile`. The image is cut into 16-by-16 tiles with stable IDs, and every backend only decides *who* renders *which* tile and *when*. Because the rendering code is shared, if two backends ever give different images, one of them has a bug. That's a really strong correctness test.
>
> On this laptop there are four physical cores and eight logical processors. OpenMP runs one process with threads that take whole tiles. MPI runs separate processes that each own tiles. And hybrid runs MPI processes that each use OpenMP threads *inside* a tile. On the right is the measured result for each layout; I'll come back to those numbers.

---

## 4. The workload is irregular

**TIME** 2:30 to 3:30
**ON SCREEN** O4: Workload Microscope with the 4-way static partition.
**ACTION** Press →. Hover the brightest tile (74) so the detail panel shows it, then tile 0 at the top left. Point at the four coloured ranges, then scroll to *Why static partitions cap the speedup*.

**WHAT I SAY**
> This is the measured cost of every one of the 144 tiles in my main strong-scaling workload, from the formal runs. **Tile 74 took 80 milliseconds; tile 0 took 2.4. That's a 34-times spread**, and it comes from the scene geometry: the expensive tiles cluster in one region of the image.
>
> These outlines are what a static split does with four workers: equal numbers of tiles, very unequal work. Range 3 alone holds 1.67 seconds of the 3.89 total. **So even with perfect workers, an equal four-way split can't beat 2.34 times**, and a two-way split can't beat 1.23. That's the workload's limit, not OpenMP's or MPI's.

---

## 5. Static, dynamic and adaptive scheduling

**TIME** 3:30 to 5:00
**ON SCREEN** O5: Scheduler Lab, compare view playing; then the *Static partition*, *Fixed dynamic* and *Adaptive batching* tabs; then the trace inspector.
**ACTION** Press →; the three replays play. Point at rank 1 going idle in the static panel. Then click *Static partition*, *Fixed dynamic* (point at the worker lanes), *Adaptive batching* (open *How adaptive batching decides*). Press **T**, point at a few rows, press **Esc**.

**WHAT I SAY**
> This is replayed from a formal scheduler experiment: same image, same two workers, rank 0 coordinating, three policies. **Under static, rank 1 finishes its easy half after 0.89 seconds and then sits idle** while rank 2 grinds on to 3.38 seconds. Dynamic hands out one tile at a time on demand, so both workers stay busy and finish together at 2.30.
>
> One honest detail: static doesn't record a dispatch trace, so its timeline is rebuilt from the recorded time of every tile, and the page says so. Dynamic and adaptive are replayed straight from the recorded trace.
>
> Adaptive only changes the batch size. The coordinator estimates each worker's speed and aims for about 50 milliseconds of work per batch, between one and eight tiles, shrinking as the queue empties. You can see it: batches of eight early, single tiles at the end, **73 assignments instead of 144**, and it finished at 2.28 seconds.
>
> And this is the raw trace: every row is a recorded message, with the worker, the tiles and the times. Nothing here is simulated.

---

## 6. Source-code proof

**TIME** 5:00 to 6:00
**ON SCREEN** VS Code, `src/core.cpp`, then `src/main.cpp`. **Switch from the browser to VS Code here.**
**ACTION** Ctrl+G to each line as you mention it: `core.cpp` 340, 241; then `main.cpp` 127, 212, 273, 190, 173.

**WHAT I SAY**
> Briefly, the real code. **Line 340**: every sample gets its own random generator, seeded from the seed, the pixel and the sample, so a pixel's random numbers don't depend on who renders it. That's why the image is bit-identical across backends. **Line 241** is the BVH traversal stack, a fixed 64-slot array; remember it.
>
> In `main.cpp`: line 127 is the whole OpenMP backend, a parallel for over tiles. Lines 212 and 213 are the static MPI split. **Line 273** is the dynamic coordinator waiting for a result from *any* worker. Line 190 is hybrid: the same protocol, but each rank renders a tile with several threads. And line 173 is the adaptive batch size.

---

## 7. Live end-to-end demonstration

**TIME** 6:00 to 7:15
**ON SCREEN** PowerShell at the repository root (demo already run once off camera, window cleared). **Switch to the terminal here.**
**ACTION** Paste and run the demo. **It starts at about 6:00** and takes about 9 seconds. Then scroll up slightly and point at the lines named below. Finally open the PNG and close it after about 4 seconds.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/helios_demo.ps1 -NoOpen
```

**WHAT I SAY** (while it runs)
> This script runs the checks live. It never reruns benchmarks and only writes to a temp folder.

**Point at**, in order: step 1 (`identical to e2c13e2`), step 2 (`= binary used for the formal experiments`), step 3 (`All Helios core checks passed`), step 4 (the column of identical hashes and `Validated 11 backend configurations`), step 5 (`ranks=3 threads=2`, `hash=57881d257daf2474`), step 6 (the same hash), step 7 (`recomputed … OK`, `pixel bytes identical: YES`).
> First, the source is exactly the frozen commit my results came from, and the binary is the one the experiments used. The core tests pass; they include a BVH-versus-brute-force check and a test that fails on a deliberately racy version. The validator runs eleven backend configurations, all with the same hash.
>
> Then the most complex mode, hybrid adaptive: three processes, a coordinator and two workers with two threads each, about 1.5 seconds. Then plain sequential with the same settings, about 4.6 seconds, and **the hash is identical**. The script recomputes both hashes itself and compares every pixel byte. These are one-off timings, not benchmarks.

```powershell
Invoke-Item "$env:TEMP\helios-demo\hybrid-adaptive.png"
```
> Here's the image: diffuse, glass and metal spheres under a triangle light.

---

## 8. Strong scaling and scheduler results

**TIME** 7:15 to 8:20
**ON SCREEN** O6: Performance Lab, speedup view; then the detail panel for OpenMP 8; then the *Scheduler* tab.
**ACTION** Switch back to the browser and press →. Point at Sequential, OpenMP 4, MPI 4, the dashed 2.34× line, OpenMP 8 and Hybrid 1×4. Click the *OpenMP 8* bar. Then click the *Scheduler* tab and point at the dynamic-vs-static rows, then the adaptive-vs-fixed rows.

**WHAT I SAY**
> Strong scaling: fixed workload, seven randomised blocks per condition. Sequential takes 3.93 seconds. Four OpenMP threads get 1.93 times and four MPI ranks 1.95, **both under the 2.34 cap we just saw**.
>
> Eight OpenMP threads on four cores reach 2.97 times, but efficiency per logical thread drops to 0.37, because a hyperthread isn't a second core. Hybrid 1-by-4 gets 2.45, above the cap, because it splits each tile instead of the tile list: a decomposition effect, not hybrid magic.
>
> For scheduling, dynamic beat static on **every** natural scene, by 27.5 to 31.8 percent. Adaptive kept that balance with far fewer messages, but on time eight of ten comparisons include zero and the other two point in opposite directions. On one machine, messages are cheap, so there wasn't much to win.

---

## 9. The hybrid anomaly and the two bugs

**TIME** 8:20 to 9:45
**ON SCREEN** O7: the case file; the HISTORICAL/FINAL toggle; the frozen `Scene::hit` excerpt; the *Optimisation A/B* tab.
**ACTION** Press →. Walk down the steps, pointing at each classification chip. Toggle *Historical* and *Final* on the right. Click *Code ↔* on the FIX step (the Source Inspector opens at `Scene::hit`; point at the stack line), then press Back (Alt+←) and click *Optimisation A/B*.

**WHAT I SAY**
> This is the part I learned most from. My first formal run, before any fixes, showed hybrid 2-by-2 taking 4.7 seconds against 3.2 for OpenMP 4, **43 percent slower**, in every block. Instead of writing "hybrid has overhead", I tested explanations one at a time. Not the partition: its ideal time was 2.47 seconds. Not MPI transfer: under a millisecond. CPU placement showed effects, but the anomaly happened without pinning. What the tile timings did show was that **two threads inside one tile were barely faster than one**.
>
> The first cause was false sharing: per-thread counters sat on shared cache lines. The fix gives each thread private counters. That helped hybrid by 8 to 14 percent, but it wasn't the main problem. The real one was here: the old traversal allocated a new vector for its stack on every ray query, about 17 million heap allocations per image. Now it's this fixed 64-slot array.
>
> In one randomised A/B with identical pixels, **the stack fix made sequential itself 44.6 percent faster**, and everything else by about as much. After freezing the code I reran all six formal experiments, and hybrid 2-by-2 now shows no resolvable difference from OpenMP 4. One caveat is on the page: the historical 4.7 seconds wasn't reproduced when the old source was rebuilt later, so I don't claim these fixes explain all of it.

---

## 10. Correctness

**TIME** 9:45 to 10:30
**ON SCREEN** O8: Correctness wall, pixel difference, validation stack.
**ACTION** Press →. Sweep across the seven hashes. In *Pixel difference*, leave A = Sequential, B = Hybrid adaptive, click **Compare**, point at the black difference image and the "0 of 360,000" line. Point at the validation stack.

**WHAT I SAY**
> Seven backends, seven different ways of distributing the work, **one hash**. The browser compares the sequential and hybrid adaptive images pixel by pixel right now: zero of 360,000 pixels differ. Underneath is the whole validation stack, re-run when this page was built: core tests, CLI and BVH validation, the backend validator, and an independent rehash of **all 458 formal images, with 458 matches**. So no timing in my results comes from a wrong image.

---

## 11. The stress test and limitations

**TIME** 10:30 to 11:20
**ON SCREEN** O9: Stress & Limits.
**ACTION** Press →. Point at 600.34 s and the ink limit line, the two recorded commands, the four outcomes; then scroll to *Validity constraints*.

**WHAT I SAY**
> The task also needs a workload that doesn't finish. This is the recorded run, not rerun for the video: sequential, 1280 by 720, 2048 samples per pixel, depth 16, about **1.89 billion camera samples** on one thread. A supervisor script gave it 600 seconds; it was killed at 600.34. No crash, no error output, and no partial image, because Helios only writes the image at the end.
>
> Some honest limits. Everything ran on one four-core laptop, so MPI went through shared memory, not a network, and I can't claim anything about clusters. The machine wasn't pinned or temperature-controlled; randomised, paired blocks reduce that, but seven blocks still give coarse intervals. The scenes are small and procedural.

---

## 12. Provenance

**TIME** 11:20 to 12:00
**ON SCREEN** O10: evidence chain for the 2.97× claim; then the *Experiment browser*.
**ACTION** Press →. Click the stages from top to bottom (Source, Binary, Experiment, Raw, Verify, Aggregate, Plot, Report). Then click *Experiment browser* and scroll the list once.

**WHAT I SAY**
> Every headline number can be traced. This is the chain for 2.97 times: the frozen source, the exact binary hash, the formal experiment and its manifest, the raw runs, the independent hash check, the aggregate, the plot, and the table in the report, where the page confirms the value appears. The experiment browser lists all twelve formal experiments: the six final ones, and the six historical ones, kept and labelled as superseded rather than deleted.

---

## 13. Conclusion

**TIME** 12:00 to 12:40
**ON SCREEN** O11: the closing frame (HELIOS, the technology line, frozen source e2c13e2).
**ACTION** Press →. Stay on the closing frame to the end, then stop recording.

**WHAT I SAY**
> To sum up: static splits were limited by the workload's imbalance, not the framework. Dynamic scheduling fixed that, about 30 percent faster on every natural scene. Adaptive kept the balance with fewer messages but had little to win on one machine. And the biggest lesson was treating a strange result as something to explain: that found two real bugs and made the whole renderer about 45 percent faster. Thanks for watching.
