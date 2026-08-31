import { chromium } from '@playwright/test';

const hostedUrl = process.argv[2] ?? 'https://sebastienaglae.github.io/swarm-gpu/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const supported = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  supported.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  supported.on('pageerror', (error) => errors.push(error.message));
  const response = await supported.goto(hostedUrl, { waitUntil: 'networkidle' });
  if (response?.ok() !== true) {
    throw new Error(`Hosted response was ${String(response?.status())}`);
  }
  if (new globalThis.URL(supported.url()).protocol !== 'https:') {
    throw new Error('Hosted demo is not using HTTPS');
  }
  await supported.waitForFunction(() => document.documentElement.dataset.appState === 'running');
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const scriptSources = await supported
    .locator('script[type="module"]')
    .evaluateAll((scripts) => scripts.map((script) => script.getAttribute('src')));
  if (
    !scriptSources.some((source) => /\/swarm-gpu\/assets\/index-[\w-]+\.js$/u.test(source ?? ''))
  ) {
    throw new Error(`Hosted asset path is not hashed/base-aware: ${JSON.stringify(scriptSources)}`);
  }

  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: undefined,
    });
  });
  const unsupportedResponse = await unsupported.goto(hostedUrl, { waitUntil: 'networkidle' });
  if (unsupportedResponse?.ok() !== true) {
    throw new Error(
      `Hosted unsupported-path response was ${String(unsupportedResponse?.status())}`,
    );
  }
  await unsupported.waitForFunction(() => document.documentElement.dataset.appState === 'failed');
  const message = await unsupported.locator('#status-message').textContent();
  if (!message?.includes('Chrome or Edge')) {
    throw new Error('Hosted unsupported-device guidance is missing');
  }
  process.stdout.write(`Hosted smoke passes for supported and unsupported paths at ${hostedUrl}\n`);
} finally {
  await browser.close();
}
