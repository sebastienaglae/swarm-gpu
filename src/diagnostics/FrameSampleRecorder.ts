export class FrameSampleRecorder {
  readonly #samples: Float32Array;
  #writeCount = 0;

  public constructor(capacity = 4096) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError('sample recorder capacity must be a positive safe integer');
    }
    this.#samples = new Float32Array(capacity);
  }

  public record(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.#samples[this.#writeCount % this.#samples.length] = value;
    this.#writeCount += 1;
  }

  public reset(): void {
    this.#writeCount = 0;
  }

  public snapshot(): number[] {
    const count = Math.min(this.#writeCount, this.#samples.length);
    const start = Math.max(0, this.#writeCount - count);
    const result = new Array<number>(count);
    for (let index = 0; index < count; index += 1) {
      result[index] = this.#samples[(start + index) % this.#samples.length] ?? 0;
    }
    return result;
  }
}
