# Phase 09 — Research extensions

## Objective

Provide a disciplined home for optional experiments after v1.0. None of this phase is required for the public release, and no experiment may weaken the simple, demonstrable core pipeline.

## Entry criteria

- Phase 08 release is complete.
- A specific measured bottleneck or research question motivates each experiment.

## Experiment protocol

Every experiment begins with a short proposal containing hypothesis, baseline scenario/report, expected tradeoff, implementation boundary, success threshold, correctness check, and removal plan. It lives behind a compile-time or clear runtime flag until accepted. Results include negative findings.

## Candidate experiments

### Hierarchical or scan-based compaction

- Replace per-instance global atomic append with workgroup-local compaction and prefix sums.
- Compare at 10%, 50%, and 100% visibility across multiple GPUs.
- Accept only if the gain outweighs extra passes, scratch memory, and maintenance complexity.

### Structure of Arrays versus packed/AoS layouts

- Implement comparable layouts with identical visual and benchmark scenarios.
- Measure simulation, culling, render, total GPU time, and memory.
- Document alignment/packing portability and shader complexity, not only peak speed.

### Approximate occlusion

- Explore a conservative hierarchical depth approach only after frustum/LOD profiling shows raster or vertex work remains limiting.
- Prevent previous-frame occlusion from creating objectionable false negatives during fast camera motion.
- Quantify depth-pyramid cost, saved work, latency artifacts, and memory.

### Multi-species visuals

- Test fish, asteroid, fragment, and drone variants through immutable appearance IDs and shared pipeline layouts.
- Avoid a general asset/scene system.
- Keep draw/pipeline growth visible in metrics.

### Adaptive simulation frequency

- Update distant LOD populations less frequently while preserving smooth rendered extrapolation.
- Quantify bandwidth savings and visible temporal artifacts.
- Keep deterministic benchmark modes explicit.

### Worker/off-main-thread preparation

- Explore worker ownership only for measured CPU/main-thread contention and supported browser behavior.
- Do not present worker use as GPU parallelism by itself.
- Retain simple main-thread mode as the correctness baseline.

### Additional presentation effects

- Consider lightweight bloom, motion trails, or velocity colorization as separately timed optional passes.
- Never include them in core headline comparisons without declaring them.

## Work checklist

- [ ] Create an experiment proposal template.
- [ ] Assign a unique scenario/result schema version when measurements change meaning.
- [ ] Preserve v1 baseline mode and reports.
- [ ] Add correctness comparison before performance comparison.
- [ ] Test on at least two GPU architectures before generalizing a vendor-specific result.
- [ ] Record rejected/negative experiments in an engineering notes index.
- [ ] Promote accepted work into architecture docs and release notes; delete abandoned flags/code.

## Exit criteria for an individual experiment

- Hypothesis is answered with comparable benchmark evidence.
- Correctness and stress checks pass against the v1 reference.
- Complexity, memory, portability, and maintenance costs are documented.
- The experiment is either promoted cleanly or removed completely; no permanent half-integrated path remains.

## Explicitly deferred ideas

- General-purpose engine/editor, ECS, backend services, AI-driven runtime behavior, networked swarms, physically accurate n-body simulation, cross-platform native renderer, and WebGL compatibility layer remain outside this repository unless the project charter is intentionally rewritten in a future major version.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Research flags accumulate into untestable combinations | One experiment at a time; promote or remove promptly |
| Vendor-specific optimization becomes default | Require multi-architecture evidence and maintain portable baseline |
| New visuals dilute the technical story | Keep the fixed pipeline and benchmark evidence central |
| Optional work delays maintenance | Phase 09 begins only after v1 release and uses bounded proposals |

