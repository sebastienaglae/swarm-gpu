# Phase 00 — Product contract

- Status: Complete
- Accepted: 2026-08-30
- Owners: SwarmGPU maintainers

## Objective

Turn the idea into a bounded engineering contract before implementation begins. This phase prevents feature drift and defines exactly what a public v1.0 must prove.

## Entry criteria

- Empty or planning-only repository.
- Raw WebGPU is accepted as the rendering API.
- The project is a technical renderer demonstration, not a general-purpose engine or game.

## Scope of v1.0

The product is one interactive space-swarm scene containing a single logical population. Every instance has GPU-resident position, velocity, orientation or heading, scale, and color/variant data. The scene supports orbit camera control, pointer attractor/repulsor interaction, pause/resume, instance-count presets, three LODs, live metrics, and deterministic benchmark mode.

The v1 pipeline is:

```text
initialize once on CPU
  -> simulate on GPU
  -> classify visibility and LOD on GPU
  -> compact visible IDs on GPU
  -> build indirect draw arguments on GPU
  -> draw on GPU
```

## Accepted product decisions

- Visual identity: a luminous low-poly space-drone swarm in a restrained dark-space scene. Near instances read as drones; mid and far representations prioritize motion and density.
- Interaction set: orbit, zoom, pointer attract/repel, pause/resume, deterministic reset, supported population presets, quality/render scale, and explicit benchmark launch/export.
- Public controls remain focused. LOD inspection, wireframe, buffer diagnostics, and fixed debug modes are development controls.
- Raw WebGPU is the only renderer. Unsupported environments receive guidance rather than a reduced WebGL version.
- Phase 09 research is outside the v1 critical path and cannot block Phases 01–08.
- MIT is the project license. Contributions follow `CONTRIBUTING.md`, the Contributor Covenant, and the private security path in `SECURITY.md`.

## Explicit non-goals

- No backend, accounts, database, multiplayer, telemetry service, or cloud dependency.
- No AI feature inside the product.
- No general scene graph, material editor, physics engine, ECS, importer, skeletal animation, or ray tracer.
- No mobile performance promise for v1.
- No WebGL fallback. Unsupported users receive an actionable compatibility screen.
- No exact occlusion culling, mesh shaders, or experimental browser flags in the primary demo.
- No claim that all machines can render one million instances at 60 FPS.

## User-visible experience

1. A loading screen requests an adapter, validates limits/features, compiles pipelines asynchronously, initializes state, and exposes progress.
2. The default scene starts at a conservative device-dependent population, never above validated buffer limits.
3. The user can orbit, zoom, move the attractor, pause, reset deterministically, and select 10k/100k/250k/500k/1m where supported.
4. The overlay exposes FPS, CPU frame time, GPU frame time when available, total/visible instances, draw calls, render scale, and active LOD counts where available without synchronous readback.
5. Benchmark mode fixes camera/input/seed/resolution and produces a downloadable report after an explicit run; readback is allowed only outside measured frames.

## Success metrics

### Correctness

- No WebGPU validation errors in normal, benchmark, resize, pause, or reset flows.
- No out-of-bounds storage access for any supported instance preset.
- Direct and indirect reference scenes produce equivalent visible results within the documented tolerance.
- Deterministic initialization reproduces the same initial state for a given seed.

### Performance

- Primary gate: 250,000 active instances at 1920×1080, median GPU frame time at or below 16.67 ms on the named reference GPU.
- CPU encoding target: median at or below 2.0 ms after warm-up on the named reference CPU.
- Stretch: 1,000,000 active instances at 60 FPS after culling in the published showcase scene.
- Steady state: no intentional heap allocation in `frame()` and no per-frame mapped-buffer readback.
- Draw calls: at most three for the swarm, one per LOD, plus explicitly documented UI/background passes.

These are acceptance targets, not marketing claims, until Phase 06 produces evidence.

### Reliability

- Ten-minute 10k and 100k runs, ten-minute 500k run on reference hardware, and two-minute 1m run where device limits permit.
- Continuous resize, visibility-tab pause/resume, scene rebuild, LOD switching, and device-loss test paths complete without stale animation loops or leaked resources.

## Canonical data contract

The initial implementation uses Structure of Arrays because simulation, culling, and rendering consume different subsets. The exact packing is finalized with `minStorageBufferOffsetAlignment`, binding-size, and memory-budget checks in Phase 01.

