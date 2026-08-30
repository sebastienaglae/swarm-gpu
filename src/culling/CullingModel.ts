import { sphereIntersectsFrustum } from '../renderer/Frustum';

export const VISIBLE_ID_BYTES = 4;
export const VISIBILITY_COUNTER_BYTES = 16;
export const INDIRECT_ARGUMENT_BYTES = 20;
export const INDIRECT_ARGUMENT_UINTS = 5;
export const CULLING_RADIUS_SAFETY_MARGIN = 1.08;

export interface IndirectArguments {
  readonly indexCount: number;
  readonly instanceCount: number;
  readonly firstIndex: number;
  readonly baseVertex: number;
  readonly firstInstance: number;
}

export interface CpuCompactionResult {
  readonly visibleIds: Uint32Array;
  readonly visibleCount: number;
  readonly overflowCount: number;
}

export function finalizeIndirectArguments(
  appendedCount: number,
  capacity: number,
  indexCount: number,
): IndirectArguments {
  if (![appendedCount, capacity, indexCount].every(Number.isSafeInteger)) {
    throw new RangeError('Indirect argument inputs must be safe integers');
  }
  if (appendedCount < 0 || capacity < 0 || indexCount < 0) {
    throw new RangeError('Indirect argument inputs must be non-negative');
  }
  return {
    indexCount,
    instanceCount: Math.min(appendedCount, capacity),
    firstIndex: 0,
    baseVertex: 0,
    firstInstance: 0,
  };
}

export function compactVisibleSpheres(
  positionsAndScales: Float32Array,
  activeCount: number,
  capacity: number,
  frustumPlanes: Float32Array,
  meshRadius: number,
): CpuCompactionResult {
  if (!Number.isSafeInteger(activeCount) || !Number.isSafeInteger(capacity)) {
    throw new RangeError('Compaction counts must be safe integers');
  }
  if (activeCount < 0 || capacity < 0 || activeCount * 4 > positionsAndScales.length) {
    throw new RangeError('Compaction inputs exceed their backing storage');
  }
  const visibleIds = new Uint32Array(Math.min(activeCount, capacity));
  let appendedCount = 0;
  let overflowCount = 0;
  for (let instanceId = 0; instanceId < activeCount; instanceId += 1) {
    const offset = instanceId * 4;
    const visible = sphereIntersectsFrustum(
      frustumPlanes,
      positionsAndScales[offset] ?? 0,
      positionsAndScales[offset + 1] ?? 0,
      positionsAndScales[offset + 2] ?? 0,
      Math.max(0, positionsAndScales[offset + 3] ?? 0) * meshRadius * CULLING_RADIUS_SAFETY_MARGIN,
    );
    if (!visible) continue;
    if (appendedCount < capacity) visibleIds[appendedCount] = instanceId;
    else overflowCount += 1;
    appendedCount += 1;
  }
  return {
    visibleIds: visibleIds.slice(0, Math.min(appendedCount, capacity)),
    visibleCount: Math.min(appendedCount, capacity),
    overflowCount,
  };
}
