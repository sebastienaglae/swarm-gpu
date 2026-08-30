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
await page.locator('#lod-controls').evaluate((details) => {
  details.open = true;
});

const captures = [];
for (const mode of ['0', '1', '2', '-1']) {
  await page.locator('#lod-mode').selectOption(mode);
  captures.push(
    await page.evaluate(() =>
      Reflect.get(globalThis, '__SWARM_GPU_APP__').validateVisibilityForDevelopment(64),
    ),
  );
}
for (let lod = 0; lod < 3; lod += 1) {
  const counts = captures[lod].lodCounts;
  if (counts[lod] !== 64 || counts.some((count, index) => index !== lod && count !== 0)) {
    throw new Error(`Fixed LOD ${String(lod)} classification failed: ${JSON.stringify(counts)}`);
  }
}
if (captures.some((capture) => !capture.idsMatch || !capture.indirectMatch)) {
  throw new Error(`LOD validation mismatch: ${JSON.stringify(captures)}`);
}
const sweep = await page.evaluate(() =>
  Reflect.get(globalThis, '__SWARM_GPU_APP__').sweepLodCameraForDevelopment(12),
);
if (sweep.duplicateIds !== 0 || sweep.invalidIds !== 0 || sweep.overflows !== 0) {
  throw new Error(`LOD camera sweep failed: ${JSON.stringify(sweep)}`);
}
if (errors.length > 0) throw new Error(errors.join('\n'));
process.stdout.write(
  `${JSON.stringify({ fixed: captures.slice(0, 3), auto: captures[3], sweep }, null, 2)}\n`,
);
await browser.close();
