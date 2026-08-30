import { readFile } from 'node:fs/promises';

const budgets = JSON.parse(await readFile('benchmarks/budgets/phase-06.json', 'utf8'));
const failures = [];
for (const [scenarioId, budget] of Object.entries(budgets.scenarios)) {
  const path = `benchmarks/results/phase-06/${scenarioId.toLowerCase()}/2026-08-30_${budgets.referenceCommit}_${budgets.environment}.json`;
  let report;
  try {
    report = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Missing reference report ${path}`, { cause: error });
  }
  if (report.schemaVersion !== '1.0.0' || report.scenario.scenarioVersion !== '1.0.0') {
    failures.push(`${scenarioId}: incompatible schema/scenario version`);
    continue;
  }
  check(scenarioId, 'frame p95', report.summary.frameIntervalMs.p95, budget.frameP95Ms);
  check(scenarioId, 'CPU median', report.summary.cpuEncodeAndSubmitMs.median, budget.cpuMedianMs);
  check(scenarioId, 'GPU median', report.summary.gpuTotalMs.median, budget.gpuMedianMs);
}
if (failures.length > 0)
  throw new Error(`Phase 06 performance budgets failed:\n${failures.join('\n')}`);
process.stdout.write(
  `Phase 06 budgets pass for ${String(Object.keys(budgets.scenarios).length)} scenarios.\n`,
);

function check(scenario, metric, actual, maximum) {
  if (!Number.isFinite(actual) || actual > maximum) {
    failures.push(`${scenario}: ${metric} ${String(actual)} ms exceeds ${String(maximum)} ms`);
  }
}
