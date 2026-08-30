import {
  MAX_SIMULATION_DELTA_SECONDS,
  SIMULATION_DEFAULTS,
  signedInteractionStrength,
  simulateCpuFixture,
  type SimulationStepParameters,
} from '../../src/simulation/SimulationModel';

const DEFAULT_PARAMETERS: SimulationStepParameters = {
  deltaSeconds: 1 / 60,
  ...SIMULATION_DEFAULTS,
  attractorX: 0,
  attractorY: 0,
  attractorZ: 0,
  attractorStrength: 0,
};

describe('simulation reference model', () => {
  it('keeps zero-length inputs finite without unsafe normalization', () => {
    const result = simulateCpuFixture(
      { position: [0, 0, 0, 0.2], velocity: [0, 0, 0, 0], seed: 1 },
      DEFAULT_PARAMETERS,
    );
    expect([...result.position, ...result.velocity].every(Number.isFinite)).toBe(true);
  });

  it('clamps large delta, acceleration, and speed', () => {
    const result = simulateCpuFixture(
      { position: [80, 0, 0, 0.2], velocity: [100, 0, 0, 0], seed: 2 },
      { ...DEFAULT_PARAMETERS, deltaSeconds: 100 },
    );
    expect(Math.hypot(...result.velocity.slice(0, 3))).toBeLessThanOrEqual(
      SIMULATION_DEFAULTS.maxSpeed + 1e-5,
    );
    expect(result.position[0]).toBeLessThanOrEqual(80 + 10 * MAX_SIMULATION_DELTA_SECONDS);
  });

  it('recovers NaN and runaway fixtures deterministically', () => {
    const fixture = {
      position: [Number.NaN, 0, 0, 0.3] as const,
      velocity: [Number.POSITIVE_INFINITY, 0, 0, 0] as const,
      seed: 123,
    };
    const first = simulateCpuFixture(fixture, DEFAULT_PARAMETERS);
    const second = simulateCpuFixture(fixture, DEFAULT_PARAMETERS);
    expect(first).toEqual(second);
    expect([...first.position, ...first.velocity].every(Number.isFinite)).toBe(true);
  });

  it('supports disabled, attract, and repel force signs', () => {
    expect(signedInteractionStrength('disabled', 10, true)).toBe(0);
    expect(signedInteractionStrength('attract', 10, false)).toBe(0);
    expect(signedInteractionStrength('attract', 10, true)).toBe(10);
    expect(signedInteractionStrength('repel', 10, true)).toBe(-10);
    expect(signedInteractionStrength('attract', 100, true)).toBe(40);
  });
});
