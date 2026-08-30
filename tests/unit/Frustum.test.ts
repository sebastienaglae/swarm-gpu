import { OrbitCamera } from '../../src/renderer/OrbitCamera';
import { FRUSTUM_PLANE_COUNT, sphereIntersectsFrustum } from '../../src/renderer/Frustum';

describe('WebGPU frustum planes', () => {
  it('classifies representative spheres and keeps normalized planes', () => {
    const camera = new OrbitCamera();
    camera.setViewport(1920, 1080);
    camera.update();

    expect(sphereIntersectsFrustum(camera.frustumPlanes, 0, 0, 0, 1)).toBe(true);
    expect(sphereIntersectsFrustum(camera.frustumPlanes, 10_000, 0, 0, 1)).toBe(false);
    expect(sphereIntersectsFrustum(camera.frustumPlanes, 0, 0, 10_000, 1)).toBe(false);

    for (let plane = 0; plane < FRUSTUM_PLANE_COUNT; plane += 1) {
      const offset = plane * 4;
      const x = camera.frustumPlanes[offset] ?? 0;
      const y = camera.frustumPlanes[offset + 1] ?? 0;
      const z = camera.frustumPlanes[offset + 2] ?? 0;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
    }
  });
});
