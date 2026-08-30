import {
  classifyProjectedRadius,
  LOD_COUNTER_BYTES,
  LOD_INDIRECT_BYTES,
  LOD_VISIBLE_ID_BYTES_PER_INSTANCE,
  projectedSphereRadiusPixels,
} from '../../src/lod/LodModel';
import { LOD_INDICES, LOD_MESH_RANGES, LOD_VERTICES } from '../../src/renderer/LodMeshes';

describe('LOD contracts', () => {
  it('classifies deterministic threshold boundaries without overlap', () => {
    expect(classifyProjectedRadius(8)).toBe(0);
    expect(classifyProjectedRadius(7.999)).toBe(1);
    expect(classifyProjectedRadius(2)).toBe(1);
    expect(classifyProjectedRadius(1.999)).toBe(2);
    expect(classifyProjectedRadius(0.35)).toBe(2);
    expect(classifyProjectedRadius(0.349)).toBe(-1);
    expect(classifyProjectedRadius(Number.NaN)).toBe(-1);
  });

  it('computes projected radius and rejects invalid view depth', () => {
    expect(projectedSphereRadiusPixels(1, 10, 1000, 2)).toBe(100);
    expect(projectedSphereRadiusPixels(1, 0, 1000, 2)).toBe(0);
  });

  it('uses three capacity-sized lists, counters, and indirect records', () => {
    expect(LOD_VISIBLE_ID_BYTES_PER_INSTANCE).toBe(12);
    expect(LOD_COUNTER_BYTES).toBe(48);
    expect(LOD_INDIRECT_BYTES).toBe(60);
  });

  it('packs three valid mesh ranges into shared vertex and index buffers', () => {
    expect(LOD_MESH_RANGES.map((range) => range.indexCount)).toEqual([36, 18, 6]);
    expect(LOD_MESH_RANGES.map((range) => range.firstIndex)).toEqual([0, 36, 54]);
    expect(LOD_MESH_RANGES.map((range) => range.baseVertex)).toEqual([0, 8, 13]);
    for (const range of LOD_MESH_RANGES) {
      expect(range.firstIndex + range.indexCount).toBeLessThanOrEqual(LOD_INDICES.length);
      expect(range.baseVertex + range.vertexCount).toBeLessThanOrEqual(LOD_VERTICES.length / 6);
    }
  });
});
