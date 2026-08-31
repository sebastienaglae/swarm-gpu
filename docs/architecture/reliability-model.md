# Reliability model

SwarmGPU classifies failures as unsupported capability, initialization failure, uncaptured runtime
GPU error, device loss, invalid content/configuration, and test timeout. Public messages remain short;
the diagnostics export retains bounded event records with category, application state, timestamp, and
driver-provided message. It does not collect personal data.

## Defensive boundary

Before allocation or encoding, checked helpers validate safe integer arithmetic, 4-byte buffer
alignment, device buffer limits, compute dispatch limits, indirect-record offsets, and mesh ranges.
Renderer capacity is rejected above the project/device bound rather than silently truncated. Public
controls accept only known population/LOD/scale values; continuous numeric inputs are finite-clamped.

Shaders independently guard invocation IDs and list capacity. Simulation clamps timestep to 1/30 s,
avoids degenerate normalization, rejects NaN/infinite-like state, and reconstructs invalid fixtures
deterministically. Indirect instance counts are clamped to their region capacity.

## Device loss and recovery

`device.lost` is installed immediately after device creation. A matching generation stops the sole
animation-frame owner before resources are destroyed. The application records the driver reason,
enters `recovering`, reacquires adapter/device, rebuilds deterministic scene resources, restores the
existing CPU camera/control state, and schedules exactly one loop. Automatic recovery is limited to
one attempt; subsequent loss shows an explicit retry action. This is an injected lifecycle test, not
a claim that every physical driver failure is recoverable.

## Ownership invariants

- Application and renderer registries destroy registered resources once, in reverse ownership order.
- Global development counters expose created, destroyed, and active registered resources.
- Loop counters expose scheduled, cancelled, executed, active, and peak-active ownership.
- Scene rebuild must return active resources to its baseline; the reference 100-cycle run created and
  destroyed 1,200 tracked resources with zero active drift.
- Resize destroys the previous depth texture; renderer destruction releases depth, query/readback,
  state, mesh, uniform, visible-list, counter, and indirect resources.
- Visibility pause clears the previous timestamp, preventing a resume delta spike.
- Detached or zero-area canvases skip drawing until a valid connected drawable surface returns.

WebGPU implementations may retain internal caches after application resources are destroyed. Browser
process memory is therefore approximate and is never sufficient alone to label a leak; ownership
counters, stable frame timing, validation events, and repeated-baseline behavior are evaluated
together.
