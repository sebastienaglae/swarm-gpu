import { FrameSampleRecorder } from '../diagnostics/FrameSampleRecorder';
import {
  GpuTelemetryRing,
  type GpuTelemetrySamples,
  type GpuTelemetrySnapshot,
} from '../diagnostics/GpuTelemetryRing';
import { VISIBLE_ID_BYTES } from '../culling/CullingModel';
import {
  LOD_COUNT,
  LOD_COUNTER_BYTES,
  LOD_COUNTER_STRIDE_BYTES,
  LOD_INDIRECT_BYTES,
  LOD_INDIRECT_STRIDE_BYTES,
  LOD_VISIBLE_ID_BYTES_PER_INSTANCE,
} from '../lod/LodModel';
import type { CanvasSize } from '../gpu/canvasSize';
import { ResourceRegistry } from '../gpu/ResourceRegistry';
import backgroundShaderSource from '../shaders/background.wgsl?raw';
import cullShaderSource from '../shaders/cull.wgsl?raw';
import finalizeIndirectShaderSource from '../shaders/finalize-indirect.wgsl?raw';
import simulateShaderSource from '../shaders/simulate.wgsl?raw';
import swarmShaderSource from '../shaders/swarm.wgsl?raw';
import { SIMULATION_WORKGROUP_SIZE } from '../simulation/SimulationModel';
import { DRONE_TRIANGLE_COUNT } from './DroneMesh';
import { LOD_INDICES, LOD_MESH_RANGES, LOD_VERTICES, LOD_VERTEX_STRIDE } from './LodMeshes';
import {
  GLOBAL_UNIFORM_BYTES,
  GLOBAL_UNIFORM_FLOATS,
  GLOBAL_UNIFORM_USED_BYTES,
  GLOBAL_OFFSETS,
  type SimulationUniformValues,
  writeGlobalUniforms,
} from './GlobalUniforms';
import {
  APPEARANCE_BYTES_PER_INSTANCE,
  createStaticInstanceData,
  POSITION_BYTES_PER_INSTANCE,
  VELOCITY_BYTES_PER_INSTANCE,
} from './InstanceData';
import type { OrbitCamera } from './OrbitCamera';

export const STATIC_RENDERER_MAX_INSTANCES = 1_000_000;
export const STATIC_POPULATION_PRESETS = [10_000, 100_000, 250_000, 500_000, 1_000_000] as const;
export const BUFFER_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const SWARM_DRAW_CALLS = 3;
export const AUXILIARY_DRAW_CALLS = 1;
export const TOTAL_DRAW_CALLS = SWARM_DRAW_CALLS + AUXILIARY_DRAW_CALLS;
export const COMPUTE_DISPATCHES = 3;

const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

export function estimateSimulationStateBytes(capacity: number): number {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError('Simulation capacity must be a safe non-negative integer');
  }
  return (
    capacity *
      (POSITION_BYTES_PER_INSTANCE * 2 +
        VELOCITY_BYTES_PER_INSTANCE * 2 +
        APPEARANCE_BYTES_PER_INSTANCE +
        LOD_VISIBLE_ID_BYTES_PER_INSTANCE) +
    LOD_COUNTER_BYTES +
    LOD_INDIRECT_BYTES
  );
}

export interface SimulationFrame extends SimulationUniformValues {
  readonly timeSeconds: number;
  readonly backgroundEnabled?: number;
  readonly simulationEnabled?: number;
}

export interface SimulationStateCapture {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
}

export interface GpuFrameTiming {
  readonly simulationMs: number;
  readonly cullingMs: number;
  readonly computeMs: number;
  readonly renderMs: number;
  readonly totalMs: number;
}

export interface VisibilityCapture {
  readonly appendedCount: number;
  readonly visibleCount: number;
  readonly overflowCount: number;
  readonly indirectArguments: Uint32Array;
  readonly visibleIds: Uint32Array;
  readonly lodCounts: Uint32Array;
  readonly lodOverflowCounts: Uint32Array;
}

interface MutableStateBuffers {
  readonly positions: GPUBuffer;
  readonly velocities: GPUBuffer;
}

export class StaticSwarmRenderer {
  public readonly capacity: number;
  public readonly triangleCount = DRONE_TRIANGLE_COUNT;
  public readonly drawCalls = TOTAL_DRAW_CALLS;
  public readonly computeDispatches: number;
  public readonly workgroupSize: number;
  public readonly estimatedStateBytes: number;
  public readonly indirectRendering: boolean;
  public readonly gpuTelemetryAvailable: boolean;
  public lastCpuFrameMs = 0;
  public lastSubmitMs = 0;

