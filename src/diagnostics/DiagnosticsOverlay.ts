import type { AppState } from '../app/AppState';
import type { AdapterCapabilities } from '../gpu/Capabilities';
import type { CanvasSize } from '../gpu/canvasSize';
import type { StaticSwarmRenderer } from '../renderer/StaticSwarmRenderer';
import type { GpuTelemetrySnapshot } from './GpuTelemetryRing';

export class DiagnosticsOverlay {
  readonly #root: HTMLElement;
  readonly #state: HTMLOutputElement;
  readonly #adapter: HTMLOutputElement;
  readonly #canvas: HTMLOutputElement;
  readonly #capacity: HTMLOutputElement;
  readonly #timestamp: HTMLOutputElement;
  readonly #instances: HTMLOutputElement;
  readonly #visible: HTMLOutputElement;
  readonly #lod: HTMLOutputElement;
  readonly #triangles: HTMLOutputElement;
  readonly #draws: HTMLOutputElement;
  readonly #dispatches: HTMLOutputElement;
  readonly #memory: HTMLOutputElement;
  readonly #fps: HTMLOutputElement;
  readonly #frame: HTMLOutputElement;
  readonly #cpu: HTMLOutputElement;
  readonly #cpuUpdate: HTMLOutputElement;
  readonly #submit: HTMLOutputElement;
  readonly #gpuPasses: HTMLOutputElement;
  readonly #gpu: HTMLOutputElement;
  readonly #renderScale: HTMLOutputElement;

  public constructor(root: HTMLElement) {
    this.#root = root;
    this.#state = requireOutput('metric-state');
    this.#adapter = requireOutput('metric-adapter');
    this.#canvas = requireOutput('metric-canvas');
    this.#capacity = requireOutput('metric-capacity');
    this.#timestamp = requireOutput('metric-timestamp');
    this.#instances = requireOutput('metric-instances');
    this.#visible = requireOutput('metric-visible');
    this.#lod = requireOutput('metric-lod');
    this.#triangles = requireOutput('metric-triangles');
    this.#draws = requireOutput('metric-draws');
    this.#dispatches = requireOutput('metric-dispatches');
    this.#memory = requireOutput('metric-memory');
    this.#fps = requireOutput('metric-fps');
    this.#frame = requireOutput('metric-frame');
    this.#cpu = requireOutput('metric-cpu');
    this.#cpuUpdate = requireOutput('metric-cpu-update');
    this.#submit = requireOutput('metric-submit');
    this.#gpuPasses = requireOutput('metric-gpu-passes');
    this.#gpu = requireOutput('metric-gpu');
    this.#renderScale = requireOutput('metric-render-scale');
  }

  public show(): void {
    this.#root.hidden = false;
  }

  public hide(): void {
    this.#root.hidden = true;
  }

  public setState(state: AppState): void {
    this.#state.value = state;
  }

  public setCapabilities(capabilities: AdapterCapabilities): void {
    this.#adapter.value = capabilities.adapterDescription;
    this.#adapter.title = [capabilities.vendor, capabilities.architecture, capabilities.device]
      .filter(Boolean)
      .join(' / ');
    this.#capacity.value = capabilities.capacity.maxInstances.toLocaleString('en-US');
    this.#capacity.title = `Limited by ${capabilities.capacity.limitingFactor}; ${capabilities.capacity.estimatedBytes.toLocaleString('en-US')} estimated bytes at selected capacity`;
    this.#timestamp.value = capabilities.timestampQuerySupported ? 'available' : 'unavailable';
  }

  public setCanvasSize(size: CanvasSize): void {
    this.#canvas.value = size.drawable
      ? `${String(size.width)} × ${String(size.height)}`
      : 'suspended';
  }

  public setRenderer(renderer: StaticSwarmRenderer, instanceCount: number): void {
    this.#draws.value = String(renderer.drawCalls);
    this.#dispatches.value = `${String(renderer.computeDispatches)} @ ${String(renderer.workgroupSize)} threads`;
    this.#visible.value = renderer.indirectRendering ? 'GPU-resident' : 'direct reference';
    this.#memory.value = `${(renderer.estimatedStateBytes / 1_048_576).toFixed(1)} MiB estimated`;
    this.#gpu.value = renderer.gpuTelemetryAvailable ? 'pending (delayed)' : 'unavailable';
    this.setPopulation(instanceCount, renderer.triangleCount);
  }

  public setPendingSimulationEstimate(capacity: number, estimatedBytes: number): void {
    this.#instances.value = `${capacity.toLocaleString('en-US')} capacity`;
    this.#memory.value = `${(estimatedBytes / 1_048_576).toFixed(1)} MiB planned`;
    this.#dispatches.value = 'pipeline pending';
  }

  public setPopulation(instanceCount: number, trianglesPerInstance: number): void {
    this.#instances.value = instanceCount.toLocaleString('en-US');
    this.#triangles.value = (instanceCount * trianglesPerInstance).toLocaleString('en-US');
  }

  public setFrameMetrics(
    framesPerSecond: number,
    frameIntervalMs: number,
    cpuFrameMs: number,
    cpuUpdateMs: number,
    submitMs: number,
    telemetry: GpuTelemetrySnapshot | undefined,
    renderScale: number,
  ): void {
    this.#fps.value = framesPerSecond.toFixed(1);
    this.#frame.value = `${frameIntervalMs.toFixed(2)} ms`;
    this.#cpuUpdate.value = `${cpuUpdateMs.toFixed(2)} ms`;
    this.#cpu.value = `${Math.max(0, cpuFrameMs - submitMs).toFixed(2)} ms`;
    this.#submit.value = `${submitMs.toFixed(3)} ms`;
    this.#renderScale.value = `${String(Math.round(renderScale * 100))}%`;
    if (!telemetry?.available) return;
    this.#visible.value = `${telemetry.lodCounts.reduce((sum, count) => sum + count, 0).toLocaleString('en-US')} delayed`;
    this.#lod.value = `${telemetry.lodCounts.join(' / ')} (${String(telemetry.delayedFrames)}f)`;
    this.#gpuPasses.value = `${telemetry.simulationMs.toFixed(2)} / ${telemetry.cullingMs.toFixed(2)} / ${telemetry.renderMs.toFixed(2)} ms`;
    this.#gpu.value = `${telemetry.totalMs.toFixed(2)} ms delayed`;
  }
}

function requireOutput(id: string): HTMLOutputElement {
  const element = document.querySelector<HTMLOutputElement>(`#${id}`);
  if (element === null) throw new Error(`Required diagnostics output #${id} was not found`);
  return element;
}
