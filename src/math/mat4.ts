export type Mat4 = Float32Array;

export function createMat4(): Mat4 {
  const matrix = new Float32Array(16);
  matrix[0] = 1;
  matrix[5] = 1;
  matrix[10] = 1;
  matrix[15] = 1;
  return matrix;
}

export function setPerspectiveWebGpu(
  out: Mat4,
  verticalFovRadians: number,
  aspect: number,
  near: number,
  far: number,
): void {
  if (![verticalFovRadians, aspect, near, far].every(Number.isFinite)) {
    throw new RangeError('perspective inputs must be finite');
  }
  if (verticalFovRadians <= 0 || verticalFovRadians >= Math.PI) {
    throw new RangeError('vertical field of view must be between zero and pi');
  }
  if (aspect <= 0 || near <= 0 || far <= near) {
    throw new RangeError('perspective aspect and clipping planes are invalid');
  }

  out.fill(0);
  const focalLength = 1 / Math.tan(verticalFovRadians * 0.5);
  out[0] = focalLength / aspect;
  out[5] = focalLength;
  out[10] = far / (near - far);
  out[11] = -1;
  out[14] = (far * near) / (near - far);
}

export function setLookAt(
  out: Mat4,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
): void {
  let zX = eyeX - targetX;
  let zY = eyeY - targetY;
  let zZ = eyeZ - targetZ;
  const zLength = Math.hypot(zX, zY, zZ);
  if (zLength <= Number.EPSILON) throw new RangeError('eye and target must differ');
  zX /= zLength;
  zY /= zLength;
  zZ /= zLength;

  // cross(worldUp, backward); switch to a stable fallback near the poles.
  let xX = zZ;
  let xY = 0;
  let xZ = -zX;
  let xLength = Math.hypot(xX, xZ);
  if (xLength <= 1e-6) {
    xX = 1;
    xY = 0;
    xZ = 0;
    xLength = 1;
  }
  xX /= xLength;
  xY /= xLength;
  xZ /= xLength;

  const yX = zY * xZ - zZ * xY;
  const yY = zZ * xX - zX * xZ;
  const yZ = zX * xY - zY * xX;

  out[0] = xX;
  out[1] = yX;
  out[2] = zX;
  out[3] = 0;
  out[4] = xY;
  out[5] = yY;
  out[6] = zY;
  out[7] = 0;
  out[8] = xZ;
  out[9] = yZ;
  out[10] = zZ;
  out[11] = 0;
  out[12] = -(xX * eyeX + xY * eyeY + xZ * eyeZ);
  out[13] = -(yX * eyeX + yY * eyeY + yZ * eyeZ);
  out[14] = -(zX * eyeX + zY * eyeY + zZ * eyeZ);
  out[15] = 1;
}

export function multiplyMat4(out: Mat4, left: Mat4, right: Mat4): void {
  if (out === left || out === right)
    throw new Error('matrix multiply output must not alias inputs');
  for (let column = 0; column < 4; column += 1) {
    const rightOffset = column * 4;
    for (let row = 0; row < 4; row += 1) {
      out[rightOffset + row] =
        readNumber(left, row, 'left matrix') * readNumber(right, rightOffset, 'right matrix') +
        readNumber(left, 4 + row, 'left matrix') *
          readNumber(right, rightOffset + 1, 'right matrix') +
        readNumber(left, 8 + row, 'left matrix') *
          readNumber(right, rightOffset + 2, 'right matrix') +
        readNumber(left, 12 + row, 'left matrix') *
          readNumber(right, rightOffset + 3, 'right matrix');
    }
  }
}

export function transformPointMat4(
  out: Float32Array,
  matrix: Mat4,
  x: number,
  y: number,
  z: number,
): void {
  const m = (index: number): number => readNumber(matrix, index, 'transform matrix');
  const inverseW = 1 / (m(3) * x + m(7) * y + m(11) * z + m(15));
  out[0] = (m(0) * x + m(4) * y + m(8) * z + m(12)) * inverseW;
  out[1] = (m(1) * x + m(5) * y + m(9) * z + m(13)) * inverseW;
  out[2] = (m(2) * x + m(6) * y + m(10) * z + m(14)) * inverseW;
}
import { readNumber } from './typedArray';
