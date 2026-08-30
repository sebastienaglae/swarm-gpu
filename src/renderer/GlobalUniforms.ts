import { readNumber } from '../math/typedArray';
import type { OrbitCamera } from './OrbitCamera';

export const GLOBAL_UNIFORM_FLOATS = 80;
export const GLOBAL_UNIFORM_BYTES = GLOBAL_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const GLOBAL_UNIFORM_USED_FLOATS = 80;
export const GLOBAL_UNIFORM_USED_BYTES =
  GLOBAL_UNIFORM_USED_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export const GLOBAL_OFFSETS = {
  view: 0,
  projection: 16,
  viewProjection: 32,
  cameraAndTime: 48,
  viewportAndCount: 52,
  attractorAndStrength: 56,
  simulationA: 60,
  simulationB: 64,
  simulationC: 68,
} as const;

export interface SimulationUniformValues {
  readonly deltaSeconds: number;
  readonly attractorX: number;
  readonly attractorY: number;
  readonly attractorZ: number;
  readonly attractorStrength: number;
  readonly boundaryRadius: number;
  readonly maxSpeed: number;
  readonly containmentStrength: number;
  readonly maxAcceleration: number;
  readonly noiseStrength: number;
  readonly attractorRadius: number;
  readonly frameIndex: number;
}

export function writeGlobalUniforms(
  target: Float32Array,
  camera: OrbitCamera,
  timeSeconds: number,
  viewportWidth: number,
  viewportHeight: number,
  instanceCount: number,
  devicePixelRatio: number,
  simulation: SimulationUniformValues,
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
  target[GLOBAL_OFFSETS.attractorAndStrength] = simulation.attractorX;
  target[GLOBAL_OFFSETS.attractorAndStrength + 1] = simulation.attractorY;
  target[GLOBAL_OFFSETS.attractorAndStrength + 2] = simulation.attractorZ;
  target[GLOBAL_OFFSETS.attractorAndStrength + 3] = simulation.attractorStrength;
  target[GLOBAL_OFFSETS.simulationA] = simulation.deltaSeconds;
  target[GLOBAL_OFFSETS.simulationA + 1] = instanceCount;
  target[GLOBAL_OFFSETS.simulationA + 2] = simulation.boundaryRadius;
  target[GLOBAL_OFFSETS.simulationA + 3] = simulation.maxSpeed;
  target[GLOBAL_OFFSETS.simulationB] = simulation.containmentStrength;
  target[GLOBAL_OFFSETS.simulationB + 1] = simulation.maxAcceleration;
  target[GLOBAL_OFFSETS.simulationB + 2] = simulation.noiseStrength;
  target[GLOBAL_OFFSETS.simulationB + 3] = simulation.attractorRadius;
  target[GLOBAL_OFFSETS.simulationC] = simulation.frameIndex;
}
