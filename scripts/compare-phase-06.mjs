import { readFile } from 'node:fs/promises';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath)
  throw new Error('Usage: node scripts/compare-phase-06.mjs before.json after.json');
const before = JSON.parse(await readFile(beforePath, 'utf8'));
const after = JSON.parse(await readFile(afterPath, 'utf8'));
if (before.schemaVersion !== after.schemaVersion) throw new Error('Result schema versions differ');
if (before.scenario.scenarioVersion !== after.scenario.scenarioVersion)
  throw new Error('Scenario versions differ');
if (JSON.stringify(before.scenario) !== JSON.stringify(after.scenario))
  throw new Error('Scenario configurations differ');
const metrics = [
  'frameIntervalMs',
  'cpuEncodeAndSubmitMs',
  'gpuSimulationMs',
  'gpuClassificationMs',
  'gpuRenderMs',
  'gpuTotalMs',
];
const comparison = {
  scenario: before.scenario.id,
  schemaVersion: before.schemaVersion,
  metrics: {},
};
for (const metric of metrics) {
  const left = before.summary[metric]?.median;
  const right = after.summary[metric]?.median;
  comparison.metrics[metric] =
    left == null || right == null
      ? null
      : {
          beforeMedian: left,
          afterMedian: right,
          deltaMs: Number((right - left).toFixed(6)),
          deltaPercent: Number((((right - left) / left) * 100).toFixed(2)),
        };
}
process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