  readonly #device: GPUDevice;
  readonly #resources = new ResourceRegistry();
  readonly #uniformStaging = new Float32Array(GLOBAL_UNIFORM_FLOATS);
  readonly #cpuFrameSamples = new FrameSampleRecorder();
  readonly #submitSamples = new FrameSampleRecorder();
  readonly #telemetry: GpuTelemetryRing | undefined;
  readonly #uniformBuffer: GPUBuffer;
  readonly #vertexBuffer: GPUBuffer;
  readonly #indexBuffer: GPUBuffer;
  readonly #stateBuffers: readonly [MutableStateBuffers, MutableStateBuffers];
  readonly #renderBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly #computeBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly #cullBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly #finalizeBindGroup: GPUBindGroup;
  readonly #visibleIdsBuffer: GPUBuffer;
  readonly #visibilityCounterBuffer: GPUBuffer;
  readonly #indirectBuffer: GPUBuffer;
  readonly #initialPositions: Float32Array;
  readonly #initialVelocities: Float32Array;
  readonly #backgroundPipeline: GPURenderPipeline;
  readonly #swarmPipelines: readonly [GPURenderPipeline, GPURenderPipeline, GPURenderPipeline];
  readonly #simulationPipeline: GPUComputePipeline;
  readonly #cullingPipeline: GPUComputePipeline;
  readonly #finalizePipeline: GPUComputePipeline;
  readonly #clearColor: GPUColorDict = { r: 0.003, g: 0.007, b: 0.015, a: 1 };
  readonly #colorAttachment: GPURenderPassColorAttachment = {
    view: undefined as unknown as GPUTextureView,
    clearValue: this.#clearColor,
    loadOp: 'clear',
    storeOp: 'store',
  };
  readonly #depthAttachment: GPURenderPassDepthStencilAttachment = {
    view: undefined as unknown as GPUTextureView,
    depthClearValue: 1,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  };
  readonly #renderPassDescriptor: GPURenderPassDescriptor = {
    label: 'GPU swarm render pass',
    colorAttachments: [this.#colorAttachment],
    depthStencilAttachment: this.#depthAttachment,
  };
  readonly #computePassDescriptor: GPUComputePassDescriptor = {
    label: 'GPU swarm simulation pass',
  };
  readonly #cullingPassDescriptor: GPUComputePassDescriptor = {
    label: 'GPU swarm culling and indirect finalization pass',
  };
  readonly #submission = [undefined as unknown as GPUCommandBuffer];
  readonly #canvasViewDescriptor: GPUTextureViewDescriptor = {
    label: 'Current GPU swarm canvas view',
  };
  readonly #commandEncoderDescriptor: GPUCommandEncoderDescriptor = {
    label: 'GPU swarm frame encoder',
  };
  readonly #commandBufferDescriptor: GPUCommandBufferDescriptor = {
    label: 'GPU swarm frame commands',
  };
  #depthTexture: GPUTexture | undefined;
  #depthWidth = 0;
  #depthHeight = 0;
  #stateParity: 0 | 1 = 0;
  #destroyed = false;

  private constructor(
    device: GPUDevice,
    capacity: number,
    uniformBuffer: GPUBuffer,
    vertexBuffer: GPUBuffer,
    indexBuffer: GPUBuffer,
    appearanceBuffer: GPUBuffer,
    stateBuffers: readonly [MutableStateBuffers, MutableStateBuffers],
    renderBindGroups: readonly [GPUBindGroup, GPUBindGroup],
    computeBindGroups: readonly [GPUBindGroup, GPUBindGroup],
    cullBindGroups: readonly [GPUBindGroup, GPUBindGroup],
    finalizeBindGroup: GPUBindGroup,
    visibleIdsBuffer: GPUBuffer,
    visibilityCounterBuffer: GPUBuffer,
    indirectBuffer: GPUBuffer,
    initialPositions: Float32Array,
    initialVelocities: Float32Array,
    backgroundPipeline: GPURenderPipeline,
    swarmPipelines: readonly [GPURenderPipeline, GPURenderPipeline, GPURenderPipeline],
    simulationPipeline: GPUComputePipeline,
    cullingPipeline: GPUComputePipeline,
    finalizePipeline: GPUComputePipeline,
    workgroupSize: number,
    indirectRendering: boolean,
  ) {
    this.#device = device;
    this.capacity = capacity;
    this.estimatedStateBytes = estimateSimulationStateBytes(capacity);
    this.#uniformBuffer = this.#resources.register(uniformBuffer, 'Global uniform buffer');
    this.#vertexBuffer = this.#resources.register(vertexBuffer, 'Drone vertex buffer');
    this.#indexBuffer = this.#resources.register(indexBuffer, 'Drone index buffer');
    this.#resources.register(appearanceBuffer, 'Appearance buffer');
    for (const [index, state] of stateBuffers.entries()) {
      this.#resources.register(state.positions, `Position state ${String(index)}`);
      this.#resources.register(state.velocities, `Velocity state ${String(index)}`);
    }
    this.#stateBuffers = stateBuffers;
    this.#renderBindGroups = renderBindGroups;
    this.#computeBindGroups = computeBindGroups;
    this.#cullBindGroups = cullBindGroups;
    this.#finalizeBindGroup = finalizeBindGroup;
    this.#visibleIdsBuffer = this.#resources.register(visibleIdsBuffer, 'Visible instance IDs');
    this.#visibilityCounterBuffer = this.#resources.register(
      visibilityCounterBuffer,
      'Visibility counters',
    );
    this.#indirectBuffer = this.#resources.register(indirectBuffer, 'Indexed indirect arguments');
    this.#initialPositions = initialPositions;
    this.#initialVelocities = initialVelocities;
    this.#backgroundPipeline = backgroundPipeline;
    this.#swarmPipelines = swarmPipelines;
    this.#simulationPipeline = simulationPipeline;
    this.#cullingPipeline = cullingPipeline;
    this.#finalizePipeline = finalizePipeline;
    this.workgroupSize = workgroupSize;
    this.indirectRendering = indirectRendering;
    this.computeDispatches = indirectRendering ? COMPUTE_DISPATCHES : 1;
    this.#telemetry = device.features.has('timestamp-query')
      ? new GpuTelemetryRing(device, indirectRendering)
      : undefined;
    this.gpuTelemetryAvailable = this.#telemetry !== undefined;
  }

  public static async create(
    device: GPUDevice,
    canvasFormat: GPUTextureFormat,
    requestedCapacity: number,
    requestedWorkgroupSize = SIMULATION_WORKGROUP_SIZE,
    indirectRendering = true,
  ): Promise<StaticSwarmRenderer> {
    const capacity = Math.max(1, Math.min(STATIC_RENDERER_MAX_INSTANCES, requestedCapacity));
    const createdBuffers: GPUBuffer[] = [];
    const workgroupSize = requestedWorkgroupSize === 256 ? 256 : SIMULATION_WORKGROUP_SIZE;
    if (
      workgroupSize > device.limits.maxComputeInvocationsPerWorkgroup ||
      workgroupSize > device.limits.maxComputeWorkgroupSizeX
    ) {
      throw new RangeError(`Workgroup size ${String(workgroupSize)} exceeds device limits`);
    }
    device.pushErrorScope('validation');
    let scopePopped = false;
    try {
      const createBuffer = (label: string, size: number, usage: GPUBufferUsageFlags): GPUBuffer => {
        const buffer = device.createBuffer({ label, size, usage });
        createdBuffers.push(buffer);
        return buffer;
      };
      const uniformBuffer = createBuffer(
        'Global uniforms',
        GLOBAL_UNIFORM_BYTES,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      );
      const vertexBuffer = createBuffer(
        'LOD mesh vertices',
        LOD_VERTICES.byteLength,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      );
      const indexBuffer = createBuffer(
        'LOD mesh indices',
        LOD_INDICES.byteLength,
        GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      );
      const appearanceBuffer = createBuffer(
        'Immutable appearance and seeds',
        capacity * APPEARANCE_BYTES_PER_INSTANCE,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      );
      const createState = (suffix: string): MutableStateBuffers => ({
        positions: createBuffer(
          `Positions ${suffix}`,
          capacity * POSITION_BYTES_PER_INSTANCE,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        ),
        velocities: createBuffer(
          `Velocities ${suffix}`,
          capacity * VELOCITY_BYTES_PER_INSTANCE,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        ),
      });
      const stateBuffers = [createState('A'), createState('B')] as const;
      const visibleIdsBuffer = createBuffer(
        'Compacted visible instance IDs',
        capacity * LOD_VISIBLE_ID_BYTES_PER_INSTANCE,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      );
      const visibilityCounterBuffer = createBuffer(
        'Visibility counters and capacity',
        LOD_COUNTER_BYTES,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      );
      const indirectBuffer = createBuffer(
        'Indexed indirect arguments',
        LOD_INDIRECT_BYTES,
        GPUBufferUsage.STORAGE |
          GPUBufferUsage.INDIRECT |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      );

      uploadArrayBufferInChunks(device.queue, vertexBuffer, LOD_VERTICES);
      uploadArrayBufferInChunks(device.queue, indexBuffer, LOD_INDICES);
      const instances = createStaticInstanceData(capacity);
      uploadArrayBufferInChunks(device.queue, appearanceBuffer, instances.appearance);
      for (const state of stateBuffers) {
        uploadArrayBufferInChunks(device.queue, state.positions, instances.positions);
        uploadArrayBufferInChunks(device.queue, state.velocities, instances.velocities);
      }
      const initialCounters = new Uint32Array(LOD_COUNT * 4);
      for (let lod = 0; lod < LOD_COUNT; lod += 1) initialCounters[lod * 4 + 2] = capacity;
      device.queue.writeBuffer(visibilityCounterBuffer, 0, initialCounters);

      const renderLayout = device.createBindGroupLayout({
        label: 'GPU swarm render bind group layout',
        entries: [
          uniformLayoutEntry(GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT),
          storageLayoutEntry(
            1,
            GPUShaderStage.VERTEX,
            true,
            capacity * POSITION_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            2,
            GPUShaderStage.VERTEX,
            true,
            capacity * APPEARANCE_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            3,
            GPUShaderStage.VERTEX,
            true,
            capacity * VELOCITY_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            4,
            GPUShaderStage.VERTEX,
            true,
            capacity * LOD_VISIBLE_ID_BYTES_PER_INSTANCE,
          ),
        ],
      });
      const computeLayout = device.createBindGroupLayout({
        label: 'GPU simulation bind group layout',
        entries: [
          uniformLayoutEntry(GPUShaderStage.COMPUTE),
          storageLayoutEntry(
            1,
            GPUShaderStage.COMPUTE,
            true,
            capacity * POSITION_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            2,
            GPUShaderStage.COMPUTE,
            true,
            capacity * VELOCITY_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            3,
            GPUShaderStage.COMPUTE,
            false,
            capacity * POSITION_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            4,
            GPUShaderStage.COMPUTE,
            false,
            capacity * VELOCITY_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            5,
            GPUShaderStage.COMPUTE,
            true,
            capacity * APPEARANCE_BYTES_PER_INSTANCE,
          ),
        ],
      });
      const cullLayout = device.createBindGroupLayout({
        label: 'GPU culling bind group layout',
        entries: [
          uniformLayoutEntry(GPUShaderStage.COMPUTE),
          storageLayoutEntry(
            1,
            GPUShaderStage.COMPUTE,
            true,
            capacity * POSITION_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(
            2,
            GPUShaderStage.COMPUTE,
            false,
            capacity * LOD_VISIBLE_ID_BYTES_PER_INSTANCE,
          ),
          storageLayoutEntry(3, GPUShaderStage.COMPUTE, false, LOD_COUNTER_BYTES),
        ],
      });
      const finalizeLayout = device.createBindGroupLayout({
        label: 'Indirect finalization bind group layout',
        entries: [
          storageLayoutEntry(0, GPUShaderStage.COMPUTE, false, LOD_COUNTER_BYTES),
          storageLayoutEntry(1, GPUShaderStage.COMPUTE, false, LOD_INDIRECT_BYTES),
        ],
      });
      const renderPipelineLayout = device.createPipelineLayout({
        label: 'GPU swarm render pipeline layout',
        bindGroupLayouts: [renderLayout],
      });
      const computePipelineLayout = device.createPipelineLayout({
        label: 'GPU simulation pipeline layout',
        bindGroupLayouts: [computeLayout],
      });
      const cullPipelineLayout = device.createPipelineLayout({
        label: 'GPU culling pipeline layout',
        bindGroupLayouts: [cullLayout],
      });
      const finalizePipelineLayout = device.createPipelineLayout({
        label: 'GPU indirect finalization pipeline layout',
        bindGroupLayouts: [finalizeLayout],
      });
      const swarmModule = device.createShaderModule({
        label: 'GPU swarm shader',
        code: swarmShaderSource,
      });
      const backgroundModule = device.createShaderModule({
        label: 'Procedural space background shader',
        code: backgroundShaderSource,
      });
      const simulationModule = device.createShaderModule({
        label: 'GPU simulation shader',
        code: simulateShaderSource,
      });
      const cullModule = device.createShaderModule({
        label: 'GPU culling shader',
        code: cullShaderSource,
      });
      const finalizeModule = device.createShaderModule({
        label: 'GPU indirect finalization shader',
        code: finalizeIndirectShaderSource,
      });
      await Promise.all([
        assertShaderCompiles(swarmModule, 'GPU swarm shader'),
        assertShaderCompiles(backgroundModule, 'background shader'),
        assertShaderCompiles(simulationModule, 'GPU simulation shader'),
        assertShaderCompiles(cullModule, 'GPU culling shader'),
        assertShaderCompiles(finalizeModule, 'GPU indirect finalization shader'),
      ]);

      const createSwarmPipeline = (lod: number): Promise<GPURenderPipeline> =>
        device.createRenderPipelineAsync({
          label: `GPU swarm LOD ${String(lod)} pipeline`,
          layout: renderPipelineLayout,
          vertex: {
            module: swarmModule,
            entryPoint: 'vertexMain',
            constants: { USE_VISIBLE_IDS: indirectRendering ? 1 : 0, LOD_INDEX: lod },
            buffers: [
              {
                arrayStride: LOD_VERTEX_STRIDE,
                attributes: [
                  { shaderLocation: 0, offset: 0, format: 'float32x3' },
                  { shaderLocation: 1, offset: 12, format: 'float32x3' },
                ],
              },
            ],
          },
          fragment: {
            module: swarmModule,
            entryPoint: 'fragmentMain',
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: 'triangle-list', cullMode: lod === 2 ? 'none' : 'back' },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
        });
      const [
        backgroundPipeline,
        nearPipeline,
        midPipeline,
        farPipeline,
        simulationPipeline,
        cullingPipeline,
        finalizePipeline,
      ] = await Promise.all([
        device.createRenderPipelineAsync({
          label: 'Procedural background pipeline',
          layout: renderPipelineLayout,
          vertex: { module: backgroundModule, entryPoint: 'vertexMain' },
          fragment: {
            module: backgroundModule,
            entryPoint: 'fragmentMain',
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: 'triangle-list' },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'always' },
        }),
        createSwarmPipeline(0),
        createSwarmPipeline(1),
        createSwarmPipeline(2),
        device.createComputePipelineAsync({
          label: 'GPU simulation pipeline',
          layout: computePipelineLayout,
          compute: {
            module: simulationModule,
            entryPoint: 'simulate',
            constants: { WORKGROUP_SIZE: workgroupSize },
          },
        }),
        device.createComputePipelineAsync({
          label: 'GPU frustum culling pipeline',
          layout: cullPipelineLayout,
          compute: {
            module: cullModule,
            entryPoint: 'cull',
            constants: { WORKGROUP_SIZE: workgroupSize },
          },
        }),
        device.createComputePipelineAsync({
          label: 'GPU indirect finalization pipeline',
          layout: finalizePipelineLayout,
          compute: { module: finalizeModule, entryPoint: 'finalizeIndirect' },
        }),
      ]);
      const swarmPipelines = [nearPipeline, midPipeline, farPipeline] as const;

      const createRenderBindGroup = (state: MutableStateBuffers, index: number): GPUBindGroup =>
        device.createBindGroup({
          label: `GPU swarm render state ${String(index)}`,
          layout: renderLayout,
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer, size: GLOBAL_UNIFORM_BYTES } },
            { binding: 1, resource: { buffer: state.positions } },
            { binding: 2, resource: { buffer: appearanceBuffer } },
            { binding: 3, resource: { buffer: state.velocities } },
            { binding: 4, resource: { buffer: visibleIdsBuffer } },
          ],
        });
      const createComputeBindGroup = (
        source: MutableStateBuffers,
        destination: MutableStateBuffers,
        index: number,
      ): GPUBindGroup =>
        device.createBindGroup({
          label: `GPU simulation ${String(index)} to ${String(1 - index)}`,
          layout: computeLayout,
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer, size: GLOBAL_UNIFORM_BYTES } },
            { binding: 1, resource: { buffer: source.positions } },
            { binding: 2, resource: { buffer: source.velocities } },
            { binding: 3, resource: { buffer: destination.positions } },
            { binding: 4, resource: { buffer: destination.velocities } },
            { binding: 5, resource: { buffer: appearanceBuffer } },
          ],
        });
      const renderBindGroups = [
        createRenderBindGroup(stateBuffers[0], 0),
        createRenderBindGroup(stateBuffers[1], 1),
      ] as const;
      const computeBindGroups = [
        createComputeBindGroup(stateBuffers[0], stateBuffers[1], 0),
        createComputeBindGroup(stateBuffers[1], stateBuffers[0], 1),
      ] as const;
      const createCullBindGroup = (state: MutableStateBuffers, index: number): GPUBindGroup =>
        device.createBindGroup({
          label: `GPU culling state ${String(index)}`,
          layout: cullLayout,
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer, size: GLOBAL_UNIFORM_BYTES } },
            { binding: 1, resource: { buffer: state.positions } },
            { binding: 2, resource: { buffer: visibleIdsBuffer } },
            { binding: 3, resource: { buffer: visibilityCounterBuffer } },
          ],
        });
      const cullBindGroups = [
        createCullBindGroup(stateBuffers[0], 0),
        createCullBindGroup(stateBuffers[1], 1),
      ] as const;
      const finalizeBindGroup = device.createBindGroup({
        label: 'GPU indirect finalization resources',
        layout: finalizeLayout,
        entries: [
          { binding: 0, resource: { buffer: visibilityCounterBuffer } },
          { binding: 1, resource: { buffer: indirectBuffer } },
        ],
      });

      const validationError = await device.popErrorScope();
      scopePopped = true;
      if (validationError !== null)
        throw new Error(validationError.message, { cause: validationError });
      return new StaticSwarmRenderer(
        device,
        capacity,
        uniformBuffer,
        vertexBuffer,
        indexBuffer,
        appearanceBuffer,
        stateBuffers,
        renderBindGroups,
        computeBindGroups,
        cullBindGroups,
        finalizeBindGroup,
        visibleIdsBuffer,
        visibilityCounterBuffer,
        indirectBuffer,
        instances.positions,
        instances.velocities,
        backgroundPipeline,
        swarmPipelines,
        simulationPipeline,
        cullingPipeline,
        finalizePipeline,
        workgroupSize,
        indirectRendering,
      );
    } catch (error) {
      if (!scopePopped) await device.popErrorScope();
      for (const buffer of createdBuffers) buffer.destroy();
      throw error;
    }
  }

  public resize(size: CanvasSize): void {
    if (this.#destroyed || !size.drawable) return;
    if (size.width === this.#depthWidth && size.height === this.#depthHeight) return;
    this.#depthTexture?.destroy();
    this.#depthTexture = this.#device.createTexture({
      label: 'GPU swarm depth texture',
      size: [size.width, size.height, 1],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.#depthAttachment.view = this.#depthTexture.createView({ label: 'GPU swarm depth view' });
    this.#depthWidth = size.width;
    this.#depthHeight = size.height;
  }

  public render(
    canvasContext: GPUCanvasContext,
    camera: OrbitCamera,
    frame: SimulationFrame,
    viewportWidth: number,
    viewportHeight: number,
    instanceCount: number,
    devicePixelRatio: number,
  ): void {
    if (this.#destroyed || this.#depthTexture === undefined) return;
    const start = performance.now();
    const safeInstanceCount = Math.min(this.capacity, Math.max(0, Math.floor(instanceCount)));
    writeGlobalUniforms(
      this.#uniformStaging,
      camera,
      frame.timeSeconds,
      viewportWidth,
      viewportHeight,
      safeInstanceCount,
      devicePixelRatio,
      frame,
    );
    this.#uniformStaging[GLOBAL_OFFSETS.simulationC + 3] = this.capacity;
    this.#device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      this.#uniformStaging.buffer,
      this.#uniformStaging.byteOffset,
      GLOBAL_UNIFORM_USED_BYTES,
    );

    const sourceParity = this.#stateParity;
    const simulationEnabled = (frame.simulationEnabled ?? 1) > 0.5;
    const destinationParity = simulationEnabled ? (sourceParity === 0 ? 1 : 0) : sourceParity;
    this.#colorAttachment.view = canvasContext
      .getCurrentTexture()
      .createView(this.#canvasViewDescriptor);
    const encoder = this.#device.createCommandEncoder(this.#commandEncoderDescriptor);
    if (this.indirectRendering) {
      encoder.clearBuffer(this.#visibilityCounterBuffer, 0, 8);
      encoder.clearBuffer(this.#visibilityCounterBuffer, LOD_COUNTER_STRIDE_BYTES, 8);
      encoder.clearBuffer(this.#visibilityCounterBuffer, LOD_COUNTER_STRIDE_BYTES * 2, 8);
      encoder.clearBuffer(this.#indirectBuffer);
    }
    const telemetrySlot = this.#telemetry?.acquire(frame.frameIndex);
    setTimestampWrites(this.#computePassDescriptor, telemetrySlot?.simulationWrites);
    const computePass = encoder.beginComputePass(this.#computePassDescriptor);
    if (simulationEnabled) {
      computePass.setPipeline(this.#simulationPipeline);
      computePass.setBindGroup(0, this.#computeBindGroups[sourceParity]);
      computePass.dispatchWorkgroups(Math.ceil(safeInstanceCount / this.workgroupSize));
    }
    computePass.end();
    if (this.indirectRendering) {
      setTimestampWrites(this.#cullingPassDescriptor, telemetrySlot?.cullingWrites);
      const cullingPass = encoder.beginComputePass(this.#cullingPassDescriptor);
      cullingPass.setPipeline(this.#cullingPipeline);
      cullingPass.setBindGroup(0, this.#cullBindGroups[destinationParity]);
      cullingPass.dispatchWorkgroups(Math.ceil(safeInstanceCount / this.workgroupSize));
      cullingPass.setPipeline(this.#finalizePipeline);
      cullingPass.setBindGroup(0, this.#finalizeBindGroup);
      cullingPass.dispatchWorkgroups(1);
      cullingPass.end();
    }

    setTimestampWrites(this.#renderPassDescriptor, telemetrySlot?.renderWrites);
    const renderPass = encoder.beginRenderPass(this.#renderPassDescriptor);
    renderPass.setBindGroup(0, this.#renderBindGroups[destinationParity]);
    if ((frame.backgroundEnabled ?? 1) > 0.5) {
      renderPass.setPipeline(this.#backgroundPipeline);
      renderPass.draw(3);
    }
    renderPass.setVertexBuffer(0, this.#vertexBuffer);
    renderPass.setIndexBuffer(this.#indexBuffer, 'uint16');
    if (this.indirectRendering) {
      renderPass.setPipeline(this.#swarmPipelines[0]);
      renderPass.drawIndexedIndirect(this.#indirectBuffer, 0);
      renderPass.setPipeline(this.#swarmPipelines[1]);
      renderPass.drawIndexedIndirect(this.#indirectBuffer, LOD_INDIRECT_STRIDE_BYTES);
      renderPass.setPipeline(this.#swarmPipelines[2]);
      renderPass.drawIndexedIndirect(this.#indirectBuffer, LOD_INDIRECT_STRIDE_BYTES * 2);
    } else {
      renderPass.setPipeline(this.#swarmPipelines[0]);
      renderPass.drawIndexed(LOD_MESH_RANGES[0]?.indexCount ?? 0, safeInstanceCount);
    }
    renderPass.end();
    if (telemetrySlot !== undefined) {
      this.#telemetry?.resolve(encoder, telemetrySlot, this.#visibilityCounterBuffer);
    }
    this.#submission[0] = encoder.finish(this.#commandBufferDescriptor);
    const submitStart = performance.now();
    this.#device.queue.submit(this.#submission);
    this.lastSubmitMs = performance.now() - submitStart;
    this.#submitSamples.record(this.lastSubmitMs);
    if (telemetrySlot !== undefined) this.#telemetry?.commit(telemetrySlot);
    this.#stateParity = destinationParity;
    this.lastCpuFrameMs = performance.now() - start;
    this.#cpuFrameSamples.record(this.lastCpuFrameMs);
  }

  public resetSimulation(): void {
    if (this.#destroyed) return;
    for (const state of this.#stateBuffers) {
      uploadArrayBufferInChunks(this.#device.queue, state.positions, this.#initialPositions);
      uploadArrayBufferInChunks(this.#device.queue, state.velocities, this.#initialVelocities);
    }
    this.#stateParity = 0;
  }

  public injectInvalidFixtureForDevelopment(): void {
    if (!import.meta.env.DEV || this.#destroyed) {
      throw new Error('Invalid-state injection is available only in development');
    }
    const invalidPosition = new Float32Array([Number.NaN, 0, 0, 0.24]);
    const invalidVelocity = new Float32Array([Number.POSITIVE_INFINITY, 0, 0, 0]);
    const state = this.#stateBuffers[this.#stateParity];
    this.#device.queue.writeBuffer(state.positions, 0, invalidPosition);
    this.#device.queue.writeBuffer(state.velocities, 0, invalidVelocity);
  }

  public async captureSimulationState(instanceCount: number): Promise<SimulationStateCapture> {
    if (this.#destroyed) throw new Error('Cannot inspect a destroyed renderer');
    const count = Math.min(this.capacity, Math.max(0, Math.floor(instanceCount)));
    const byteLength = count * POSITION_BYTES_PER_INSTANCE;
    const positionReadback = this.#device.createBuffer({
      label: 'Explicit debug position readback',
      size: Math.max(4, byteLength),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const velocityReadback = this.#device.createBuffer({
      label: 'Explicit debug velocity readback',
      size: Math.max(4, byteLength),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const state = this.#stateBuffers[this.#stateParity];
      const encoder = this.#device.createCommandEncoder({ label: 'Explicit debug state readback' });
      if (byteLength > 0) {
        encoder.copyBufferToBuffer(state.positions, 0, positionReadback, 0, byteLength);
        encoder.copyBufferToBuffer(state.velocities, 0, velocityReadback, 0, byteLength);
      }
      this.#device.queue.submit([encoder.finish()]);
      await Promise.all([
        positionReadback.mapAsync(GPUMapMode.READ),
        velocityReadback.mapAsync(GPUMapMode.READ),
      ]);
      return {
        positions: new Float32Array(positionReadback.getMappedRange().slice(0)),
        velocities: new Float32Array(velocityReadback.getMappedRange().slice(0)),
      };
    } finally {
      positionReadback.destroy();
      velocityReadback.destroy();
    }
  }

  public async captureVisibility(maxVisibleIds = 64): Promise<VisibilityCapture> {
    if (this.#destroyed) throw new Error('Cannot inspect a destroyed renderer');
    const idCount = Math.min(this.capacity, Math.max(0, Math.floor(maxVisibleIds)));
    const idBytesPerLod = idCount * VISIBLE_ID_BYTES;
    const idBytes = idBytesPerLod * LOD_COUNT;
    const counterReadback = this.#device.createBuffer({
      label: 'Explicit debug visibility counter readback',
      size: LOD_COUNTER_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const indirectReadback = this.#device.createBuffer({
      label: 'Explicit debug indirect arguments readback',
      size: LOD_INDIRECT_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const idsReadback = this.#device.createBuffer({
      label: 'Explicit debug visible IDs readback',
      size: Math.max(VISIBLE_ID_BYTES, idBytes),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const encoder = this.#device.createCommandEncoder({ label: 'Explicit visibility readback' });
      encoder.copyBufferToBuffer(
        this.#visibilityCounterBuffer,
        0,
        counterReadback,
        0,
        LOD_COUNTER_BYTES,
      );
      encoder.copyBufferToBuffer(this.#indirectBuffer, 0, indirectReadback, 0, LOD_INDIRECT_BYTES);
      if (idBytesPerLod > 0) {
        for (let lod = 0; lod < LOD_COUNT; lod += 1) {
          encoder.copyBufferToBuffer(
            this.#visibleIdsBuffer,
            lod * this.capacity * VISIBLE_ID_BYTES,
            idsReadback,
            lod * idBytesPerLod,
            idBytesPerLod,
          );
        }
      }
      this.#device.queue.submit([encoder.finish()]);
      await Promise.all([
        counterReadback.mapAsync(GPUMapMode.READ),
        indirectReadback.mapAsync(GPUMapMode.READ),
        idsReadback.mapAsync(GPUMapMode.READ),
      ]);
      const counters = new Uint32Array(counterReadback.getMappedRange());
      const lodCounts = new Uint32Array(LOD_COUNT);
      const lodOverflowCounts = new Uint32Array(LOD_COUNT);
      let appendedCount = 0;
      let visibleCount = 0;
      let overflowCount = 0;
      for (let lod = 0; lod < LOD_COUNT; lod += 1) {
        const appended = counters[lod * 4] ?? 0;
        lodCounts[lod] = Math.min(appended, this.capacity);
        lodOverflowCounts[lod] = counters[lod * 4 + 1] ?? 0;
        appendedCount += appended;
        visibleCount += lodCounts[lod] ?? 0;
        overflowCount += lodOverflowCounts[lod] ?? 0;
      }
      const mappedIds = new Uint32Array(idsReadback.getMappedRange());
      const capturedIds = new Uint32Array(
        lodCounts.reduce((total, count) => total + Math.min(count, idCount), 0),
      );
      let destination = 0;
      for (let lod = 0; lod < LOD_COUNT; lod += 1) {
        const count = Math.min(lodCounts[lod] ?? 0, idCount);
        capturedIds.set(mappedIds.subarray(lod * idCount, lod * idCount + count), destination);
        destination += count;
      }
      return {
        appendedCount,
        visibleCount,
        overflowCount,
        indirectArguments: new Uint32Array(indirectReadback.getMappedRange().slice(0)),
        visibleIds: capturedIds,
        lodCounts,
        lodOverflowCounts,
      };
    } finally {
      counterReadback.destroy();
      indirectReadback.destroy();
      idsReadback.destroy();
    }
  }

  public async measureGpuFrame(
    canvasContext: GPUCanvasContext,
    camera: OrbitCamera,
    frame: SimulationFrame,
    viewportWidth: number,
    viewportHeight: number,
    instanceCount: number,
    devicePixelRatio: number,
  ): Promise<GpuFrameTiming> {
    if (!this.#device.features.has('timestamp-query')) {
      throw new Error('GPU timestamp queries are unavailable on this device');
    }
    const safeInstanceCount = Math.min(this.capacity, Math.max(0, Math.floor(instanceCount)));
    writeGlobalUniforms(
      this.#uniformStaging,
      camera,
      frame.timeSeconds,
      viewportWidth,
      viewportHeight,
      safeInstanceCount,
      devicePixelRatio,
      frame,
    );
    this.#uniformStaging[GLOBAL_OFFSETS.simulationC + 3] = this.capacity;
    this.#device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      this.#uniformStaging.buffer,
      this.#uniformStaging.byteOffset,
      GLOBAL_UNIFORM_USED_BYTES,
    );
    const queryCount = this.indirectRendering ? 6 : 4;
    const queryBytes = queryCount * BigUint64Array.BYTES_PER_ELEMENT;
    const querySet = this.#device.createQuerySet({ type: 'timestamp', count: queryCount });
    const resolveBuffer = this.#device.createBuffer({
      label: 'Explicit benchmark timestamp resolve',
      size: queryBytes,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const readbackBuffer = this.#device.createBuffer({
      label: 'Explicit benchmark timestamp readback',
      size: queryBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const sourceParity = this.#stateParity;
      const destinationParity = sourceParity === 0 ? 1 : 0;
      this.#colorAttachment.view = canvasContext
        .getCurrentTexture()
        .createView(this.#canvasViewDescriptor);
      const encoder = this.#device.createCommandEncoder({ label: 'Explicit benchmark frame' });
      if (this.indirectRendering) {
        encoder.clearBuffer(this.#visibilityCounterBuffer, 0, 8);
        encoder.clearBuffer(this.#visibilityCounterBuffer, LOD_COUNTER_STRIDE_BYTES, 8);
        encoder.clearBuffer(this.#visibilityCounterBuffer, LOD_COUNTER_STRIDE_BYTES * 2, 8);
        encoder.clearBuffer(this.#indirectBuffer);
      }
      const computePass = encoder.beginComputePass({
        label: 'Timed simulation pass',
        timestampWrites: {
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      });
      computePass.setPipeline(this.#simulationPipeline);
      computePass.setBindGroup(0, this.#computeBindGroups[sourceParity]);
      computePass.dispatchWorkgroups(Math.ceil(safeInstanceCount / this.workgroupSize));
      computePass.end();
      if (this.indirectRendering) {
        const cullingPass = encoder.beginComputePass({
          label: 'Timed culling and indirect finalization pass',
          timestampWrites: {
            querySet,
            beginningOfPassWriteIndex: 2,
            endOfPassWriteIndex: 3,
          },
        });
        cullingPass.setPipeline(this.#cullingPipeline);
        cullingPass.setBindGroup(0, this.#cullBindGroups[destinationParity]);
        cullingPass.dispatchWorkgroups(Math.ceil(safeInstanceCount / this.workgroupSize));
        cullingPass.setPipeline(this.#finalizePipeline);
        cullingPass.setBindGroup(0, this.#finalizeBindGroup);
        cullingPass.dispatchWorkgroups(1);
        cullingPass.end();
      }
      const renderStartIndex = this.indirectRendering ? 4 : 2;
      const renderPass = encoder.beginRenderPass({
        ...this.#renderPassDescriptor,
        timestampWrites: {
          querySet,
          beginningOfPassWriteIndex: renderStartIndex,
          endOfPassWriteIndex: renderStartIndex + 1,
        },
      });
      renderPass.setBindGroup(0, this.#renderBindGroups[destinationParity]);
      if ((frame.backgroundEnabled ?? 1) > 0.5) {
        renderPass.setPipeline(this.#backgroundPipeline);
        renderPass.draw(3);
      }
      renderPass.setVertexBuffer(0, this.#vertexBuffer);
      renderPass.setIndexBuffer(this.#indexBuffer, 'uint16');
      if (this.indirectRendering) {
        renderPass.setPipeline(this.#swarmPipelines[0]);
        renderPass.drawIndexedIndirect(this.#indirectBuffer, 0);
        renderPass.setPipeline(this.#swarmPipelines[1]);
        renderPass.drawIndexedIndirect(this.#indirectBuffer, LOD_INDIRECT_STRIDE_BYTES);
        renderPass.setPipeline(this.#swarmPipelines[2]);
        renderPass.drawIndexedIndirect(this.#indirectBuffer, LOD_INDIRECT_STRIDE_BYTES * 2);
      } else {
        renderPass.setPipeline(this.#swarmPipelines[0]);
        renderPass.drawIndexed(LOD_MESH_RANGES[0]?.indexCount ?? 0, safeInstanceCount);
      }
      renderPass.end();
      encoder.resolveQuerySet(querySet, 0, queryCount, resolveBuffer, 0);
      encoder.copyBufferToBuffer(resolveBuffer, 0, readbackBuffer, 0, queryBytes);
      this.#device.queue.submit([encoder.finish()]);
      this.#stateParity = destinationParity;
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const timestamps = new BigUint64Array(readbackBuffer.getMappedRange());
      const computeStart = timestamps[0] ?? 0n;
      const computeEnd = timestamps[1] ?? 0n;
      const cullingStart = this.indirectRendering ? (timestamps[2] ?? 0n) : computeEnd;
      const cullingEnd = this.indirectRendering ? (timestamps[3] ?? 0n) : computeEnd;
      const renderStart = timestamps[renderStartIndex] ?? 0n;
      const renderEnd = timestamps[renderStartIndex + 1] ?? 0n;
      const simulationMs = Number(computeEnd - computeStart) / 1_000_000;
      const cullingMs = Number(cullingEnd - cullingStart) / 1_000_000;
      return {
        simulationMs,
        cullingMs,
        computeMs: simulationMs + cullingMs,
        renderMs: Number(renderEnd - renderStart) / 1_000_000,
        totalMs: Number(renderEnd - computeStart) / 1_000_000,
      };
    } finally {
      querySet.destroy();
      resolveBuffer.destroy();
      readbackBuffer.destroy();
    }
  }

  public resetPerformanceSamples(): void {
    this.#cpuFrameSamples.reset();
    this.#submitSamples.reset();
    this.#telemetry?.resetSamples();
  }

  public captureCpuFrameSamples(): number[] {
    return this.#cpuFrameSamples.snapshot();
  }

  public captureSubmitSamples(): number[] {
    return this.#submitSamples.snapshot();
  }

  public captureGpuTelemetry(frameIndex: number): GpuTelemetrySnapshot | undefined {
    return this.#telemetry?.snapshot(frameIndex);
  }

  public captureGpuTelemetrySamples(): GpuTelemetrySamples | undefined {
    return this.#telemetry?.samples();
  }

  public get latestGpuFrameMs(): number | undefined {
    return this.#telemetry?.latestTotalMs;
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#depthTexture?.destroy();
    this.#depthTexture = undefined;
    this.#telemetry?.destroy();
    this.#resources.destroyAll();
  }
}

function uniformLayoutEntry(visibility: GPUShaderStageFlags): GPUBindGroupLayoutEntry {
  return {
    binding: 0,
    visibility,
    buffer: { type: 'uniform', minBindingSize: GLOBAL_UNIFORM_USED_BYTES },
  };
}

function setTimestampWrites(
  descriptor: GPUComputePassDescriptor | GPURenderPassDescriptor,
  writes: GPUComputePassTimestampWrites | GPURenderPassTimestampWrites | undefined,
): void {
  if (writes === undefined) delete descriptor.timestampWrites;
  else descriptor.timestampWrites = writes;
}

function storageLayoutEntry(
  binding: number,
  visibility: GPUShaderStageFlags,
  readOnly: boolean,
  minBindingSize: number,
): GPUBindGroupLayoutEntry {
  return {
    binding,
    visibility,
    buffer: { type: readOnly ? 'read-only-storage' : 'storage', minBindingSize },
  };
}

export function uploadArrayBufferInChunks(
  queue: GPUQueue,
  target: GPUBuffer,
  source: ArrayBufferView,
  chunkBytes = BUFFER_UPLOAD_CHUNK_BYTES,
): void {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0 || chunkBytes % 4 !== 0) {
    throw new RangeError('upload chunk size must be a positive multiple of four');
  }
  for (let sourceOffset = 0; sourceOffset < source.byteLength; sourceOffset += chunkBytes) {
    const size = Math.min(chunkBytes, source.byteLength - sourceOffset);
    queue.writeBuffer(target, sourceOffset, source.buffer, source.byteOffset + sourceOffset, size);
  }
}

async function assertShaderCompiles(module: GPUShaderModule, label: string): Promise<void> {
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter((message) => message.type === 'error');
  if (errors.length === 0) return;
  const details = errors
    .map((message) => `${String(message.lineNum)}:${String(message.linePos)} ${message.message}`)
    .join('\n');
  throw new Error(`${label} compilation failed:\n${details}`);
}
