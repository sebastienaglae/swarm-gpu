import { ResourceRegistry } from '../gpu/ResourceRegistry';
import type { CanvasSize } from '../gpu/canvasSize';
import { FrameSampleRecorder } from '../diagnostics/FrameSampleRecorder';
import backgroundShaderSource from '../shaders/background.wgsl?raw';
import swarmShaderSource from '../shaders/swarm.wgsl?raw';
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
  writeGlobalUniforms,
} from './GlobalUniforms';
import {
  APPEARANCE_BYTES_PER_INSTANCE,
  createStaticInstanceData,
  POSITION_BYTES_PER_INSTANCE,
} from './InstanceData';
import type { OrbitCamera } from './OrbitCamera';

export const STATIC_RENDERER_MAX_INSTANCES = 100_000;
export const STATIC_POPULATION_PRESETS = [10_000, 50_000, 100_000] as const;
export const BUFFER_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const SWARM_DRAW_CALLS = 1;
export const AUXILIARY_DRAW_CALLS = 1;
export const TOTAL_DRAW_CALLS = SWARM_DRAW_CALLS + AUXILIARY_DRAW_CALLS;

const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

export class StaticSwarmRenderer {
  public readonly capacity: number;
  public readonly triangleCount = DRONE_TRIANGLE_COUNT;
  public readonly drawCalls = TOTAL_DRAW_CALLS;
  public lastCpuFrameMs = 0;

