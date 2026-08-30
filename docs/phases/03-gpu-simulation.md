# Phase 03 — GPU simulation

## Objective

Move all per-instance motion to compute shaders with ping-pong state, deterministic reset, bounded dynamics, and pointer-driven interaction. The CPU provides only global parameters and encodes work.

## Entry criteria

- Phase 02 produces a validated static reference renderer.
- Instance layouts, capacity checks, and resource ownership are stable.

## Simulation model

Use a visually expressive but inexpensive swarm model:

- Forward integration from position and velocity.
- Central containment force with a soft boundary and hard finite-value-safe recovery.
- Pointer-controlled attractor or repulsor in world space.
- Low-cost curl/noise-like perturbation derived from stable hashes rather than a large texture dependency.
- Speed and acceleration clamps.
- Orientation/heading derived in the vertex shader from velocity unless a measured need justifies stored quaternions.

This is not a physically accurate n-body or boids simulation. Avoid all-pairs neighbor searches in v1.

## GPU pass design

```text
state A (read) + globals -> simulate compute -> state B (write)
state B (read) -> render
next frame swaps A/B bind groups
```

Both bind groups are created during initialization. Frame parity selects them without reconstruction. Workgroup size is selected through measurement, beginning at 128 or 256 threads and validated against device limits.

## Implementation work

### State and initialization

- [ ] Allocate two position buffers and two velocity buffers at maximum selected capacity.
- [ ] Keep immutable appearance/seed data single-buffered.
- [ ] Generate deterministic initial state with documented spatial and velocity distributions.
- [ ] Add byte and total-memory estimates to capability UI before allocating.
- [ ] Implement explicit state reset without rebuilding unrelated pipelines.

### Compute shader

- [ ] Guard invocation index before every instance-state access.
- [ ] Clamp `deltaTime` to prevent explosive resume frames.
- [ ] Apply acceleration and speed limits without normalizing zero-length vectors.
- [ ] Detect invalid/non-finite-like states through safe comparisons and re-seed them deterministically; WGSL behavior and limitations are documented.
- [ ] Keep numerical constants in a uniform/config block rather than scattered magic values.
- [ ] Confirm source and destination buffers never alias in one compute dispatch.

### Interaction

- [ ] Convert pointer coordinates into a stable world-space attractor using a documented plane or ray intersection.
- [ ] Update interaction state through the global uniform only.
- [ ] Support attract, repel, disabled, and strength/radius controls.
- [ ] Ensure pointer leave, capture loss, and touch input cannot leave an unbounded force active.

### Frame integration

- [ ] Encode compute before render in the same command encoder unless measurement supports another organization.
- [ ] Swap prebuilt compute/render bind groups by frame parity.
- [ ] Skip or freeze simulation during pause without accumulating elapsed time.
- [ ] Support fixed-timestep benchmark mode and clamped variable timestep interactive mode.
- [ ] Preserve zero per-instance CPU work and zero per-frame GPU readback.

## Correctness strategy

- Provide a tiny debug population mode whose output can be copied and inspected only on explicit request while paused.
- Compare one-step shader output against a CPU reference for a few deterministic fixtures with tolerances.
- Test zero velocity, center position, boundary position, extreme allowed delta, maximum index, and inactive invocation.
- Use browser visual tests for bounded distribution and deterministic reset captures.
- Record validation errors and finite-state recovery counter only in dedicated diagnostic runs, not the normal frame loop.

## Performance matrix

Measure 100k, 250k, 500k, and 1m where capacity permits. For each, capture simulation dispatch time, render time, total GPU frame, CPU encode time, memory footprint, workgroup size, and resolution. Compare at least two workgroup sizes on the reference GPU before locking the default.

## Exit criteria

- 500,000 instances simulate entirely on the GPU and render correctly on the reference machine, subject to device capacity.
- CPU code does not iterate over instances after initialization or reset.
- No mapped readback occurs during interactive animation.
- Ping-pong buffers and bind groups are persistent and correctly alternate.
- Pause/resume and large frame gaps do not create NaNs, escape explosions, or duplicate loops.
- Deterministic reset and small-fixture shader comparison pass.

## Risks and mitigations

| Risk                                                  | Mitigation                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| Extra ping-pong buffers consume too much memory       | Compute exact budgets, pack immutable data, and clamp capacity        |
| Variable timestep changes benchmark behavior          | Use fixed timestep in benchmark mode and report it                    |
| Stored rotation increases bandwidth                   | Derive heading in vertex stage until profiling proves otherwise       |
| Read/write binding mistake creates undefined behavior | Encode layouts and parity selection in typed resource sets with tests |
