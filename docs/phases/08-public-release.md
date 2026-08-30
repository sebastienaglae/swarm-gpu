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

- [ ] Write concise architecture overview and link accepted ADRs.
- [ ] Add Mermaid or checked-in vector pipeline diagram with accessible alt text.
- [ ] Document buffer layouts, pass ordering, synchronization assumptions, and resource lifecycle.
- [ ] Publish benchmark methodology, schemas, reference reports, and reproduction steps.
- [ ] Document browser/security-context requirements and unsupported-device behavior.
- [ ] Write an honest limitations section: hardware variance, timestamp availability, approximate visibility metrics, lack of WebGL fallback, and transparency tradeoffs.
- [ ] Complete contribution, security, code-of-conduct, license, asset attribution, and third-party notices.

### Media and presentation

- [ ] Record a deterministic ten-second showcase at a stable frame rate and representative density.
- [ ] Capture performance overlay and a clean beauty frame.
- [ ] Optimize media size without making text unreadable or hiding frame pacing.
- [ ] Include captions/alt text and avoid relying on animation alone to explain the project.
- [ ] Ensure captures match the released commit and benchmark configuration.

### Hosting

- [ ] Select static HTTPS hosting compatible with WebGPU requirements.
- [ ] Configure correct base path, immutable hashed assets, useful fallback page, and no secret configuration.
- [ ] Test production build from a clean clone before deployment.
- [ ] Add deployment preview for pull requests if it does not broaden permissions unnecessarily.
- [ ] Smoke-test hosted demo on supported browsers and one unsupported path.
- [ ] Document hosting ownership, rollback, and custom-domain details if used.

### Release engineering

- [ ] Establish semantic versioning and maintain `CHANGELOG.md`.
- [ ] Run full checks, benchmark suite, stress matrix, link checker, and production smoke test against the release candidate.
- [ ] Review dependency licenses and production bundle contents.
- [ ] Verify no source maps, reports, logs, environment files, or media contain private paths or machine identifiers beyond intentionally published hardware metadata.
- [ ] Tag signed/annotated `v1.0.0`, create release notes, attach or link evidence, and retain rollback artifact.
- [ ] Create post-release issue templates for bug, performance report, and browser/device compatibility.

## Release acceptance checklist

- [ ] Hosted demo loads over HTTPS and reaches first interactive frame without console/validation errors.
- [ ] Default settings are safe on the minimum supported capability profile.
- [ ] 10k, 100k, 250k, 500k, and 1m options are enabled or clearly disabled based on capacity.
- [ ] README claims match committed benchmark reports and released code.
- [ ] GIF/capture, diagram, performance table, optimization table, demo link, and limitations are present.
- [ ] Clean-clone quick start succeeds on a second environment.
- [ ] All internal documentation links and phase links resolve.
- [ ] Repository contains no credentials, private endpoints, personal tokens, or unlicensed assets.

## Exit criteria

- A reproducible `v1.0.0` tag, hosted static demo, and complete public README exist.
- Release evidence identifies exact code, scenario, environment, and methodology.
- A new contributor can understand architecture, run the project, reproduce a smoke benchmark, and find the correct phase/issue context.
- Known limitations and unsupported configurations are visible before users mistake them for bugs.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Marketing claim exceeds evidence | Generate tables from committed reports where possible and review each headline number |
| Hosted environment differs from local preview | Test the exact deployed artifact and base path |
| Large media harms initial load | Use poster/thumbnail, lazy media, and optimized encodes |
| Public history exposes secrets or private paths | Run release audit before first push and avoid committing sensitive data at any stage |

