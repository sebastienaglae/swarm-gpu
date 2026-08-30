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
      const distance = camera.frustumPlanes[offset + 3] ?? 0;
      expect(
        sphereIntersectsFrustum(
          camera.frustumPlanes,
          -x * (distance + 2),
          -y * (distance + 2),
          -z * (distance + 2),
          0.1,
        ),
      ).toBe(false);
    }
  });

  it('keeps spheres intersecting the far plane and rejects those beyond it', () => {
    const camera = new OrbitCamera();
    camera.update();
    const farOffset = 5 * 4;
    const x = camera.frustumPlanes[farOffset] ?? 0;
    const y = camera.frustumPlanes[farOffset + 1] ?? 0;
    const z = camera.frustumPlanes[farOffset + 2] ?? 0;
    const distance = camera.frustumPlanes[farOffset + 3] ?? 0;
    expect(
      sphereIntersectsFrustum(
        camera.frustumPlanes,
        -x * (distance + 0.05),
        -y * (distance + 0.05),
        -z * (distance + 0.05),
        0.1,
      ),
    ).toBe(true);
  });
});
