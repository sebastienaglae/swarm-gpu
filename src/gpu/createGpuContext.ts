import { captureAdapterCapabilities, type AdapterCapabilities } from './Capabilities';
import { GpuInitializationError } from './GpuError';

export interface GpuContext {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly canvasContext: GPUCanvasContext;
  readonly canvasFormat: GPUTextureFormat;
  readonly capabilities: AdapterCapabilities;
  dispose(): void;
}

export interface GpuContextOptions {
  readonly powerPreference?: GPUPowerPreference;
  readonly requestedInstances?: number;
  readonly onDeviceLost: (info: GPUDeviceLostInfo) => void;
  readonly onUncapturedError: (error: GPUError) => void;
}

export async function createGpuContext(
  canvas: HTMLCanvasElement,
  options: GpuContextOptions,
): Promise<GpuContext> {
  if (!globalThis.isSecureContext) throw new GpuInitializationError('INSECURE_CONTEXT');
  const gpu = Reflect.get(navigator, 'gpu') as GPU | undefined;
  if (gpu === undefined) throw new GpuInitializationError('WEBGPU_UNAVAILABLE');

  const adapter = await gpu.requestAdapter({
    powerPreference: options.powerPreference ?? 'high-performance',
  });
  if (adapter === null) throw new GpuInitializationError('ADAPTER_UNAVAILABLE');

  const capabilities = captureAdapterCapabilities(adapter, options.requestedInstances);
  let device: GPUDevice;
  try {
    // Phase 01 records optional features but requests none until a pass consumes one.
    device = await adapter.requestDevice({
      label: 'SwarmGPU device',
      requiredFeatures: [],
      requiredLimits: {},
    });
  } catch (error) {
    throw new GpuInitializationError('DEVICE_UNAVAILABLE', error);
  }

  const canvasContext = canvas.getContext('webgpu');
  if (canvasContext === null) {
    device.destroy();
    throw new GpuInitializationError('CANVAS_CONTEXT_UNAVAILABLE');
  }

  const canvasFormat = gpu.getPreferredCanvasFormat();
  try {
    device.pushErrorScope('validation');
    canvasContext.configure({
      device,
      format: canvasFormat,
      alphaMode: 'opaque',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const configurationError = await device.popErrorScope();
    if (configurationError !== null) {
      throw new GpuInitializationError('CANVAS_CONFIGURATION_FAILED', configurationError);
    }
  } catch (error) {
    device.destroy();
    if (error instanceof GpuInitializationError) throw error;
    throw new GpuInitializationError('CANVAS_CONFIGURATION_FAILED', error);
  }

  const uncapturedErrorHandler = (event: GPUUncapturedErrorEvent): void => {
    event.preventDefault();
    options.onUncapturedError(event.error);
  };
  device.addEventListener('uncapturederror', uncapturedErrorHandler);
  void device.lost.then(options.onDeviceLost);

  let disposed = false;
  return {
    adapter,
    device,
    canvasContext,
    canvasFormat,
    capabilities,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      device.removeEventListener('uncapturederror', uncapturedErrorHandler);
      canvasContext.unconfigure();
      device.destroy();
    },
  };
}
