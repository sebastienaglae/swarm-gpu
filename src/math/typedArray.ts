export function readNumber(
  values: ArrayLike<number>,
  index: number,
  label = 'numeric array',
): number {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} index ${String(index)} is out of bounds`);
  return value;
}
