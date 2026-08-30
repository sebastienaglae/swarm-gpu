## Primary phase

<!-- Example: Phase 03 — GPU simulation -->

Phase:

Checklist item(s):

Issue:

## Change

<!-- What changed and why is it required by this phase? -->

## Correctness evidence

<!-- Tests, validation output, deterministic capture, or reference comparison. -->

## Performance evidence

<!-- Required for hot-loop, shader, layout, mesh, pass, or allocation changes. Link comparable before/after reports or state why this is not performance-sensitive. -->

## Resource and lifecycle impact

- New/replaced GPU buffers or textures:
- New bind groups or pipelines:
- Frame-loop allocations/readbacks:
- Device-loss/rebuild behavior:

## Public-repository checklist

- [ ] I used one primary phase and referenced its checklist.
- [ ] I ran the relevant automated checks.
- [ ] I checked for WebGPU validation errors where applicable.
- [ ] I updated architecture/phase documentation for changed contracts.
- [ ] I separated measured results from estimates or targets.
- [ ] I documented the provenance and license of new assets/dependencies.
- [ ] I included no credentials, private paths, or personal data.

