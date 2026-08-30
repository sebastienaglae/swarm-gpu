# Contributing to SwarmGPU

SwarmGPU is deliberately small: one specialized GPU-driven swarm renderer. Contributions should strengthen the pipeline described in the [project roadmap](README.md), preserve measurement integrity, and avoid turning the repository into a general-purpose engine.

## Before starting

1. Read the current phase document under `docs/phases/`.
2. Open or select an issue that names one primary phase and its checklist item.
3. Discuss architectural, buffer-layout, shader-interface, dependency, or scope changes before implementing them.
4. Keep Phase 09 experiments out of the v1 critical path.

## Development rules

- Use strict TypeScript and static WGSL modules.
- Keep per-instance work on the GPU after initialization.
- Do not add synchronous or per-frame GPU readback.
- Do not allocate intentionally inside the steady-state frame loop.
- Create buffers, pipelines, and bind groups outside the frame loop unless the documented lifecycle requires replacement.
- Label GPU resources and guard every compute invocation against the active instance count.
- Add tests for byte layouts, limits, lifecycle transitions, and shader edge cases affected by a change.
- Benchmark hot-path changes using the same versioned scenario before and after.
- Do not commit generated media or benchmark output unless it follows the evidence policy in `docs/benchmarking/evidence-policy.md`.

## Commit and pull-request scope

Prefer small, reviewable commits with imperative messages, for example:

```text
feat(simulation): add ping-pong position buffers
test(culling): cover frustum boundary spheres
docs(phase-03): record workgroup-size decision
```

A pull request must:

- Name exactly one primary phase.
- Reference at least one checklist item from that phase.
- Explain correctness and performance impact.
- Include validation evidence appropriate to the change.
- Update the phase checklist and decision log when the evidence is complete.
- Separate measured results from targets or estimates.

## Required checks

The definitive commands will be introduced in Phase 01. Once available, contributors must run the aggregate `check` command and any hardware benchmark or stress scenario relevant to the change. Hardware-specific checks may be reported manually when CI has no WebGPU adapter.

## Performance evidence

Performance reports must include the scenario version, commit, browser, operating system, GPU/driver, resolution, population, visible population sampling method, warm-up, sample duration, and median/p95/p99 timings. A result measured with different scenarios is not a valid before/after comparison.

## Assets and dependencies

New assets need source, author, license, and transformation notes. New runtime dependencies need a clear benefit, compatible license, and an explanation of why the small renderer should carry them.

## Reporting problems

Use the bug template for reproducible defects and the performance template for device-specific results. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
