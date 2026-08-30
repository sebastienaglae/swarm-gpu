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
};

struct VisibilityCounters {
  visibleCount: atomic<u32>,
  overflowCount: atomic<u32>,
  capacity: u32,
  padding: u32,
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> visibleIds: array<u32>;
@group(0) @binding(3) var<storage, read_write> counters: VisibilityCounters;

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
  if (!sphereVisible(state.xyz, radius)) {
    return;
  }
  let destination = atomicAdd(&counters.visibleCount, 1u);
  let capacity = counters.capacity;
  if (destination < capacity) {
    visibleIds[destination] = instanceId;
  } else {
    atomicAdd(&counters.overflowCount, 1u);
  }
}
