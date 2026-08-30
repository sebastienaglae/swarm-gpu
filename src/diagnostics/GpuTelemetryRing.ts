import { LOD_COUNT, LOD_COUNTER_BYTES } from '../lod/LodModel';
import { FrameSampleRecorder } from './FrameSampleRecorder';

const SLOT_COUNT = 3;
const SAMPLE_INTERVAL_FRAMES = 60;

export interface GpuPassTiming {
  readonly simulationMs: number;
  readonly cullingMs: number;
  readonly renderMs: number;
  readonly totalMs: number;
}

export interface GpuTelemetrySnapshot extends GpuPassTiming {
  readonly available: boolean;
  readonly delayedFrames: number;
  readonly lodCounts: readonly number[];
  readonly overflowCount: number;
}

export interface GpuTelemetrySamples {
  readonly simulationMs: number[];
  readonly cullingMs: number[];
  readonly renderMs: number[];
  readonly totalMs: number[];
}

export interface GpuTelemetrySlot {
  readonly querySet: GPUQuerySet;
  readonly queryCount: number;
  readonly queryBytes: number;
  readonly resolveBuffer: GPUBuffer;
  readonly timestampReadback: GPUBuffer;
  readonly counterReadback: GPUBuffer;
  readonly simulationWrites: GPUComputePassTimestampWrites;
  readonly cullingWrites: GPUComputePassTimestampWrites | undefined;
  readonly renderWrites: GPURenderPassTimestampWrites;
  pending: boolean;
  submittedFrame: number;
}

export class GpuTelemetryRing {
  readonly #slots: readonly GpuTelemetrySlot[];
  readonly #indirect: boolean;
  readonly #simulationSamples = new FrameSampleRecorder(512);
  readonly #cullingSamples = new FrameSampleRecorder(512);
  readonly #renderSamples = new FrameSampleRecorder(512);
  readonly #totalSamples = new FrameSampleRecorder(512);
  readonly #lodCounts = new Uint32Array(LOD_COUNT);
  #nextSlot = 0;
  #latest: GpuPassTiming = { simulationMs: 0, cullingMs: 0, renderMs: 0, totalMs: 0 };
  #overflowCount = 0;
  #latestSubmittedFrame = 0;
  #destroyed = false;

