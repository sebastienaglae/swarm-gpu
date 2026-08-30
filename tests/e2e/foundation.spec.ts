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
    let lastInstanceCount = 0;
    let lastTextureSize = '';
    let textureDestroyCount = 0;
    let computeDispatchCount = 0;
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
        features: new Set(['timestamp-query']),
        limits: {
          maxComputeInvocationsPerWorkgroup: 256,
          maxComputeWorkgroupSizeX: 256,
        },
        queue: {
          submit: () => {
            submitCount += 1;
          },
          writeBuffer: noop,
        },
        lost,
        addEventListener: noop,
        removeEventListener: noop,
        pushErrorScope: noop,
        popErrorScope: async () => null,
        createBuffer: () => ({ destroy: noop }),
        createTexture: (descriptor: { size: [number, number, number] }) => {
          lastTextureSize = `${String(descriptor.size[0])}x${String(descriptor.size[1])}`;
          return {
            createView: () => ({}),
            destroy: () => {
              textureDestroyCount += 1;
            },
          };
        },
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createBindGroup: () => ({}),
        createShaderModule: () => ({
          getCompilationInfo: async () => ({ messages: [] }),
        }),
        createRenderPipelineAsync: async () => ({}),
        createComputePipelineAsync: async () => ({}),
        createCommandEncoder: () => ({
          beginComputePass: () => ({
            setBindGroup: noop,
            setPipeline: noop,
            dispatchWorkgroups: () => {
              computeDispatchCount += 1;
            },
            end: noop,
          }),
          beginRenderPass: () => ({
            setBindGroup: noop,
            setPipeline: noop,
            setVertexBuffer: noop,
            setIndexBuffer: noop,
            draw: noop,
            drawIndexed: (_indices: number, instances: number) => {
              lastInstanceCount = instances;
            },
            end: noop,
          }),
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
    Object.defineProperty(globalThis, 'GPUBufferUsage', {
      configurable: true,
      value: {
        MAP_READ: 1,
        COPY_SRC: 4,
        COPY_DST: 8,
        INDEX: 16,
        VERTEX: 32,
        UNIFORM: 64,
        STORAGE: 128,
      },
    });
    Object.defineProperty(globalThis, 'GPUShaderStage', {
      configurable: true,
      value: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
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
    Object.defineProperty(globalThis, '__MOCK_LAST_INSTANCE_COUNT__', {
      configurable: true,
      get: () => lastInstanceCount,
    });
    Object.defineProperty(globalThis, '__MOCK_LAST_TEXTURE_SIZE__', {
      configurable: true,
      get: () => lastTextureSize,
    });
    Object.defineProperty(globalThis, '__MOCK_TEXTURE_DESTROY_COUNT__', {
      configurable: true,
      get: () => textureDestroyCount,
    });
    Object.defineProperty(globalThis, '__MOCK_COMPUTE_DISPATCH_COUNT__', {
      configurable: true,
      get: () => computeDispatchCount,
    });
  });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
  await expect(page.locator('#diagnostics')).toBeVisible();
  await expect(page.locator('#metric-adapter')).toHaveText('Mock discrete adapter');
  await expect(page.locator('#metric-timestamp')).toHaveText('available');
  await expect(page.locator('#metric-canvas')).not.toHaveText('0 × 0');
  await expect(page.locator('#metric-instances')).toHaveText('500,000');
  await expect(page.locator('#metric-dispatches')).toHaveText('1 @ 128 threads');
  await page.locator('#population-select').selectOption('100000');
  await expect(page.locator('#metric-instances')).toHaveText('100,000');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, '__MOCK_LAST_INSTANCE_COUNT__')))
    .toBe(100_000);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, '__MOCK_COMPUTE_DISPATCH_COUNT__')))
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(page.locator('#metric-canvas')).toHaveText('900 × 600');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, '__MOCK_LAST_TEXTURE_SIZE__')))
    .toBe('900x600');
  expect(
    await page.evaluate(() => Reflect.get(globalThis, '__MOCK_TEXTURE_DESTROY_COUNT__')),
  ).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, '__MOCK_SUBMIT_COUNT__')))
    .toBeGreaterThan(0);
  await page.locator('#pause-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'paused');
  const pausedSubmitCount = await page.evaluate(() =>
    Reflect.get(globalThis, '__MOCK_SUBMIT_COUNT__'),
  );
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => Reflect.get(globalThis, '__MOCK_SUBMIT_COUNT__'))).toBe(
    pausedSubmitCount,
  );
  await page.locator('#interaction-mode').selectOption('repel');
  await page.locator('#interaction-strength').fill('30');
  await page.locator('#interaction-radius').fill('40');
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

  await page.evaluate(() => {
    const app = Reflect.get(globalThis, '__SWARM_GPU_APP__');
    app.dispose();
    app.dispose();
  });
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'disposed');
  const disposedSubmitCount = await page.evaluate(() =>
    Reflect.get(globalThis, '__MOCK_SUBMIT_COUNT__'),
  );
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => Reflect.get(globalThis, '__MOCK_SUBMIT_COUNT__'))).toBe(
    disposedSubmitCount,
  );

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
  await page.evaluate(() => {
    Reflect.get(globalThis, '__SWARM_GPU_APP__').dispose();
  });
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'disposed');
});
