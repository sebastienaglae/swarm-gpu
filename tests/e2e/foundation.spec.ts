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
});

test('renders and keeps lifecycle controls idempotent when WebGPU is available', async ({
  page,
}) => {
  await page.goto('/');
  const hasWebGpu = await page.evaluate(() => navigator.gpu !== undefined);
  test.skip(!hasWebGpu, 'This Playwright environment does not expose a hardware WebGPU adapter.');

  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
  await expect(page.locator('#diagnostics')).toBeVisible();
  await expect(page.locator('#metric-canvas')).not.toHaveText('0 × 0');
  await page.locator('#pause-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'paused');
  await page.locator('#pause-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
  await page.locator('#reset-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'running');
});
