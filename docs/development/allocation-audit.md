# Steady-state allocation audit

Phase 01 establishes the audit method; Phase 02 applies its zero-intentional-allocation gate to the first instanced renderer.

## Chrome procedure

1. Build and preview the production bundle so hot reload and development overlays do not affect results.
2. Open Chrome DevTools, select **Memory**, and choose **Allocation instrumentation on timeline**.
3. Start recording, interact briefly to establish the path, then leave the renderer running for at least 30 seconds without diagnostics export.
4. Stop recording and group allocations by function.
5. Repeat once with the diagnostics overlay hidden to distinguish rendering from UI updates.
6. Retain a sanitized summary under `docs/evidence/phase-<nn>/`; raw profiles stay local because they may contain private paths and browser state.

## Interpretation limits

Browser WebGPU calls necessarily create JavaScript wrapper objects such as command encoders, command buffers, and current texture views. “Zero intentional allocations” means SwarmGPU does not create transient vectors, matrices, arrays, closures, descriptors, or per-instance objects in its steady-state frame code. It does not claim the browser or WebGPU implementation allocates nothing.

DevTools changes timing and allocation behavior, so this procedure diagnoses owners but does not produce headline performance numbers. Benchmark mode remains the source for frame-time claims.

## Phase 01 baseline

- `InputState.pointer` and global uniform staging storage are allocated once.
- Render-pass descriptor, color attachment, clear color, and frame callback are allocated once.
- The WebGPU API still returns a current texture view, command encoder, render pass encoder, and command buffer each frame.
- Diagnostics update only when state, capability, or size changes in this phase.
- Shader source will be imported as static WGSL modules; runtime shader-string assembly is prohibited.
