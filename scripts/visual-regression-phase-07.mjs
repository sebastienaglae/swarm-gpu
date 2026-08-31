import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5174/?benchmark=1&static=1';
const update = process.argv.includes('--update');
const baselinePath = 'docs/evidence/phase-07/static-10k-reference.png';
const actualPath = 'benchmarks/results/phase-07/visual/static-10k-actual.png';
const width = 1280;
const height = 720;
const channelTolerance = 12;
const maximumDifferentPixelRatio = 0.01;
const maximumMeanAbsoluteError = 2;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
await page.locator('#population-select').selectOption('10000');
await page.locator('#lod-mode').evaluate((element) => {
  const select = element;
  select.value = '0';
  select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
});
for (const selector of ['#background-toggle', '#fog-toggle', '#marker-toggle']) {
  await page.locator(selector).evaluate((element) => {
    const input = element;
    input.checked = false;
    input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  });
}
await page.waitForTimeout(500);
await page.locator('#capture-button').click();
const actual = await page.screenshot();
if (errors.length > 0) throw new Error(errors.join('\n'));

if (update) {
  await mkdir('docs/evidence/phase-07', { recursive: true });
  await writeFile(baselinePath, actual);
  process.stdout.write(`Updated ${baselinePath}\n`);
} else {
  const baseline = await readFile(baselinePath);
  const comparison = await comparePngs(page, baseline, actual);
  await mkdir('benchmarks/results/phase-07/visual', { recursive: true });
  await writeFile(actualPath, actual);
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
  if (
    comparison.differentPixelRatio > maximumDifferentPixelRatio ||
    comparison.meanAbsoluteError > maximumMeanAbsoluteError
  ) {
    throw new Error(`Visual regression exceeded tolerance; actual retained at ${actualPath}`);
  }
}
await browser.close();

async function comparePngs(targetPage, baseline, actual) {
  return targetPage.evaluate(
    async ({ baselineBase64, actualBase64, expectedWidth, expectedHeight, tolerance }) => {
      const decode = async (base64) => {
        const bytes = Uint8Array.from(globalThis.atob(base64), (character) =>
          character.charCodeAt(0),
        );
        const bitmap = await globalThis.createImageBitmap(
          new globalThis.Blob([bytes], { type: 'image/png' }),
        );
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) throw new Error('2D canvas unavailable for visual comparison');
        context.drawImage(bitmap, 0, 0);
        return {
          width: bitmap.width,
          height: bitmap.height,
          pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
        };
      };
      const [left, right] = await Promise.all([decode(baselineBase64), decode(actualBase64)]);
      if (
        left.width !== expectedWidth ||
        left.height !== expectedHeight ||
        right.width !== expectedWidth ||
        right.height !== expectedHeight
      ) {
        throw new Error(
          `Visual dimensions differ: ${left.width}x${left.height} vs ${right.width}x${right.height}`,
        );
      }
      let differentPixels = 0;
      let absoluteError = 0;
      const pixelCount = expectedWidth * expectedHeight;
      for (let offset = 0; offset < left.pixels.length; offset += 4) {
        let pixelDifferent = false;
        for (let channel = 0; channel < 3; channel += 1) {
          const difference = Math.abs(
            left.pixels[offset + channel] - right.pixels[offset + channel],
          );
          absoluteError += difference;
          if (difference > tolerance) pixelDifferent = true;
        }
        if (pixelDifferent) differentPixels += 1;
      }
      return {
        width: expectedWidth,
        height: expectedHeight,
        channelTolerance: tolerance,
        differentPixels,
        differentPixelRatio: differentPixels / pixelCount,
        meanAbsoluteError: absoluteError / (pixelCount * 3),
      };
    },
    {
      baselineBase64: baseline.toString('base64'),
      actualBase64: actual.toString('base64'),
      expectedWidth: width,
      expectedHeight: height,
      tolerance: channelTolerance,
    },
  );
}
