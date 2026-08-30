import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { URL } from 'node:url';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5174/';
const commit = process.argv[3];
if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error('Pass a clean source commit');

const scenarios = [
  { population: 500_000, mode: 'direct', visibility: 100 },
  { population: 500_000, mode: 'indirect', visibility: 10 },
  { population: 500_000, mode: 'indirect', visibility: 50 },
  { population: 500_000, mode: 'indirect', visibility: 100 },
  { population: 1_000_000, mode: 'indirect', visibility: 100 },
];
const width = 1280;
const height = 720;
const warmupSeconds = 5;
const sampleSeconds = 20;
const gpuSampleCount = 10;
const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const scenario of scenarios) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL(baseUrl);
  url.searchParams.set('benchmark', '1');
  if (scenario.mode === 'direct') url.searchParams.set('direct', '1');
  else url.searchParams.set('visibility', String(scenario.visibility));
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
  await page.locator('#population-select').selectOption(String(scenario.population));
  await page.waitForTimeout(warmupSeconds * 1000);
  await page.evaluate(() => Reflect.get(globalThis, '__SWARM_GPU_APP__').resetPerformanceSamples());
  await page.waitForTimeout(sampleSeconds * 1000);
  const frameSamples = await page.evaluate(() =>
    Reflect.get(globalThis, '__SWARM_GPU_APP__').capturePerformanceSamples(),
  );
  await page.locator('#pause-button').click();
  const gpuSamples = [];
  for (let sample = 0; sample < gpuSampleCount; sample += 1) {
    gpuSamples.push(
      await page.evaluate(() =>
        Reflect.get(globalThis, '__SWARM_GPU_APP__').measureGpuFrameForDevelopment(),
      ),
    );
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const adapter = (await page.locator('#metric-adapter').textContent())?.trim() || 'Unavailable';
  const id = `CULL-${scenario.population}-${scenario.mode.toUpperCase()}-V${scenario.visibility}`;
  const report = {
    schemaVersion: '1.0.0',
    scenario: { id, ...scenario, width, height, workgroupSize: 128, fixedTimestepSeconds: 1 / 60 },
    source: { commit, dirty: false },
    environment: {
      recordedAt: new Date().toISOString(),
      os: `Windows ${release()}`,
      browser: `Google Chrome ${browser.version()} (Playwright channel chrome, headless)`,
      adapter,
    },
    measurement: { warmupSeconds, sampleSeconds, gpuSampleCount },
    results: {
      frameIntervalMs: percentiles(frameSamples.frameIntervalMs),
      cpuFrameMs: percentiles(frameSamples.cpuFrameMs),
      gpuSimulationMs: percentiles(gpuSamples.map((sample) => sample.simulationMs)),
      gpuCullingMs: percentiles(gpuSamples.map((sample) => sample.cullingMs)),
      gpuRenderMs: percentiles(gpuSamples.map((sample) => sample.renderMs)),
      gpuTotalMs: percentiles(gpuSamples.map((sample) => sample.totalMs)),
      readbacksPerInteractiveFrame: 0,
    },
  };
  const directory = `benchmarks/baselines/${id.toLowerCase()}`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/2026-08-30_${commit.slice(0, 7)}_nvidia-turing-chrome-win11.json`;
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${id}: total ${String(report.results.gpuTotalMs.median)} ms, cull ${String(report.results.gpuCullingMs.median)} ms, render ${String(report.results.gpuRenderMs.median)} ms\n`,
  );
  await page.close();
}
await browser.close();

function percentiles(input) {
  if (input.length === 0) throw new Error('Measurement returned no samples');
  const sorted = [...input].sort((left, right) => left - right);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number(sorted[index].toFixed(6));
}
