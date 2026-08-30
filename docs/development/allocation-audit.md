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

## Phase 02 static renderer audit

The steady-state source audit at 10k and 100k found no application-owned `new`, array literal, object literal, closure creation, shader construction, bind-group creation, pipeline creation, buffer creation, or texture creation in `App.#onFrame` or `StaticSwarmRenderer.render`.

- Camera matrices, input deltas, uniform staging, attachments, pass descriptors, texture-view descriptor, encoder descriptor, command-buffer descriptor, and submission array are persistent.
- Each frame writes 224 uniform bytes, encodes one pass, submits two configured draws, and records numeric timing into preallocated 4096-entry rings.
- Diagnostics format strings and update DOM text at 4 Hz, outside the measured renderer timing. Benchmark snapshots allocate only after the measurement window.
- Browser-owned current texture views, command encoders, render-pass encoders, and command buffers remain unavoidable wrapper objects.
- Resizing alone recreates the depth texture and view. Population switching changes only the direct instance count.

The retained Phase 02 evidence records source inspection and benchmark behavior rather than a raw DevTools allocation profile, which stays local under the evidence policy. A release-grade allocation timeline remains a Phase 06 observability task.

## Phase 03 simulation audit

- `App.#onFrame` mutates one persistent `SimulationFrame` object and preallocated camera/attractor arrays.
- Both compute bind groups and both render bind groups are immutable after initialization; parity selects array entries without rebuilding resources.
- The simulation dispatch, render pass, and submission share one command encoder. No instance loop, mapped buffer, promise, descriptor construction, or debug counter readback occurs in the interactive path.
- Reset performs bounded chunk uploads of retained initial arrays only on explicit user action; it does not rebuild pipelines, layouts, or bind groups.
- Fixture capture and timestamp resolution are explicit paused-development operations and are excluded from interactive allocation/readback claims.

## Phase 04 culling audit

- Visible IDs, counters, indirect arguments, culling bind groups, and both compute pipelines are
  created once. The frame only clears two persistent ranges, selects parity bind groups, and encodes
  three dispatches plus `drawIndexedIndirect`.
- The CPU never iterates over instances or retrieves the visible count during interactive frames.
  The overlay deliberately reports `GPU-resident` instead of manufacturing a synchronized number.
- `captureVisibility` creates and maps readback buffers only through an explicit paused development
  action. Benchmark timestamp mapping occurs after the 20-second interactive measurement window.
- The deterministic visibility control mutates existing uniform fields and is enabled only by the
  benchmark query parameter; it does not allocate inside the loop.

## Phase 05 LOD audit

- Three render pipelines, combined mesh buffers, three list regions, counter records, and indirect
  records are all created during initialization. Per-frame LOD and visual controls update fields in
  the existing uniform staging array only.
- Fixed/auto LOD, thresholds, debug colors, fog, background, marker, and render scale do not rebuild
  GPU pipelines or bind groups. Render-scale changes only resize the depth/canvas attachments as an
  explicit user action.
- The three indirect draw calls are statically encoded. Empty LODs are skipped by a GPU-written zero
  instance count rather than CPU-visible counters.
- Camera-sweep, ID capture, and benchmark counters remain paused development readbacks outside the
  interactive loop.
