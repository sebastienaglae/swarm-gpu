export class InputState {
  // x, y, pressed flag, button, inside-canvas flag.
  public readonly pointer = new Float32Array(5);
  public readonly orbitDelta = new Float32Array(3);
  #attached = false;
  readonly #onPointerMove = (event: PointerEvent): void => {
    this.pointer[0] = event.offsetX;
    this.pointer[1] = event.offsetY;
    if (this.pointer[2] === 1 && this.pointer[3] === 0) {
      this.orbitDelta[0] = (this.orbitDelta[0] ?? 0) + event.movementX;
      this.orbitDelta[1] = (this.orbitDelta[1] ?? 0) + event.movementY;
    }
  };
  readonly #onPointerDown = (event: PointerEvent): void => {
    this.pointer[2] = 1;
    this.pointer[3] = event.button;
    if (event.currentTarget instanceof Element) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  readonly #onPointerUp = (event: PointerEvent): void => {
    this.pointer[2] = 0;
    this.pointer[3] = -1;
    if (
      event.currentTarget instanceof Element &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  readonly #onLostPointerCapture = (): void => {
    this.pointer[2] = 0;
    this.pointer[3] = -1;
    this.pointer[4] = 0;
  };
  readonly #onPointerEnter = (): void => {
    this.pointer[4] = 1;
  };
  readonly #onPointerLeave = (): void => {
    this.pointer[4] = 0;
  };
  readonly #onWheel = (event: WheelEvent): void => {
    this.orbitDelta[2] = (this.orbitDelta[2] ?? 0) + event.deltaY;
    event.preventDefault();
  };

  public attach(canvas: HTMLCanvasElement): void {
    if (this.#attached) return;
    this.#attached = true;
    canvas.addEventListener('pointermove', this.#onPointerMove);
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointercancel', this.#onPointerUp);
    canvas.addEventListener('lostpointercapture', this.#onLostPointerCapture);
    canvas.addEventListener('pointerenter', this.#onPointerEnter);
    canvas.addEventListener('pointerleave', this.#onPointerLeave);
    canvas.addEventListener('wheel', this.#onWheel, { passive: false });
  }

  public detach(canvas: HTMLCanvasElement): void {
    if (!this.#attached) return;
    this.#attached = false;
    canvas.removeEventListener('pointermove', this.#onPointerMove);
    canvas.removeEventListener('pointerdown', this.#onPointerDown);
    canvas.removeEventListener('pointerup', this.#onPointerUp);
    canvas.removeEventListener('pointercancel', this.#onPointerUp);
    canvas.removeEventListener('lostpointercapture', this.#onLostPointerCapture);
    canvas.removeEventListener('pointerenter', this.#onPointerEnter);
    canvas.removeEventListener('pointerleave', this.#onPointerLeave);
    canvas.removeEventListener('wheel', this.#onWheel);
  }

  public consumeOrbitDelta(target: Float32Array): void {
    if (target.length < 3) throw new RangeError('orbit input target requires three floats');
    target[0] = this.orbitDelta[0] ?? 0;
    target[1] = this.orbitDelta[1] ?? 0;
    target[2] = this.orbitDelta[2] ?? 0;
    this.orbitDelta.fill(0);
  }

  public reset(): void {
    this.pointer.fill(0);
    this.pointer[3] = -1;
    this.orbitDelta.fill(0);
  }
}
