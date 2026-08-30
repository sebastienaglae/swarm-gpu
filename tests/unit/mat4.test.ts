import {
  createMat4,
  multiplyMat4,
  setLookAt,
  setPerspectiveWebGpu,
  transformPointMat4,
} from '../../src/math/mat4';

describe('mat4', () => {
  it('maps the WebGPU near and far planes to zero and one', () => {
    const projection = createMat4();
    const point = new Float32Array(3);
    setPerspectiveWebGpu(projection, Math.PI / 2, 1, 0.1, 100);

    transformPointMat4(point, projection, 0, 0, -0.1);
    expect(point[2]).toBeCloseTo(0, 5);
    transformPointMat4(point, projection, 0, 0, -100);
    expect(point[2]).toBeCloseTo(1, 5);
  });

  it('places the look-at target on the camera forward axis', () => {
    const view = createMat4();
    const point = new Float32Array(3);
    setLookAt(view, 0, 0, 10, 0, 0, 0);
    transformPointMat4(point, view, 0, 0, 0);
    expect(Array.from(point)).toEqual([0, 0, -10]);
  });

  it('multiplies column-major matrices without accepting aliased output', () => {
    const left = createMat4();
    const right = createMat4();
    const result = new Float32Array(16);
    right[12] = 3;
    multiplyMat4(result, left, right);
    expect(Array.from(result)).toEqual(Array.from(right));
    expect(() => {
      multiplyMat4(left, left, right);
    }).toThrow(/alias/);
  });
});
