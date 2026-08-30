import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5174/';
const commit = process.argv[3];
const suite = process.argv[4] ?? 'smoke';
if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error('Pass a clean source commit');
if (!['smoke', 'full'].includes(suite)) throw new Error('Suite must be smoke or full');
const scenarios = JSON.parse(await readFile(`benchmarks/scenarios/phase-06-${suite}.json`, 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const scenario of scenarios) {
  const page = await browser.newPage({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL(baseUrl);
  url.searchParams.set('benchmark', '1');
  url.searchParams.set('workgroup', String(scenario.workgroupSize));
  if (scenario.visibilityPercent === 10 || scenario.visibilityPercent === 100) {
    url.searchParams.set('visibility', String(scenario.visibilityPercent));
  }
  if (scenario.id.startsWith('STATIC-')) url.searchParams.set('direct', '1');
  const loadStarted = performance.now();
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.appState !== 'initializing');
  const state = await page.evaluate(() => document.documentElement.dataset.appState);
  if (state !== 'running') throw new Error(`${scenario.id} initialization entered ${state}`);
  const compilationAndLoadMs = performance.now() - loadStarted;
  const populationOption = page.locator(
    `#population-select option[value="${scenario.population}"]`,
  );
  if ((await populationOption.count()) === 0 || (await populationOption.isDisabled())) {
    await writeUnsupportedReport(scenario, commit, browser.version(), 'validated adapter capacity');
    await page.close();
    continue;
  }
  await page.locator('#population-select').selectOption(String(scenario.population));
  await page.locator('#render-scale').selectOption(String(scenario.renderScale));
  await page.locator('#lod-controls').evaluate((details) => {
    details.open = true;
  });
  await page.locator('#lod-mode').selectOption(scenario.lodMode === 'auto' ? '-1' : '0');
  await page.waitForTimeout(scenario.warmupSeconds * 1000);
  await page.evaluate(() =>
    Reflect.get(globalThis, '__SWARM_GPU_APP__').beginBenchmarkMeasurementForDevelopment(),
  );
  await page.waitForTimeout(scenario.durationSeconds * 1000);
  await page.evaluate(() =>
    Reflect.get(globalThis, '__SWARM_GPU_APP__').endBenchmarkMeasurementForDevelopment(),
  );
  const reportSnapshot = await page.evaluate(() =>
    Reflect.get(globalThis, '__SWARM_GPU_APP__').captureDiagnosticsReport(),
  );
  await page.locator('#pause-button').click();
  await page.waitForTimeout(100);
  const postMeasurement = scenario.id.startsWith('STATIC-')
    ? { lodCounts: [0, 0, 0], overflowCounts: [0, 0, 0] }
    : await page.evaluate(() =>
        Reflect.get(globalThis, '__SWARM_GPU_APP__').captureLodCountsForDevelopment(),
      );
  if (errors.length > 0) throw new Error(`${scenario.id}: ${errors.join('\n')}`);
  const frameInterval = reportSnapshot.metrics.frameIntervalMs;
  const cpu = reportSnapshot.metrics.cpuEncodeAndSubmitMs;
  const gpu = reportSnapshot.metrics.gpu;
  const report = {
    schemaVersion: '1.0.0',
    scenario,
    source: { commit, dirty: false },
    environment: {
      recordedAt: new Date().toISOString(),
      os: `Windows ${release()}`,
      browser: `Google Chrome ${browser.version()} (Playwright channel chrome, headless)`,
      adapter: reportSnapshot.capabilities.adapter,
      timestampQuery: reportSnapshot.capabilities.timestampQuery,
      powerPreference: 'high-performance',
    },
    stages: {
      loadingAndCompilationMs: Number(compilationAndLoadMs.toFixed(3)),
      warmupSeconds: scenario.warmupSeconds,
      measurementSeconds: scenario.durationSeconds,
      postMeasurementReadback: true,
      overlayDuringMeasurement: false,
    },
    samples: {
      frameIntervalMs: frameInterval,
      cpuEncodeAndSubmitMs: cpu,
      gpuSimulationMs: gpu?.simulationMs ?? [],
      gpuClassificationMs: gpu?.cullingMs ?? [],
      gpuRenderMs: gpu?.renderMs ?? [],
      gpuTotalMs: gpu?.totalMs ?? [],
    },
    summary: {
      status: 'supported',
      frameIntervalMs: summarize(frameInterval),
      cpuEncodeAndSubmitMs: summarize(cpu),
      gpuSimulationMs: summarizeOptional(gpu?.simulationMs),
      gpuClassificationMs: summarizeOptional(gpu?.cullingMs),
      gpuRenderMs: summarizeOptional(gpu?.renderMs),
      gpuTotalMs: summarizeOptional(gpu?.totalMs),
      longFrameCount: frameInterval.filter((value) => value > 33.33).length,
      histograms: {
        frameIntervalMs: histogram(frameInterval, 2),
        gpuTotalMs: histogram(gpu?.totalMs ?? [], 1),
      },
    },
    postMeasurement: {
      ...postMeasurement,
      readbacksPerInteractiveFrame: 0,
      estimatedStateBytes: reportSnapshot.metrics.estimatedStateBytes,
      drawCalls: reportSnapshot.metrics.drawCalls,
      computeDispatches: reportSnapshot.metrics.computeDispatches,
      notes: 'GPU timestamps use WebGPU nanosecond units and are asynchronously delayed.',
    },
  };
  const directory = `benchmarks/results/phase-06/${scenario.id.toLowerCase()}`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/2026-08-30_${commit.slice(0, 7)}_nvidia-turing-chrome-win11.json`;
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${scenario.id}: frame ${report.summary.frameIntervalMs.median} ms, GPU ${report.summary.gpuTotalMs?.median ?? 'unavailable'} ms\n`,
  );
  await page.close();
}
await browser.close();

async function writeUnsupportedReport(scenario, sourceCommit, browserVersion, reason) {
  const report = {
    schemaVersion: '1.0.0',
    scenario,
    source: { commit: sourceCommit, dirty: false },
    environment: {
      recordedAt: new Date().toISOString(),
      os: `Windows ${release()}`,
      browser: browserVersion,
    },
    stages: {},
    samples: {},
    summary: { status: 'unsupported', reason },
    postMeasurement: {},
  };
  const directory = `benchmarks/results/phase-06/${scenario.id.toLowerCase()}`;
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/unsupported_${sourceCommit.slice(0, 7)}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

function summarizeOptional(input) {
  return input?.length ? summarize(input) : null;
}
function summarize(input) {
  if (input.length === 0) throw new Error('Measurement returned no samples');
  const sorted = [...input].sort((a, b) => a - b);
  return {
    sampleCount: sorted.length,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    minimum: Number(sorted[0].toFixed(6)),
    maximum: Number(sorted.at(-1).toFixed(6)),
  };
}
function percentile(sorted, fraction) {
  return Number(
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(6),
  );
}
function histogram(input, width) {
  const bins = {};
  for (const value of input) {
    const key = String(Math.floor(value / width) * width);
    bins[key] = (bins[key] ?? 0) + 1;
  }
  return { binWidthMs: width, bins };
}
