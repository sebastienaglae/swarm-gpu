# Phase 02 evidence — static renderer baseline

Captured on 2026-08-30 from clean commit `7838379` using installed Chrome on the reference Windows 11 machine. WebGPU reported `nvidia turing`; Windows inventory correlates that adapter with the NVIDIA GeForce GTX 1650. Chrome did not expose a driver string through WebGPU, so none is invented.

## Retained visual evidence

- `2026-08-30_static-swarm-100k.png`: 1920×1080, fixed default orbit camera, 100,000 static drones, 1,200,000 submitted triangles, one swarm draw plus one background draw. The overlay shows 60 FPS and the browser-exposed adapter.
- `2026-08-30_static-swarm-10k.png`: the same camera and resolution at the smallest preset, demonstrating that population switching does not recreate the scene.

The dense shell contains extensive overlaps at multiple depths; the hardware capture was produced only after both pipelines matched the `depth24plus` render-pass contract. The capture run reported no GPU validation or shader compilation errors.

## Benchmark matrix

Six JSON reports under `benchmarks/baselines/static-*` cover 10k, 50k, and 100k at 1280×720 and 1920×1080. Every run used a 5-second warm-up and a 20-second sample window, fixed seed/camera, zero readbacks, and two draws. GPU time is explicitly `null`: timestamp instrumentation is Phase 06 work and frame interval is not relabeled as GPU time.

| Resolution | Instances | Frame median | Frame p95 | CPU median | Long frames >33.33 ms |
| ---------- | --------: | -----------: | --------: | ---------: | --------------------: |
| 1280×720   |    10,000 |      16.7 ms |   16.8 ms |     0.2 ms |                     0 |
| 1280×720   |    50,000 |      16.7 ms |   16.9 ms |     0.2 ms |                     0 |
| 1280×720   |   100,000 |      16.7 ms |   16.8 ms |     0.2 ms |                     0 |
| 1920×1080  |    10,000 |      16.7 ms |   16.8 ms |     0.2 ms |                     3 |
| 1920×1080  |    50,000 |      16.7 ms |   17.0 ms |     0.3 ms |                     1 |
| 1920×1080  |   100,000 |      16.7 ms |   17.0 ms |     0.3 ms |                     4 |

These are Phase 02 development baselines, not verified release headline results. Chrome headless was vsync-limited near 60 Hz, and GPU duration was not measured.
