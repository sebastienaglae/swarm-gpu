# Phase 03 evidence — GPU simulation

Captured on 2026-08-30 in installed Chrome on the reference Windows 11 / NVIDIA Turing environment. The benchmark reports use clean commit `1a0b090`; the retained screenshots include the subsequent allocation-estimate presentation change without changing simulation behavior.

## Correctness evidence

- Chrome compiled and executed `simulate.wgsl` without validation errors.
- `scripts/validate-phase-03.mjs` resets the renderer while paused, advances exactly one fixed 1/60-second compute step, reads 16 fixtures explicitly, and compares position/velocity against the CPU reference. Maximum absolute error was `0.0000016843660475274191`, below the `0.0001` gate.
- Unit fixtures cover center/zero velocity, boundary containment, extreme delta, speed clamping, NaN/infinity recovery, deterministic recovery, and all interaction signs.
- Browser lifecycle coverage verifies one compute dispatch per frame, pause freeze, population changes, reset, resize, scene recreation, and device-loss recovery.

## Visual evidence

- `2026-08-30_simulation-500k.png`: 500,000 moving instances at 1920×1080, one compute dispatch, two draws, and 60 FPS overlay.
- `2026-08-30_attractor-500k.png`: the same population after five seconds with the world-plane attractor at maximum documented radius/strength.

## Performance matrix

Each committed JSON used a five-second warm-up, 20-second fixed-timestep measurement, approximately 1,200 frame samples, and ten explicit post-pause timestamp samples. Interactive readbacks remained zero.

| Population | Threads | Frame median | CPU median | GPU compute | GPU render | GPU total | Long frames |
| ---------: | ------: | -----------: | ---------: | ----------: | ---------: | --------: | ----------: |
|    100,000 |     128 |      16.7 ms |     0.2 ms |    0.066 ms |   0.590 ms |  0.655 ms |           0 |
|    250,000 |     128 |      16.7 ms |     0.2 ms |    0.131 ms |   1.442 ms |  1.573 ms |           1 |
|    500,000 |     128 |      16.7 ms |     0.2 ms |    0.262 ms |   2.818 ms |  3.146 ms |           0 |
|  1,000,000 |     128 |      16.7 ms |     0.2 ms |    0.590 ms |   5.046 ms |  5.702 ms |           0 |
|    500,000 |     256 |      16.7 ms |     0.3 ms |    0.262 ms |   2.294 ms |  2.556 ms |           0 |

Chrome timestamps are privacy-quantized in 65.536 µs increments. Compute results for 128 and 256 threads at 500k are therefore indistinguishable at available precision. The default remains 128 for broader device portability; both variants stay selectable by query parameter for future measurements. Render variance between sequential runs is not attributed to workgroup size.

These are development baselines, not release headline claims. Reports live under `benchmarks/baselines/sim-*` and validate against `simulation-benchmark-result.schema.json`.
