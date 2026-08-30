import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5174/?benchmark=1';
const output = 'docs/evidence/phase-05';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const scenarios = [
  {
    name: 'near-silhouette-10k',
    population: '10000',
    mode: '0',
    width: 1280,
    height: 720,
    scale: 1,
  },
  {
    name: 'mid-simplification-100k',
    population: '100000',
    mode: '1',
    width: 1280,
    height: 720,
    scale: 1,
  },
  { name: 'far-density-500k', population: '500000', mode: '2', width: 1280, height: 720, scale: 1 },
  {
    name: 'transition-lod-colors',
    population: '500000',
    mode: '-1',
    width: 1920,
    height: 1080,
    scale: 1,
    colors: true,
  },
  { name: 'narrow-500k', population: '500000', mode: '-1', width: 720, height: 1080, scale: 1 },
  { name: 'high-dpi-500k', population: '500000', mode: '-1', width: 1280, height: 720, scale: 2 },
];

for (const scenario of scenarios) {
  const page = await browser.newPage({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: scenario.scale,
  });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
  await page.locator('#population-select').selectOption(scenario.population);
  await page.locator('#lod-controls').evaluate((details) => {
    details.open = true;
  });
  await page.locator('#lod-mode').selectOption(scenario.mode);
  if (scenario.colors) await page.locator('#lod-visualize').check();
  await page.waitForTimeout(1500);
  await page.locator('#capture-button').click();
  await page.screenshot({ path: `${output}/${scenario.name}.png` });
  if (errors.length > 0) throw new Error(errors.join('\n'));
  await page.close();
}
await browser.close();
