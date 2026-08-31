# Phase 08 — Public release and demo

## Objective

Package the renderer as a credible public engineering project: reproducible demo, honest evidence, clear architecture, maintainable documentation, and a tagged v1.0 release.

## Entry criteria

- Phases 00–07 pass their exit gates.
- Performance and reliability evidence exists on named hardware.

## README final structure

1. One-sentence technical value proposition.
2. Ten-second GIF/video poster and direct hosted-demo link.
3. Verified headline benchmark table with full hardware summary.
4. Pipeline diagram showing CPU globals through GPU indirect draws.
5. Feature list centered on compute, culling, LOD, indirect rendering, and lifecycle safety.
6. Quick start with exact prerequisites and commands.
7. Controls and benchmark instructions.
8. Architecture/data-flow explanation and memory layout.
9. Before/after optimization table linked to comparable reports.
10. Browser support, limitations, roadmap, contributing, license, and acknowledgments.

The README must distinguish measured results from targets. Replace every placeholder such as `RTX XXXX` before release.

## Implementation work

### Documentation

- [x] Write concise architecture overview and link accepted ADRs.
- [x] Add Mermaid or checked-in vector pipeline diagram with accessible alt text.
- [x] Document buffer layouts, pass ordering, synchronization assumptions, and resource lifecycle.
- [x] Publish benchmark methodology, schemas, reference reports, and reproduction steps.
- [x] Document browser/security-context requirements and unsupported-device behavior.
- [x] Write an honest limitations section: hardware variance, timestamp availability, approximate visibility metrics, lack of WebGL fallback, and transparency tradeoffs.
- [x] Complete contribution, security, code-of-conduct, license, asset attribution, and third-party notices.

### Media and presentation

- [x] Record a deterministic ten-second showcase at a stable frame rate and representative density.
- [x] Capture performance overlay and a clean beauty frame.
- [x] Optimize media size without making text unreadable or hiding frame pacing.
- [x] Include captions/alt text and avoid relying on animation alone to explain the project.
- [x] Ensure captures match the released commit and benchmark configuration.

### Hosting

- [x] Select static HTTPS hosting compatible with WebGPU requirements.
- [x] Configure correct base path, immutable hashed assets, useful fallback page, and no secret configuration.
- [x] Test production build from a clean clone before deployment.
- [x] Add deployment preview for pull requests if it does not broaden permissions unnecessarily.
- [x] Smoke-test hosted demo on supported browsers and one unsupported path.
- [x] Document hosting ownership, rollback, and custom-domain details if used.

### Release engineering

- [x] Establish semantic versioning and maintain `CHANGELOG.md`.
- [x] Run full checks, benchmark suite, stress matrix, link checker, and production smoke test against the release candidate.
- [x] Review dependency licenses and production bundle contents.
- [x] Verify no source maps, reports, logs, environment files, or media contain private paths or machine identifiers beyond intentionally published hardware metadata.
- [ ] Tag signed/annotated `v1.0.0`, create release notes, attach or link evidence, and retain rollback artifact.
- [x] Create post-release issue templates for bug, performance report, and browser/device compatibility.

## Release acceptance checklist

- [x] Hosted demo loads over HTTPS and reaches first interactive frame without console/validation errors.
- [x] Default settings are safe on the minimum supported capability profile.
- [x] 10k, 100k, 250k, 500k, and 1m options are enabled or clearly disabled based on capacity.
- [x] README claims match committed benchmark reports and released code.
- [x] GIF/capture, diagram, performance table, optimization table, demo link, and limitations are present.
- [x] Clean-clone quick start succeeds on a second environment.
- [x] All internal documentation links and phase links resolve.
- [x] Repository contains no credentials, private endpoints, personal tokens, or unlicensed assets.

## Exit criteria

- A reproducible `v1.0.0` tag, hosted static demo, and complete public README exist.
- Release evidence identifies exact code, scenario, environment, and methodology.
- A new contributor can understand architecture, run the project, reproduce a smoke benchmark, and find the correct phase/issue context.
- Known limitations and unsupported configurations are visible before users mistake them for bugs.

## Risks and mitigations

| Risk                                            | Mitigation                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Marketing claim exceeds evidence                | Generate tables from committed reports where possible and review each headline number |
| Hosted environment differs from local preview   | Test the exact deployed artifact and base path                                        |
| Large media harms initial load                  | Use poster/thumbnail, lazy media, and optimized encodes                               |
| Public history exposes secrets or private paths | Run release audit before first push and avoid committing sensitive data at any stage  |
