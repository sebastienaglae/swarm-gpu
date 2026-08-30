# Phase 01 — Project foundation

- Status: Complete
- Local qualification: Passed on 2026-08-30
- Remote CI gate: Passed on 2026-08-30 (CI #9, commit `d6a0039`)
- Owners: SwarmGPU maintainers

## Objective

Create a strict, reproducible application foundation and a fault-aware WebGPU lifecycle before any high-volume rendering code exists.

## Entry criteria

- Phase 00 exit criteria pass.
- Node.js support policy and package manager are selected and pinned.

## Deliverables

- Vite + TypeScript application with strict compiler settings.
- Formatting, linting, unit tests, browser tests, type checking, production build, and CI.
- Capability negotiation and unsupported-device UI.
- Explicit GPU resource ownership and application state machine.
- Development diagnostics suitable for shader and validation failures.

## Planned modules

```text
src/main.ts
src/app/App.ts
src/app/AppState.ts
src/gpu/createGpuContext.ts
src/gpu/Capabilities.ts
src/gpu/ResourceRegistry.ts
src/gpu/GpuError.ts
src/diagnostics/DiagnosticsOverlay.ts
src/input/InputState.ts
```

Application lifecycle states are `idle -> initializing -> ready -> running -> paused -> recovering -> disposed`, with `failed` reachable from initialization or recovery. State transitions are testable and prevent multiple animation loops.

## Implementation work

### Toolchain and repository hygiene

- [x] Initialize Git with an intentional default branch and add a permissive or copyleft license selected in Phase 00.
- [x] Pin Node through `.nvmrc` or equivalent and declare `engines` plus `packageManager`.
- [x] Configure Vite, strict TypeScript, ESLint, Prettier, Vitest, and Playwright.
- [x] Add scripts for `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:e2e`, and `check`.
- [x] Commit lockfile and configure automated dependency updates.
- [x] Add CI for clean install, checks, production build, and browser smoke test.
- [x] Add issue/PR templates, contributing guide, security policy, code of conduct, and changelog policy.
- [x] Ensure generated benchmark reports and captures have an explicit commit/ignore policy.

### WebGPU bootstrap

- [x] Check secure context, `navigator.gpu`, adapter acquisition, and device acquisition independently.
- [x] Request only features actually used; treat `timestamp-query` as optional.
- [x] Record adapter info when exposed, supported features, and relevant limits.
- [x] Clamp requested instance capacity against storage binding size, total allocation budget, and indirect-buffer requirements.
- [x] Configure canvas with the preferred format, explicit alpha mode, and device-pixel-aware sizing.
- [x] Install `device.lost` handling before rendering begins.
- [x] Install development uncaptured-error reporting and scoped error capture around pipeline/resource creation.
- [x] Label all GPU objects in development builds.

### Lifecycle and resource safety

- [x] Centralize animation-frame ownership and cancellation.
- [x] Make `start`, `pause`, `resume`, `reset`, and `dispose` idempotent.
- [x] Use `ResizeObserver`; ignore zero-sized canvases and cap dimensions against device limits.
- [x] Destroy replaced textures and large buffers deliberately.
- [x] Remove event listeners and observers during disposal.
- [x] Implement a recovery policy: show state, reacquire adapter/device, rebuild resources, and restart once safe.
- [x] Prevent recovery loops with bounded retry and a user-invoked retry button.

### Allocation discipline

- [x] Input events update a preallocated scalar/typed-array state rather than building event-derived vectors.
- [x] Camera and global uniform staging arrays are allocated once.
- [x] Establish a development-only allocation audit method using browser tooling and record its limitations.
- [x] Ban runtime shader string assembly; import static WGSL modules.

## Validation plan

### Automated

- Unit-test lifecycle transitions, capability-derived population caps, byte-size/alignment helpers, and resize calculations.
- Browser smoke-test supported and mocked unsupported paths.
- Build with source maps disabled or controlled for release, while keeping useful development diagnostics.
- CI fails on formatting, lint, types, unit tests, e2e smoke tests, or production build.

### Manual

- Load under an unsupported browser and verify useful guidance.
- Repeatedly mount/dispose the app and verify a single active animation loop.
- Resize between normal, tiny, zero, DPR-changed, and maximized canvas sizes.
- Trigger a synthetic initialization error and verify that raw shader/device errors are not dumped as the only user message.

## Exit criteria

- Fresh clone to running development server follows documented commands without global dependencies beyond pinned Node tooling.
- CI is green on the default branch.
- A clear screen renders using WebGPU, resize is correct, and lifecycle controls do not create duplicate loops.
- Unsupported WebGPU and initialization failure produce actionable UI.
- Capabilities and resource estimates are available to later phases through typed interfaces.
- No uncaptured validation error appears in the supported smoke path.

## Evidence to retain

- [Phase 01 evidence index](../evidence/phase-01/README.md).
- [Reference hardware capability capture](../evidence/phase-01/reference-capabilities.json).
- [Supported clear-pass screenshot](../evidence/phase-01/supported-clear-screen.png) and [unsupported-state screenshot](../evidence/phase-01/unsupported-webgpu.png).
- Local quality gate: 20/20 unit tests plus formatting, lint, strict types, and production build.
- Browser gate: 3/3 supported/failure/recovery flows.
- Remote GitHub Actions gate: CI #9 passed on commit `d6a0039`.

## Qualification record

All implementation checklist items and locally executable exit criteria passed on 2026-08-30. Installed Chrome selected a hardware WebGPU adapter reporting vendor `nvidia`, architecture `turing`, and `timestamp-query`; the application rendered a 1920×1080 clear pass with no uncaptured GPU or console error. Capability limits and derived capacity are retained in the evidence directory.

The committed GitHub Actions workflow runs clean install, the aggregate quality gate, a production build, and browser smoke tests. CI #9 passed on `d6a0039`; `origin/main` was independently verified at that same commit. All Phase 01 exit criteria are therefore satisfied.

## Risks and mitigations

| Risk                                | Mitigation                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Type packages lag browser APIs      | Pin compatible WebGPU types and isolate compatibility shims                               |
| Device loss is untestable on demand | Provide a development recovery injection path and test state transitions separately       |
| High-DPI canvas exceeds limits      | Clamp physical size and expose effective render resolution                                |
| CI lacks hardware WebGPU            | Keep GPU browser smoke tagged/conditional and run deterministic CPU-side tests everywhere |
