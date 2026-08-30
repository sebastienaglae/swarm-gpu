# Phase 02 — Renderer baseline

## Objective

Build a correct static renderer with one mesh, persistent instance data, orbit camera, depth testing, and direct instanced drawing. This becomes the visual and correctness reference for later GPU-driven passes.

## Entry criteria

- Phase 01 passes and the application owns a stable device/canvas lifecycle.
- Buffer-layout helpers and capability limits are available.

## Rendering contract

- Right-handed world coordinates and clip-space conventions are documented.
- Reversed-Z versus conventional depth is decided once and recorded.
- Camera matrices and frustum extraction share the same convention and have unit tests.
- The baseline uses `drawIndexed` with a fixed CPU-known instance count; indirect drawing is intentionally deferred.
- Instance buffers are created at selected capacity and are never recreated during normal frames.

## Deliverables

- Stylized low-poly drone mesh with normals or intentionally simple lighting attributes.
- Orbit camera with pointer drag, wheel zoom, reset, and bounded distance.
- Static instance population presets through 100,000.
- Depth texture lifecycle tied to physical canvas size.
- Minimal background/grid/star field that does not obscure performance results.
- Overlay for FPS, CPU frame duration, requested population, resolution, and draw calls.

## Implementation work

### Geometry and layout

- [ ] Define a compact indexed vertex format and document stride/offsets.
- [ ] Create near-LOD mesh data procedurally or add licensed source asset plus attribution.
- [ ] Calculate and document object-space bounding radius used by later culling.
- [ ] Define WGSL structs and matching TypeScript byte layouts with alignment tests.
- [ ] Initialize deterministic positions, scale, color, and heading using a seeded PRNG outside the frame loop.
- [ ] Upload initial population in bounded chunks if one large upload risks implementation limits.

### Camera and globals

- [ ] Implement orbit yaw/pitch/distance using preallocated arrays.
- [ ] Clamp pitch and distance and handle lost pointer capture.
- [ ] Update view, projection, view-projection, camera position, time, viewport, and instance count in one aligned global-uniform block.
- [ ] Write only the used global bytes per frame.
- [ ] Unit-test known camera transforms and frustum-plane extraction fixtures.

### Pipeline and render loop

- [ ] Create shader modules, bind group layouts, pipeline layout, render pipeline, bind groups, depth texture, and render bundle candidates before animation starts.
- [ ] Await asynchronous pipeline creation and reflect progress in loading UI.
- [ ] Encode one render pass and one indexed instanced draw for the swarm.
- [ ] Keep command encoding local and allocation-conscious; cache stable descriptors where safe.
- [ ] Recreate only size-dependent attachments during resize.
- [ ] Preserve correct behavior at zero canvas area and across pause/resume.

### Diagnostics

- [ ] Implement an overlay update cadence independent from per-frame string creation where practical (for example 4 Hz).
- [ ] Track JS frame interval and CPU encode/submit duration separately.
- [ ] Show whether timing is approximate and whether GPU timestamp queries are unavailable.
- [ ] Count swarm and auxiliary draw calls from renderer configuration rather than driver introspection.

## Validation plan

- Unit tests: mesh indices within bounds, byte layouts, deterministic seed, camera fixtures, resize/depth dimensions.
- Visual reference captures: front/side drone silhouette, orbit extremes, 10k distribution, depth overlap.
- Browser tests: population switch before/after pause, resize, reset, and scene recreation.
- WebGPU validation: deliberately use exact buffer usage flags and minimum binding sizes.
- Profiling audit: capture a steady-state allocation profile at 10k and 100k and identify any remaining allocations by owner.

## Performance experiment

Run 10k, 50k, and 100k static instances at 1280×720 and 1920×1080 after warm-up. Record CPU frame, GPU frame if available, frame interval, memory estimate, and draw count. This is the pre-compute baseline; it is not compared directly to final moving-scene claims without qualification.

## Exit criteria

- 100,000 static instances render in one swarm draw call on the reference device.
- Camera, depth, resize, pause/resume, and reset are visually correct.
- No GPU validation errors or out-of-bounds access occur at supported presets.
- Stable GPU resources are not recreated in the frame loop.
- Frame-loop allocation audit is recorded; intentional diagnostics allocations are either removed or run at the documented low cadence.
- Baseline screenshots and benchmark JSON are committed under the agreed evidence policy.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A detailed mesh hides pipeline costs with raster load | Keep vertex/index counts small and publish triangle counts |
| Camera convention later breaks culling | Freeze/test matrix and clip-space conventions now |
| Overlay distorts CPU measurements | Throttle overlay and disable it during measured benchmark windows |
| Startup upload stalls | Chunk initialization and measure loading separately from steady state |

