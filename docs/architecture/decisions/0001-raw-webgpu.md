# ADR 0001 — Use raw WebGPU as the only rendering API

- Status: Accepted
- Date: 2026-08-30
- Owners: SwarmGPU maintainers
- Phase: Phase 00

## Context

SwarmGPU exists to demonstrate direct control of GPU simulation, storage buffers, culling, compaction, LOD selection, and indirect drawing. A scene framework could shorten setup but would hide or constrain the resource and pass architecture that the repository is intended to expose.

The project is a static browser application. It does not require a backend, native packaging, a general scene graph, or a compatibility renderer.

## Decision drivers

- Make buffer layouts, bind groups, pipeline creation, pass ordering, synchronization, and indirect arguments visible in project code.
- Keep CPU work and allocations auditable.
- Use WGSL compute shaders without framework abstraction boundaries.
- Produce a focused portfolio repository rather than a broad engine integration.
- Avoid maintaining two rendering paths during v1.

## Options considered

### Raw WebGPU with TypeScript and WGSL

Provides full API control and the clearest educational architecture. It requires explicit device lifecycle, validation, resource management, camera math, and browser capability handling.

### Three.js or Babylon.js with WebGPU support

Provides cameras, meshes, loaders, and scene lifecycle quickly. Custom compute/indirect paths may depend on framework internals, and the CPU/GPU boundary becomes less obvious to readers.

### WebGL fallback alongside WebGPU

Broadens compatibility but cannot express the same compute and indirect pipeline cleanly. It doubles architecture, tests, documentation, and optimization work while weakening the repository's central claim.

### Native APIs such as Vulkan, Direct3D 12, or wgpu

Offer deeper platform control but increase setup and distribution cost. They do not provide the immediate hosted browser demo required by the project contract.

## Decision

SwarmGPU will use raw WebGPU through the browser API, TypeScript, static WGSL modules, Vite, and at most a small math library. It will not use a rendering engine or implement a WebGL fallback in v1.

Unsupported browsers or adapters receive a clear capability screen. Optional WebGPU features such as timestamp queries are feature-detected and must have honest degraded behavior.

## Consequences

### Positive

- The repository directly demonstrates the intended GPU programming skills.
- Resource lifetime and frame-loop costs are controlled and inspectable.
- The simulation-to-indirect-draw path is not coupled to framework release choices.
- The production artifact remains a static site.

### Negative

- More foundational code and cross-browser validation are required.
- Camera, mesh, lifecycle, error handling, and instrumentation must be built and tested locally.
- Unsupported devices cannot run the scene.

### Neutral or deferred

- A future major version could reconsider another platform, but it would require a new project contract and superseding ADR.

## Validation

- Phase 01 must acquire/configure a device, show a clear unsupported path, and recover through a testable lifecycle.
- Phase 02 must render 100,000 static instances in one swarm draw.
- Phases 03–04 must implement compute through indirect draw without per-frame readback.
- Reconsider only if a required stable WebGPU capability cannot implement the contracted pipeline across the supported baseline browsers.

## Related material

- [Phase 00 product contract](../../phases/00-product-contract.md)
- [Phase 01 foundation](../../phases/01-project-foundation.md)

