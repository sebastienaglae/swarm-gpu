# Benchmark evidence policy

Benchmark evidence makes SwarmGPU's public claims reproducible without filling the repository with arbitrary captures or machine-specific noise.

## Directory convention

```text
benchmarks/
  schemas/                         versioned JSON schemas
  scenarios/                       committed deterministic scenario inputs
  baselines/
    <scenario-id>/
      <yyyy-mm-dd>_<short-commit>_<environment-id>.json
docs/evidence/
  phase-<nn>/
    <yyyy-mm-dd>_<artifact-name>.<ext>
```

Use lowercase ASCII slugs. `environment-id` identifies the published hardware profile without usernames, hostnames, serial numbers, or private paths, for example `gtx1650-chrome151-win11`.

## What is committed

- Versioned schemas and deterministic scenarios.
- Release/reference benchmark JSON reports used by README or architecture claims.
- Small screenshots, diagrams, and validation summaries required by a phase exit gate.
- A short index or nearby prose explaining what each retained artifact proves.

## What is not committed by default

- Every local exploratory run.
- Browser profiles, crash dumps, raw GPU captures, large videos, or uncompressed image sequences.
- Reports containing usernames, hostnames, full local paths, serial numbers, tokens, or unrelated system details.
- Results from modified/uncommitted code presented as baselines.

Large release media belongs in the selected release/hosting workflow once Phase 08 defines it. Until then, retain the source locally and commit only an optimized artifact when a phase explicitly requires it.

## Measurement window

- Compile and initialize before warm-up.
- Warm up for at least 5 seconds.
- Measure for at least 20 seconds.
- Do not map visibility/timestamp buffers synchronously inside the measured frame loop.
- Read final counters after the measurement window.
- Report median, p95, and p99 rather than only average FPS.
- Record long-frame threshold/count and any excluded samples with a reason.

## Comparison validity

Before/after results are comparable only when scenario ID/schema version, seed, timestep, camera path, population, resolution, render scale, LOD settings, browser path, power mode, and measurement method match. Hardware or driver differences must be shown as separate environments, not merged into one improvement percentage.

## Claim rules

- `target`: planned and not yet proven.
- `estimate`: calculated from known inputs, not measured.
- `measured`: produced by the versioned harness with required metadata.
- `verified release result`: measured from a clean release commit and retained as a baseline.

Only verified release results may appear in the README headline benchmark table. Missing GPU timestamp support must be shown as unavailable; frame interval is not relabeled as GPU time.

## Privacy and review

Review every artifact before commit. Remove usernames, machine names, serial/device IDs, full private filesystem paths, tokens, browsing data, and unrelated application details. GPU model, driver, CPU model, RAM capacity, OS build, and browser version are intentional technical metadata.
