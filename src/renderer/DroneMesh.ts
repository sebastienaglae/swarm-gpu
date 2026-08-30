export const DRONE_VERTEX_FLOATS = 6;
export const DRONE_VERTEX_STRIDE = DRONE_VERTEX_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const DRONE_BOUNDING_RADIUS = 1.5;

// Compact authored-in-code asset. Each vertex is position.xyz + approximate normal.xyz.
export const DRONE_VERTICES = new Float32Array([
  0, 0, 1.5, 0, 0.35, 0.94, -1.1, 0, -0.35, -0.67, 0.67, 0.31, 1.1, 0, -0.35, 0.67, 0.67, 0.31, 0,
  0.3, -0.05, 0, 1, 0, 0, -0.24, -0.05, 0, -1, 0, -0.44, 0, -1.18, -0.35, 0.45, -0.82, 0.44, 0,
  -1.18, 0.35, 0.45, -0.82, 0, 0.34, -0.9, 0, 0.8, -0.6,
]);

export const DRONE_INDICES = new Uint16Array([
  0, 1, 3, 0, 3, 2, 3, 1, 5, 3, 5, 7, 3, 7, 6, 3, 6, 2, 0, 4, 1, 0, 2, 4, 4, 5, 1, 4, 7, 5, 4, 6, 7,
  4, 2, 6,
]);

export const DRONE_VERTEX_COUNT = DRONE_VERTICES.length / DRONE_VERTEX_FLOATS;
export const DRONE_TRIANGLE_COUNT = DRONE_INDICES.length / 3;

export function computeMeshBoundingRadius(vertices: Float32Array): number {
  if (vertices.length % DRONE_VERTEX_FLOATS !== 0) {
    throw new RangeError('vertex data does not match the drone vertex stride');
  }
  let squaredRadius = 0;
  for (let offset = 0; offset < vertices.length; offset += DRONE_VERTEX_FLOATS) {
    const x = readNumber(vertices, offset, 'drone vertices');
    const y = readNumber(vertices, offset + 1, 'drone vertices');
    const z = readNumber(vertices, offset + 2, 'drone vertices');
    squaredRadius = Math.max(squaredRadius, x * x + y * y + z * z);
  }
  return Math.sqrt(squaredRadius);
}
import { readNumber } from '../math/typedArray';
