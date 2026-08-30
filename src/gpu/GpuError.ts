export type GpuInitializationErrorCode =
  | 'INSECURE_CONTEXT'
  | 'WEBGPU_UNAVAILABLE'
  | 'ADAPTER_UNAVAILABLE'
  | 'DEVICE_UNAVAILABLE'
  | 'CANVAS_CONTEXT_UNAVAILABLE'
  | 'CANVAS_CONFIGURATION_FAILED';

const USER_MESSAGES: Record<GpuInitializationErrorCode, string> = {
  INSECURE_CONTEXT: 'WebGPU requires a secure HTTPS context or localhost.',
  WEBGPU_UNAVAILABLE:
    'WebGPU is not available in this browser. Try a current Chrome or Edge release with hardware acceleration enabled.',
  ADAPTER_UNAVAILABLE:
    'No compatible GPU adapter was found. Check hardware acceleration and your graphics driver.',
  DEVICE_UNAVAILABLE:
    'The browser found a GPU adapter but could not create a WebGPU device. Update the browser and graphics driver, then retry.',
  CANVAS_CONTEXT_UNAVAILABLE: 'The browser could not create a WebGPU canvas context.',
  CANVAS_CONFIGURATION_FAILED:
    'The GPU was created, but the rendering surface could not be configured.',
};

export class GpuInitializationError extends Error {
  public readonly code: GpuInitializationErrorCode;
  public override readonly cause: unknown;

  public constructor(code: GpuInitializationErrorCode, cause?: unknown) {
    super(USER_MESSAGES[code]);
    this.name = 'GpuInitializationError';
    this.code = code;
    this.cause = cause;
  }
}

export function toUserFacingError(error: unknown): string {
  if (error instanceof GpuInitializationError) return error.message;
  return 'SwarmGPU could not initialize the renderer. Review the browser console for diagnostics, then retry.';
}
