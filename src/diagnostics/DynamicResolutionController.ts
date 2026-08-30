export const DYNAMIC_RESOLUTION_LEVELS = [0.5, 0.625, 0.75, 0.875, 1] as const;

const WINDOW_FRAMES = 90;
const LOWER_THRESHOLD_MS = 18.5;
const RAISE_THRESHOLD_MS = 13.5;

export class DynamicResolutionController {
  #scaleIndex = DYNAMIC_RESOLUTION_LEVELS.length - 1;
  #sampleCount = 0;
  #sampleSum = 0;
  #slowWindows = 0;
  #fastWindows = 0;

  public get scale(): number {
    return DYNAMIC_RESOLUTION_LEVELS[this.#scaleIndex] ?? 1;
  }

  public setScale(scale: number): void {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < DYNAMIC_RESOLUTION_LEVELS.length; index += 1) {
      const distance = Math.abs((DYNAMIC_RESOLUTION_LEVELS[index] ?? 1) - scale);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }
    this.#scaleIndex = nearest;
    this.resetWindow();
  }

  public record(gpuFrameMs: number | undefined, frameIntervalMs: number): number | undefined {
    const signal =
      gpuFrameMs !== undefined && Number.isFinite(gpuFrameMs) && gpuFrameMs > 0
        ? gpuFrameMs
        : frameIntervalMs;
    if (!Number.isFinite(signal) || signal <= 0) return undefined;
    this.#sampleSum += signal;
    this.#sampleCount += 1;
    if (this.#sampleCount < WINDOW_FRAMES) return undefined;
    const average = this.#sampleSum / this.#sampleCount;
    this.#sampleCount = 0;
    this.#sampleSum = 0;
    this.#slowWindows = average > LOWER_THRESHOLD_MS ? this.#slowWindows + 1 : 0;
    this.#fastWindows = average < RAISE_THRESHOLD_MS ? this.#fastWindows + 1 : 0;
    if (this.#slowWindows >= 2 && this.#scaleIndex > 0) {
      this.#scaleIndex -= 1;
      this.resetPressure();
      return this.scale;
    }
    if (this.#fastWindows >= 3 && this.#scaleIndex < DYNAMIC_RESOLUTION_LEVELS.length - 1) {
      this.#scaleIndex += 1;
      this.resetPressure();
      return this.scale;
    }
    return undefined;
  }

  public resetWindow(): void {
    this.#sampleCount = 0;
    this.#sampleSum = 0;
    this.resetPressure();
  }

  private resetPressure(): void {
    this.#slowWindows = 0;
    this.#fastWindows = 0;
  }
}
