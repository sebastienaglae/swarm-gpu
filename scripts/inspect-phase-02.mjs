import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5174/';
const output = process.argv[3] ?? 'docs/evidence/phase-02/static-swarm-100k.png';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const messages = [];
page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.appState !== 'initializing');
await page.waitForTimeout(3000);
await page.screenshot({ path: output });
const snapshot = await page.evaluate(() => ({
  state: document.documentElement.dataset.appState,
  title: document.querySelector('#status-title')?.textContent,
  message: document.querySelector('#status-message')?.textContent,
  diagnostics: document.querySelector('#diagnostics')?.textContent,
}));
process.stdout.write(
  `${JSON.stringify({ snapshot, messageCount: messages.length, messages: messages.slice(0, 20) }, null, 2)}\n`,
);
await browser.close();
