import {
  computeMeshBoundingRadius,
  DRONE_BOUNDING_RADIUS,
  DRONE_INDICES,
  DRONE_TRIANGLE_COUNT,
  DRONE_VERTEX_COUNT,
  DRONE_VERTICES,
} from '../../src/renderer/DroneMesh';

describe('drone mesh contract', () => {
  it('has valid triangles, indices, and a conservative bound', () => {
    expect(DRONE_VERTEX_COUNT).toBeGreaterThan(0);
    expect(DRONE_INDICES.length % 3).toBe(0);
    expect(DRONE_TRIANGLE_COUNT).toBe(DRONE_INDICES.length / 3);
    for (const index of DRONE_INDICES) expect(index).toBeLessThan(DRONE_VERTEX_COUNT);
    expect(computeMeshBoundingRadius(DRONE_VERTICES)).toBeLessThanOrEqual(DRONE_BOUNDING_RADIUS);
  });

  it('rejects malformed interleaved vertex data', () => {
    expect(() => computeMeshBoundingRadius(new Float32Array(5))).toThrow(RangeError);
  });
});
