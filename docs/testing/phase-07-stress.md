# Phase 07 stress qualification

Scenario and result contracts are versioned in `benchmarks/schemas/`. The quick suite is intended for
local development; CI always runs unit tests, mocked browser lifecycle stress, and validates the
committed hardware reports. The full suite requires a real WebGPU adapter and is run manually before
release qualification.

Start the development server, then run from a clean checkout:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
npm run stress:quick
npm run stress:full
npm run stress:reports
npm run test:visual
```

An individual full case can be selected with `npm run stress:full -- SOAK-1M`. The wrapper derives the
short commit from clean `HEAD`; callers cannot supply misleading source metadata. Every scenario has
a hard timeout, progress heartbeat, terminal status, console/page/WebGPU error capture, bounded
failure screenshot, environment metadata, maximum tracked state estimate, before/after resources,
loop ownership, and first/last timing medians.

An unsupported population produces `unsupported` with the adapter capacity rather than silently
lowering it. Expected injected device-loss records remain distinguishable from uncaptured validation
errors. Timing drift is evaluated for soaks only; pause/recovery scenarios intentionally disturb
display cadence.

## Evidence interpretation

The committed report gate requires all eleven reference scenarios to pass, active resources to return
to baseline, peak loop ownership to remain one, no uncaptured WebGPU event, and soak last/first median
frame interval to remain at or below 1.15. Process memory is deliberately not a pass gate because
browser/driver caching makes it an ambiguous leak signal.

## Visual tolerance

The hardware visual check uses a static, fixed-camera 10k near-LOD frame at 1280×720. It decodes the
committed and current PNGs through the browser and allows a per-channel difference of 12, at most 1%
different pixels, and mean absolute channel error at most 2. These tolerances admit small
driver/rasterization differences without accepting structural scene changes. Regenerate the baseline
only after an intentional visual change with:

```bash
node scripts/visual-regression-phase-07.mjs "http://127.0.0.1:5174/?benchmark=1&static=1" --update
```
