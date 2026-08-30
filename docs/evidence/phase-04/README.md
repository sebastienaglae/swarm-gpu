# Phase 04 evidence

Recorded on 2026-08-30 at commit `ef5ba50`, Google Chrome headless, Windows 11, `nvidia turing`,
1280×720. Each scenario uses 5 seconds warmup, a 20 second interactive sample window, then ten
explicit timestamp-query samples while paused. Interactive readbacks remain `0/frame`.

| Scenario            | CPU median | Simulation |  Culling |   Render | GPU total |
| ------------------- | ---------: | ---------: | -------: | -------: | --------: |
| 500k direct, 100%   |   0.400 ms |   0.262 ms |     0 ms | 2.753 ms |  3.015 ms |
| 500k indirect, 10%  |   0.300 ms |   0.262 ms | 0.066 ms | 0.328 ms |  0.655 ms |
| 500k indirect, 50%  |   0.500 ms |   0.262 ms | 0.066 ms | 1.442 ms |  1.835 ms |
| 500k indirect, 100% |   0.300 ms |   0.262 ms | 0.066 ms | 2.556 ms |  2.884 ms |
| 1m indirect, 100%   |   0.300 ms |   0.524 ms | 0.131 ms | 5.308 ms |  6.029 ms |

The expected break-even did not occur within 0–100% visibility on this reference system: even the
500k all-visible indirect case was about 0.131 ms faster than direct. This is a hardware-specific
result, not a universal claim. Culling timestamps are visibly quantized at roughly 0.065536 ms, so
small differences should not be over-interpreted. The one-million all-visible atomic-contention
case remains well below the 16.67 ms frame budget and does not justify a prefix scan yet.

Artifacts:

- `direct-500k.png` and `indirect-500k.png`: deterministic reference screenshots.
- `benchmarks/baselines/cull-*`: complete percentile reports and environment metadata.
- `scripts/validate-phase-04.mjs`: paused GPU/CPU visible-ID and indirect-record validation.
- `scripts/benchmark-phase-04.mjs`: reproducible direct/culling comparison harness.