  readonly #device: GPUDevice;
  readonly #resources = new ResourceRegistry();
  readonly #uniformStaging = new Float32Array(GLOBAL_UNIFORM_FLOATS);
  readonly #cpuFrameSamples = new FrameSampleRecorder();
  readonly #uniformBuffer: GPUBuffer;
  readonly #vertexBuffer: GPUBuffer;
  readonly #indexBuffer: GPUBuffer;
  readonly #bindGroup: GPUBindGroup;
  readonly #backgroundPipeline: GPURenderPipeline;
  readonly #swarmPipeline: GPURenderPipeline;
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
    label: 'Static swarm render pass',
    colorAttachments: [this.#colorAttachment],
    depthStencilAttachment: this.#depthAttachment,
  };
  readonly #submission = [undefined as unknown as GPUCommandBuffer];
  readonly #canvasViewDescriptor: GPUTextureViewDescriptor = {
    label: 'Current static swarm canvas view',
  };
  readonly #commandEncoderDescriptor: GPUCommandEncoderDescriptor = {
    label: 'Static swarm frame encoder',
  };
  readonly #commandBufferDescriptor: GPUCommandBufferDescriptor = {
    label: 'Static swarm frame commands',
  };
  #depthTexture: GPUTexture | undefined;
  #depthWidth = 0;
  #depthHeight = 0;
  #destroyed = false;

  private constructor(
    device: GPUDevice,
    capacity: number,
    uniformBuffer: GPUBuffer,
    vertexBuffer: GPUBuffer,
    indexBuffer: GPUBuffer,
    positionBuffer: GPUBuffer,
    appearanceBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    backgroundPipeline: GPURenderPipeline,
    swarmPipeline: GPURenderPipeline,
  ) {
    this.#device = device;
    this.capacity = capacity;
    this.#uniformBuffer = this.#resources.register(uniformBuffer, 'Global uniform buffer');
    this.#vertexBuffer = this.#resources.register(vertexBuffer, 'Drone vertex buffer');
    this.#indexBuffer = this.#resources.register(indexBuffer, 'Drone index buffer');
    this.#resources.register(positionBuffer, 'Static position buffer');
    this.#resources.register(appearanceBuffer, 'Static appearance buffer');
    this.#bindGroup = bindGroup;
    this.#backgroundPipeline = backgroundPipeline;
    this.#swarmPipeline = swarmPipeline;
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
      const uniformBuffer = device.createBuffer({
        label: 'Global uniforms',
        size: GLOBAL_UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      createdBuffers.push(uniformBuffer);
      const vertexBuffer = device.createBuffer({
        label: 'Drone vertices',
        size: DRONE_VERTICES.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      createdBuffers.push(vertexBuffer);
      const indexBuffer = device.createBuffer({
        label: 'Drone indices',
        size: DRONE_INDICES.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      createdBuffers.push(indexBuffer);
      const positionBuffer = device.createBuffer({
        label: 'Static positions and scales',
        size: capacity * POSITION_BYTES_PER_INSTANCE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      createdBuffers.push(positionBuffer);
      const appearanceBuffer = device.createBuffer({
        label: 'Static colors and headings',
        size: capacity * APPEARANCE_BYTES_PER_INSTANCE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      createdBuffers.push(appearanceBuffer);

      uploadArrayBufferInChunks(device.queue, vertexBuffer, DRONE_VERTICES);
      uploadArrayBufferInChunks(device.queue, indexBuffer, DRONE_INDICES);
      const instances = createStaticInstanceData(capacity);
      uploadArrayBufferInChunks(device.queue, positionBuffer, instances.positions);
      uploadArrayBufferInChunks(device.queue, appearanceBuffer, instances.appearance);

      const bindGroupLayout = device.createBindGroupLayout({
        label: 'Static swarm bind group layout',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform', minBindingSize: GLOBAL_UNIFORM_USED_BYTES },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.VERTEX,
            buffer: {
              type: 'read-only-storage',
              minBindingSize: capacity * POSITION_BYTES_PER_INSTANCE,
            },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.VERTEX,
            buffer: {
              type: 'read-only-storage',
              minBindingSize: capacity * APPEARANCE_BYTES_PER_INSTANCE,
            },
          },
        ],
      });
      const pipelineLayout = device.createPipelineLayout({
        label: 'Static swarm pipeline layout',
        bindGroupLayouts: [bindGroupLayout],
      });
      const swarmModule = device.createShaderModule({
        label: 'Static swarm shader',
        code: swarmShaderSource,
      });
      const backgroundModule = device.createShaderModule({
        label: 'Procedural space background shader',
        code: backgroundShaderSource,
      });
      await assertShaderCompiles(swarmModule, 'static swarm shader');
      await assertShaderCompiles(backgroundModule, 'background shader');

      const [backgroundPipeline, swarmPipeline] = await Promise.all([
        device.createRenderPipelineAsync({
          label: 'Procedural background pipeline',
          layout: pipelineLayout,
          vertex: { module: backgroundModule, entryPoint: 'vertexMain' },
          fragment: {
            module: backgroundModule,
            entryPoint: 'fragmentMain',
            targets: [{ format: canvasFormat }],
          },
          primitive: { topology: 'triangle-list' },
          depthStencil: {
            format: DEPTH_FORMAT,
            depthWriteEnabled: false,
            depthCompare: 'always',
          },
        }),
        device.createRenderPipelineAsync({
          label: 'Static swarm pipeline',
          layout: pipelineLayout,
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
          depthStencil: {
            format: DEPTH_FORMAT,
            depthWriteEnabled: true,
            depthCompare: 'less',
          },
        }),
      ]);
      const bindGroup = device.createBindGroup({
        label: 'Static swarm bind group',
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer, size: GLOBAL_UNIFORM_BYTES } },
          {
            binding: 1,
            resource: { buffer: positionBuffer, size: capacity * POSITION_BYTES_PER_INSTANCE },
          },
          {
            binding: 2,
            resource: {
              buffer: appearanceBuffer,
              size: capacity * APPEARANCE_BYTES_PER_INSTANCE,
            },
          },
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
        positionBuffer,
        appearanceBuffer,
        bindGroup,
        backgroundPipeline,
        swarmPipeline,
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
      label: 'Static swarm depth texture',
      size: [size.width, size.height, 1],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.#depthAttachment.view = this.#depthTexture.createView({
      label: 'Static swarm depth view',
    });
    this.#depthWidth = size.width;
    this.#depthHeight = size.height;
  }

  public render(
    canvasContext: GPUCanvasContext,
    camera: OrbitCamera,
    timeSeconds: number,
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
      timeSeconds,
      viewportWidth,
      viewportHeight,
      safeInstanceCount,
      devicePixelRatio,
    );
    this.#device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      this.#uniformStaging.buffer,
      this.#uniformStaging.byteOffset,
      GLOBAL_UNIFORM_USED_BYTES,
    );

    this.#colorAttachment.view = canvasContext
      .getCurrentTexture()
      .createView(this.#canvasViewDescriptor);
    const encoder = this.#device.createCommandEncoder(this.#commandEncoderDescriptor);
    const pass = encoder.beginRenderPass(this.#renderPassDescriptor);
    pass.setBindGroup(0, this.#bindGroup);
    pass.setPipeline(this.#backgroundPipeline);
    pass.draw(3);
    pass.setPipeline(this.#swarmPipeline);
    pass.setVertexBuffer(0, this.#vertexBuffer);
    pass.setIndexBuffer(this.#indexBuffer, 'uint16');
    pass.drawIndexed(DRONE_INDICES.length, safeInstanceCount);
    pass.end();
    this.#submission[0] = encoder.finish(this.#commandBufferDescriptor);
    this.#device.queue.submit(this.#submission);
    this.lastCpuFrameMs = performance.now() - start;
    this.#cpuFrameSamples.record(this.lastCpuFrameMs);
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
