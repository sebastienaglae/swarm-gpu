# Phase 06 — Performance and observability

## Objective

Make performance claims reproducible, locate real bottlenecks, and achieve the 250,000-instance/60-FPS primary target through evidence-driven optimization.

## Entry criteria

- Phases 02–05 provide the complete GPU-driven pipeline.
- Correctness/reference modes exist so optimizations can be verified.

## Measurement architecture

Separate these quantities:

- Display frame interval (`requestAnimationFrame` cadence).
- CPU update plus command-encoding time.
- Submit call duration (not equivalent to GPU completion).
- GPU timestamps per simulation, culling/finalize, render, and optional effects where `timestamp-query` is available.
- Estimated resident buffer/texture bytes.
- Scenario configuration and adapter capabilities.

GPU query resolve/copy/map is asynchronous and delayed. It must use a ring of readback buffers and never block the current frame. Unsupported devices show “unavailable,” never fabricated GPU timing.

## Implementation work

### Instrumentation

- [x] Add timestamp-query capability path with labeled pass boundaries.
- [x] Use a multi-frame resolve/readback ring and consume only completed results.
- [x] Handle timestamp period/units according to current API behavior and verify with known workload changes.
- [x] Maintain rolling fixed-size numeric samples without per-frame array growth.
- [x] Calculate median/p95/p99 outside hot frames or at low cadence.
- [x] Expose CPU/GPU/pass times, FPS, draw count, population, delayed visible/LOD counts, render scale, and memory estimate.
- [x] Provide a diagnostics export that includes feature availability and warns about approximate metrics.

### Deterministic benchmark runner

- [x] Define versioned JSON scenario and result schemas.
- [x] Fix PRNG seed, timestep, camera path, input, canvas resolution, render scale, duration, and population.
- [x] Separate loading/compilation, warm-up, measurement, and post-measurement readback stages.
- [x] Disable or throttle overlay, devtools-dependent instrumentation, and capture effects during measurement.
- [x] Export raw samples or histograms plus summary statistics and environment metadata.
- [x] Reject headline comparison when scenario/schema versions differ.
- [x] Add documented local commands for smoke and full benchmark suites.

### Optimization sequence

Apply one change at a time and keep before/after evidence:

1. Remove remaining steady-state JS allocations and redundant uniform writes.
2. Verify pipelines, bind groups, buffers, and attachment textures are persistent.
3. Tune compute workgroup sizes across at least two representative GPUs when available.
4. Reduce storage bandwidth through packing only when layout complexity yields measured gain.
5. Measure SoA against a temporary AoS experiment using identical scenarios.
6. Tune LOD thresholds/mesh counts and culling break-even policy.
7. Evaluate render bundles for stable draw encoding if CPU time is material.
8. Add dynamic resolution only for raster-bound cases, with slow hysteresis and hard min/max bounds.
9. Investigate prefix-scan/workgroup compaction only if atomic contention is measured.

### Dynamic resolution

- [x] Use GPU timing when available, otherwise a conservative frame-interval signal.
- [x] Change scale slowly after a sustained window, not in response to individual frames.
- [x] Quantize changes to avoid texture churn; recreate size-dependent attachments only when scale changes.
- [x] Exclude UI resolution where practical and report internal versus display resolution.
- [x] Disable adaptation in deterministic benchmarks unless the scenario explicitly tests it.

## Required benchmark scenarios

| ID          | Population | Visibility |         Resolution | Purpose                 |
| ----------- | ---------: | ---------: | -----------------: | ----------------------- |
| STATIC-100K |       100k |       100% |          1920×1080 | Renderer baseline       |
| SIM-250K    |       250k |       100% |          1920×1080 | Simulation bandwidth    |
| CULL-1M-10  |         1m |       ~10% |          1920×1080 | Culling benefit         |
| CULL-1M-100 |         1m |       100% |          1920×1080 | Atomic worst case       |
| LOD-500K    |       500k |      mixed |          1920×1080 | Representative showcase |
| SCALE-500K  |       500k |      mixed | 1280×720 to native | Raster sensitivity      |

If hardware capacity rejects a scenario, the report records “unsupported by validated limit/budget” rather than silently lowering the count.

## Exit criteria

- Reference hardware demonstrates the primary 250k target or a transparent bottleneck report explains why it is missed and records the achieved stable target.
- Benchmark results are reproducible from a clean clone and include the full contract metadata.
- GPU timing is correct and non-blocking where supported; fallback labels are honest where not.
- A before/after optimization table links each material improvement to comparable reports.
- Steady-state allocation audit reports zero intentional allocations in the render loop, with diagnostic cadence exceptions documented.
- Dynamic resolution behaves stably and is not used to obscure native-resolution results.

## Risks and mitigations

| Risk                               | Mitigation                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Timestamp support/behavior varies  | Feature-detect, isolate timing code, retain CPU/frame fallback              |
| Benchmark noise creates false wins | Warm up, use sufficient samples, report percentiles and environment         |
| DevTools alters timing             | Use exported in-app benchmark for claims and DevTools for diagnosis only    |
| Optimization harms correctness     | Run deterministic visual/data references after each layout or shader change |
