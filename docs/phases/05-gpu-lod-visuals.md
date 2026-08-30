# Phase 05 — GPU LOD and visual system

## Objective

Classify visible instances into three GPU-resident LOD streams and turn the technical pipeline into a compelling, readable swarm demonstration without obscuring performance.

## Entry criteria

- Phase 04 indirect visibility pipeline passes correctness and overflow tests.
- A stable bound and distance/depth convention exist.

## LOD design

| LOD    | Intended range | Representation                             | Goal                                    |
| ------ | -------------- | ------------------------------------------ | --------------------------------------- |
| 0 near | Close          | Low-poly drone mesh                        | Recognizable silhouette and orientation |
| 1 mid  | Medium         | Simplified wedge/fragment mesh             | Lower vertex cost, coherent movement    |
| 2 far  | Distant        | Camera-facing quad or point-like billboard | Minimal geometry and luminous density   |

Exact thresholds are scene parameters chosen through projected screen size, not arbitrary world distance alone. Add hysteresis or a transition band if threshold flicker is visible. Very distant or subpixel instances may be culled.

## Implementation work

### GPU classification and buffers

- [x] Extend culling to compute projected size/depth and select one of three outputs.
- [x] Maintain independent capacity-safe counters and indirect records.
- [x] Choose visible-list organization (three buffers or fixed regions) based on clear memory arithmetic.
- [x] Finalize three indirect records on GPU.
- [x] Issue at most three swarm indirect draws, skipping is not CPU-dependent because zero instance counts are valid.
- [x] Verify base offsets, first-instance semantics, and per-LOD mesh index ranges.

### Geometry and shading

- [x] Produce three compatible representations with documented vertex/index counts and bounds.
- [x] Derive orientation from velocity robustly, with a fallback heading near zero speed.
- [x] Use a restrained emissive palette and inexpensive directional/rim lighting.
- [x] Implement far billboard facing without storing per-instance matrices.
- [x] Keep transparency strategy explicit; prefer additive or alpha behavior that avoids global per-instance sorting.
- [x] Prevent NaNs and degenerate basis construction in orientation and billboard math.

### Visual direction

- [x] Establish space background, fog/depth fade, attractor marker, and color variation as independently toggleable passes/features.
- [x] Make movement legible at both 10k and 1m density.
- [x] Provide a clean capture mode that hides controls but can retain metrics.
- [x] Avoid post-processing until base frame budget is measured; any bloom is optional, toggleable, and separately benchmarked.
- [x] Confirm colors and overlay contrast remain readable for common color-vision deficiencies.

### Controls

- [x] Expose LOD auto/fixed debug modes, thresholds, visualization-by-LOD, and mesh wireframe/debug view in development UI.
- [x] Keep public controls focused: population, attract/repel, pause, reset, benchmark, quality/render scale.
- [x] Validate controls do not recreate pipelines or buffers during normal changes.

## Validation plan

- Deterministic boundary fixtures for each LOD and the far-cull range.
- Camera sweep test looking for popping, holes, double classification, and counter carry-over.
- Debug colors prove every visible ID enters exactly one LOD list.
- Screenshot comparisons for near silhouette, mid simplification, far density, and transition views.
- Triangle/vertex workload estimates and GPU timings for LOD disabled versus enabled.
- Test narrow, wide, high-DPI, and resized aspect ratios.

## Exit criteria

- Three LODs are selected and compacted on GPU and rendered with no more than three swarm draws.
- Every visible instance belongs to exactly one valid LOD stream with no buffer overflow.
- Transitions are stable during slow camera motion; any remaining pop is documented with rationale.
- Visual scene communicates scale and motion clearly while all expensive presentation effects are measurable and toggleable.
- LOD produces a demonstrated GPU-time benefit in the showcase scenario or its limitations are documented honestly.

## Risks and mitigations

| Risk                                          | Mitigation                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Billboards require expensive blending/sorting | Use additive/opaque-soft visuals and avoid sorted alpha                      |
| LOD classification triples atomic contention  | Use independent counters and profile per stream                              |
| Visual polish masks renderer cost             | Benchmark core, background, and optional effects independently               |
| Threshold flicker distracts                   | Base selection on projected size and add measured hysteresis/transition band |
