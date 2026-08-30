import type { AppState } from '../app/AppState';
import type { AdapterCapabilities } from '../gpu/Capabilities';
import type { CanvasSize } from '../gpu/canvasSize';

export class DiagnosticsOverlay {
  readonly #root: HTMLElement;
  readonly #state: HTMLOutputElement;
  readonly #adapter: HTMLOutputElement;
  readonly #canvas: HTMLOutputElement;
  readonly #capacity: HTMLOutputElement;
  readonly #timestamp: HTMLOutputElement;

  public constructor(root: HTMLElement) {
    this.#root = root;
    this.#state = requireOutput('metric-state');
    this.#adapter = requireOutput('metric-adapter');
    this.#canvas = requireOutput('metric-canvas');
    this.#capacity = requireOutput('metric-capacity');
    this.#timestamp = requireOutput('metric-timestamp');
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
}

function requireOutput(id: string): HTMLOutputElement {
  const element = document.querySelector<HTMLOutputElement>(`#${id}`);
  if (element === null) throw new Error(`Required diagnostics output #${id} was not found`);
  return element;
}
