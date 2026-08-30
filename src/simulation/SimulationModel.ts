export const SIMULATION_WORKGROUP_SIZE = 128;
export const MAX_SIMULATION_DELTA_SECONDS = 1 / 30;
export const FIXED_BENCHMARK_DELTA_SECONDS = 1 / 60;

export const SIMULATION_DEFAULTS = {
  boundaryRadius: 58,
  maxSpeed: 10,
  containmentStrength: 2.8,
  maxAcceleration: 18,
  noiseStrength: 1.35,
  attractorRadius: 24,
} as const;

export type InteractionMode = 'disabled' | 'attract' | 'repel';

export interface SimulationStepParameters {
  readonly deltaSeconds: number;
  readonly boundaryRadius: number;
  readonly maxSpeed: number;
  readonly containmentStrength: number;
  readonly maxAcceleration: number;
  readonly noiseStrength: number;
  readonly attractorRadius: number;
  readonly attractorX: number;
  readonly attractorY: number;
  readonly attractorZ: number;
  readonly attractorStrength: number;
}

export interface SimulationFixture {
  readonly position: readonly [number, number, number, number];
  readonly velocity: readonly [number, number, number, number];
  readonly seed: number;
}

export interface SimulationFixtureResult {
  readonly position: [number, number, number, number];
  readonly velocity: [number, number, number, number];
}

export function signedInteractionStrength(
  mode: InteractionMode,
  strength: number,
  active: boolean,
): number {
  if (!active || mode === 'disabled' || !Number.isFinite(strength)) return 0;
  const bounded = Math.min(40, Math.max(0, strength));
  return mode === 'repel' ? -bounded : bounded;
}

export function simulateCpuFixture(
  fixture: SimulationFixture,
  parameters: SimulationStepParameters,
): SimulationFixtureResult {
  const dt = Math.min(MAX_SIMULATION_DELTA_SECONDS, Math.max(0, parameters.deltaSeconds));
  let [px, py, pz] = fixture.position;
  const scale = fixture.position[3];
  let [vx, vy, vz, phase] = fixture.velocity;
  if (![px, py, pz, scale, vx, vy, vz, phase].every(isFiniteSimulationValue)) {
    return recoverFixture(fixture.seed, scale);
  }

  let ax = Math.sin(py * 0.17 + phase) * parameters.noiseStrength;
  let ay = Math.sin(pz * 0.13 + phase * 1.7) * parameters.noiseStrength * 0.55;
  let az = Math.sin(px * 0.19 - phase * 1.3) * parameters.noiseStrength;
  const distance = Math.hypot(px, py, pz);
  if (distance > parameters.boundaryRadius && distance > 1e-5) {
    const excess = distance - parameters.boundaryRadius;
    const force = parameters.containmentStrength * (1 + excess * 0.08);
    ax -= (px / distance) * force;
    ay -= (py / distance) * force;
    az -= (pz / distance) * force;
  }

  const attractX = parameters.attractorX - px;
  const attractY = parameters.attractorY - py;
  const attractZ = parameters.attractorZ - pz;
  const attractDistance = Math.hypot(attractX, attractY, attractZ);
  if (
    parameters.attractorStrength !== 0 &&
    attractDistance > 1e-5 &&
    attractDistance < parameters.attractorRadius
  ) {
    const falloff = 1 - attractDistance / parameters.attractorRadius;
    const force = parameters.attractorStrength * falloff * falloff;
    ax += (attractX / attractDistance) * force;
    ay += (attractY / attractDistance) * force;
    az += (attractZ / attractDistance) * force;
  }

  [ax, ay, az] = clampVector(ax, ay, az, parameters.maxAcceleration);
  vx += ax * dt;
  vy += ay * dt;
  vz += az * dt;
  [vx, vy, vz] = clampVector(vx, vy, vz, parameters.maxSpeed);
  px += vx * dt;
  py += vy * dt;
  pz += vz * dt;
  phase += dt * 0.7;

  if (![px, py, pz, vx, vy, vz, phase].every(isFiniteSimulationValue)) {
    return recoverFixture(fixture.seed, scale);
  }
  return { position: [px, py, pz, scale], velocity: [vx, vy, vz, phase] };
}

function clampVector(x: number, y: number, z: number, maximum: number): [number, number, number] {
  const length = Math.hypot(x, y, z);
  if (length <= maximum || length <= 1e-5) return [x, y, z];
  const scale = maximum / length;
  return [x * scale, y * scale, z * scale];
}

function isFiniteSimulationValue(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < 1e12;
}

function recoverFixture(seed: number, originalScale: number): SimulationFixtureResult {
  const angle = hash01(seed) * Math.PI * 2;
  const height = hash01(seed ^ 0x68bc21eb) * 2 - 1;
  const radius = 18 + hash01(seed ^ 0x02e5be93) * 24;
  const horizontal = Math.sqrt(Math.max(0, 1 - height * height));
  const scale = Number.isFinite(originalScale)
    ? Math.min(0.4, Math.max(0.16, originalScale))
    : 0.24;
  return {
    position: [
      Math.cos(angle) * horizontal * radius,
      height * radius * 0.62,
      Math.sin(angle) * horizontal * radius,
      scale,
    ],
    velocity: [-Math.sin(angle) * 2, 0, Math.cos(angle) * 2, hash01(seed) * Math.PI * 2],
  };
}

function hash01(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_296;
}
