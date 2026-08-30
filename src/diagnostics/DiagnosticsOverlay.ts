import type { AppState } from '../app/AppState';
import type { AdapterCapabilities } from '../gpu/Capabilities';
import type { CanvasSize } from '../gpu/canvasSize';
import type { StaticSwarmRenderer } from '../renderer/StaticSwarmRenderer';

export class DiagnosticsOverlay {
  readonly #root: HTMLElement;
  readonly #state: HTMLOutputElement;
  readonly #adapter: HTMLOutputElement;
  readonly #canvas: HTMLOutputElement;
  readonly #capacity: HTMLOutputElement;
  readonly #timestamp: HTMLOutputElement;
  readonly #instances: HTMLOutputElement;
  readonly #triangles: HTMLOutputElement;
  readonly #draws: HTMLOutputElement;
  readonly #dispatches: HTMLOutputElement;
  readonly #memory: HTMLOutputElement;
  readonly #fps: HTMLOutputElement;
  readonly #frame: HTMLOutputElement;
  readonly #cpu: HTMLOutputElement;
  readonly #gpu: HTMLOutputElement;

  public constructor(root: HTMLElement) {
    this.#root = root;
    this.#state = requireOutput('metric-state');
    this.#adapter = requireOutput('metric-adapter');
    this.#canvas = requireOutput('metric-canvas');
    this.#capacity = requireOutput('metric-capacity');
    this.#timestamp = requireOutput('metric-timestamp');
    this.#instances = requireOutput('metric-instances');
    this.#triangles = requireOutput('metric-triangles');
    this.#draws = requireOutput('metric-draws');
    this.#dispatches = requireOutput('metric-dispatches');
    this.#memory = requireOutput('metric-memory');
    this.#fps = requireOutput('metric-fps');
    this.#frame = requireOutput('metric-frame');
    this.#cpu = requireOutput('metric-cpu');
    this.#gpu = requireOutput('metric-gpu');
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
    this.#memory.value = `${(renderer.estimatedStateBytes / 1_048_576).toFixed(1)} MiB estimated`;
    this.#gpu.value = 'not measured (Phase 06)';
    this.setPopulation(instanceCount, renderer.triangleCount);
  }

  public setPopulation(instanceCount: number, trianglesPerInstance: number): void {
    this.#instances.value = instanceCount.toLocaleString('en-US');
    this.#triangles.value = (instanceCount * trianglesPerInstance).toLocaleString('en-US');
  }

  public setFrameMetrics(
    framesPerSecond: number,
    frameIntervalMs: number,
    cpuFrameMs: number,
  ): void {
    this.#fps.value = framesPerSecond.toFixed(1);
    this.#frame.value = `${frameIntervalMs.toFixed(2)} ms`;
    this.#cpu.value = `${cpuFrameMs.toFixed(2)} ms`;
  }
}

function requireOutput(id: string): HTMLOutputElement {
  const element = document.querySelector<HTMLOutputElement>(`#${id}`);
  if (element === null) throw new Error(`Required diagnostics output #${id} was not found`);
  return element;
}
