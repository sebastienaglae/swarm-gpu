export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly drawable: boolean;
}

export function computeCanvasSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxTextureDimension2D: number,
): CanvasSize {
  if (![cssWidth, cssHeight, devicePixelRatio, maxTextureDimension2D].every(Number.isFinite)) {
    throw new RangeError('canvas sizing inputs must be finite');
  }
  if (maxTextureDimension2D < 1) throw new RangeError('maximum texture dimension must be positive');
  if (cssWidth <= 0 || cssHeight <= 0 || devicePixelRatio <= 0) {
    return { width: 0, height: 0, drawable: false };
  }

  return {
    width: Math.min(maxTextureDimension2D, Math.max(1, Math.round(cssWidth * devicePixelRatio))),
    height: Math.min(maxTextureDimension2D, Math.max(1, Math.round(cssHeight * devicePixelRatio))),
    drawable: true,
  };
}
