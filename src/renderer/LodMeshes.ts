import {
  DRONE_BOUNDING_RADIUS,
  DRONE_INDICES,
  DRONE_VERTICES,
  DRONE_VERTEX_FLOATS,
  DRONE_VERTEX_STRIDE,
} from './DroneMesh';

const MID_VERTICES = new Float32Array([
  0, 0, 1.5, 0, 0.35, 0.94, -0.9, 0, -0.6, -0.7, 0.35, -0.35, 0.9, 0, -0.6, 0.7, 0.35, -0.35, 0,
  0.28, -0.25, 0, 1, 0, 0, -0.18, -0.25, 0, -1, 0,
]);
const MID_INDICES = new Uint16Array([0, 1, 3, 0, 3, 2, 0, 4, 1, 0, 2, 4, 1, 4, 3, 2, 3, 4]);

const FAR_VERTICES = new Float32Array([
  -1, -1, 0, 0, 0, 1, 1, -1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, -1, 1, 0, 0, 0, 1,
]);
const FAR_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

export interface LodMeshRange {
  readonly lod: 0 | 1 | 2;
  readonly name: 'near' | 'mid' | 'far';
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly baseVertex: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly boundingRadius: number;
}

const sources = [
  { name: 'near', vertices: DRONE_VERTICES, indices: DRONE_INDICES, radius: DRONE_BOUNDING_RADIUS },
  { name: 'mid', vertices: MID_VERTICES, indices: MID_INDICES, radius: DRONE_BOUNDING_RADIUS },
  { name: 'far', vertices: FAR_VERTICES, indices: FAR_INDICES, radius: Math.SQRT2 },
] as const;

export const LOD_VERTICES = new Float32Array(
  sources.reduce((total, source) => total + source.vertices.length, 0),
);
export const LOD_INDICES = new Uint16Array(
  sources.reduce((total, source) => total + source.indices.length, 0),
);

let vertexFloatOffset = 0;
let indexOffset = 0;
export const LOD_MESH_RANGES: readonly LodMeshRange[] = sources.map((source, lod) => {
  LOD_VERTICES.set(source.vertices, vertexFloatOffset);
  LOD_INDICES.set(source.indices, indexOffset);
  const vertexCount = source.vertices.length / DRONE_VERTEX_FLOATS;
  const range: LodMeshRange = {
    lod: lod as 0 | 1 | 2,
    name: source.name,
    firstIndex: indexOffset,
    indexCount: source.indices.length,
    baseVertex: vertexFloatOffset / DRONE_VERTEX_FLOATS,
    vertexCount,
    triangleCount: source.indices.length / 3,
    boundingRadius: source.radius,
  };
  vertexFloatOffset += source.vertices.length;
  indexOffset += source.indices.length;
  return range;
});

export { DRONE_VERTEX_STRIDE as LOD_VERTEX_STRIDE };
