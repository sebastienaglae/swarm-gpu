export const LOD_COUNT = 3;
export const LOD_COUNTER_STRIDE_BYTES = 16;
export const LOD_COUNTER_BYTES = LOD_COUNT * LOD_COUNTER_STRIDE_BYTES;
export const LOD_INDIRECT_STRIDE_BYTES = 20;
export const LOD_INDIRECT_BYTES = LOD_COUNT * LOD_INDIRECT_STRIDE_BYTES;
export const LOD_VISIBLE_ID_BYTES_PER_INSTANCE = LOD_COUNT * Uint32Array.BYTES_PER_ELEMENT;

export const DEFAULT_LOD_THRESHOLDS = {
  nearPixels: 8,
  midPixels: 2,
  farPixels: 0.35,
} as const;

export interface LodThresholds {
  readonly nearPixels: number;
  readonly midPixels: number;
  readonly farPixels: number;
}

export function classifyProjectedRadius(
  projectedRadiusPixels: number,
  thresholds: LodThresholds = DEFAULT_LOD_THRESHOLDS,
): 0 | 1 | 2 | -1 {
  if (!Number.isFinite(projectedRadiusPixels) || projectedRadiusPixels < thresholds.farPixels)
    return -1;
  if (projectedRadiusPixels >= thresholds.nearPixels) return 0;
  if (projectedRadiusPixels >= thresholds.midPixels) return 1;
  return 2;
}

export function projectedSphereRadiusPixels(
  radius: number,
  viewDepth: number,
  viewportHeight: number,
  verticalProjectionScale: number,
): number {
  if (viewDepth <= 0 || viewportHeight <= 0 || radius < 0) return 0;
  return (radius * verticalProjectionScale * viewportHeight * 0.5) / viewDepth;
}
