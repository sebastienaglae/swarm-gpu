import { FrameSampleRecorder } from '../diagnostics/FrameSampleRecorder';
import type { CanvasSize } from '../gpu/canvasSize';
import { ResourceRegistry } from '../gpu/ResourceRegistry';
import backgroundShaderSource from '../shaders/background.wgsl?raw';
import simulateShaderSource from '../shaders/simulate.wgsl?raw';
import swarmShaderSource from '../shaders/swarm.wgsl?raw';
import { SIMULATION_WORKGROUP_SIZE } from '../simulation/SimulationModel';
import {
  DRONE_INDICES,
  DRONE_TRIANGLE_COUNT,
  DRONE_VERTICES,
  DRONE_VERTEX_STRIDE,
} from './DroneMesh';
import {
  GLOBAL_UNIFORM_BYTES,
  GLOBAL_UNIFORM_FLOATS,
  GLOBAL_UNIFORM_USED_BYTES,
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
export const STATIC_POPULATION_PRESETS = [100_000, 250_000, 500_000, 1_000_000] as const;
export const BUFFER_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const SWARM_DRAW_CALLS = 1;
export const AUXILIARY_DRAW_CALLS = 1;
export const TOTAL_DRAW_CALLS = SWARM_DRAW_CALLS + AUXILIARY_DRAW_CALLS;
export const COMPUTE_DISPATCHES = 1;

const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

export interface SimulationFrame extends SimulationUniformValues {
  readonly timeSeconds: number;
}

export interface SimulationStateCapture {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
}

interface MutableStateBuffers {
  readonly positions: GPUBuffer;
  readonly velocities: GPUBuffer;
}

export class StaticSwarmRenderer {
  public readonly capacity: number;
  public readonly triangleCount = DRONE_TRIANGLE_COUNT;
  public readonly drawCalls = TOTAL_DRAW_CALLS;
  public readonly computeDispatches = COMPUTE_DISPATCHES;
  public readonly estimatedStateBytes: number;
  public lastCpuFrameMs = 0;

  readonly #device: GPUDevice;
  readonly #resources = new ResourceRegistry();
  readonly #uniformStaging = new Float32Array(GLOBAL_UNIFORM_FLOATS);
  readonly #cpuFrameSamples = new FrameSampleRecorder();
  readonly #uniformBuffer: GPUBuffer;
  readonly #vertexBuffer: GPUBuffer;
  readonly #indexBuffer: GPUBuffer;
  readonly #stateBuffers: readonly [MutableStateBuffers, MutableStateBuffers];
  readonly #renderBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly #computeBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly #initialPositions: Float32Array;
  readonly #initialVelocities: Float32Array;
  readonly #backgroundPipeline: GPURenderPipeline;
  readonly #swarmPipeline: GPURenderPipeline;
  readonly #simulationPipeline: GPUComputePipeline;
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
    initialPositions: Float32Array,
    initialVelocities: Float32Array,
    backgroundPipeline: GPURenderPipeline,
    swarmPipeline: GPURenderPipeline,
    simulationPipeline: GPUComputePipeline,
  ) {
    this.#device = device;
    this.capacity = capacity;
    this.estimatedStateBytes =
      capacity *
      (POSITION_BYTES_PER_INSTANCE * 2 +
        VELOCITY_BYTES_PER_INSTANCE * 2 +
        APPEARANCE_BYTES_PER_INSTANCE);
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
    this.#initialPositions = initialPositions;
    this.#initialVelocities = initialVelocities;
    this.#backgroundPipeline = backgroundPipeline;
    this.#swarmPipeline = swarmPipeline;
    this.#simulationPipeline = simulationPipeline;
  }

  public static async create(
    device: GPUDevice,
    canvasFormat: GPUTextureFormat,
    requestedCapacity: number,
  ): Promise<StaticSwarmRenderer> {
    const capacity = Math.max(1, Math.min(STATIC_RENDERER_MAX_INSTANCES, requestedCapacity));
    const createdBuffers: GPUBuffer[] = [];
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
        'Drone vertices',
        DRONE_VERTICES.byteLength,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      );
      const indexBuffer = createBuffer(
        'Drone indices',
        DRONE_INDICES.byteLength,
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

      uploadArrayBufferInChunks(device.queue, vertexBuffer, DRONE_VERTICES);
      uploadArrayBufferInChunks(device.queue, indexBuffer, DRONE_INDICES);
      const instances = createStaticInstanceData(capacity);
      uploadArrayBufferInChunks(device.queue, appearanceBuffer, instances.appearance);
      for (const state of stateBuffers) {
        uploadArrayBufferInChunks(device.queue, state.positions, instances.positions);
        uploadArrayBufferInChunks(device.queue, state.velocities, instances.velocities);
      }

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
      const renderPipelineLayout = device.createPipelineLayout({
        label: 'GPU swarm render pipeline layout',
        bindGroupLayouts: [renderLayout],
      });
      const computePipelineLayout = device.createPipelineLayout({
        label: 'GPU simulation pipeline layout',
        bindGroupLayouts: [computeLayout],
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
      await Promise.all([
        assertShaderCompiles(swarmModule, 'GPU swarm shader'),
        assertShaderCompiles(backgroundModule, 'background shader'),
        assertShaderCompiles(simulationModule, 'GPU simulation shader'),
      ]);

      const [backgroundPipeline, swarmPipeline, simulationPipeline] = await Promise.all([
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
        device.createRenderPipelineAsync({
          label: 'GPU swarm pipeline',
          layout: renderPipelineLayout,
          vertex: {
            module: swarmModule,
            entryPoint: 'vertexMain',
            buffers: [
              {
                arrayStride: DRONE_VERTEX_STRIDE,
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
          primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
        }),
        device.createComputePipelineAsync({
          label: 'GPU simulation pipeline',
          layout: computePipelineLayout,
          compute: { module: simulationModule, entryPoint: 'simulate' },
        }),
      ]);

      const createRenderBindGroup = (state: MutableStateBuffers, index: number): GPUBindGroup =>
        device.createBindGroup({
          label: `GPU swarm render state ${String(index)}`,
          layout: renderLayout,
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer, size: GLOBAL_UNIFORM_BYTES } },
            { binding: 1, resource: { buffer: state.positions } },
            { binding: 2, resource: { buffer: appearanceBuffer } },
            { binding: 3, resource: { buffer: state.velocities } },
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
        instances.positions,
        instances.velocities,
        backgroundPipeline,
        swarmPipeline,
        simulationPipeline,
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
    this.#device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      this.#uniformStaging.buffer,
      this.#uniformStaging.byteOffset,
      GLOBAL_UNIFORM_USED_BYTES,
    );

    const sourceParity = this.#stateParity;
    const destinationParity = sourceParity === 0 ? 1 : 0;
    this.#colorAttachment.view = canvasContext
      .getCurrentTexture()
      .createView(this.#canvasViewDescriptor);
    const encoder = this.#device.createCommandEncoder(this.#commandEncoderDescriptor);
    const computePass = encoder.beginComputePass(this.#computePassDescriptor);
    computePass.setPipeline(this.#simulationPipeline);
    computePass.setBindGroup(0, this.#computeBindGroups[sourceParity]);
    computePass.dispatchWorkgroups(Math.ceil(safeInstanceCount / SIMULATION_WORKGROUP_SIZE));
    computePass.end();

    const renderPass = encoder.beginRenderPass(this.#renderPassDescriptor);
    renderPass.setBindGroup(0, this.#renderBindGroups[destinationParity]);
    renderPass.setPipeline(this.#backgroundPipeline);
    renderPass.draw(3);
    renderPass.setPipeline(this.#swarmPipeline);
    renderPass.setVertexBuffer(0, this.#vertexBuffer);
    renderPass.setIndexBuffer(this.#indexBuffer, 'uint16');
    renderPass.drawIndexed(DRONE_INDICES.length, safeInstanceCount);
    renderPass.end();
    this.#submission[0] = encoder.finish(this.#commandBufferDescriptor);
    this.#device.queue.submit(this.#submission);
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

  public resetPerformanceSamples(): void {
    this.#cpuFrameSamples.reset();
  }

  public captureCpuFrameSamples(): number[] {
    return this.#cpuFrameSamples.snapshot();
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#depthTexture?.destroy();
    this.#depthTexture = undefined;
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
