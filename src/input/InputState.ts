export class InputState {
  public readonly pointer = new Float32Array(4);
  #attached = false;
  readonly #onPointerMove = (event: PointerEvent): void => {
    this.pointer[0] = event.offsetX;
    this.pointer[1] = event.offsetY;
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

  public attach(canvas: HTMLCanvasElement): void {
    if (this.#attached) return;
    this.#attached = true;
    canvas.addEventListener('pointermove', this.#onPointerMove);
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointercancel', this.#onPointerUp);
  }

  public detach(canvas: HTMLCanvasElement): void {
    if (!this.#attached) return;
    this.#attached = false;
    canvas.removeEventListener('pointermove', this.#onPointerMove);
    canvas.removeEventListener('pointerdown', this.#onPointerDown);
    canvas.removeEventListener('pointerup', this.#onPointerUp);
    canvas.removeEventListener('pointercancel', this.#onPointerUp);
  }

  public reset(): void {
    this.pointer.fill(0);
    this.pointer[3] = -1;
  }
}
