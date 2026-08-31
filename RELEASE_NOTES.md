# SwarmGPU v1.0.0

SwarmGPU v1.0.0 is the first stable release of a specialized raw-WebGPU swarm renderer. It simulates,
culls, classifies, compacts, and indirectly draws up to one million simple instances while the CPU
handles only frame-global state and command submission.

## Highlights

- GPU compute simulation with deterministic recovery from invalid state.
- Conservative frustum culling and three projected-size LODs.
- Three GPU-generated indirect draw records and no per-frame visibility readback.
- Delayed per-pass GPU timestamps, reproducible benchmark reports, and honest fallbacks.
- Bounded device-loss recovery and a complete 32-minute hardware soak/lifecycle qualification.
- Static HTTPS demo packaged for GitHub Pages.

## Reference result

On the browser-exposed NVIDIA Turing adapter, Chrome 151, Windows 10.0.26200, and 1920×1080,
`SIM-250K` measured 16.7 ms median / 16.9 ms p95 display cadence, 0.3 ms median CPU encode+submit,
and 2.621 ms median delayed GPU time. See `docs/evidence/phase-06/README.md` for methodology and rerun
variance rather than treating these numbers as universal hardware guarantees.

## Known limits

- WebGPU and a secure context are required; there is no WebGL fallback.
- GPU timestamp queries are optional and visibility/LOD overlay counts are delayed.
- Adapter limits, browser scheduling, thermals, and drivers materially change capacity/performance.
- Recovery injection validates application state transitions, not every physical driver failure.

Release downloads contain the exact static rollback artifact and curated Phase 06/07 evidence.
