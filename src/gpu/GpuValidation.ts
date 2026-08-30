export function requireSafeInteger(value: number, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${label} must be a safe integer greater than or equal to ${String(minimum)}`,
    );
  }
  return value;
}

export function checkedMultiply(left: number, right: number, label: string): number {
  requireSafeInteger(left, `${label} left operand`);
  requireSafeInteger(right, `${label} right operand`);
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer range`);
  return result;
}

export function validateBufferSize(size: number, maximum: number, label: string): number {
  requireSafeInteger(size, `${label} byte size`, 1);
  requireSafeInteger(maximum, 'maximum buffer byte size', 1);
  if (size > maximum) {
    throw new RangeError(
      `${label} byte size ${String(size)} exceeds device limit ${String(maximum)}`,
    );
  }
  if (size % 4 !== 0) throw new RangeError(`${label} byte size must be aligned to 4 bytes`);
  return size;
}

export function validateDispatchCount(count: number, maximum: number, label: string): number {
  requireSafeInteger(count, `${label} dispatch count`, 1);
  requireSafeInteger(maximum, 'maximum dispatch count', 1);
  if (count > maximum) {
    throw new RangeError(
      `${label} dispatch count ${String(count)} exceeds device limit ${String(maximum)}`,
    );
  }
  return count;
}

export function validateIndirectOffset(
  offset: number,
  bufferSize: number,
  recordBytes = 20,
): number {
  requireSafeInteger(offset, 'indirect offset');
  requireSafeInteger(bufferSize, 'indirect buffer size', 1);
  requireSafeInteger(recordBytes, 'indirect record size', 1);
  if (offset % 4 !== 0) throw new RangeError('indirect offset must be aligned to 4 bytes');
  if (offset + recordBytes > bufferSize)
    throw new RangeError('indirect record exceeds buffer range');
  return offset;
}

export interface MeshRangeLike {
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly baseVertex: number;
  readonly vertexCount: number;
}

export function validateMeshRange(
  range: MeshRangeLike,
  totalIndices: number,
  totalVertices: number,
): void {
  requireSafeInteger(totalIndices, 'total index count');
  requireSafeInteger(totalVertices, 'total vertex count');
  requireSafeInteger(range.firstIndex, 'mesh first index');
  requireSafeInteger(range.indexCount, 'mesh index count');
  requireSafeInteger(range.baseVertex, 'mesh base vertex');
  requireSafeInteger(range.vertexCount, 'mesh vertex count');
  if (range.firstIndex + range.indexCount > totalIndices) {
    throw new RangeError('mesh index range exceeds index buffer');
  }
  if (range.baseVertex + range.vertexCount > totalVertices) {
    throw new RangeError('mesh vertex range exceeds vertex buffer');
  }
}

export function clampFinite(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (![minimum, maximum, fallback].every(Number.isFinite) || minimum > maximum) {
    throw new RangeError('finite clamp bounds and fallback are invalid');
  }
  if (!Number.isFinite(value)) return Math.min(maximum, Math.max(minimum, fallback));
  return Math.min(maximum, Math.max(minimum, value));
}
