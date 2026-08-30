import {
  GLOBAL_OFFSETS,
  GLOBAL_UNIFORM_BYTES,
  GLOBAL_UNIFORM_FLOATS,
  GLOBAL_UNIFORM_USED_BYTES,
  writeGlobalUniforms,
} from '../../src/renderer/GlobalUniforms';
import { OrbitCamera } from '../../src/renderer/OrbitCamera';

describe('global uniform layout', () => {
  it('uses an aligned persistent block with stable field offsets', () => {
    expect(GLOBAL_UNIFORM_BYTES).toBe(320);
    expect(GLOBAL_UNIFORM_USED_BYTES).toBe(320);
    const camera = new OrbitCamera();
    camera.update();
    const target = new Float32Array(GLOBAL_UNIFORM_FLOATS);
    writeGlobalUniforms(target, camera, 12.5, 1920, 1080, 100_000, 2, {
      deltaSeconds: 1 / 60,
      attractorX: 1,
      attractorY: 2,
      attractorZ: 3,
      attractorStrength: 18,
      boundaryRadius: 58,
      maxSpeed: 10,
      containmentStrength: 2.8,
      maxAcceleration: 18,
      noiseStrength: 1.35,
      attractorRadius: 24,
      frameIndex: 7,
    });

    expect(target[GLOBAL_OFFSETS.cameraAndTime + 3]).toBe(12.5);
    expect(Array.from(target.slice(GLOBAL_OFFSETS.viewportAndCount, 56))).toEqual([
      1920, 1080, 100_000, 2,
    ]);
  });

  it('rejects undersized staging memory', () => {
    const camera = new OrbitCamera();
    expect(() => {
      writeGlobalUniforms(new Float32Array(55), camera, 0, 1, 1, 1, 1, {
        deltaSeconds: 0,
        attractorX: 0,
        attractorY: 0,
        attractorZ: 0,
        attractorStrength: 0,
        boundaryRadius: 58,
        maxSpeed: 10,
        containmentStrength: 2.8,
        maxAcceleration: 18,
        noiseStrength: 1.35,
        attractorRadius: 24,
        frameIndex: 0,
      });
    }).toThrow(RangeError);
  });
});
