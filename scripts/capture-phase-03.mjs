import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/';
const outputDirectory = 'docs/evidence/phase-03';
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
await page.locator('#population-select').selectOption('500000');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outputDirectory}/2026-08-30_simulation-500k.png` });

await page.locator('#interaction-mode').selectOption('attract');
await page.locator('#interaction-strength').fill('40');
await page.locator('#interaction-radius').fill('60');
await page.mouse.move(960, 540);
await page.waitForTimeout(5000);
await page.screenshot({ path: `${outputDirectory}/2026-08-30_attractor-500k.png` });
if (errors.length > 0) throw new Error(errors.join('\n'));
process.stdout.write('Captured 500k simulation and attractor evidence without console errors.\n');
await browser.close();
