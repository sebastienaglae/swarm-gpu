import {
  DynamicResolutionController,
  DYNAMIC_RESOLUTION_LEVELS,
} from '../../src/diagnostics/DynamicResolutionController';

function feed(
  controller: DynamicResolutionController,
  milliseconds: number,
  frames: number,
): number[] {
  const changes: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const change = controller.record(milliseconds, milliseconds);
    if (change !== undefined) changes.push(change);
  }
  return changes;
}

describe('DynamicResolutionController', () => {
  it('uses bounded quantized levels and requires sustained slow windows', () => {
    const controller = new DynamicResolutionController();
    expect(feed(controller, 25, 89)).toEqual([]);
    expect(feed(controller, 25, 91)).toEqual([0.875]);
    expect(DYNAMIC_RESOLUTION_LEVELS).toContain(controller.scale);
  });

  it('raises more slowly and never exceeds one', () => {
    const controller = new DynamicResolutionController();
    controller.setScale(0.5);
    expect(feed(controller, 8, 269)).toEqual([]);
    expect(feed(controller, 8, 1)).toEqual([0.625]);
    expect(feed(controller, 8, 2000).at(-1)).toBe(1);
    expect(controller.scale).toBe(1);
  });

  it('falls back to frame interval when GPU timing is unavailable', () => {
    const controller = new DynamicResolutionController();
    expect(feedFallback(controller, 30, 180)).toEqual([0.875]);
  });
});

function feedFallback(
  controller: DynamicResolutionController,
  milliseconds: number,
  frames: number,
): number[] {
  const changes: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const change = controller.record(undefined, milliseconds);
    if (change !== undefined) changes.push(change);
  }
  return changes;
}
