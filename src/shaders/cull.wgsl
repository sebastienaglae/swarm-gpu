struct Globals {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  viewProjection: mat4x4<f32>,
  cameraAndTime: vec4<f32>,
  viewportAndCount: vec4<f32>,
  attractorAndStrength: vec4<f32>,
  simulationA: vec4<f32>,
  simulationB: vec4<f32>,
  simulationC: vec4<f32>,
  frustumPlanes: array<vec4<f32>, 6>,
  lodParameters: vec4<f32>,
};

struct LodCounter {
  visibleCount: atomic<u32>,
  overflowCount: atomic<u32>,
  capacity: u32,
  padding: u32,
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> visibleIds: array<u32>;
@group(0) @binding(3) var<storage, read_write> counters: array<LodCounter, 3>;

fn sphereVisible(center: vec3<f32>, radius: f32) -> bool {
  for (var planeIndex = 0u; planeIndex < 6u; planeIndex += 1u) {
    let plane = globals.frustumPlanes[planeIndex];
    if (dot(plane.xyz, center) + plane.w < -radius) {
      return false;
    }
  }
  return true;
}

override WORKGROUP_SIZE: u32 = 128u;

@compute @workgroup_size(WORKGROUP_SIZE)
fn cull(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let instanceId = invocation.x;
  let activeCount = u32(globals.simulationA.y);
  if (instanceId >= activeCount) {
    return;
  }
  let state = positions[instanceId];
  let radius = max(0.0, state.w) * 1.5 * 1.08;
  let benchmarkVisible = f32(instanceId) < f32(activeCount) * globals.simulationC.y;
  let visible = select(sphereVisible(state.xyz, radius), benchmarkVisible, globals.simulationC.z > 0.5);
  if (!visible) {
    return;
  }
  let viewPosition = globals.view * vec4<f32>(state.xyz, 1.0);
  let viewDepth = max(0.0001, -viewPosition.z);
  let projectedRadius = radius * globals.projection[1][1] * globals.viewportAndCount.y * 0.5 / viewDepth;
  let transitionHash = f32((instanceId * 1664525u + 1013904223u) >> 8u) / 16777215.0;
  let transitionScale = mix(0.92, 1.08, transitionHash);
  var lod = 2u;
  if (projectedRadius >= globals.lodParameters.x * transitionScale) {
    lod = 0u;
  } else if (projectedRadius >= globals.lodParameters.y * transitionScale) {
    lod = 1u;
  } else if (projectedRadius < globals.lodParameters.z * transitionScale) {
    return;
  }
  if (globals.lodParameters.w >= 0.0) {
    lod = min(2u, u32(globals.lodParameters.w));
  }
  let destination = atomicAdd(&counters[lod].visibleCount, 1u);
  let capacity = counters[lod].capacity;
  if (destination < capacity) {
    visibleIds[lod * capacity + destination] = instanceId;
  } else {
    atomicAdd(&counters[lod].overflowCount, 1u);
  }
}
