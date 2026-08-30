import { computeCanvasSize } from '../../src/gpu/canvasSize';

describe('computeCanvasSize', () => {
  it('converts CSS dimensions to physical pixels', () => {
    expect(computeCanvasSize(800, 600, 2, 8192)).toEqual({
      width: 1600,
      height: 1200,
      drawable: true,
    });
  });

  it('rounds fractional dimensions and caps each axis independently', () => {
    expect(computeCanvasSize(5000.2, 100.2, 2, 4096)).toEqual({
      width: 4096,
      height: 200,
      drawable: true,
    });
  });

  it('suspends a zero-sized or invalid-DPR drawable', () => {
    expect(computeCanvasSize(0, 100, 1, 8192)).toEqual({
      width: 0,
      height: 0,
      drawable: false,
    });
    expect(computeCanvasSize(100, 100, 0, 8192).drawable).toBe(false);
  });

  it('rejects non-finite values and invalid device limits', () => {
    expect(() => computeCanvasSize(Number.NaN, 1, 1, 8192)).toThrow(RangeError);
    expect(() => computeCanvasSize(1, 1, 1, 0)).toThrow(RangeError);
  });
});
