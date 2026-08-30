import { readNumber } from '../math/typedArray';
import type { OrbitCamera } from './OrbitCamera';

export const GLOBAL_UNIFORM_FLOATS = 64;
export const GLOBAL_UNIFORM_BYTES = GLOBAL_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const GLOBAL_UNIFORM_USED_FLOATS = 56;
export const GLOBAL_UNIFORM_USED_BYTES =
  GLOBAL_UNIFORM_USED_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export const GLOBAL_OFFSETS = {
  view: 0,
  projection: 16,
  viewProjection: 32,
  cameraAndTime: 48,
  viewportAndCount: 52,
} as const;

export function writeGlobalUniforms(
  target: Float32Array,
  camera: OrbitCamera,
  timeSeconds: number,
  viewportWidth: number,
  viewportHeight: number,
  instanceCount: number,
  devicePixelRatio: number,
): void {
  if (target.length < GLOBAL_UNIFORM_FLOATS)
    throw new RangeError('global uniform target is too small');
  target.set(camera.view, GLOBAL_OFFSETS.view);
  target.set(camera.projection, GLOBAL_OFFSETS.projection);
  target.set(camera.viewProjection, GLOBAL_OFFSETS.viewProjection);
  target[GLOBAL_OFFSETS.cameraAndTime] = readNumber(camera.position, 0, 'camera position');
  target[GLOBAL_OFFSETS.cameraAndTime + 1] = readNumber(camera.position, 1, 'camera position');
  target[GLOBAL_OFFSETS.cameraAndTime + 2] = readNumber(camera.position, 2, 'camera position');
  target[GLOBAL_OFFSETS.cameraAndTime + 3] = timeSeconds;
  target[GLOBAL_OFFSETS.viewportAndCount] = viewportWidth;
  target[GLOBAL_OFFSETS.viewportAndCount + 1] = viewportHeight;
  target[GLOBAL_OFFSETS.viewportAndCount + 2] = instanceCount;
  target[GLOBAL_OFFSETS.viewportAndCount + 3] = devicePixelRatio;
}
