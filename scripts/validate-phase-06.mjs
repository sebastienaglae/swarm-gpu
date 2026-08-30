import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(`${baseUrl}?benchmark=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
await page.locator('#population-select').selectOption('250000');
await page.waitForTimeout(2500);
const lower = await page.evaluate(() =>
  Reflect.get(globalThis, '__SWARM_GPU_APP__').captureDiagnosticsReport(),
);
await page.locator('#population-select').selectOption('1000000');
await page.waitForTimeout(2500);
const higher = await page.evaluate(() =>
  Reflect.get(globalThis, '__SWARM_GPU_APP__').captureDiagnosticsReport(),
);
if (!lower.capabilities.timestampQuery || lower.metrics.gpu.totalMs.length === 0) {
  throw new Error('Live timestamp telemetry did not produce samples');
}
if (higher.metrics.latestGpu.totalMs <= lower.metrics.latestGpu.totalMs) {
  throw new Error(
    `Known workload increase was not reflected in GPU time: ${lower.metrics.latestGpu.totalMs} -> ${higher.metrics.latestGpu.totalMs}`,
  );
}
if (higher.metrics.latestGpu.delayedFrames < 0 || higher.metrics.latestGpu.delayedFrames > 120) {
  throw new Error(
    `Telemetry delay escaped the ring bound: ${higher.metrics.latestGpu.delayedFrames}`,
  );
}
if (errors.length > 0) throw new Error(errors.join('\n'));

const adaptivePage = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
await adaptivePage.goto(`${baseUrl}?adaptive=1`, { waitUntil: 'networkidle' });
await adaptivePage.waitForFunction(() => document.documentElement.dataset.appState === 'running');
await adaptivePage.locator('#population-select').selectOption('1000000');
await adaptivePage.waitForTimeout(7000);
const adaptive = await adaptivePage.evaluate(() =>
  Reflect.get(globalThis, '__SWARM_GPU_APP__').captureDiagnosticsReport(),
);
const allowedScales = [0.5, 0.625, 0.75, 0.875, 1];
if (!allowedScales.includes(adaptive.scenario.renderScale)) {
  throw new Error(`Dynamic scale was not quantized: ${adaptive.scenario.renderScale}`);
}
if (
  adaptive.scenario.displayResolution[0] !== 3840 ||
  adaptive.scenario.displayResolution[1] !== 2160
) {
  throw new Error(`UI/display resolution changed: ${adaptive.scenario.displayResolution}`);
}
process.stdout.write(
  `${JSON.stringify({ workloadCheck: { lower: lower.metrics.latestGpu, higher: higher.metrics.latestGpu }, adaptive: adaptive.scenario }, null, 2)}\n`,
);
await browser.close();
