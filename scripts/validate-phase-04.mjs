import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/?benchmark=1';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const messages = [];
page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.appState !== 'initializing');
  const state = await page.evaluate(() => document.documentElement.dataset.appState);
  if (state !== 'running') {
    const status = await page.locator('#status-message').textContent();
    throw new Error(`Application entered ${state}: ${status ?? 'no status message'}`);
  }
  await page.locator('#population-select').selectOption('100000');
  await page.locator('#pause-button').click();
  await page.waitForFunction(() => document.documentElement.dataset.appState === 'paused');
  const visibility = await page.evaluate(() =>
    Reflect.get(globalThis, '__SWARM_GPU_APP__').validateVisibilityForDevelopment(64),
  );
  if (!visibility.idsMatch || !visibility.indirectMatch || visibility.overflowCount !== 0) {
    throw new Error(`Visibility validation failed: ${JSON.stringify(visibility)}`);
  }
  if (messages.some((message) => message.startsWith('error:') || message.startsWith('pageerror:'))) {
    throw new Error(messages.join('\n'));
  }
  process.stdout.write(`${JSON.stringify({ state, visibility, messages }, null, 2)}\n`);
} catch (error) {
  const snapshot = await page.evaluate(() => ({
    state: document.documentElement.dataset.appState,
    title: document.querySelector('#status-title')?.textContent,
    message: document.querySelector('#status-message')?.textContent,
  }));
  throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify({ snapshot, messages }, null, 2)}`);
} finally {
  await browser.close();
}