  public constructor(device: GPUDevice, indirect: boolean) {
    this.#indirect = indirect;
    const queryCount = indirect ? 6 : 4;
    const queryBytes = queryCount * BigUint64Array.BYTES_PER_ELEMENT;
    this.#slots = Array.from({ length: SLOT_COUNT }, (_, index) => {
      const querySet = device.createQuerySet({
        label: `Live telemetry queries ${String(index)}`,
        type: 'timestamp',
        count: queryCount,
      });
      const resolveBuffer = device.createBuffer({
        label: `Live telemetry resolve ${String(index)}`,
        size: queryBytes,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      const timestampReadback = device.createBuffer({
        label: `Live telemetry timestamp readback ${String(index)}`,
        size: queryBytes,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const counterReadback = device.createBuffer({
        label: `Live telemetry counter readback ${String(index)}`,
        size: LOD_COUNTER_BYTES,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const renderStart = indirect ? 4 : 2;
      return {
        querySet,
        queryCount,
        queryBytes,
        resolveBuffer,
        timestampReadback,
        counterReadback,
        simulationWrites: timestampWrites(querySet, 0),
        cullingWrites: indirect ? timestampWrites(querySet, 2) : undefined,
        renderWrites: timestampWrites(querySet, renderStart),
        pending: false,
        submittedFrame: 0,
      };
    });
  }

  public get latestTotalMs(): number | undefined {
    return this.#latestSubmittedFrame > 0 ? this.#latest.totalMs : undefined;
  }

  public acquire(frameIndex: number): GpuTelemetrySlot | undefined {
    if (this.#destroyed || frameIndex % SAMPLE_INTERVAL_FRAMES !== 0) return undefined;
    for (let attempt = 0; attempt < this.#slots.length; attempt += 1) {
      const index = (this.#nextSlot + attempt) % this.#slots.length;
      const slot = this.#slots[index];
      if (slot !== undefined && !slot.pending) {
        this.#nextSlot = (index + 1) % this.#slots.length;
        slot.pending = true;
        slot.submittedFrame = frameIndex;
        return slot;
      }
    }
    return undefined;
  }

  public resolve(
    encoder: GPUCommandEncoder,
    slot: GpuTelemetrySlot,
    counterBuffer: GPUBuffer,
  ): void {
    encoder.resolveQuerySet(slot.querySet, 0, slot.queryCount, slot.resolveBuffer, 0);
    encoder.copyBufferToBuffer(slot.resolveBuffer, 0, slot.timestampReadback, 0, slot.queryBytes);
    encoder.copyBufferToBuffer(counterBuffer, 0, slot.counterReadback, 0, LOD_COUNTER_BYTES);
  }

  public commit(slot: GpuTelemetrySlot): void {
    void Promise.all([
      slot.timestampReadback.mapAsync(GPUMapMode.READ),
      slot.counterReadback.mapAsync(GPUMapMode.READ),
    ])
      .then(
        () => {
          if (this.#destroyed) return;
          const timestamps = new BigUint64Array(slot.timestampReadback.getMappedRange());
          const simulationMs = durationMs(timestamps, 0, 1);
          const cullingMs = this.#indirect ? durationMs(timestamps, 2, 3) : 0;
          const renderStart = this.#indirect ? 4 : 2;
          const renderMs = durationMs(timestamps, renderStart, renderStart + 1);
          const totalMs = durationMs(timestamps, 0, renderStart + 1);
          this.#latest = { simulationMs, cullingMs, renderMs, totalMs };
          this.#latestSubmittedFrame = slot.submittedFrame;
          this.#simulationSamples.record(simulationMs);
          this.#cullingSamples.record(cullingMs);
          this.#renderSamples.record(renderMs);
          this.#totalSamples.record(totalMs);
          const counters = new Uint32Array(slot.counterReadback.getMappedRange());
          this.#overflowCount = 0;
          for (let lod = 0; lod < LOD_COUNT; lod += 1) {
            this.#lodCounts[lod] = counters[lod * 4] ?? 0;
            this.#overflowCount += counters[lod * 4 + 1] ?? 0;
          }
        },
        () => {
          // Device loss or teardown can reject an in-flight map. Live telemetry is best-effort.
        },
      )
      .finally(() => {
        if (slot.timestampReadback.mapState === 'mapped') slot.timestampReadback.unmap();
        if (slot.counterReadback.mapState === 'mapped') slot.counterReadback.unmap();
        slot.pending = false;
      });
  }

  public snapshot(currentFrame: number): GpuTelemetrySnapshot {
    return {
      available: this.#latestSubmittedFrame > 0,
      ...this.#latest,
      delayedFrames: Math.max(0, currentFrame - this.#latestSubmittedFrame),
      lodCounts: Array.from(this.#lodCounts),
      overflowCount: this.#overflowCount,
    };
  }

  public samples(): GpuTelemetrySamples {
    return {
      simulationMs: this.#simulationSamples.snapshot(),
      cullingMs: this.#cullingSamples.snapshot(),
      renderMs: this.#renderSamples.snapshot(),
      totalMs: this.#totalSamples.snapshot(),
    };
  }

  public resetSamples(): void {
    this.#simulationSamples.reset();
    this.#cullingSamples.reset();
    this.#renderSamples.reset();
    this.#totalSamples.reset();
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const slot of this.#slots) {
      slot.querySet.destroy();
      slot.resolveBuffer.destroy();
      slot.timestampReadback.destroy();
      slot.counterReadback.destroy();
    }
  }
}

function timestampWrites(querySet: GPUQuerySet, start: number): GPUComputePassTimestampWrites {
  return {
    querySet,
    beginningOfPassWriteIndex: start,
    endOfPassWriteIndex: start + 1,
  };
}

function durationMs(values: BigUint64Array, start: number, end: number): number {
  return Number((values[end] ?? 0n) - (values[start] ?? 0n)) / 1_000_000;
}
