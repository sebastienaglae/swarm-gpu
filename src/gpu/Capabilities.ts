export const INSTANCE_BYTES = 92;
export const EXPLICIT_GPU_BUDGET_BYTES = 256 * 1024 * 1024;
export const INSTANCE_PRESETS = [10_000, 100_000, 250_000, 500_000, 1_000_000] as const;
export const INITIAL_COMPUTE_WORKGROUP_SIZE = 256;

export interface CapacityLimits {
  readonly maxBufferSize: number;
  readonly maxStorageBufferBindingSize: number;
  readonly maxComputeWorkgroupsPerDimension: number;
}

export interface CapacityReport {
  readonly maxInstances: number;
  readonly limitingFactor: 'buffer-size' | 'storage-binding' | 'dispatch' | 'memory-budget';
  readonly requestedInstances: number;
  readonly selectedInstances: number;
  readonly estimatedBytes: number;
  readonly presets: readonly Readonly<{ count: number; supported: boolean }>[];
}

export interface AdapterCapabilities {
  readonly adapterDescription: string;
  readonly architecture: string;
  readonly vendor: string;
  readonly device: string;
  readonly features: readonly string[];
  readonly timestampQuerySupported: boolean;
  readonly limits: Readonly<CapacityLimits> & {
    readonly maxTextureDimension2D: number;
    readonly maxStorageBuffersPerShaderStage: number;
    readonly maxComputeInvocationsPerWorkgroup: number;
    readonly maxComputeWorkgroupSizeX: number;
    readonly minUniformBufferOffsetAlignment: number;
    readonly minStorageBufferOffsetAlignment: number;
  };
  readonly capacity: CapacityReport;
}

interface CapacityCandidate {
  readonly value: number;
  readonly factor: CapacityReport['limitingFactor'];
}

export function alignTo(value: number, alignment: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('value must be a safe non-negative integer');
  if (!Number.isSafeInteger(alignment) || alignment <= 0) {
    throw new RangeError('alignment must be a safe positive integer');
  }
  const remainder = value % alignment;
  const result = remainder === 0 ? value : value + (alignment - remainder);
  if (!Number.isSafeInteger(result))
    throw new RangeError('aligned value exceeds safe integer range');
  return result;
}

export function estimateInstanceBytes(instanceCount: number): number {
  if (!Number.isSafeInteger(instanceCount) || instanceCount < 0) {
    throw new RangeError('instance count must be a safe non-negative integer');
  }
  const bytes = instanceCount * INSTANCE_BYTES;
  if (!Number.isSafeInteger(bytes))
    throw new RangeError('instance allocation exceeds safe integer range');
  return bytes;
}

export function deriveCapacity(
  requestedInstances: number,
  limits: CapacityLimits,
  explicitBudgetBytes = EXPLICIT_GPU_BUDGET_BYTES,
  workgroupSize = INITIAL_COMPUTE_WORKGROUP_SIZE,
): CapacityReport {
  if (!Number.isSafeInteger(requestedInstances) || requestedInstances < 0) {
    throw new RangeError('requested instance count must be a safe non-negative integer');
  }
  if (!Number.isSafeInteger(explicitBudgetBytes) || explicitBudgetBytes <= 0) {
    throw new RangeError('explicit budget must be a safe positive integer');
  }
  if (!Number.isSafeInteger(workgroupSize) || workgroupSize <= 0) {
    throw new RangeError('workgroup size must be a safe positive integer');
  }

  const candidates: readonly CapacityCandidate[] = [
    {
      value: Math.floor(limits.maxBufferSize / 16),
      factor: 'buffer-size',
    },
    {
      value: Math.floor(limits.maxStorageBufferBindingSize / 16),
      factor: 'storage-binding',
    },
    {
      value: limits.maxComputeWorkgroupsPerDimension * workgroupSize,
      factor: 'dispatch',
    },
    {
      value: Math.floor(explicitBudgetBytes / INSTANCE_BYTES),
      factor: 'memory-budget',
    },
  ];

  let limiting = candidates[0];
  if (limiting === undefined) throw new Error('capacity candidates are unavailable');
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate !== undefined && candidate.value < limiting.value) limiting = candidate;
  }

  const maxInstances = Math.max(0, Math.floor(limiting.value));
  const selectedInstances = Math.min(requestedInstances, maxInstances);
  return {
    maxInstances,
    limitingFactor: limiting.factor,
    requestedInstances,
    selectedInstances,
    estimatedBytes: estimateInstanceBytes(selectedInstances),
    presets: INSTANCE_PRESETS.map((count) => ({ count, supported: count <= maxInstances })),
  };
}

export function captureAdapterCapabilities(
  adapter: GPUAdapter,
  requestedInstances = 1_000_000,
): AdapterCapabilities {
  const { info, limits } = adapter;
  const capacityLimits: CapacityLimits = {
    maxBufferSize: limits.maxBufferSize,
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
    maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
  };

  return {
    adapterDescription: info.description || 'WebGPU adapter',
    architecture: info.architecture,
    vendor: info.vendor,
    device: info.device,
    features: [...adapter.features].sort(),
    timestampQuerySupported: adapter.features.has('timestamp-query'),
    limits: {
      ...capacityLimits,
      maxTextureDimension2D: limits.maxTextureDimension2D,
      maxStorageBuffersPerShaderStage: limits.maxStorageBuffersPerShaderStage,
      maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
      minUniformBufferOffsetAlignment: limits.minUniformBufferOffsetAlignment,
      minStorageBufferOffsetAlignment: limits.minStorageBufferOffsetAlignment,
    },
    capacity: deriveCapacity(requestedInstances, capacityLimits),
  };
}
