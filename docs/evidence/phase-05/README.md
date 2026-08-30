# Phase 05 evidence

Recorded on 2026-08-30 from source commit `3b4005d`, Google Chrome headless, Windows 11,
`nvidia turing`, 1280×720. Benchmark scenarios use 5 seconds warmup, a 20 second interactive
window, and ten paused timestamp-query samples. Counter readback occurs after the window; the
interactive loop remains at `0 readbacks/frame`.

| Population | Mode      | LOD counts near/mid/far    | Estimated triangles | GPU classification | GPU render | GPU total |
| ---------: | --------- | -------------------------- | ------------------: | -----------------: | ---------: | --------: |
|       500k | Auto      | 13,268 / 403,167 / 67,365  |           2,712,948 |           0.524 ms |   1.769 ms |  2.556 ms |
|       500k | Near-only | 483,805 / 0 / 0            |           5,805,660 |           0.524 ms |   2.753 ms |  3.998 ms |
|         1m | Auto      | 24,702 / 812,333 / 133,884 |           5,438,190 |           0.852 ms |   2.818 ms |  4.456 ms |
|         1m | Near-only | 967,657 / 0 / 0            |          11,611,884 |           0.852 ms |   5.833 ms |  7.274 ms |

Auto LOD reduces the estimated triangle workload by about 53% in both showcase populations. Median
GPU total improves by 36% at 500k and 39% at one million. These results include the procedural
background and base lighting but no post-processing. Timestamp values are hardware/browser-specific
and visibly quantized.

`validate-phase-05.mjs` forces near, mid, and far consecutively, checks all three indirect records,
then performs a 12-step slow camera sweep. The retained run reported zero duplicate/out-of-range
IDs, zero overflow, and no stale counts. Unit fixtures cover every projected-size boundary.

Visual artifacts include:

- `near-silhouette-10k.png`, `mid-simplification-100k.png`, and `far-density-500k.png`;
- `transition-lod-colors.png`, proving exclusive near/mid/far debug coloring;
- `narrow-500k.png`, `lod-auto-500k.png`, and `high-dpi-500k.png` for aspect/scale coverage.

The debug palette uses cyan, amber, and magenta, differentiated by both luminance and mesh shape.
Overlay foregrounds retain strong light/dark contrast. The scene was visually inspected at wide,
narrow, and 2× device scale. Remaining limitation: dense views intentionally read as luminous mass;
individual silhouettes are best inspected at 10k or with fixed-LOD debug controls.
