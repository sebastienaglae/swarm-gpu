import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { release } from 'node:os';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/';
const commit = process.argv[3];
if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) {
  throw new Error('Pass the clean source commit as the second argument');
}

const outputRoot = 'benchmarks/baselines';
const seed = 0x5a17c9e3;
const populations = [10_000, 50_000, 100_000];
const resolutions = [
  [1280, 720],
  [1920, 1080],
];
const warmupSeconds = 5;
const sampleSeconds = 20;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const browserVersion = browser.version();

for (const [width, height] of resolutions) {
  for (const population of populations) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
    await page.locator('#population-select').selectOption(String(population));
    await page.waitForTimeout(warmupSeconds * 1000);
    await page.evaluate(() =>
      Reflect.get(globalThis, '__SWARM_GPU_APP__').resetPerformanceSamples(),
    );
    await page.waitForTimeout(sampleSeconds * 1000);
    const samples = await page.evaluate(() =>
      Reflect.get(globalThis, '__SWARM_GPU_APP__').capturePerformanceSamples(),
    );
    const adapterDescription =
      (await page.locator('#metric-adapter').textContent())?.trim() || 'Unavailable';
    if (errors.length > 0) throw new Error(errors.join('\n'));

    const scenarioId = `STATIC-${population}-${width}X${height}`;
    const report = {
      schemaVersion: '1.0.0',
      scenario: {
        id: scenarioId,
        version: 1,
        seed,
        instanceCount: population,
        cameraPath: 'fixed-default-orbit-camera',
        fixedTimestepSeconds: 1 / 60,
        canvasWidth: width,
        canvasHeight: height,
        renderScale: 1,
        lodThresholds: [0, 0],
        notes: 'Static Phase 02 direct-instancing baseline; LOD is intentionally disabled.',
      },
      source: { commit, dirty: false },
      environment: {
        recordedAt: new Date().toISOString(),
        os: `Windows ${release()}`,
        browser: `Google Chrome ${browserVersion} (Playwright channel chrome, headless)`,
        powerPreference: 'high-performance',
        powerNotes:
          'Browser request used high-performance; Chrome reports this hint is ignored on Windows.',
        thermalNotes: 'Sequential local run; thermal state was not instrumented.',
      },
      adapter: {
        description: adapterDescription,
        driver: 'Not exposed by WebGPU adapter metadata',
        features: ['timestamp-query'],
        limits: {},
      },
      measurement: {
        warmupSeconds,
        sampleSeconds,
        sampleCount: samples.frameIntervalMs.length,
        longFrameThresholdMs: 33.33,
        excludedSamples: 0,
      },
      results: {
        frameIntervalMs: percentiles(samples.frameIntervalMs),
        cpuFrameMs: percentiles(samples.cpuFrameMs),
        gpuFrameMs: null,
        gpuTimingUnavailableReason: 'Timestamp instrumentation is deferred to Phase 06.',
        longFrameCount: samples.frameIntervalMs.filter((value) => value > 33.33).length,
        drawCalls: 2,
        readbacksPerMeasuredFrame: 0,
        visibleCountAfterMeasurement: population,
        estimatedExplicitGpuBytes: population * 32 + width * height * 4 + 520,
        notes:
          'Includes one background draw and one indexed swarm draw. CPU timing covers encode and submit.',
      },
    };
    const directory = `${outputRoot}/${scenarioId.toLowerCase()}`;
    await mkdir(directory, { recursive: true });
    const path = `${directory}/2026-08-30_${commit.slice(0, 7)}_nvidia-turing-chrome-win11.json`;
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(
      `${scenarioId}: ${String(report.results.frameIntervalMs.median)} ms median, ${String(report.measurement.sampleCount)} samples\n`,
    );
    await page.close();
  }
}

await browser.close();

function percentiles(input) {
  if (!Array.isArray(input) || input.length === 0)
    throw new Error('Measurement returned no samples');
  const sorted = [...input].sort((left, right) => left - right);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return Number(sorted[index].toFixed(4));
}
