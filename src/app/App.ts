import { DiagnosticsOverlay } from '../diagnostics/DiagnosticsOverlay';
import { DynamicResolutionController } from '../diagnostics/DynamicResolutionController';
import { compactVisibleSpheres } from '../culling/CullingModel';
import { FrameSampleRecorder } from '../diagnostics/FrameSampleRecorder';
import type { CanvasSize } from '../gpu/canvasSize';
import { computeCanvasSize } from '../gpu/canvasSize';
import { createGpuContext, type GpuContext } from '../gpu/createGpuContext';
import { toUserFacingError } from '../gpu/GpuError';
import { ResourceRegistry } from '../gpu/ResourceRegistry';
import { InputState } from '../input/InputState';
import { OrbitCamera } from '../renderer/OrbitCamera';
import { DRONE_BOUNDING_RADIUS } from '../renderer/DroneMesh';
import { LOD_MESH_RANGES } from '../renderer/LodMeshes';
import { createStaticInstanceData } from '../renderer/InstanceData';
import {
  STATIC_POPULATION_PRESETS,
  estimateSimulationStateBytes,
  type SimulationFrame,
  StaticSwarmRenderer,
} from '../renderer/StaticSwarmRenderer';
import {
  FIXED_BENCHMARK_DELTA_SECONDS,
  type InteractionMode,
  MAX_SIMULATION_DELTA_SECONDS,
  SIMULATION_DEFAULTS,
  signedInteractionStrength,
  simulateCpuFixture,
} from '../simulation/SimulationModel';
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
  readonly #populationSelect: HTMLSelectElement;
  readonly #interactionMode: HTMLSelectElement;
  readonly #interactionStrength: HTMLInputElement;
  readonly #interactionRadius: HTMLInputElement;
  readonly #renderScaleSelect: HTMLSelectElement;
  readonly #lodModeSelect: HTMLSelectElement;
  readonly #lodNearInput: HTMLInputElement;
  readonly #lodMidInput: HTMLInputElement;
  readonly #lodFarInput: HTMLInputElement;
  readonly #lodVisualizeInput: HTMLInputElement;
  readonly #backgroundInput: HTMLInputElement;
  readonly #fogInput: HTMLInputElement;
  readonly #markerInput: HTMLInputElement;
  readonly #captureButton: HTMLButtonElement;
  readonly #benchmarkButton: HTMLButtonElement;
  readonly #exportButton: HTMLButtonElement;
  readonly #lodControls: HTMLDetailsElement;
  readonly #input = new InputState();
  readonly #cameraInput = new Float32Array(3);
  readonly #camera = new OrbitCamera();
  readonly #attractorPosition = new Float32Array(3);
  readonly #simulationFrame: SimulationFrame & {
    timeSeconds: number;
    deltaSeconds: number;
    attractorX: number;
    attractorY: number;
    attractorZ: number;
    attractorStrength: number;
    attractorRadius: number;
    frameIndex: number;
    benchmarkVisibilityFraction: number;
    benchmarkVisibilityEnabled: number;
    lodNearPixels: number;
    lodMidPixels: number;
    lodFarPixels: number;
    lodMode: number;
    lodVisualization: number;
    fogEnabled: number;
    markerEnabled: number;
    backgroundEnabled: number;
    simulationEnabled: number;
  } = {
    timeSeconds: 0,
    deltaSeconds: 0,
    attractorX: 0,
    attractorY: 0,
    attractorZ: 0,
    attractorStrength: 0,
    boundaryRadius: SIMULATION_DEFAULTS.boundaryRadius,
    maxSpeed: SIMULATION_DEFAULTS.maxSpeed,
    containmentStrength: SIMULATION_DEFAULTS.containmentStrength,
    maxAcceleration: SIMULATION_DEFAULTS.maxAcceleration,
    noiseStrength: SIMULATION_DEFAULTS.noiseStrength,
    attractorRadius: SIMULATION_DEFAULTS.attractorRadius,
    frameIndex: 0,
    benchmarkVisibilityFraction: 1,
    benchmarkVisibilityEnabled: 0,
    lodNearPixels: 8,
    lodMidPixels: 2,
    lodFarPixels: 0.35,
    lodMode: -1,
    lodVisualization: 0,
    fogEnabled: 1,
    markerEnabled: 1,
    backgroundEnabled: 1,
    simulationEnabled: 1,
  };
  readonly #frameIntervalSamples = new FrameSampleRecorder();
  readonly #cpuUpdateSamples = new FrameSampleRecorder();
  readonly #dynamicResolution = new DynamicResolutionController();
  readonly #resizeObserver: ResizeObserver;
  #gpu: GpuContext | undefined;
  #renderer: StaticSwarmRenderer | undefined;
  #resources = new ResourceRegistry();
  #canvasSize: CanvasSize = { width: 0, height: 0, drawable: false };
  #frameHandle: number | undefined;
  #generation = 0;
  #automaticRecoveryAttempts = 0;
  #visibilityPaused = false;
  #initializedListeners = false;
  #instanceCount = 500_000;
  #lastFrameTimestamp = 0;
  #smoothedFrameInterval = 16.67;
  #renderScale = 1;
  #adaptiveResolution = new URLSearchParams(location.search).get('adaptive') === '1';
  #captureMode = false;
  #lastCpuUpdateMs = 0;
  #lastDiagnosticsTimestamp = 0;
  readonly #fixedTimestep = new URLSearchParams(location.search).get('benchmark') === '1';
  readonly #requestedWorkgroupSize =
    new URLSearchParams(location.search).get('workgroup') === '256' ? 256 : 128;
  readonly #indirectRendering = new URLSearchParams(location.search).get('direct') !== '1';
  readonly #benchmarkVisibilityPercent = Number(
    new URLSearchParams(location.search).get('visibility') ?? '0',
  );
  readonly #staticBenchmark = new URLSearchParams(location.search).get('static') === '1';

  readonly #onFrame = (timestamp: number): void => {
    this.#frameHandle = undefined;
    if (this.state.current !== 'running') return;

    const gpu = this.#gpu;
    const renderer = this.#renderer;
    if (gpu !== undefined && renderer !== undefined && this.#canvasSize.drawable) {
      const updateStart = performance.now();
      this.#input.consumeOrbitDelta(this.#cameraInput);
      const [orbitX = 0, orbitY = 0, zoom = 0] = this.#cameraInput;
      this.#camera.applyInput(orbitX, orbitY, zoom);
      this.#camera.update();
      const elapsedSeconds =
        this.#lastFrameTimestamp > 0 ? (timestamp - this.#lastFrameTimestamp) * 0.001 : 0;
      this.#simulationFrame.timeSeconds = timestamp * 0.001;
      this.#simulationFrame.deltaSeconds = this.#fixedTimestep
        ? FIXED_BENCHMARK_DELTA_SECONDS
        : Math.min(MAX_SIMULATION_DELTA_SECONDS, Math.max(0, elapsedSeconds));
      this.#simulationFrame.frameIndex += 1;
      const pointerActive = (this.#input.pointer[4] ?? 0) === 1;
      const hasAttractor =
        pointerActive &&
        this.#camera.projectPointerToTargetPlane(
          this.#attractorPosition,
          this.#input.pointer[0] ?? 0,
          this.#input.pointer[1] ?? 0,
          this.#canvas.clientWidth,
          this.#canvas.clientHeight,
        );
      this.#simulationFrame.attractorX = this.#attractorPosition[0] ?? 0;
      this.#simulationFrame.attractorY = this.#attractorPosition[1] ?? 0;
      this.#simulationFrame.attractorZ = this.#attractorPosition[2] ?? 0;
      this.#simulationFrame.attractorStrength = signedInteractionStrength(
        this.#interactionMode.value as InteractionMode,
        Number(this.#interactionStrength.value),
        hasAttractor,
      );
      this.#simulationFrame.attractorRadius = Number(this.#interactionRadius.value);
      this.#lastCpuUpdateMs = performance.now() - updateStart;
      this.#cpuUpdateSamples.record(this.#lastCpuUpdateMs);
      renderer.render(
        gpu.canvasContext,
        this.#camera,
        this.#simulationFrame,
        this.#canvasSize.width,
        this.#canvasSize.height,
        this.#instanceCount,
        window.devicePixelRatio * this.#renderScale,
      );

      if (this.#lastFrameTimestamp > 0) {
        const interval = timestamp - this.#lastFrameTimestamp;
        this.#frameIntervalSamples.record(interval);
        this.#smoothedFrameInterval += (interval - this.#smoothedFrameInterval) * 0.08;
        if (this.#adaptiveResolution) {
          const nextScale = this.#dynamicResolution.record(renderer.latestGpuFrameMs, interval);
          if (nextScale !== undefined && nextScale !== this.#renderScale) {
            this.#renderScale = nextScale;
            this.#resize(this.#canvas.clientWidth, this.#canvas.clientHeight);
          }
        }
      }
      this.#lastFrameTimestamp = timestamp;
      if (timestamp - this.#lastDiagnosticsTimestamp >= 250) {
        this.#lastDiagnosticsTimestamp = timestamp;
        this.#diagnostics.setFrameMetrics(
          1000 / this.#smoothedFrameInterval,
          this.#smoothedFrameInterval,
          renderer.lastCpuFrameMs,
          this.#lastCpuUpdateMs,
          renderer.lastSubmitMs,
          renderer.captureGpuTelemetry(this.#simulationFrame.frameIndex),
          this.#renderScale,
        );
      }
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

  readonly #onPopulationChange = (): void => {
    const selected = Number(this.#populationSelect.value);
    const renderer = this.#renderer;
    if (renderer === undefined || !isPopulationPreset(selected)) return;
    this.#instanceCount = Math.min(selected, renderer.capacity);
    this.#diagnostics.setPopulation(this.#instanceCount, renderer.triangleCount);
  };

  readonly #onRenderScaleChange = (): void => {
    if (this.#renderScaleSelect.value === 'auto') {
      this.#adaptiveResolution = true;
      this.#dynamicResolution.setScale(this.#renderScale);
      return;
    }
    const scale = Number(this.#renderScaleSelect.value);
    if (![0.5, 0.625, 0.75, 0.875, 1].includes(scale)) return;
    this.#adaptiveResolution = false;
    this.#renderScale = scale;
    this.#resize(this.#canvas.clientWidth, this.#canvas.clientHeight);
  };

  readonly #onLodControlsChange = (): void => {
    const near = Number(this.#lodNearInput.value);
    const mid = Number(this.#lodMidInput.value);
    const far = Number(this.#lodFarInput.value);
    if (
      Number.isFinite(near) &&
      Number.isFinite(mid) &&
      Number.isFinite(far) &&
      near > mid &&
      mid > far
    ) {
      this.#simulationFrame.lodNearPixels = near;
      this.#simulationFrame.lodMidPixels = mid;
      this.#simulationFrame.lodFarPixels = far;
    }
    this.#simulationFrame.lodMode = Number(this.#lodModeSelect.value);
    this.#simulationFrame.lodVisualization = this.#lodVisualizeInput.checked ? 1 : 0;
    this.#simulationFrame.backgroundEnabled = this.#backgroundInput.checked ? 1 : 0;
    this.#simulationFrame.fogEnabled = this.#fogInput.checked ? 1 : 0;
    this.#simulationFrame.markerEnabled = this.#markerInput.checked ? 1 : 0;
  };

  readonly #onCaptureMode = (): void => {
    this.#captureMode = !this.#captureMode;
    document.documentElement.classList.toggle('capture-mode', this.#captureMode);
    this.#captureButton.textContent = this.#captureMode ? 'Exit capture' : 'Capture mode';
  };

  readonly #onBenchmarkMode = (): void => {
    const url = new URL(location.href);
    url.searchParams.set('benchmark', '1');
    location.assign(url);
  };

  readonly #onExportMetrics = (): void => {
    const report = this.captureDiagnosticsReport();
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `swarmgpu-diagnostics-${new Date().toISOString().replaceAll(':', '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.#captureMode) this.#onCaptureMode();
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
    this.#populationSelect = requireElement(root, '#population-select', HTMLSelectElement);
    this.#interactionMode = requireElement(root, '#interaction-mode', HTMLSelectElement);
    this.#interactionStrength = requireElement(root, '#interaction-strength', HTMLInputElement);
    this.#interactionRadius = requireElement(root, '#interaction-radius', HTMLInputElement);
    this.#renderScaleSelect = requireElement(root, '#render-scale', HTMLSelectElement);
    if (this.#adaptiveResolution) this.#renderScaleSelect.value = 'auto';
    this.#lodModeSelect = requireElement(root, '#lod-mode', HTMLSelectElement);
    this.#lodNearInput = requireElement(root, '#lod-near', HTMLInputElement);
    this.#lodMidInput = requireElement(root, '#lod-mid', HTMLInputElement);
    this.#lodFarInput = requireElement(root, '#lod-far', HTMLInputElement);
    this.#lodVisualizeInput = requireElement(root, '#lod-visualize', HTMLInputElement);
    this.#backgroundInput = requireElement(root, '#background-toggle', HTMLInputElement);
    this.#fogInput = requireElement(root, '#fog-toggle', HTMLInputElement);
    this.#markerInput = requireElement(root, '#marker-toggle', HTMLInputElement);
    this.#captureButton = requireElement(root, '#capture-button', HTMLButtonElement);
    this.#benchmarkButton = requireElement(root, '#benchmark-button', HTMLButtonElement);
    this.#exportButton = requireElement(root, '#export-button', HTMLButtonElement);
    this.#lodControls = requireElement(root, '#lod-controls', HTMLDetailsElement);
    this.#lodControls.hidden = !import.meta.env.DEV;
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
    this.#simulationFrame.simulationEnabled = this.#staticBenchmark ? 0 : 1;
    if ([10, 50, 100].includes(this.#benchmarkVisibilityPercent)) {
      this.#simulationFrame.benchmarkVisibilityFraction = this.#benchmarkVisibilityPercent / 100;
      this.#simulationFrame.benchmarkVisibilityEnabled = 1;
    }
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
      this.#showStatus(
        'Compiling renderer',
        'Creating shaders, persistent buffers, bind groups, and render pipelines…',
        false,
      );
      const rendererCapacity = Math.min(1_000_000, gpu.capabilities.capacity.maxInstances);
      this.#diagnostics.setCapabilities(gpu.capabilities);
      this.#diagnostics.setPendingSimulationEstimate(
        rendererCapacity,
        estimateSimulationStateBytes(rendererCapacity),
      );
      this.#diagnostics.show();
      const renderer = await StaticSwarmRenderer.create(
        gpu.device,
        gpu.canvasFormat,
        rendererCapacity,
        this.#requestedWorkgroupSize,
        this.#indirectRendering,
      );
      if (generation !== this.#generation) {
        renderer.destroy();
        return;
      }
      this.#renderer = this.#resources.register(renderer, 'Static swarm renderer');
      this.#renderer.resize(this.#canvasSize);
      this.#camera.setViewport(this.#canvasSize.width, this.#canvasSize.height);
      this.#camera.update();
      this.#configurePopulationPresets(renderer.capacity);
      this.#diagnostics.setRenderer(renderer, this.#instanceCount);
      this.#diagnostics.show();
      this.#controls.hidden = false;
      this.#status.panel.dataset.kind = 'ready';
      console.info('[SwarmGPU] WebGPU capabilities', gpu.capabilities);
      this.state.transition('ready');
      this.start();
    } catch (error) {
      if (generation !== this.#generation || this.state.current === 'disposed') return;
      console.error('[SwarmGPU] Initialization failed', error);
      this.#destroyGpuResources();
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
    this.#lastFrameTimestamp = 0;
    this.#pauseButton.textContent = 'Resume';
  }

  public resume(): void {
    if (this.state.current !== 'paused') return;
    this.start();
  }

  public reset(): void {
    if (this.state.current === 'disposed') return;
    this.#input.reset();
    this.#camera.reset();
    this.#camera.update();
    this.#renderer?.resetSimulation();
    this.#simulationFrame.frameIndex = 0;
    this.#lastFrameTimestamp = 0;
  }

  public simulateDeviceLossForDevelopment(): void {
    if (!import.meta.env.DEV || this.state.current === 'disposed') return;
    this.#gpu?.device.destroy();
  }

  public resetPerformanceSamples(): void {
    this.#frameIntervalSamples.reset();
    this.#cpuUpdateSamples.reset();
    this.#renderer?.resetPerformanceSamples();
  }

  public beginBenchmarkMeasurementForDevelopment(): void {
    if (!import.meta.env.DEV) throw new Error('Benchmark controls are development-only');
    this.resetPerformanceSamples();
    this.#diagnostics.hide();
  }

  public endBenchmarkMeasurementForDevelopment(): void {
    if (!import.meta.env.DEV) throw new Error('Benchmark controls are development-only');
    this.#diagnostics.show();
  }

  public capturePerformanceSamples(): {
    readonly frameIntervalMs: number[];
    readonly cpuFrameMs: number[];
  } {
    return {
      frameIntervalMs: this.#frameIntervalSamples.snapshot(),
      cpuFrameMs: this.#renderer?.captureCpuFrameSamples() ?? [],
    };
  }

  public captureDiagnosticsReport(): object {
    const renderer = this.#renderer;
    const capabilities = this.#gpu?.capabilities;
    return {
      schemaVersion: '1.0.0',
      capturedAt: new Date().toISOString(),
      warning:
        'Display cadence, CPU wall time, and explicit allocation bytes are approximate. GPU timestamps are delayed and unavailable on unsupported adapters.',
      state: this.state.current,
      scenario: {
        population: this.#instanceCount,
        internalResolution: [this.#canvasSize.width, this.#canvasSize.height],
        displayResolution: [this.#canvas.clientWidth, this.#canvas.clientHeight],
        renderScale: this.#renderScale,
        fixedTimestep: this.#fixedTimestep,
        lodThresholdsPixels: [
          this.#simulationFrame.lodNearPixels,
          this.#simulationFrame.lodMidPixels,
          this.#simulationFrame.lodFarPixels,
        ],
      },
      capabilities:
        capabilities === undefined
          ? null
          : {
              adapter: capabilities.adapterDescription,
              timestampQuery: capabilities.timestampQuerySupported,
              limits: capabilities.limits,
            },
      metrics:
        renderer === undefined
          ? null
          : {
              cpuEncodeAndSubmitMs: renderer.captureCpuFrameSamples(),
              cpuUpdateMs: this.#cpuUpdateSamples.snapshot(),
              submitCallMs: renderer.captureSubmitSamples(),
              frameIntervalMs: this.#frameIntervalSamples.snapshot(),
              gpu: renderer.captureGpuTelemetrySamples() ?? null,
              latestGpu: renderer.captureGpuTelemetry(this.#simulationFrame.frameIndex) ?? null,
              latestSubmitCallMs: renderer.lastSubmitMs,
              estimatedStateBytes: renderer.estimatedStateBytes,
              drawCalls: renderer.drawCalls,
              computeDispatches: renderer.computeDispatches,
            },
    };
  }

  public async captureSimulationStateForDevelopment(instanceCount = 8): Promise<{
    readonly positions: Float32Array;
    readonly velocities: Float32Array;
  }> {
    if (!import.meta.env.DEV || this.state.current !== 'paused' || this.#renderer === undefined) {
      throw new Error('Simulation readback is available only in development while paused');
    }
    return this.#renderer.captureSimulationState(Math.min(64, Math.max(1, instanceCount)));
  }

  public async captureLodCountsForDevelopment(): Promise<{
    readonly lodCounts: readonly number[];
    readonly overflowCounts: readonly number[];
  }> {
    if (!import.meta.env.DEV || this.state.current !== 'paused' || this.#renderer === undefined) {
      throw new Error('LOD counter readback is available only in development while paused');
    }
    const capture = await this.#renderer.captureVisibility(0);
    return {
      lodCounts: Array.from(capture.lodCounts),
      overflowCounts: Array.from(capture.lodOverflowCounts),
    };
  }

  public async compareSimulationFixtureForDevelopment(instanceCount = 8): Promise<{
    readonly fixtureCount: number;
    readonly maxAbsoluteError: number;
  }> {
    const renderer = this.#renderer;
    const gpu = this.#gpu;
    if (
      !import.meta.env.DEV ||
      this.state.current !== 'paused' ||
      renderer === undefined ||
      gpu === undefined ||
      !this.#canvasSize.drawable
    ) {
      throw new Error('Shader comparison is available only in development while paused');
    }
    const count = Math.min(64, Math.max(1, Math.floor(instanceCount)));
    const initial = createStaticInstanceData(count);
    renderer.resetSimulation();
    this.#simulationFrame.timeSeconds = 0;
    this.#simulationFrame.deltaSeconds = FIXED_BENCHMARK_DELTA_SECONDS;
    this.#simulationFrame.attractorStrength = 0;
    this.#simulationFrame.frameIndex = 1;
    renderer.render(
      gpu.canvasContext,
      this.#camera,
      this.#simulationFrame,
      this.#canvasSize.width,
      this.#canvasSize.height,
      count,
      window.devicePixelRatio,
    );
    const actual = await renderer.captureSimulationState(count);
    let maxAbsoluteError = 0;
    for (let instance = 0; instance < count; instance += 1) {
      const offset = instance * 4;
      const expected = simulateCpuFixture(
        {
          position: readVec4(initial.positions, offset),
          velocity: readVec4(initial.velocities, offset),
          seed: initial.appearance[offset + 2] ?? 0,
        },
        {
          deltaSeconds: FIXED_BENCHMARK_DELTA_SECONDS,
          boundaryRadius: this.#simulationFrame.boundaryRadius,
          maxSpeed: this.#simulationFrame.maxSpeed,
          containmentStrength: this.#simulationFrame.containmentStrength,
          maxAcceleration: this.#simulationFrame.maxAcceleration,
          noiseStrength: this.#simulationFrame.noiseStrength,
          attractorRadius: this.#simulationFrame.attractorRadius,
          attractorX: 0,
          attractorY: 0,
          attractorZ: 0,
          attractorStrength: 0,
        },
      );
      for (let component = 0; component < 4; component += 1) {
        maxAbsoluteError = Math.max(
          maxAbsoluteError,
          Math.abs(
            (actual.positions[offset + component] ?? 0) - (expected.position[component] ?? 0),
          ),
          Math.abs(
            (actual.velocities[offset + component] ?? 0) - (expected.velocity[component] ?? 0),
          ),
        );
      }
    }
    return { fixtureCount: count, maxAbsoluteError };
  }

  public async validateVisibilityForDevelopment(instanceCount = 64): Promise<{
    readonly fixtureCount: number;
    readonly visibleCount: number;
    readonly overflowCount: number;
    readonly idsMatch: boolean;
    readonly indirectMatch: boolean;
    readonly lodCounts: readonly number[];
    readonly indirectArguments: readonly number[];
    readonly expectedVisibleCount: number;
    readonly indirectRecordMatches: readonly boolean[];
  }> {
    const renderer = this.#renderer;
    const gpu = this.#gpu;
    if (
      !import.meta.env.DEV ||
      this.state.current !== 'paused' ||
      renderer === undefined ||
      gpu === undefined ||
      !renderer.indirectRendering ||
      !this.#canvasSize.drawable
    ) {
      throw new Error('Visibility validation requires paused development indirect rendering');
    }
    const count = Math.min(64, Math.max(0, Math.floor(instanceCount)));
    renderer.resetSimulation();
    this.#simulationFrame.timeSeconds = 0;
    this.#simulationFrame.deltaSeconds = 0;
    this.#simulationFrame.attractorStrength = 0;
    renderer.render(
      gpu.canvasContext,
      this.#camera,
      this.#simulationFrame,
      this.#canvasSize.width,
      this.#canvasSize.height,
      count,
      window.devicePixelRatio,
    );
    const [state, visibility] = await Promise.all([
      renderer.captureSimulationState(count),
      renderer.captureVisibility(count),
    ]);
    const expected = compactVisibleSpheres(
      state.positions,
      count,
      renderer.capacity,
      this.#camera.frustumPlanes,
      DRONE_BOUNDING_RADIUS,
    );
    const actualIds = Array.from(visibility.visibleIds).sort((a, b) => a - b);
    const expectedIds = Array.from(expected.visibleIds).sort((a, b) => a - b);
    const args = visibility.indirectArguments;
    const indirectRecordMatches = LOD_MESH_RANGES.map((range, lod) => {
      const offset = lod * 5;
      return (
        args[offset] === range.indexCount &&
        args[offset + 1] === visibility.lodCounts[lod] &&
        args[offset + 2] === range.firstIndex &&
        args[offset + 3] === range.baseVertex &&
        args[offset + 4] === 0
      );
    });
    return {
      fixtureCount: count,
      visibleCount: visibility.visibleCount,
      overflowCount: visibility.overflowCount,
      lodCounts: Array.from(visibility.lodCounts),
      indirectArguments: Array.from(args),
      expectedVisibleCount: expected.visibleCount,
      indirectRecordMatches,
      idsMatch:
        actualIds.length === expectedIds.length &&
        actualIds.every((value, index) => value === expectedIds[index]),
      indirectMatch:
        args.length === 15 &&
        indirectRecordMatches.every(Boolean) &&
        visibility.visibleCount === expected.visibleCount,
    };
  }

  public async sweepLodCameraForDevelopment(steps = 12): Promise<{
    readonly steps: number;
    readonly duplicateIds: number;
    readonly invalidIds: number;
    readonly overflows: number;
    readonly countHistory: readonly (readonly number[])[];
  }> {
    const renderer = this.#renderer;
    const gpu = this.#gpu;
    if (
      !import.meta.env.DEV ||
      this.state.current !== 'paused' ||
      renderer === undefined ||
      gpu === undefined ||
      !this.#canvasSize.drawable
    ) {
      throw new Error('LOD camera sweep requires paused development rendering');
    }
    const safeSteps = Math.min(32, Math.max(1, Math.floor(steps)));
    const fixtureCount = 64;
    let duplicateIds = 0;
    let invalidIds = 0;
    let overflows = 0;
    const countHistory: number[][] = [];
    renderer.resetSimulation();
    this.#simulationFrame.deltaSeconds = 0;
    this.#simulationFrame.lodMode = -1;
    for (let step = 0; step < safeSteps; step += 1) {
      this.#camera.applyInput(3, 0.4, step % 2 === 0 ? 0.35 : -0.35);
      this.#camera.update();
      renderer.render(
        gpu.canvasContext,
        this.#camera,
        this.#simulationFrame,
        this.#canvasSize.width,
        this.#canvasSize.height,
        fixtureCount,
        window.devicePixelRatio * this.#renderScale,
      );
      const capture = await renderer.captureVisibility(fixtureCount);
      const ids = Array.from(capture.visibleIds);
      duplicateIds += ids.length - new Set(ids).size;
      invalidIds += ids.filter((id) => id >= fixtureCount).length;
      overflows += capture.overflowCount;
      countHistory.push(Array.from(capture.lodCounts));
    }
    this.#camera.reset();
    this.#camera.update();
    return { steps: safeSteps, duplicateIds, invalidIds, overflows, countHistory };
  }

  public async measureGpuFrameForDevelopment(): Promise<{
    readonly simulationMs: number;
    readonly cullingMs: number;
    readonly computeMs: number;
    readonly renderMs: number;
    readonly totalMs: number;
  }> {
    const renderer = this.#renderer;
    const gpu = this.#gpu;
    if (
      !import.meta.env.DEV ||
      this.state.current !== 'paused' ||
      renderer === undefined ||
      gpu === undefined ||
      !this.#canvasSize.drawable
    ) {
      throw new Error('GPU timing is available only in development while paused');
    }
    this.#simulationFrame.deltaSeconds = FIXED_BENCHMARK_DELTA_SECONDS;
    this.#simulationFrame.attractorStrength = 0;
    return renderer.measureGpuFrame(
      gpu.canvasContext,
      this.#camera,
      this.#simulationFrame,
      this.#canvasSize.width,
      this.#canvasSize.height,
      this.#instanceCount,
      window.devicePixelRatio,
    );
  }

  public async runFiniteRecoveryDiagnosticForDevelopment(): Promise<{
    readonly injectedCount: number;
    readonly recoveredCount: number;
  }> {
    const renderer = this.#renderer;
    const gpu = this.#gpu;
    if (
      !import.meta.env.DEV ||
      this.state.current !== 'paused' ||
      renderer === undefined ||
      gpu === undefined ||
      !this.#canvasSize.drawable
    ) {
      throw new Error('Recovery diagnostics are available only in development while paused');
    }
    renderer.resetSimulation();
    renderer.injectInvalidFixtureForDevelopment();
    this.#simulationFrame.deltaSeconds = FIXED_BENCHMARK_DELTA_SECONDS;
    this.#simulationFrame.attractorStrength = 0;
    renderer.render(
      gpu.canvasContext,
      this.#camera,
      this.#simulationFrame,
      this.#canvasSize.width,
      this.#canvasSize.height,
      1,
      window.devicePixelRatio,
    );
    const recovered = await renderer.captureSimulationState(1);
    const isFinite = [...recovered.positions, ...recovered.velocities].every(Number.isFinite);
    return { injectedCount: 1, recoveredCount: isFinite ? 1 : 0 };
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
    this.#populationSelect.addEventListener('change', this.#onPopulationChange);
    this.#renderScaleSelect.addEventListener('change', this.#onRenderScaleChange);
    for (const control of [
      this.#lodModeSelect,
      this.#lodNearInput,
      this.#lodMidInput,
      this.#lodFarInput,
      this.#lodVisualizeInput,
      this.#backgroundInput,
      this.#fogInput,
      this.#markerInput,
    ]) {
      control.addEventListener('change', this.#onLodControlsChange);
    }
    this.#captureButton.addEventListener('click', this.#onCaptureMode);
    this.#benchmarkButton.addEventListener('click', this.#onBenchmarkMode);
    this.#exportButton.addEventListener('click', this.#onExportMetrics);
    window.addEventListener('resize', this.#onWindowResize);
    window.addEventListener('keydown', this.#onKeyDown);
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  #removeListeners(): void {
    if (!this.#initializedListeners) return;
    this.#initializedListeners = false;
    this.#input.detach(this.#canvas);
    this.#resizeObserver.disconnect();
    this.#pauseButton.removeEventListener('click', this.#onPauseToggle);
    this.#resetButton.removeEventListener('click', this.#onReset);
    this.#populationSelect.removeEventListener('change', this.#onPopulationChange);
    this.#renderScaleSelect.removeEventListener('change', this.#onRenderScaleChange);
    for (const control of [
      this.#lodModeSelect,
      this.#lodNearInput,
      this.#lodMidInput,
      this.#lodFarInput,
      this.#lodVisualizeInput,
      this.#backgroundInput,
      this.#fogInput,
      this.#markerInput,
    ]) {
      control.removeEventListener('change', this.#onLodControlsChange);
    }
    this.#captureButton.removeEventListener('click', this.#onCaptureMode);
    this.#benchmarkButton.removeEventListener('click', this.#onBenchmarkMode);
    this.#exportButton.removeEventListener('click', this.#onExportMetrics);
    window.removeEventListener('resize', this.#onWindowResize);
    window.removeEventListener('keydown', this.#onKeyDown);
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
  }

  #resize(cssWidth: number, cssHeight: number): void {
    const maxDimension = this.#gpu?.capabilities.limits.maxTextureDimension2D ?? 8192;
    const size = computeCanvasSize(
      cssWidth,
      cssHeight,
      window.devicePixelRatio * this.#renderScale,
      maxDimension,
    );
    this.#canvasSize = size;
    this.#diagnostics.setCanvasSize(size);
    if (!size.drawable) return;
    if (this.#canvas.width !== size.width) this.#canvas.width = size.width;
    if (this.#canvas.height !== size.height) this.#canvas.height = size.height;
    this.#camera.setViewport(size.width, size.height);
    this.#renderer?.resize(size);
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
    if (
      generation !== this.#generation ||
      this.state.current === 'disposed' ||
      this.state.current === 'failed' ||
      this.state.current === 'initializing'
    )
      return;
    console.error(`[SwarmGPU] Device lost (${info.reason})`, info.message);
    this.#cancelFrame();
    this.#controls.hidden = true;
    this.#diagnostics.hide();
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
    this.#renderer = undefined;
    this.#gpu?.dispose();
    this.#gpu = undefined;
  }

  #showStatus(title: string, message: string, canRetry: boolean): void {
    this.#status.panel.dataset.kind = 'message';
    this.#status.title.textContent = title;
    this.#status.message.textContent = message;
    this.#status.retry.hidden = !canRetry;
  }

  #configurePopulationPresets(capacity: number): void {
    let largestSupported = 0;
    for (const option of this.#populationSelect.options) {
      const count = Number(option.value);
      option.disabled = count > capacity;
      if (!option.disabled) largestSupported = Math.max(largestSupported, count);
    }
    if (largestSupported === 0)
      throw new Error('This adapter cannot render the minimum population');
    const preferred = Math.min(500_000, largestSupported);
    this.#instanceCount = preferred;
    this.#populationSelect.value = String(preferred);
  }
}

function isPopulationPreset(value: number): value is (typeof STATIC_POPULATION_PRESETS)[number] {
  return STATIC_POPULATION_PRESETS.some((preset) => preset === value);
}

function readVec4(values: Float32Array, offset: number): [number, number, number, number] {
  return [
    values[offset] ?? 0,
    values[offset + 1] ?? 0,
    values[offset + 2] ?? 0,
    values[offset + 3] ?? 0,
  ];
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
