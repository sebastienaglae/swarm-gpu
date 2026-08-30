# ADR 0002 — Start with Structure of Arrays for GPU instance state

- Status: Accepted
- Date: 2026-08-30
- Owners: SwarmGPU maintainers
- Phase: Phase 00

## Context

Simulation reads and writes position and velocity. Culling primarily reads position and scale/radius. Rendering reads position plus immutable appearance and may derive orientation from velocity. A single large interleaved structure would make each pass fetch fields it does not need and would duplicate immutable data if the entire structure were ping-ponged.

The v1 capacity target reaches one million instances, so storage bandwidth and duplicated bytes matter. The layout must also remain simple enough to validate across TypeScript and WGSL.

## Decision drivers

- Minimize ping-ponged mutable bytes.
- Allow compute passes to bind only the state they consume.
- Make capacity and memory estimates straightforward.
- Preserve 16-byte alignment for predictable WGSL layouts.
- Keep room for a controlled AoS comparison after measurement tooling exists.

## Options considered

### Structure of Arrays with 16-byte elements

Separate position/scale, velocity/phase, and immutable appearance buffers. Mutable position and velocity are ping-ponged; appearance is not. This is simple and avoids duplicating appearance data, at the cost of multiple storage bindings.

### Array of Structures

One interleaved instance structure makes full-instance fetches convenient and reduces the number of bindings. It duplicates unused fields during ping-pong and can increase bandwidth in passes that need only positions.

### Aggressively packed scalar/half-precision data

Could reduce bandwidth and memory but increases conversion, precision risk, feature assumptions, and layout complexity before a bottleneck has been measured.

## Decision

The initial canonical layout is:

```text
positionsA/B : array<vec4<f32>>  // xyz position + scale/bounding radius
velocitiesA/B: array<vec4<f32>>  // xyz velocity + deterministic phase/seed
appearance   : array<vec4<u32>>  // packed RGBA/variant/flags/reserved
visibleIds   : three capacity-sized arrays or regions of u32 IDs
```

Position and velocity use 16 bytes per instance per copy. Appearance uses 16 bytes per instance once. Visible IDs reserve a worst-case 12 bytes per active instance so any one LOD distribution cannot overflow its assigned capacity. Counters, indirect arguments, globals, and alignment padding are fixed overhead.

Orientation is derived from velocity in rendering unless later evidence shows that stored orientation is necessary. Aggressive packing is deferred until Phase 06 can measure it.

## Consequences

### Positive

- Simulation ping-pong excludes immutable appearance.
- Culling can read position without fetching velocity and appearance.
- Per-instance storage cost is explicit and initially estimated at 92 bytes including both ping-pong copies and three worst-case visible-ID capacities.
- Individual buffer capacities can be validated against adapter binding limits.

### Negative

- More storage buffer bindings and matching bind-group layouts are required.
- Rendering may perform multiple buffer reads for one visible instance.
- Three full-capacity visible streams reserve memory for a worst case that cannot happen simultaneously.

### Neutral or deferred

- The visible-list strategy may move to a shared compact arena if evidence supports the added allocator/prefix complexity.
- AoS and packed formats remain valid Phase 09 research comparisons after the benchmark harness is stable.

## Validation

- Phase 01 must check every buffer size against runtime adapter limits before allocation.
- Phase 02 must test TypeScript/WGSL offsets and strides.
- Phase 03 must measure simulation bandwidth at 100k through 1m.
- Phase 06 must compare SoA to any proposed replacement using identical versioned scenarios.
- Reconsider when storage bandwidth is a demonstrated primary bottleneck or binding limits prevent the layout on supported devices.

## Related material

- [Memory budget](../../architecture/memory-budget.md)
- [Phase 00 product contract](../../phases/00-product-contract.md)
- [Phase 06 performance plan](../../phases/06-performance-observability.md)
