export const POSITION_FLOATS_PER_INSTANCE = 4;
export const APPEARANCE_UINTS_PER_INSTANCE = 4;
export const POSITION_BYTES_PER_INSTANCE = 16;
export const APPEARANCE_BYTES_PER_INSTANCE = 16;
export const STATIC_INSTANCE_SEED = 0x5a17c9e3;

const PALETTE = new Uint32Array([
  packRgba(77, 226, 255, 255),
  packRgba(111, 151, 255, 255),
  packRgba(188, 119, 255, 255),
  packRgba(92, 255, 190, 255),
]);

export interface StaticInstanceData {
  readonly positions: Float32Array;
  readonly appearance: Uint32Array;
}

export class XorShift32 {
  #state: number;

  public constructor(seed: number) {
    const normalized = seed >>> 0;
    this.#state = normalized === 0 ? 0x6d2b79f5 : normalized;
  }

  public nextUint32(): number {
    let value = this.#state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.#state = value >>> 0;
    return this.#state;
  }

  public nextFloat(): number {
    return this.nextUint32() / 4_294_967_296;
  }
}

export function createStaticInstanceData(
  instanceCount: number,
  seed = STATIC_INSTANCE_SEED,
): StaticInstanceData {
  if (!Number.isSafeInteger(instanceCount) || instanceCount < 0) {
    throw new RangeError('instance count must be a safe non-negative integer');
  }
  const positions = new Float32Array(instanceCount * POSITION_FLOATS_PER_INSTANCE);
  const appearance = new Uint32Array(instanceCount * APPEARANCE_UINTS_PER_INSTANCE);
  const random = new XorShift32(seed);
  const floatScratch = new Float32Array(1);
  const uintScratch = new Uint32Array(floatScratch.buffer);

  for (let instance = 0; instance < instanceCount; instance += 1) {
    const positionOffset = instance * POSITION_FLOATS_PER_INSTANCE;
    const appearanceOffset = instance * APPEARANCE_UINTS_PER_INSTANCE;
    const y = random.nextFloat() * 2 - 1;
    const azimuth = random.nextFloat() * Math.PI * 2;
    const radial = 12 + Math.cbrt(random.nextFloat()) * 42;
    const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
    positions[positionOffset] = Math.cos(azimuth) * horizontal * radial;
    positions[positionOffset + 1] = y * radial * 0.62;
    positions[positionOffset + 2] = Math.sin(azimuth) * horizontal * radial;
    positions[positionOffset + 3] = 0.16 + random.nextFloat() * 0.24;

    floatScratch[0] = random.nextFloat() * Math.PI * 2;
    appearance[appearanceOffset] = readNumber(
      PALETTE,
      random.nextUint32() % PALETTE.length,
      'instance palette',
    );
    appearance[appearanceOffset + 1] = readNumber(uintScratch, 0, 'heading bit pattern');
    appearance[appearanceOffset + 2] = random.nextUint32();
    appearance[appearanceOffset + 3] = random.nextUint32() & 3;
  }

  return { positions, appearance };
}

function packRgba(red: number, green: number, blue: number, alpha: number): number {
  return (red | (green << 8) | (blue << 16) | (alpha << 24)) >>> 0;
}
import { readNumber } from '../math/typedArray';