```text
positionsA/B : array<vec4<f32>>  // xyz + scale/radius
velocitiesA/B: array<vec4<f32>>  // xyz + seed/phase
appearance   : array<vec4<u32>>  // packed color, variant, flags, spare
visibleIds   : one region per LOD
lodCounters  : atomic counters
indirectArgs : one DrawIndexedIndirect record per LOD
```

Ping-pong is limited to mutable simulation state. Immutable appearance data is single-buffered. Buffer memory estimates must be shown before raising population caps.

## Benchmark contract

Every committed benchmark scenario declares:

- Scenario ID and git commit.
- Seed, instance count, visibility/camera path, LOD thresholds, render scale, and canvas size.
- Browser name/version, OS, GPU/driver, adapter limits/features, and power preference.
- Warm-up duration of at least 5 seconds and sample duration of at least 20 seconds.
- Median, p95, and p99 CPU frame time; GPU time if timestamp queries are available.
- Dropped/long frames, visible counts sampled outside the measurement window, and notes on thermal/power conditions.

## Engineering policies

- TypeScript strict mode; WGSL bindings and struct layouts have a single documented source.
- No `any` in production paths without a comment and issue reference.
- Resource ownership is explicit; every destroyable GPU resource has one lifecycle owner.
- Development uses labels on buffers, textures, bind groups, pipelines, and passes.
- Shaders guard `global_invocation_id.x >= instanceCount` before buffer access.
- Hot-loop changes require a benchmark comparison, not intuition alone.
- Generated assets and third-party code must have documented provenance and compatible licenses.

## Work checklist

- [x] Record the reference development machine and intended baseline browser.
- [x] Confirm the v1 interaction set and the visual identity “space drone swarm.”
- [x] Approve the non-goals and prevent Phase 09 work from entering the critical path.
- [x] Create an architecture decision record template.
- [x] Create issue and pull-request templates referencing phase checklist items.
- [x] Define licensing choice, contribution policy, code of conduct, and security reporting path.
- [x] Define the benchmark JSON schema and evidence directory naming convention.
- [x] Establish the initial memory budget for 10k through 1m populations.

## Capability ownership

Each v1 capability has one primary implementation phase. Later phases may test or document it but do not own a duplicate implementation.

| Capability | Owning phase |
|---|---|
| Toolchain, CI, capability negotiation, unsupported UI, device lifecycle | Phase 01 |
| Camera, mesh, depth, resize, static instancing, basic overlay | Phase 02 |
| GPU motion, ping-pong state, deterministic reset, pointer attract/repel | Phase 03 |
| Frustum culling, visible-ID compaction, indirect argument generation/draw | Phase 04 |
| Three LOD representations, GPU classification, final visual language | Phase 05 |
| GPU timing, benchmark runner, allocation audit, dynamic resolution, optimization | Phase 06 |
| Input/bounds hardening, recovery qualification, automated stress matrix | Phase 07 |
| Public README, media, hosted demo, release qualification and v1.0 tag | Phase 08 |

Phase 09 owns post-v1 experiments only; it contains no required v1 capability.

## Exit criteria

- Scope, non-goals, success metrics, data contract direction, and benchmark contract are accepted.
- Unknown reference hardware fields are tracked explicitly and block performance marketing, not implementation.
- Every planned v1 capability belongs to exactly one phase from 01 through 08.

## Evidence to retain

- [ADR 0001: raw WebGPU](../architecture/decisions/0001-raw-webgpu.md).
- [ADR 0002: Structure of Arrays](../architecture/decisions/0002-structure-of-arrays.md).
- [Reference hardware record](../reference-hardware.md).
- [Initial memory-budget worksheet](../architecture/memory-budget.md).
- [Benchmark evidence policy](../benchmarking/evidence-policy.md) and [result schema](../../benchmarks/schemas/benchmark-result.schema.json).
- Project templates under `.github/` and the root governance files.

## Acceptance record

The scope, non-goals, metrics, SoA direction, benchmark contract, visual identity, interaction set, ownership matrix, and public governance are accepted as the v1 contract on 2026-08-30. Changing any of those boundaries requires an ADR or an explicit update to this phase before implementation diverges.

Runtime WebGPU adapter identity, features, and limits remain pending by design. They are enumerated in the reference-hardware record and must be captured in Phase 01. Until then they block performance marketing, not implementation.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| One-million headline drives unsafe defaults | Select defaults from validated limits and maintain 250k as the primary gate |
| Browser implementations differ | Capture adapter capabilities and test stable Chrome/Edge plus another implementation when viable |
| Metrics become UI decoration rather than evidence | Separate live approximate overlay from controlled benchmark reports |
| Scope grows into a game engine | Reject work not required by the fixed pipeline or move it to Phase 09 |
