import {
  alignTo,
  deriveCapacity,
  estimateInstanceBytes,
  EXPLICIT_GPU_BUDGET_BYTES,
  INSTANCE_BYTES,
} from '../../src/gpu/Capabilities';

const generousLimits = {
  maxBufferSize: 1_000_000_000,
  maxStorageBufferBindingSize: 1_000_000_000,
  maxComputeWorkgroupsPerDimension: 65_535,
};

describe('GPU capacity helpers', () => {
  it('aligns values without changing already aligned values', () => {
    expect(alignTo(0, 256)).toBe(0);
    expect(alignTo(256, 256)).toBe(256);
    expect(alignTo(257, 256)).toBe(512);
  });

  it('rejects invalid alignment inputs and unsafe results', () => {
    expect(() => alignTo(-1, 256)).toThrow(RangeError);
    expect(() => alignTo(1, 0)).toThrow(RangeError);
    expect(() => alignTo(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });

  it('matches the accepted 92-byte per-instance budget', () => {
    expect(INSTANCE_BYTES).toBe(92);
    expect(estimateInstanceBytes(1_000_000)).toBe(92_000_000);
    expect(estimateInstanceBytes(250_000)).toBe(23_000_000);
  });

  it('uses the explicit project memory budget when it is the tightest limit', () => {
    const report = deriveCapacity(10_000_000, generousLimits);
    expect(report.maxInstances).toBe(Math.floor(EXPLICIT_GPU_BUDGET_BYTES / INSTANCE_BYTES));
    expect(report.limitingFactor).toBe('memory-budget');
    expect(report.selectedInstances).toBe(report.maxInstances);
    expect(report.presets.every((preset) => preset.supported)).toBe(true);
  });

  it('clamps to a storage binding and disables unsupported presets', () => {
    const report = deriveCapacity(1_000_000, {
      ...generousLimits,
      maxStorageBufferBindingSize: 16 * 125_000,
    });
    expect(report.maxInstances).toBe(125_000);
    expect(report.selectedInstances).toBe(125_000);
    expect(report.limitingFactor).toBe('storage-binding');
    expect(report.presets.map(({ supported }) => supported)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('accounts for dispatch and buffer-size bounds', () => {
    const dispatchBound = deriveCapacity(1_000_000, {
      ...generousLimits,
      maxComputeWorkgroupsPerDimension: 100,
    });
    expect(dispatchBound.maxInstances).toBe(25_600);
    expect(dispatchBound.limitingFactor).toBe('dispatch');

    const bufferBound = deriveCapacity(1_000_000, {
      ...generousLimits,
      maxBufferSize: 160_000,
    });
    expect(bufferBound.maxInstances).toBe(10_000);
    expect(bufferBound.limitingFactor).toBe('buffer-size');
  });

  it('rejects invalid counts and budgets', () => {
    expect(() => deriveCapacity(-1, generousLimits)).toThrow(RangeError);
    expect(() => deriveCapacity(1, generousLimits, 0)).toThrow(RangeError);
    expect(() => estimateInstanceBytes(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
