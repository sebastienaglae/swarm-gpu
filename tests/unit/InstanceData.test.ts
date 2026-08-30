import {
  APPEARANCE_UINTS_PER_INSTANCE,
  createStaticInstanceData,
  POSITION_FLOATS_PER_INSTANCE,
} from '../../src/renderer/InstanceData';
import { estimateSimulationStateBytes } from '../../src/renderer/StaticSwarmRenderer';

describe('static instance generation', () => {
  it('is deterministic for a given seed and changes for another seed', () => {
    const first = createStaticInstanceData(64, 123);
    const second = createStaticInstanceData(64, 123);
    const other = createStaticInstanceData(64, 124);
    expect(first.positions).toEqual(second.positions);
    expect(first.appearance).toEqual(second.appearance);
    expect(first.velocities).toEqual(second.velocities);
    expect(first.positions).not.toEqual(other.positions);
  });

  it('matches the SoA layout and emits finite bounded values', () => {
    const count = 128;
    const data = createStaticInstanceData(count);
    expect(data.positions).toHaveLength(count * POSITION_FLOATS_PER_INSTANCE);
    expect(data.appearance).toHaveLength(count * APPEARANCE_UINTS_PER_INSTANCE);
    expect(data.velocities).toHaveLength(count * POSITION_FLOATS_PER_INSTANCE);
    for (let instance = 0; instance < count; instance += 1) {
      const offset = instance * POSITION_FLOATS_PER_INSTANCE;
      const values = data.positions.slice(offset, offset + POSITION_FLOATS_PER_INSTANCE);
      expect(Array.from(values).every(Number.isFinite)).toBe(true);
      expect(values[3]).toBeGreaterThanOrEqual(0.16);
      expect(values[3]).toBeLessThanOrEqual(0.4);
    }
  });

  it('rejects invalid population sizes', () => {
    expect(() => createStaticInstanceData(-1)).toThrow(RangeError);
    expect(() => createStaticInstanceData(1.5)).toThrow(RangeError);
  });

  it('estimates simulation, appearance, visible IDs, counters, and indirect arguments', () => {
    expect(estimateSimulationStateBytes(500_000)).toBe(42_000_036);
    expect(() => estimateSimulationStateBytes(-1)).toThrow(RangeError);
  });
});
