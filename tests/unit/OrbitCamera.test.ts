import { OrbitCamera } from '../../src/renderer/OrbitCamera';

describe('OrbitCamera', () => {
  it('updates lazily, clamps navigation, and resets deterministically', () => {
    const camera = new OrbitCamera();
    expect(camera.update()).toBe(true);
    expect(camera.update()).toBe(false);

    camera.applyInput(100, 100_000, -100_000);
    expect(camera.pitch).toBeGreaterThanOrEqual(-Math.PI * 0.48);
    expect(camera.distance).toBe(8);
    expect(camera.update()).toBe(true);

    camera.applyInput(0, -100_000, 100_000);
    expect(camera.pitch).toBeLessThanOrEqual(Math.PI * 0.48);
    expect(camera.distance).toBe(240);

    camera.reset();
    camera.update();
    expect(camera.yaw).toBeCloseTo(0.55);
    expect(camera.pitch).toBeCloseTo(0.28);
    expect(camera.distance).toBe(92);
  });

  it('invalidates the projection only for drawable viewport changes', () => {
    const camera = new OrbitCamera();
    camera.update();
    camera.setViewport(0, 0);
    expect(camera.update()).toBe(false);
    camera.setViewport(1920, 1080);
    expect(camera.update()).toBe(true);
  });

  it('projects the viewport center onto the world target plane', () => {
    const camera = new OrbitCamera();
    camera.setViewport(1920, 1080);
    camera.update();
    const point = new Float32Array(3);
    expect(camera.projectPointerToTargetPlane(point, 960, 540, 1920, 1080)).toBe(true);
    expect(point[0]).toBeCloseTo(0, 4);
    expect(point[1]).toBeCloseTo(0, 4);
    expect(point[2]).toBeCloseTo(0, 4);
  });
});
