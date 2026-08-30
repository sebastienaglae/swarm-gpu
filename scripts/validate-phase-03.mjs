import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/?benchmark=1';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
await page.locator('#pause-button').click();
await page.waitForFunction(() => document.documentElement.dataset.appState === 'paused');
const comparison = await page.evaluate(() =>
  Reflect.get(globalThis, '__SWARM_GPU_APP__').compareSimulationFixtureForDevelopment(16),
);
if (errors.length > 0) throw new Error(errors.join('\n'));
if (comparison.fixtureCount !== 16 || comparison.maxAbsoluteError > 0.0001) {
  throw new Error(`Shader comparison exceeded tolerance: ${JSON.stringify(comparison)}`);
}
process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
await browser.close();
