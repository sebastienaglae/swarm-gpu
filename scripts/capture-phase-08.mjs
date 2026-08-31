import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preview } from 'vite';

const width = 1280;
const height = 720;
const framesPerSecond = 10;
const frameCount = 100;
const outputDirectory = resolve('docs/media');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'swarmgpu-phase-08-'));
const server = await preview({
  preview: { host: '127.0.0.1', port: 4189, strictPort: true },
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  await mkdir(outputDirectory, { recursive: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4189/swarm-gpu/?benchmark=1', {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
  await page.locator('#population-select').selectOption('500000');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: join(temporaryDirectory, 'performance-overlay.png') });
  convertToWebp(
    join(temporaryDirectory, 'performance-overlay.png'),
    join(outputDirectory, 'performance-overlay.webp'),
  );

  await page.locator('#capture-button').click();
  await page.locator('.diagnostics').evaluate((element) => {
    element.hidden = true;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(temporaryDirectory, 'showcase-poster.png') });
  convertToWebp(
    join(temporaryDirectory, 'showcase-poster.png'),
    join(outputDirectory, 'showcase-poster.webp'),
  );

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameName = `frame-${String(frame).padStart(3, '0')}.png`;
    await page.screenshot({ path: join(temporaryDirectory, frameName) });
    await page.waitForTimeout(1000 / framesPerSecond);
  }
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-framerate',
      String(framesPerSecond),
      '-i',
      join(temporaryDirectory, 'frame-%03d.png'),
      '-vf',
      'scale=960:-2:flags=lanczos',
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '42',
      '-b:v',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-an',
      join(outputDirectory, 'swarmgpu-showcase.webm'),
    ],
    { stdio: 'inherit' },
  );
  if (errors.length > 0) throw new Error(errors.join('\n'));
  process.stdout.write('Generated deterministic Phase 08 media (100 frames at 10 fps).\n');
} finally {
  await browser.close();
  await new Promise((resolveClose, reject) => {
    server.httpServer.close((error) => {
      if (error !== undefined) reject(error);
      else resolveClose(undefined);
    });
  });
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function convertToWebp(input, output) {
  execFileSync(
    'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-quality', '82', output],
    { stdio: 'inherit' },
  );
}
