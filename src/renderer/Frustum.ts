import type { Mat4 } from '../math/mat4';
import { readNumber } from '../math/typedArray';

export const FRUSTUM_PLANE_COUNT = 6;
export const FRUSTUM_FLOAT_COUNT = FRUSTUM_PLANE_COUNT * 4;

export function extractWebGpuFrustumPlanes(out: Float32Array, viewProjection: Mat4): void {
  if (out.length < FRUSTUM_FLOAT_COUNT) throw new RangeError('frustum output is too small');

  // Column-major matrix rows. WebGPU clip volume is -w<=x<=w, -w<=y<=w, 0<=z<=w.
  setNormalizedPlane(out, 0, viewProjection, 3, 0, 1); // left: row4 + row1
  setNormalizedPlane(out, 4, viewProjection, 3, 0, -1); // right: row4 - row1
  setNormalizedPlane(out, 8, viewProjection, 3, 1, 1); // bottom: row4 + row2
  setNormalizedPlane(out, 12, viewProjection, 3, 1, -1); // top: row4 - row2
  setNormalizedRowPlane(out, 16, viewProjection, 2); // near: row3
  setNormalizedPlane(out, 20, viewProjection, 3, 2, -1); // far: row4 - row3
}

export function sphereIntersectsFrustum(
  planes: Float32Array,
  x: number,
  y: number,
  z: number,
  radius: number,
): boolean {
  for (let plane = 0; plane < FRUSTUM_PLANE_COUNT; plane += 1) {
    const offset = plane * 4;
    const distance =
      readNumber(planes, offset, 'frustum planes') * x +
      readNumber(planes, offset + 1, 'frustum planes') * y +
      readNumber(planes, offset + 2, 'frustum planes') * z +
      readNumber(planes, offset + 3, 'frustum planes');
    if (distance < -radius) return false;
  }
  return true;
}

function setNormalizedPlane(
  out: Float32Array,
  outputOffset: number,
  matrix: Mat4,
  firstRow: number,
  secondRow: number,
  secondSign: 1 | -1,
): void {
  const x =
    readNumber(matrix, firstRow, 'view-projection matrix') +
    secondSign * readNumber(matrix, secondRow, 'view-projection matrix');
  const y =
    readNumber(matrix, 4 + firstRow, 'view-projection matrix') +
    secondSign * readNumber(matrix, 4 + secondRow, 'view-projection matrix');
  const z =
    readNumber(matrix, 8 + firstRow, 'view-projection matrix') +
    secondSign * readNumber(matrix, 8 + secondRow, 'view-projection matrix');
  const w =
    readNumber(matrix, 12 + firstRow, 'view-projection matrix') +
    secondSign * readNumber(matrix, 12 + secondRow, 'view-projection matrix');
  setPlane(out, outputOffset, x, y, z, w);
}

function setNormalizedRowPlane(
  out: Float32Array,
  outputOffset: number,
  matrix: Mat4,
  row: number,
): void {
  setPlane(
    out,
    outputOffset,
    readNumber(matrix, row, 'view-projection matrix'),
    readNumber(matrix, 4 + row, 'view-projection matrix'),
    readNumber(matrix, 8 + row, 'view-projection matrix'),
    readNumber(matrix, 12 + row, 'view-projection matrix'),
  );
}

function setPlane(
  out: Float32Array,
  offset: number,
  x: number,
  y: number,
  z: number,
  w: number,
): void {
  const length = Math.hypot(x, y, z);
  if (length <= Number.EPSILON) throw new RangeError('cannot normalize a degenerate plane');
  out[offset] = x / length;
  out[offset + 1] = y / length;
  out[offset + 2] = z / length;
  out[offset + 3] = w / length;
}
