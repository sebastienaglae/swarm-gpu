# ADR 0003 — Freeze camera, clip-space, and depth conventions

- Status: Accepted
- Date: 2026-08-30
- Owners: SwarmGPU maintainers
- Phase: Phase 02

## Context

Camera transforms, CPU frustum fixtures, later GPU culling, and depth testing must agree exactly. A convention mismatch can produce plausible rendering while rejecting visible objects or inverting the depth test.

## Decision

SwarmGPU uses a right-handed world with +Y up. The default orbit camera targets the origin and looks along its local -Z axis. Matrices are stored column-major and multiplied as `projection × view × worldPosition`.

The WebGPU clip volume is `-w ≤ x ≤ w`, `-w ≤ y ≤ w`, and `0 ≤ z ≤ w`. Phase 02 uses conventional depth: the near plane maps to zero, the far plane maps to one, depth clears to `1.0`, and geometry uses `depthCompare: less`. Reversed-Z remains a future measured change and would require a superseding ADR.

Frustum planes are extracted from the same column-major view-projection matrix: left/right are row 4 ± row 1, bottom/top are row 4 ± row 2, near is row 3, and far is row 4 − row 3. Planes are normalized before sphere tests.

## Consequences

- CPU fixtures and future WGSL culling can share one explicit contract.
- The background pipeline declares the same depth attachment format as the render pass but never writes depth.
- Any change to handedness, matrix order, clip-space Z, or depth direction must update this ADR, WGSL, camera tests, and frustum tests together.

## Validation

- Unit fixtures prove near/far projection mapping, look-at behavior, matrix order, normalized planes, and representative inside/outside spheres.
- Chrome hardware validation compiles both pipelines and renders overlapping drones without WebGPU validation errors.

## Related material

- [Static renderer layouts](../static-renderer-layout.md)
- [Phase 02 renderer baseline](../../phases/02-renderer-baseline.md)
