import { readFile, readdir } from 'node:fs/promises';

const contract = JSON.parse(await readFile('benchmarks/budgets/phase-07.json', 'utf8'));
const files = await collectJsonFiles('benchmarks/results/phase-07');
const reports = [];
for (const file of files) {
  reports.push(JSON.parse(await readFile(file, 'utf8')));
}

const failures = [];
for (const id of contract.requiredScenarios) {
  const expectedCommit = contract.scenarioCommits?.[id] ?? contract.referenceCommit;
  const report = reports.find(
    (candidate) => candidate.scenario?.id === id && candidate.source?.commit === expectedCommit,
  );
  if (report === undefined) {
    failures.push(`${id}: missing reference report`);
    continue;
  }
  if (report.schemaVersion !== contract.contractVersion) failures.push(`${id}: schema mismatch`);
  if (report.scenario.scenarioVersion !== contract.contractVersion) {
    failures.push(`${id}: scenario version mismatch`);
  }
  if (report.source.commit !== expectedCommit || report.source.dirty !== false) {
    failures.push(`${id}: invalid source metadata`);
  }
  if (report.status !== 'passed') failures.push(`${id}: status is ${String(report.status)}`);
  if (report.resources.before.active !== report.resources.after.active) {
    failures.push(`${id}: active resource drift`);
  }
  if (report.resources.loop.peakActive > contract.maximumActiveLoops) {
    failures.push(`${id}: duplicate loop ownership`);
  }
  const uncaptured = report.validationEvents.filter((event) =>
    String(typeof event === 'string' ? event : event.category).includes('uncaptured'),
  );
  if (uncaptured.length > 0) failures.push(`${id}: uncaptured WebGPU validation event`);
  if (
    report.scenario.kind === 'soak' &&
    (!Number.isFinite(report.timingDrift.ratio) ||
      report.timingDrift.ratio > contract.maximumSoakTimingDriftRatio)
  ) {
    failures.push(`${id}: timing drift ${String(report.timingDrift.ratio)}`);
  }
}

if (failures.length > 0) throw new Error(`Phase 07 report checks failed:\n${failures.join('\n')}`);
process.stdout.write(
  `Phase 07 reports pass for ${String(contract.requiredScenarios.length)} scenarios.\n`,
);

async function collectJsonFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) output.push(...(await collectJsonFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.json')) output.push(path);
  }
  return output;
}
