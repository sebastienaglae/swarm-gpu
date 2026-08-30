import {
  compactVisibleSpheres,
  finalizeIndirectArguments,
  INDIRECT_ARGUMENT_BYTES,
  INDIRECT_ARGUMENT_UINTS,
} from '../../src/culling/CullingModel';

const UNIT_CUBE_PLANES = new Float32Array([
  1, 0, 0, 1, -1, 0, 0, 1, 0, 1, 0, 1, 0, -1, 0, 1, 0, 0, 1, 1, 0, 0, -1, 1,
]);

function spheres(...values: readonly number[]): Float32Array {
  return new Float32Array(values);
}

describe('GPU culling reference model', () => {
  it('matches the five-u32 indexed indirect ABI', () => {
    expect(INDIRECT_ARGUMENT_BYTES).toBe(20);
    expect(INDIRECT_ARGUMENT_UINTS).toBe(5);
    expect(finalizeIndirectArguments(12, 8, 36)).toEqual({
      indexCount: 36,
      instanceCount: 8,
      firstIndex: 0,
      baseVertex: 0,
      firstInstance: 0,
    });
  });

  it('compacts visible spheres and preserves source IDs', () => {
    const result = compactVisibleSpheres(
      spheres(0, 0, 0, 0.1, 10, 0, 0, 0.1, 0.95, 0, 0, 0.1),
      3,
      3,
      UNIT_CUBE_PLANES,
      1,
    );
    expect(Array.from(result.visibleIds)).toEqual([0, 2]);
    expect(result.visibleCount).toBe(2);
    expect(result.overflowCount).toBe(0);
  });

  it('handles zero, hidden, partial workgroup, and overflow boundaries', () => {
    expect(compactVisibleSpheres(new Float32Array(), 0, 0, UNIT_CUBE_PLANES, 1).visibleCount).toBe(
      0,
    );
    expect(
      compactVisibleSpheres(spheres(5, 5, 5, 0.1), 1, 1, UNIT_CUBE_PLANES, 1).visibleCount,
    ).toBe(0);

    const partial = new Float32Array(129 * 4);
    for (let id = 0; id < 129; id += 1) partial[id * 4 + 3] = 0.1;
    const result = compactVisibleSpheres(partial, 129, 128, UNIT_CUBE_PLANES, 1);
    expect(result.visibleCount).toBe(128);
    expect(result.overflowCount).toBe(1);
    expect(new Set(result.visibleIds).size).toBe(128);
    expect(Array.from(result.visibleIds).every((id) => id < 129)).toBe(true);
  });

  it('rejects invalid counts and indirect arguments', () => {
    expect(() => compactVisibleSpheres(new Float32Array(), 1, 1, UNIT_CUBE_PLANES, 1)).toThrow(
      RangeError,
    );
    expect(() => finalizeIndirectArguments(-1, 1, 36)).toThrow(RangeError);
  });
});
