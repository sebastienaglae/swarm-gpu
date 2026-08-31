# Phase 07 — Reliability and stress

## Objective

Prove that the renderer survives long runs, lifecycle changes, invalid environments, and capacity boundaries without validation errors, runaway resources, or misleading recovery behavior.

## Entry criteria

- Complete optimized pipeline and benchmark tooling from Phase 06.
- Resource ownership and recovery hooks established in Phase 01.

## Reliability model

Failures are categorized as unsupported capability, initialization error, runtime validation/internal/out-of-memory error, device loss, content/config error, and test timeout. User messages remain concise; developer diagnostics retain labels, cause chains, phase/pass context, and adapter metadata without collecting personal data.

## Implementation work

### Defensive validation

- [x] Validate instance count, buffer byte sizes, alignments, dispatch counts, texture dimensions, indirect offsets, and mesh ranges before GPU creation/encoding.
- [x] Use checked integer arithmetic helpers and reject counts that overflow JavaScript-safe or WebGPU-relevant ranges.
- [x] Clamp all user numeric inputs and reject non-finite values.
- [x] Guard shader invocation bounds, output capacities, degenerate normalization, and timestep extremes.
- [x] Scope expected GPU errors in tests; treat uncaptured errors as failures.
- [x] Give every large resource and pass a useful debug label.

### Device loss and recovery

- [x] Stop scheduling/encoding immediately when loss is observed.
- [x] Surface loss reason/message in developer diagnostics without promising recovery.
- [x] Dispose CPU-side listeners/references and destroy eligible old resources.
- [x] Reacquire adapter/device and rebuild resources from deterministic scene configuration.
- [x] Restore camera/settings safely and restart exactly one loop.
- [x] Bound automatic retries and provide an explicit retry/reload action.
- [x] Test recovery state transitions through injection even when physical device loss cannot be forced.

### Lifecycle robustness

- [x] Repeatedly start, pause, resume, reset, rebuild scene, and dispose.
- [x] Handle document visibility changes without an enormous simulation delta.
- [x] Handle canvas removal/reinsertion and zero-area resize.
- [x] Verify old depth textures, query buffers, state buffers, observers, and event handlers are released.
- [x] Provide development counters for resource creation/destruction and active loop ownership.

### Stress automation

- [x] Create a scenario runner with timeout, progress, result, error capture, and optional screenshots.
- [x] Run quick stress in pull requests and extended stress manually/nightly on WebGPU hardware.
- [x] Persist scenario version, commit, environment, maximum memory estimate, validation events, and timing drift.
- [x] Detect performance degradation across intervals that may indicate thermal throttling separately from leaks.
- [x] Document that browser process memory is approximate and use multiple signals before claiming a leak.

## Required stress matrix

| Scenario            | Duration/repetitions | Pass condition                                  |
| ------------------- | -------------------: | ----------------------------------------------- |
| 10k soak            |               10 min | No error, stable loop/resources                 |
| 100k soak           |               10 min | No error, bounded timing drift                  |
| 500k soak           |               10 min | No error on reference hardware                  |
| 1m soak             |                2 min | No error where supported                        |
| Resize storm        |        1,000 changes | Correct dimensions, old attachments released    |
| Pause/resume        |           500 cycles | One loop, bounded delta, stable state           |
| LOD/quality switch  |           500 cycles | No pipeline/buffer churn outside design         |
| Scene rebuild       |           100 cycles | Resource counters return to baseline            |
| Tab hide/show       |           100 cycles | No simulation explosion                         |
| Recovery injection  |            25 cycles | Bounded retry, correct state/user UI            |
| Capacity boundaries |      min, max, max+1 | Accept safe values; reject unsafe value clearly |

## Test layers

- Pure unit tests for bounds, byte arithmetic, lifecycle reducer, and scenario parsing.
- Shader fixture tests via small buffers and explicit paused readback.
- Playwright flows for controls, resize, visibility where automatable, and unsupported UI.
- Visual regression for deterministic reference frames with documented tolerances.
- Hardware stress suite excluded from generic CI when no compatible adapter is guaranteed, but required before release.

## Exit criteria

- The required reference-hardware stress matrix passes or each unsupported row is explicitly justified by a validated device limit.
- No uncaptured WebGPU validation error appears in logs.
- Scene rebuild and recovery do not leave duplicate animation loops, handlers, observers, or tracked resources.
- Unsafe capacity/input values fail before allocation/dispatch with actionable diagnostics.
- Known browser/driver limitations and recovery boundaries are documented for the public release.

## Risks and mitigations

| Risk                                      | Mitigation                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Hardware GPU CI is unavailable            | Separate universal CI from recorded release qualification on named hardware             |
| Device loss cannot be forced reliably     | Inject lifecycle loss events and document limits of the simulation                      |
| Long tests are flaky from thermal state   | Record clocks/power context when possible and distinguish correctness from timing gates |
| Apparent memory growth is browser caching | Track owned resources and repeat rebuild baselines before declaring a leak              |
