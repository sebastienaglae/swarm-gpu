# SwarmGPU

SwarmGPU is a raw WebGPU renderer designed to simulate, cull, classify, compact, and draw up to one million simple objects on the GPU. The CPU only updates frame-level parameters and encodes commands; it never iterates over individual instances.

Phases 00–06 are implemented. The renderer currently runs GPU simulation, conservative frustum
culling, projected-size LOD classification, capacity-safe compaction, three GPU-generated indirect
draws, delayed asynchronous GPU telemetry, and stable dynamic resolution without synchronous GPU
readback. The phase documents below remain
the project source of truth: implementation work must satisfy the corresponding acceptance criteria
and retain evidence.

Reference Phase 06 target result (`nvidia turing`, Chrome headless, Windows, 1920×1080):

```text
Instances       250,000
Swarm draws     3 indirect
Frame interval  16.7 ms median / 16.9 ms p95
CPU encode      0.3 ms median (including submit)
GPU frame       2.621 ms median (delayed timestamps)
Readbacks       0 blocking/frame
State memory    21.93 MiB tracked
```

## Target pipeline

```text
frame parameters (CPU)
        |
        v
GPU simulation -> frustum culling -> LOD classification
        -> visible-list compaction -> indirect arguments -> rendering
```

## Non-negotiable targets

- Raw WebGPU, TypeScript, WGSL, Vite, and a small math dependency only.
- No per-instance CPU loop after scene initialization.
- No GPU readback in the interactive frame loop.
- Zero intentional JavaScript allocations in the steady-state frame loop.
- Persistent buffers, bind groups, and pipelines.
- Reproducible benchmarks with hardware and browser metadata.
- Graceful handling of unsupported WebGPU, resize, pause/resume, and device loss.
- Initial performance gate: 250,000 simulated instances at 60 FPS on the reference machine; stretch goal: 1,000,000.

## Delivery phases

| Phase                                                                             | Outcome                                                                 | Exit gate                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| [00 — Product contract](docs/phases/00-product-contract.md)                       | Scope, metrics, constraints, and public-repository standards are frozen | Project charter approved                                |
| [01 — Project foundation](docs/phases/01-project-foundation.md)                   | Toolchain, CI, application shell, and WebGPU capability flow work       | Clean CI and usable unsupported-device screen           |
| [02 — Renderer baseline](docs/phases/02-renderer-baseline.md)                     | Camera, mesh, depth, resize, and direct instancing render correctly     | 100,000 static instances render reliably                |
| [03 — GPU simulation](docs/phases/03-gpu-simulation.md)                           | Compute-driven motion with ping-pong state and interaction              | 500,000 stable simulated instances                      |
| [04 — GPU culling and compaction](docs/phases/04-gpu-culling-compaction.md)       | Visibility remains GPU-resident and feeds indirect rendering            | Zero-readback indirect draw is correct                  |
| [05 — GPU LOD and visual system](docs/phases/05-gpu-lod-visuals.md)               | Three GPU-selected LODs and a polished swarm scene                      | Stable transitions and at most three swarm draws        |
| [06 — Performance and observability](docs/phases/06-performance-observability.md) | Profiling, timestamps, dynamic resolution, and benchmark harness        | 250k/60-FPS target demonstrated reproducibly            |
| [07 — Reliability and stress](docs/phases/07-reliability-stress.md)               | Recovery, lifecycle, validation, and stress scenarios are proven        | Stress matrix passes without leaks or validation errors |
| [08 — Public release and demo](docs/phases/08-public-release.md)                  | Documentation, media, hosted demo, and release automation are ready     | Public v1.0 release is reproducible                     |
| [09 — Research extensions](docs/phases/09-research-extensions.md)                 | Optional experiments are isolated from the v1 core                      | Each experiment has evidence and can be removed cleanly |

## How work is governed

1. Work phases execute in numeric order. A later phase may be prototyped, but it cannot become the main branch baseline until earlier exit gates pass.
2. Every pull request names one primary phase and one or more checklist items from that phase.
3. A checkbox is marked complete only when its evidence exists: test, capture, benchmark result, or documented decision.
4. Performance claims always include GPU, CPU, OS, browser/version, resolution, instance count, visible count, and sampling method.
5. Architectural changes update the affected phase document before or in the same pull request as the code.
6. Optional work must not delay phases 00–08. Phase 09 is explicitly outside the v1 critical path.

Project governance and technical contracts:

- [Contributing guide](CONTRIBUTING.md), [code of conduct](CODE_OF_CONDUCT.md), [security policy](SECURITY.md), and [MIT license](LICENSE).
- [Architecture decisions](docs/architecture/decisions/README.md), [reference hardware](docs/reference-hardware.md), and [initial memory budget](docs/architecture/memory-budget.md).
- [Benchmark evidence policy](docs/benchmarking/evidence-policy.md) and [versioned result schema](benchmarks/schemas/benchmark-result.schema.json).

## Planned repository layout

```text
src/
  app/              lifecycle and UI orchestration
  gpu/              adapter/device setup, resources, pipelines, timing
  renderer/         render graph, camera, meshes, LOD passes
  simulation/       state initialization and compute orchestration
  shaders/          WGSL modules
  diagnostics/      overlay, capabilities, benchmark recording
  input/            allocation-free interaction state
tests/               unit, browser, visual, and stress tests
benchmarks/          scenarios, baselines, reports, and schemas
public/              static release assets
docs/
  phases/            authoritative implementation plan
  architecture/      diagrams and accepted decision records
```

## Development

Prerequisites: Node.js 22.20 (pinned in `.nvmrc`) and npm 11.18. From a clean clone:

```bash
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`). WebGPU requires a secure context;
localhost qualifies. Run the complete local quality gate with `npm run check` and the browser smoke
suite with `npm run test:e2e`. The browser suite installs with `npx playwright install chromium`
when Chromium is not already present.

Use the in-app LOD controls in development builds to force a representation, adjust projected-size
thresholds, or enable classification colors. `?direct=1` retains the Phase 04 direct-draw reference;
benchmark and capture scripts live under `scripts/`.

Phase 06 methodology, raw reports, rerun variance, and optimization decisions are documented in the
[performance evidence](docs/evidence/phase-06/README.md). Run the committed regression budgets with
`npm run benchmark:budgets`.

## Definition of a trustworthy performance claim

The headline target is not “one million objects” in isolation. A valid result reports a fixed scenario, warm-up period, sample duration, median and percentile frame times, CPU and GPU timing when supported, resolution, visible population, draw count, and whether the browser used native WebGPU. Results without that context are exploratory and must not be placed in the README headline.
