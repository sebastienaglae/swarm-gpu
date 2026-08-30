import { extractWebGpuFrustumPlanes, FRUSTUM_FLOAT_COUNT } from './Frustum';
import { createMat4, multiplyMat4, setLookAt, setPerspectiveWebGpu } from '../math/mat4';

const DEFAULT_YAW = 0.55;
const DEFAULT_PITCH = 0.28;
const DEFAULT_DISTANCE = 92;
const MIN_PITCH = -Math.PI * 0.48;
const MAX_PITCH = Math.PI * 0.48;
const MIN_DISTANCE = 8;
const MAX_DISTANCE = 240;
const VERTICAL_FOV = Math.PI / 3;

export class OrbitCamera {
  public readonly view = createMat4();
  public readonly projection = createMat4();
  public readonly viewProjection = createMat4();
  public readonly position = new Float32Array(3);
  public readonly frustumPlanes = new Float32Array(FRUSTUM_FLOAT_COUNT);
  #yaw = DEFAULT_YAW;
  #pitch = DEFAULT_PITCH;
  #distance = DEFAULT_DISTANCE;
  #aspect = 1;
  #dirty = true;

  public get yaw(): number {
    return this.#yaw;
  }

  public get pitch(): number {
    return this.#pitch;
  }

  public get distance(): number {
    return this.#distance;
  }

  public setViewport(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    if (Math.abs(aspect - this.#aspect) <= 1e-7) return;
    this.#aspect = aspect;
    this.#dirty = true;
  }

  public applyInput(deltaX: number, deltaY: number, wheelDelta: number): void {
    if (deltaX !== 0 || deltaY !== 0) {
      this.#yaw -= deltaX * 0.0045;
      this.#pitch = clamp(this.#pitch - deltaY * 0.0045, MIN_PITCH, MAX_PITCH);
      this.#dirty = true;
    }
    if (wheelDelta !== 0) {
      this.#distance = clamp(
        this.#distance * Math.exp(wheelDelta * 0.0012),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
      this.#dirty = true;
    }
  }

  public reset(): void {
    this.#yaw = DEFAULT_YAW;
    this.#pitch = DEFAULT_PITCH;
    this.#distance = DEFAULT_DISTANCE;
    this.#dirty = true;
  }

  public update(): boolean {
    if (!this.#dirty) return false;
    const horizontalDistance = Math.cos(this.#pitch) * this.#distance;
    this.position[0] = Math.sin(this.#yaw) * horizontalDistance;
    this.position[1] = Math.sin(this.#pitch) * this.#distance;
    this.position[2] = Math.cos(this.#yaw) * horizontalDistance;

    setLookAt(this.view, this.position[0], this.position[1], this.position[2], 0, 0, 0);
    setPerspectiveWebGpu(this.projection, VERTICAL_FOV, this.#aspect, 0.1, 400);
    multiplyMat4(this.viewProjection, this.projection, this.view);
    extractWebGpuFrustumPlanes(this.frustumPlanes, this.viewProjection);
    this.#dirty = false;
    return true;
  }

  public projectPointerToTargetPlane(
    out: Float32Array,
    pointerX: number,
    pointerY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): boolean {
    if (out.length < 3 || viewportWidth <= 0 || viewportHeight <= 0) return false;
    const eyeX = this.position[0] ?? 0;
    const eyeY = this.position[1] ?? 0;
    const eyeZ = this.position[2] ?? 0;
    const inverseDistance = 1 / Math.max(1e-6, Math.hypot(eyeX, eyeY, eyeZ));
    const forwardX = -eyeX * inverseDistance;
    const forwardY = -eyeY * inverseDistance;
    const forwardZ = -eyeZ * inverseDistance;
    let rightX = -forwardZ;
    let rightZ = forwardX;
    const rightLength = Math.max(1e-6, Math.hypot(rightX, rightZ));
    rightX /= rightLength;
    rightZ /= rightLength;
    const upX = -forwardY * rightZ;
    const upY = forwardZ * rightX - forwardX * rightZ;
    const upZ = forwardY * rightX;
    const normalizedX = (pointerX / viewportWidth) * 2 - 1;
    const normalizedY = 1 - (pointerY / viewportHeight) * 2;
    const halfHeight = Math.tan(VERTICAL_FOV * 0.5);
    const rayX =
      forwardX + rightX * normalizedX * halfHeight * this.#aspect + upX * normalizedY * halfHeight;
    const rayY = forwardY + upY * normalizedY * halfHeight;
    const rayZ =
      forwardZ + rightZ * normalizedX * halfHeight * this.#aspect + upZ * normalizedY * halfHeight;
    const denominator = rayX * forwardX + rayY * forwardY + rayZ * forwardZ;
    if (Math.abs(denominator) <= 1e-6) return false;
    const distance = -(eyeX * forwardX + eyeY * forwardY + eyeZ * forwardZ) / denominator;
    if (distance <= 0 || !Number.isFinite(distance)) return false;
    out[0] = eyeX + rayX * distance;
    out[1] = eyeY + rayY * distance;
    out[2] = eyeZ + rayZ * distance;
    return true;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
