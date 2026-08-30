import {
  checkedMultiply,
  clampFinite,
  requireSafeInteger,
  validateBufferSize,
  validateDispatchCount,
  validateIndirectOffset,
  validateMeshRange,
} from '../../src/gpu/GpuValidation';

describe('GPU defensive validation', () => {
  it('rejects unsafe integer arithmetic before GPU allocation', () => {
    expect(checkedMultiply(250_000, 16, 'positions')).toBe(4_000_000);
    expect(() => checkedMultiply(Number.MAX_SAFE_INTEGER, 4, 'positions')).toThrow(RangeError);
    expect(() => requireSafeInteger(1.5, 'count')).toThrow(RangeError);
  });

  it('validates buffer alignment, bounds, and dispatch limits', () => {
    expect(validateBufferSize(64, 128, 'state')).toBe(64);
    expect(() => validateBufferSize(66, 128, 'state')).toThrow('aligned');
    expect(() => validateBufferSize(132, 128, 'state')).toThrow('exceeds device limit');
    expect(validateDispatchCount(8, 8, 'simulation')).toBe(8);
    expect(() => validateDispatchCount(9, 8, 'simulation')).toThrow('exceeds device limit');
  });

  it('validates indirect and mesh ranges', () => {
    expect(validateIndirectOffset(20, 60)).toBe(20);
    expect(() => validateIndirectOffset(2, 60)).toThrow('aligned');
    expect(() => validateIndirectOffset(44, 60)).toThrow('exceeds buffer range');
    expect(() => {
      validateMeshRange({ firstIndex: 4, indexCount: 8, baseVertex: 2, vertexCount: 5 }, 12, 7);
    }).not.toThrow();
    expect(() => {
      validateMeshRange({ firstIndex: 4, indexCount: 9, baseVertex: 2, vertexCount: 5 }, 12, 7);
    }).toThrow('index range');
  });

  it('clamps finite inputs and replaces non-finite values', () => {
    expect(clampFinite(12, 0, 10, 4)).toBe(10);
    expect(clampFinite(Number.NaN, 0, 10, 4)).toBe(4);
    expect(clampFinite(Number.POSITIVE_INFINITY, 0, 10, 4)).toBe(4);
  });
});
