import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = await preview({
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const supported = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  supported.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  supported.on('pageerror', (error) => errors.push(error.message));
  const response = await supported.goto('http://127.0.0.1:4188/swarm-gpu/', {
    waitUntil: 'networkidle',
  });
  if (response?.ok() !== true)
    throw new Error(`Production response was ${String(response?.status())}`);
  await supported.waitForFunction(() => document.documentElement.dataset.appState === 'running');
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const scriptSources = await supported
    .locator('script[type="module"]')
    .evaluateAll((scripts) => scripts.map((script) => script.getAttribute('src')));
  if (
    !scriptSources.some((source) => /\/swarm-gpu\/assets\/index-[\w-]+\.js$/u.test(source ?? ''))
  ) {
    throw new Error(
      `Production asset path is not hashed/base-aware: ${JSON.stringify(scriptSources)}`,
    );
  }

  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: undefined,
    });
  });
  await unsupported.goto('http://127.0.0.1:4188/swarm-gpu/', { waitUntil: 'networkidle' });
  await unsupported.waitForFunction(() => document.documentElement.dataset.appState === 'failed');
  const message = await unsupported.locator('#status-message').textContent();
  if (!message?.includes('Chrome or Edge'))
    throw new Error('Unsupported-device guidance is missing');
  process.stdout.write(
    'Production smoke passes for supported WebGPU and unsupported-device paths.\n',
  );
} finally {
  await browser.close();
  await new Promise((resolve, reject) => {
    server.httpServer.close((error) => {
      if (error !== undefined) reject(error);
      else resolve(undefined);
    });
  });
}
