import { expect, test } from '@playwright/test';

test('shows actionable guidance when WebGPU is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/');
  await expect(page.locator('#status-title')).toHaveText('WebGPU initialization failed');
  await expect(page.locator('#status-message')).toContainText('current Chrome or Edge');
  await expect(page.locator('#retry-button')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'failed');
});

test('turns synthetic initialization failures into a safe retry screen', async ({ page }) => {
  await page.goto('/?debugInitFailure=1');
  await expect(page.locator('#status-title')).toHaveText('WebGPU initialization failed');
  await expect(page.locator('#status-message')).toContainText('could not initialize');
  await expect(page.locator('#status-message')).not.toContainText(
    'Synthetic initialization failure',
  );
  await expect(page.locator('#retry-button')).toBeVisible();
  await page.locator('#retry-button').click();
  await expect(page.locator('#status-title')).toHaveText('WebGPU initialization failed');
});

test('renders and keeps lifecycle controls idempotent with a supported WebGPU contract', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let submitCount = 0;
    let deviceRequestCount = 0;
    const noop = () => {
      return;
    };
    const createDevice = () => {
      let resolveLost = noop;
      let destroyed = false;
      const lost = new Promise((resolve) => {
        resolveLost = resolve;
      });
      return {
        label: 'Mock WebGPU device',
        queue: {
          submit: () => {
            submitCount += 1;
          },
        },
        lost,
        addEventListener: noop,
        removeEventListener: noop,
        pushErrorScope: noop,
        popErrorScope: async () => null,
        createCommandEncoder: () => ({
          beginRenderPass: () => ({ end: noop }),
          finish: () => ({}),
        }),
        destroy: () => {
          if (destroyed) return;
          destroyed = true;
          resolveLost({ reason: 'destroyed', message: 'Synthetic device loss' });
        },
      };
    };
    const adapter = {
      info: {
        description: 'Mock discrete adapter',
        architecture: 'mock-architecture',
        vendor: 'mock-vendor',
        device: 'mock-device',
      },
      features: new Set(['timestamp-query']),
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
        maxComputeWorkgroupsPerDimension: 65_535,
        maxTextureDimension2D: 8192,
        maxStorageBuffersPerShaderStage: 8,
        maxComputeInvocationsPerWorkgroup: 256,
        maxComputeWorkgroupSizeX: 256,
        minUniformBufferOffsetAlignment: 256,
        minStorageBufferOffsetAlignment: 256,
      },
      requestDevice: async () => {
        deviceRequestCount += 1;
        return createDevice();
      },
    };
    const canvasContext = {
      configure: noop,
      unconfigure: noop,
      getCurrentTexture: () => ({ createView: () => ({}) }),
    };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
      if (contextId === 'webgpu') return canvasContext;
      return Reflect.apply(originalGetContext, this, [contextId, ...args]);
    };
    Object.defineProperty(globalThis, 'GPUTextureUsage', {
      configurable: true,
      value: { RENDER_ATTACHMENT: 16 },
    });
    Object.defineProperty(Navigator.prototype, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: async () => adapter,
        getPreferredCanvasFormat: () => 'bgra8unorm',
      },
    });
    Object.defineProperty(globalThis, '__MOCK_SUBMIT_COUNT__', {
      configurable: true,
      get: () => submitCount,
    });
    Object.defineProperty(globalThis, '__MOCK_DEVICE_REQUEST_COUNT__', {
      configurable: true,
      get: () => deviceRequestCount,
    });
  });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
  await expect(page.locator('#diagnostics')).toBeVisible();
  await expect(page.locator('#metric-adapter')).toHaveText('Mock discrete adapter');
  await expect(page.locator('#metric-timestamp')).toHaveText('available');
  await expect(page.locator('#metric-canvas')).not.toHaveText('0 × 0');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, '__MOCK_SUBMIT_COUNT__')))
    .toBeGreaterThan(0);
  await page.locator('#pause-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'paused');
  await page.locator('#pause-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
  await page.locator('#reset-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');

  await page.evaluate(() => {
    Reflect.get(globalThis, '__SWARM_GPU_APP__').simulateDeviceLossForDevelopment();
  });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, '__MOCK_DEVICE_REQUEST_COUNT__')))
    .toBe(2);
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');

  await page.evaluate(() => {
    Reflect.get(globalThis, '__SWARM_GPU_APP__').simulateDeviceLossForDevelopment();
  });
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'failed');
  await expect(page.locator('#status-title')).toHaveText('GPU recovery stopped');
  await page.locator('#retry-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
});
