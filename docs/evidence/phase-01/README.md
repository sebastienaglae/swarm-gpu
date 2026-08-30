# Phase 01 evidence

Evidence was captured on the reference development machine described in `docs/reference-hardware.md`.

## Automated checks

- `npm run check`: formatting, strict ESLint, strict TypeScript, 20 unit tests, and production build pass locally.
- `npm run test:e2e`: three Chromium flows pass: unsupported WebGPU, sanitized initialization failure/retry, and a complete supported contract with rendering, pause/resume/reset, bounded recovery, and manual retry.
- Production output at capture: 1.96 kB HTML, 1.90 kB CSS, and 13.62 kB JavaScript before gzip figures shown by Vite.

## Hardware WebGPU smoke

[reference-capabilities.json](reference-capabilities.json) records the selected high-performance adapter's WebGPU features and relevant limits from installed Google Chrome without experimental WebGPU flags. The application reached `running` at a 1920×1080 physical canvas and emitted no uncaptured GPU errors. This is a capability/clear-pass qualification, not a performance result.

Capacity derivation reserves 32 MiB of the 256 MiB explicit project ceiling for attachments, mesh/uniform/query resources, indirect arguments, and alignment headroom before applying the 92-byte per-instance cost.

The browser exposed vendor `nvidia` and architecture `turing`, but withheld its device and description strings. Windows inventory identifies the intended adapter as an NVIDIA GeForce GTX 1650; the evidence retains both facts rather than claiming the browser exposed more than it did.

## Visual evidence

- [supported-clear-screen.png](supported-clear-screen.png): hardware-backed Phase 01 clear pass and diagnostic overlay.
- [unsupported-webgpu.png](unsupported-webgpu.png): actionable adapter-unavailable screen with retry action.

The screenshots contain no username, hostname, private path, or browser profile data.

## Remaining external evidence

The GitHub Actions workflow is committed and its local equivalent passes. A remote green workflow link cannot exist until these commits are pushed; pushes are intentionally outside the current authorization. This does not weaken the local implementation evidence but remains an external Phase 01 release gate.
