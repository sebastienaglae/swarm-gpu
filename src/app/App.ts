import { DiagnosticsOverlay } from '../diagnostics/DiagnosticsOverlay';
import type { CanvasSize } from '../gpu/canvasSize';
import { computeCanvasSize } from '../gpu/canvasSize';
import { createGpuContext, type GpuContext } from '../gpu/createGpuContext';
import { toUserFacingError } from '../gpu/GpuError';
import { ResourceRegistry } from '../gpu/ResourceRegistry';
import { InputState } from '../input/InputState';
import { AppStateStore } from './AppState';

const MAX_AUTOMATIC_RECOVERY_ATTEMPTS = 1;

interface StatusElements {
  readonly panel: HTMLElement;
  readonly title: HTMLElement;
  readonly message: HTMLElement;
  readonly retry: HTMLButtonElement;
}

export class App {
  public readonly state = new AppStateStore();
  readonly #canvas: HTMLCanvasElement;
  readonly #status: StatusElements;
  readonly #diagnostics: DiagnosticsOverlay;
  readonly #controls: HTMLElement;
  readonly #pauseButton: HTMLButtonElement;
  readonly #resetButton: HTMLButtonElement;
  readonly #input = new InputState();
  readonly #globalUniformStaging = new Float32Array(64);
  readonly #clearColor: GPUColorDict = { r: 0.008, g: 0.018, b: 0.035, a: 1 };
  readonly #colorAttachment: GPURenderPassColorAttachment = {
    view: undefined as unknown as GPUTextureView,
    clearValue: this.#clearColor,
    loadOp: 'clear',
    storeOp: 'store',
  };
  readonly #renderPassDescriptor: GPURenderPassDescriptor = {
    label: 'Foundation clear pass',
    colorAttachments: [this.#colorAttachment],
  };
  readonly #resizeObserver: ResizeObserver;
  #gpu: GpuContext | undefined;
  #resources = new ResourceRegistry();
  #canvasSize: CanvasSize = { width: 0, height: 0, drawable: false };
  #frameHandle: number | undefined;
  #generation = 0;
  #automaticRecoveryAttempts = 0;
  #visibilityPaused = false;
  #initializedListeners = false;

  readonly #onFrame = (): void => {
    this.#frameHandle = undefined;
    if (this.state.current !== 'running') return;

    const gpu = this.#gpu;
    if (gpu !== undefined && this.#canvasSize.drawable) {
      this.#colorAttachment.view = gpu.canvasContext.getCurrentTexture().createView({
        label: 'Current canvas view',
      });
      const encoder = gpu.device.createCommandEncoder({
        label: 'Foundation frame encoder',
      });
      const pass = encoder.beginRenderPass(this.#renderPassDescriptor);
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    }

    this.#scheduleFrame();
  };

  readonly #onRetry = (): void => {
    if (this.state.current !== 'failed') return;
    this.#automaticRecoveryAttempts = 0;
    void this.initialize();
  };

  readonly #onPauseToggle = (): void => {
    if (this.state.current === 'running') this.pause();
    else if (this.state.current === 'paused') this.resume();
  };

  readonly #onReset = (): void => {
    this.reset();
  };

  readonly #onWindowResize = (): void => {
    this.#resize(this.#canvas.clientWidth, this.#canvas.clientHeight);
  };

  readonly #onVisibilityChange = (): void => {
    if (document.hidden && this.state.current === 'running') {
      this.#visibilityPaused = true;
      this.pause();
    } else if (!document.hidden && this.#visibilityPaused && this.state.current === 'paused') {
      this.#visibilityPaused = false;
      this.resume();
    }
  };

  public constructor(root: HTMLElement) {
    this.#canvas = requireElement(root, '#gpu-canvas', HTMLCanvasElement);
    this.#status = {
      panel: requireElement(root, '#status-panel', HTMLElement),
      title: requireElement(root, '#status-title', HTMLElement),
      message: requireElement(root, '#status-message', HTMLElement),
      retry: requireElement(root, '#retry-button', HTMLButtonElement),
    };
    this.#diagnostics = new DiagnosticsOverlay(requireElement(root, '#diagnostics', HTMLElement));
    this.#controls = requireElement(root, '#controls', HTMLElement);
    this.#pauseButton = requireElement(root, '#pause-button', HTMLButtonElement);
    this.#resetButton = requireElement(root, '#reset-button', HTMLButtonElement);
    this.#resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) this.#resize(entry.contentRect.width, entry.contentRect.height);
    });

    this.state.subscribe((current) => {
      this.#diagnostics.setState(current);
      document.documentElement.dataset.appState = current;
    });
    this.#diagnostics.setState(this.state.current);
    this.#status.retry.addEventListener('click', this.#onRetry);
  }

  public async initialize(): Promise<void> {
    const current = this.state.current;
    if (current === 'initializing' || current === 'ready' || current === 'running') return;
    if (current === 'disposed') return;

    this.state.transition('initializing');
    this.#showStatus(
      'Initializing WebGPU',
      'Checking the secure context, adapter, device, and rendering surface…',
      false,
    );
    this.#generation += 1;
    const generation = this.#generation;

    try {
      if (import.meta.env.DEV && new URLSearchParams(location.search).has('debugInitFailure')) {
        throw new Error('Synthetic initialization failure');
      }

      const gpu = await createGpuContext(this.#canvas, {
        powerPreference: 'high-performance',
        requestedInstances: 1_000_000,
        onDeviceLost: (info) => {
          void this.#handleDeviceLost(generation, info);
        },
        onUncapturedError: (error) => {
          this.#handleUncapturedError(error);
        },
      });

      if (generation !== this.#generation || this.state.current === 'disposed') {
        gpu.dispose();
        return;
      }

      this.#gpu = gpu;
      this.#resources = new ResourceRegistry();
      this.#configureListeners();
      this.#resize(this.#canvas.clientWidth, this.#canvas.clientHeight);
      this.#diagnostics.setCapabilities(gpu.capabilities);
      this.#diagnostics.show();
      this.#controls.hidden = false;
      this.#status.panel.dataset.kind = 'ready';
      console.info('[SwarmGPU] WebGPU capabilities', gpu.capabilities);
      this.state.transition('ready');
      this.start();
    } catch (error) {
      if (generation !== this.#generation || this.state.current === 'disposed') return;
      console.error('[SwarmGPU] Initialization failed', error);
      this.state.transition('failed');
      this.#showStatus('WebGPU initialization failed', toUserFacingError(error), true);
    }
  }

  public start(): void {
    if (this.state.current === 'running' || this.state.current === 'disposed') return;
    if (this.state.current !== 'ready' && this.state.current !== 'paused') return;
    this.state.transition('running');
    this.#pauseButton.textContent = 'Pause';
    this.#scheduleFrame();
  }

  public pause(): void {
    if (this.state.current !== 'running') return;
    this.state.transition('paused');
    this.#cancelFrame();
    this.#pauseButton.textContent = 'Resume';
  }

  public resume(): void {
    if (this.state.current !== 'paused') return;
    this.start();
  }

  public reset(): void {
    if (this.state.current === 'disposed') return;
    this.#globalUniformStaging.fill(0);
    this.#input.reset();
  }

  public simulateDeviceLossForDevelopment(): void {
    if (!import.meta.env.DEV || this.state.current === 'disposed') return;
    this.#gpu?.device.destroy();
  }

  public dispose(): void {
    if (this.state.current === 'disposed') return;
    this.#generation += 1;
    this.#cancelFrame();
    this.#removeListeners();
    this.#status.retry.removeEventListener('click', this.#onRetry);
    this.#destroyGpuResources();
    this.#diagnostics.hide();
    this.#controls.hidden = true;
    this.state.transition('disposed');
  }

  #configureListeners(): void {
    if (this.#initializedListeners) return;
    this.#initializedListeners = true;
    this.#input.attach(this.#canvas);
    this.#resizeObserver.observe(this.#canvas);
    this.#pauseButton.addEventListener('click', this.#onPauseToggle);
    this.#resetButton.addEventListener('click', this.#onReset);
    window.addEventListener('resize', this.#onWindowResize);
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  #removeListeners(): void {
    if (!this.#initializedListeners) return;
    this.#initializedListeners = false;
    this.#input.detach(this.#canvas);
    this.#resizeObserver.disconnect();
    this.#pauseButton.removeEventListener('click', this.#onPauseToggle);
    this.#resetButton.removeEventListener('click', this.#onReset);
    window.removeEventListener('resize', this.#onWindowResize);
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
  }

  #resize(cssWidth: number, cssHeight: number): void {
    const maxDimension = this.#gpu?.capabilities.limits.maxTextureDimension2D ?? 8192;
    const size = computeCanvasSize(cssWidth, cssHeight, window.devicePixelRatio, maxDimension);
    this.#canvasSize = size;
    this.#diagnostics.setCanvasSize(size);
    if (!size.drawable) return;
    if (this.#canvas.width !== size.width) this.#canvas.width = size.width;
    if (this.#canvas.height !== size.height) this.#canvas.height = size.height;
  }

  #scheduleFrame(): void {
    if (this.#frameHandle !== undefined || this.state.current !== 'running') return;
    this.#frameHandle = requestAnimationFrame(this.#onFrame);
  }

  #cancelFrame(): void {
    if (this.#frameHandle === undefined) return;
    cancelAnimationFrame(this.#frameHandle);
    this.#frameHandle = undefined;
  }

  async #handleDeviceLost(generation: number, info: GPUDeviceLostInfo): Promise<void> {
    if (generation !== this.#generation || this.state.current === 'disposed') return;
    console.error(`[SwarmGPU] Device lost (${info.reason})`, info.message);
    this.#cancelFrame();
    this.state.transition('recovering');
    this.#showStatus(
      'GPU device lost',
      'The graphics device became unavailable. SwarmGPU is rebuilding its resources…',
      false,
    );
    this.#generation += 1;
    this.#destroyGpuResources();

    if (this.#automaticRecoveryAttempts < MAX_AUTOMATIC_RECOVERY_ATTEMPTS) {
      this.#automaticRecoveryAttempts += 1;
      await this.initialize();
      return;
    }

    this.state.transition('failed');
    this.#showStatus(
      'GPU recovery stopped',
      'Automatic recovery was unsuccessful. Check the browser and graphics driver, then retry.',
      true,
    );
  }

  #handleUncapturedError(error: GPUError): void {
    console.error(`[SwarmGPU] Uncaptured ${error.constructor.name}`, error.message, error);
  }

  #destroyGpuResources(): void {
    this.#resources.destroyAll((label, error) => {
      console.error(`[SwarmGPU] Failed to destroy ${label}`, error);
    });
    this.#gpu?.dispose();
    this.#gpu = undefined;
  }

  #showStatus(title: string, message: string, canRetry: boolean): void {
    this.#status.panel.dataset.kind = 'message';
    this.#status.title.textContent = title;
    this.#status.message.textContent = message;
    this.#status.retry.hidden = !canRetry;
  }
}

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  constructor: abstract new (...args: never[]) => T,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof constructor))
    throw new Error(`Required element ${selector} was not found`);
  return element;
}
