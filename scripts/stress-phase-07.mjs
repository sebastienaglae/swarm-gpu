import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { URL } from 'node:url';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5174/';
const commit = process.argv[3];
const suite = process.argv[4] ?? 'quick';
const scenarioFilter = process.argv[5];
if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error('Pass a clean source commit');
if (!['quick', 'full'].includes(suite)) throw new Error('Suite must be quick or full');

const scenarios = JSON.parse(
  await readFile(`benchmarks/scenarios/phase-07-${suite}.json`, 'utf8'),
).filter((scenario) => scenarioFilter === undefined || scenario.id === scenarioFilter);
if (scenarios.length === 0) throw new Error('No Phase 07 stress scenario matched');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const scenario of scenarios) await runScenario(scenario);
await browser.close();

async function runScenario(scenario) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(10_000);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  const startedAt = Date.now();
  let completed = 0;
  let error = null;
  let screenshot = null;
  let status = 'passed';
  let diagnostics = null;
  let before = null;
  let timeoutHandle;

  try {
    await Promise.race([
      execute(),
      new Promise((_, reject) => {
        timeoutHandle = globalThis.setTimeout(
          () =>
            reject(new Error(`${scenario.id} exceeded ${String(scenario.timeoutSeconds)} seconds`)),
          scenario.timeoutSeconds * 1000,
        );
      }),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    status = error.includes('exceeded') ? 'timeout' : 'failed';
    if (scenario.screenshot === true || status === 'failed') {
      const directory = `benchmarks/results/phase-07/${scenario.id.toLowerCase()}`;
      await mkdir(directory, { recursive: true });
      screenshot = `${directory}/${new Date().toISOString().slice(0, 10)}_${commit}_failure.png`;
      await bounded(
        page.screenshot({ path: screenshot, fullPage: true }),
        5_000,
        'failure screenshot',
      ).catch(() => {
        screenshot = null;
      });
    }
  } finally {
    globalThis.clearTimeout(timeoutHandle);
  }

  diagnostics ??= await safeEvaluate(page, () =>
    Reflect.get(globalThis, '__SWARM_GPU_APP__')?.captureDiagnosticsReport(),
  );
  const after = await safeEvaluate(page, () =>
    Reflect.get(globalThis, '__SWARM_GPU_APP__')?.captureReliabilitySnapshot(),
  );
  const uncaptured = consoleErrors.filter((message) => message.includes('[SwarmGPU] Uncaptured'));
  if (status === 'passed' && uncaptured.length > 0) {
    status = 'failed';
    error = `Uncaptured WebGPU errors: ${uncaptured.join(' | ')}`;
  }
  if (status === 'passed' && after?.loop?.peakActive > 1) {
    status = 'failed';
    error = `Duplicate animation loop ownership: ${String(after.loop.peakActive)}`;
  }
  if (
    status === 'passed' &&
    before !== null &&
    after?.resources?.active !== before.resources.active
  ) {
    status = 'failed';
    error = `Tracked resource drift: ${String(before.resources.active)} -> ${String(after?.resources?.active)}`;
  }

  const samples = diagnostics?.metrics?.frameIntervalMs ?? [];
  const thirds = splitThirds(samples);
  const report = {
    schemaVersion: '1.0.0',
    scenario,
    source: { commit, dirty: false },
    environment: {
      recordedAt: new Date().toISOString(),
      os: `Windows ${release()}`,
      browser: await page.evaluate(() => globalThis.navigator.userAgent),
      adapter: diagnostics?.capabilities?.adapter ?? 'unavailable',
      timestampQuery: diagnostics?.capabilities?.timestampQuery ?? false,
    },
    status,
    progress: {
      completed,
      expected: scenario.kind === 'soak' ? scenario.durationSeconds : scenario.repetitions,
      elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    },
    validationEvents: [...uncaptured, ...(after?.events ?? [])],
    timingDrift: {
      firstThirdMedianMs: median(thirds[0]),
      lastThirdMedianMs: median(thirds[2]),
      ratio:
        median(thirds[0]) > 0 ? Number((median(thirds[2]) / median(thirds[0])).toFixed(4)) : null,
      note: 'Browser process memory is approximate and is not used alone as leak evidence.',
    },
    resources: {
      before: before?.resources ?? null,
      after: after?.resources ?? null,
      maximumEstimatedStateBytes: diagnostics?.metrics?.estimatedStateBytes ?? null,
      loop: after?.loop ?? null,
    },
    error,
    screenshot,
  };
  const directory = `benchmarks/results/phase-07/${scenario.id.toLowerCase()}`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${new Date().toISOString().slice(0, 10)}_${commit}.json`;
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${scenario.id}: ${status} (${String(completed)} completed) -> ${path}\n`);
  await bounded(page.close(), 5_000, 'page close').catch(() => undefined);
  if (status === 'failed' || status === 'timeout') {
    throw new Error(`${scenario.id}: ${error ?? status}`);
  }

  async function execute() {
    const url = new URL(baseUrl);
    url.searchParams.set('benchmark', '1');
    await page.goto(url.toString(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.appState !== 'initializing');
    const appState = await page.getAttribute('html', 'data-app-state');
    if (appState !== 'running') throw new Error(`Initialization entered ${String(appState)}`);
    const option = page.locator(
      `#population-select option[value="${String(scenario.population)}"]`,
    );
    if ((await option.count()) === 0 || (await option.isDisabled())) {
      status = 'unsupported';
      diagnostics = await page.evaluate(() =>
        Reflect.get(globalThis, '__SWARM_GPU_APP__').captureDiagnosticsReport(),
      );
      return;
    }
    await page.locator('#population-select').selectOption(String(scenario.population));
    before = await page.evaluate(() =>
      Reflect.get(globalThis, '__SWARM_GPU_APP__').captureReliabilitySnapshot(),
    );
    await page.evaluate(() =>
      Reflect.get(globalThis, '__SWARM_GPU_APP__').resetPerformanceSamples(),
    );

    if (scenario.kind === 'soak') {
      for (let second = 0; second < scenario.durationSeconds; second += 1) {
        await page.waitForTimeout(1000);
        completed = second + 1;
        if (completed % 30 === 0) process.stdout.write(`${scenario.id}: ${String(completed)}s\n`);
      }
    } else if (scenario.kind === 'resize') {
      for (let index = 0; index < scenario.repetitions; index += 1) {
        await page.setViewportSize({
          width: 320 + (index % 23) * 37,
          height: 240 + (index % 17) * 29,
        });
        completed = index + 1;
      }
      await page.evaluate(async () => {
        const canvas = document.querySelector('#gpu-canvas');
        const parent = canvas?.parentElement;
        canvas?.remove();
        await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
        if (canvas !== null && parent !== null) parent.prepend(canvas);
        globalThis.window.dispatchEvent(new globalThis.Event('resize'));
      });
    } else if (scenario.kind === 'pause-resume') {
      await repeatAppCall('pause', 'resume');
    } else if (scenario.kind === 'quality') {
      const values = ['-1', '0', '1', '2'];
      for (let index = 0; index < scenario.repetitions; index += 1) {
        await page.locator('#lod-mode').evaluate(
          (element, value) => {
            const select = element;
            select.value = value;
            select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
          },
          values[index % values.length],
        );
        completed = index + 1;
      }
    } else if (scenario.kind === 'rebuild') {
      for (let index = 0; index < scenario.repetitions; index += 1) {
        await page.evaluate(() =>
          Reflect.get(globalThis, '__SWARM_GPU_APP__').rebuildSceneForDevelopment(),
        );
        completed = index + 1;
      }
    } else if (scenario.kind === 'visibility') {
      for (let index = 0; index < scenario.repetitions; index += 1) {
        await page.evaluate(() => {
          const app = Reflect.get(globalThis, '__SWARM_GPU_APP__');
          app.setVisibilityForDevelopment(true);
          app.setVisibilityForDevelopment(false);
        });
        completed = index + 1;
      }
    } else if (scenario.kind === 'recovery') {
      for (let index = 0; index < scenario.repetitions; index += 1) {
        await page.evaluate(() =>
          Reflect.get(globalThis, '__SWARM_GPU_APP__').simulateDeviceLossForDevelopment(),
        );
        await page.waitForFunction(() => document.documentElement.dataset.appState !== 'running');
        await page.waitForFunction(() =>
          ['running', 'failed'].includes(document.documentElement.dataset.appState ?? ''),
        );
        if ((await page.getAttribute('html', 'data-app-state')) === 'failed') {
          await page.locator('#retry-button').click();
          await page.waitForFunction(() => document.documentElement.dataset.appState === 'running');
        }
        completed = index + 1;
      }
    } else if (scenario.kind === 'capacity') {
      const result = await page.evaluate(() => {
        const app = Reflect.get(globalThis, '__SWARM_GPU_APP__');
        const maximum = app.validateCapacityForDevelopment(1).maximum;
        return [
          app.validateCapacityForDevelopment(1),
          app.validateCapacityForDevelopment(maximum),
          app.validateCapacityForDevelopment(maximum + 1),
          app.validateCapacityForDevelopment(Number.NaN),
        ];
      });
      if (!result[0].accepted || !result[1].accepted || result[2].accepted || result[3].accepted) {
        throw new Error(`Capacity boundary contract failed: ${JSON.stringify(result)}`);
      }
      completed = scenario.repetitions;
    }
    process.stdout.write(`${scenario.id}: collecting final diagnostics\n`);
    diagnostics = await bounded(
      page.evaluate(() => Reflect.get(globalThis, '__SWARM_GPU_APP__').captureDiagnosticsReport()),
      10_000,
      'final diagnostics',
    );
  }

  async function repeatAppCall(first, second) {
    for (let index = 0; index < scenario.repetitions; index += 1) {
      await page.evaluate(
        ([firstMethod, secondMethod]) => {
          const app = Reflect.get(globalThis, '__SWARM_GPU_APP__');
          app[firstMethod]();
          app[firstMethod]();
          app[secondMethod]();
          app[secondMethod]();
        },
        [first, second],
      );
      completed = index + 1;
    }
  }
}

async function safeEvaluate(page, callback) {
  try {
    return await bounded(page.evaluate(callback), 5_000, 'diagnostic evaluation');
  } catch {
    return null;
  }
}

async function bounded(promise, timeoutMilliseconds, label) {
  let handle;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        handle = globalThis.setTimeout(
          () => reject(new Error(`${label} exceeded ${String(timeoutMilliseconds)} ms`)),
          timeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    globalThis.clearTimeout(handle);
  }
}

function splitThirds(values) {
  const width = Math.max(1, Math.floor(values.length / 3));
  return [values.slice(0, width), values.slice(width, width * 2), values.slice(width * 2)];
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
