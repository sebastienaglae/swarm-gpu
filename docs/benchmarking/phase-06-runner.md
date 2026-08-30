# Phase 06 benchmark runner

The scenario contract is `benchmarks/scenarios/phase-06-*.json`; the result contract is
`benchmarks/schemas/phase-06-result.schema.json`. Both are versioned `1.0.0`. A result records the
source commit, dirty flag, adapter/browser/OS, feature availability, compilation/load duration,
warm-up and measurement stages, raw bounded samples, histograms, percentiles, delayed counters, and
tracked state bytes.

From a clean checkout, start Vite and pass the clean commit explicitly:

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
node scripts/benchmark-phase-06.mjs http://127.0.0.1:5174/ <commit> smoke
node scripts/benchmark-phase-06.mjs http://127.0.0.1:5174/ <commit> full
```

An optional fifth argument selects one scenario, for example `SIM-250K`. During measurement the
overlay is hidden, inputs are disabled, timestep/seed/camera/canvas/scale/population are fixed, and
adaptation is off. GPU counters are drained only after measurement. Unsupported validated capacity
is recorded instead of silently reducing population.

Compare compatible reports with:

```bash
npm run benchmark:compare -- before.json after.json
npm run benchmark:budgets
```

The comparator rejects different schema versions or scenario configurations. Budgets use committed
reference reports rather than running WebGPU in CI, because hosted CI adapters are not comparable to
the reference machine.
