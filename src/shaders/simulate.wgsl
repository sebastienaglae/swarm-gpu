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
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> sourcePositions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> sourceVelocities: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> destinationPositions: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> destinationVelocities: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> appearance: array<vec4<u32>>;

fn hash32(input: u32) -> u32 {
  var value = input;
  value = value ^ (value >> 16u);
  value = value * 0x7feb352du;
  value = value ^ (value >> 15u);
  value = value * 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn hash01(input: u32) -> f32 {
  return f32(hash32(input)) / 4294967296.0;
}

fn safeClampVector(value: vec3<f32>, maximum: f32) -> vec3<f32> {
  let lengthSquared = dot(value, value);
  if (lengthSquared <= maximum * maximum || lengthSquared <= 0.0000000001) {
    return value;
  }
  return value * (maximum * inverseSqrt(lengthSquared));
}

fn finiteLike(value: vec3<f32>) -> bool {
  // WGSL has no portable isFinite builtin. NaN fails self-equality; infinities and runaway
  // values are rejected by the conservative magnitude comparison.
  return all(value == value) && all(abs(value) < vec3<f32>(1.0e12));
}

fn recoverPosition(seed: u32, scale: f32) -> vec4<f32> {
  let angle = hash01(seed) * 6.28318530718;
  let height = hash01(seed ^ 0x68bc21ebu) * 2.0 - 1.0;
  let radius = 18.0 + hash01(seed ^ 0x02e5be93u) * 24.0;
  let horizontal = sqrt(max(0.0, 1.0 - height * height));
  return vec4<f32>(
    cos(angle) * horizontal * radius,
    height * radius * 0.62,
    sin(angle) * horizontal * radius,
    clamp(select(0.24, scale, scale == scale), 0.16, 0.4)
  );
}

fn recoverVelocity(seed: u32) -> vec4<f32> {
  let angle = hash01(seed) * 6.28318530718;
  return vec4<f32>(-sin(angle) * 2.0, 0.0, cos(angle) * 2.0, angle);
}

@compute @workgroup_size(128)
fn simulate(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let instanceId = invocation.x;
  let instanceCount = u32(globals.simulationA.y);
  if (instanceId >= instanceCount) {
    return;
  }

  var positionState = sourcePositions[instanceId];
  var velocityState = sourceVelocities[instanceId];
  let seed = appearance[instanceId].z;
  if (!finiteLike(positionState.xyz) || !finiteLike(velocityState.xyz) || velocityState.w != velocityState.w) {
    destinationPositions[instanceId] = recoverPosition(seed, positionState.w);
    destinationVelocities[instanceId] = recoverVelocity(seed);
    return;
  }

  let deltaTime = clamp(globals.simulationA.x, 0.0, 0.0333333333);
  let boundaryRadius = globals.simulationA.z;
  let maxSpeed = globals.simulationA.w;
  let containmentStrength = globals.simulationB.x;
  let maxAcceleration = globals.simulationB.y;
  let noiseStrength = globals.simulationB.z;
  let attractorRadius = globals.simulationB.w;
  let phase = velocityState.w;
  var acceleration = vec3<f32>(
    sin(positionState.y * 0.17 + phase),
    sin(positionState.z * 0.13 + phase * 1.7) * 0.55,
    sin(positionState.x * 0.19 - phase * 1.3)
  ) * noiseStrength;

  let centerDistance = length(positionState.xyz);
  if (centerDistance > boundaryRadius && centerDistance > 0.00001) {
    let excess = centerDistance - boundaryRadius;
    acceleration -= positionState.xyz / centerDistance * containmentStrength * (1.0 + excess * 0.08);
  }

  let toAttractor = globals.attractorAndStrength.xyz - positionState.xyz;
  let attractorDistance = length(toAttractor);
  if (globals.attractorAndStrength.w != 0.0 && attractorDistance > 0.00001 && attractorDistance < attractorRadius) {
    let falloff = 1.0 - attractorDistance / attractorRadius;
    acceleration += toAttractor / attractorDistance * globals.attractorAndStrength.w * falloff * falloff;
  }

  acceleration = safeClampVector(acceleration, maxAcceleration);
  velocityState.xyz = safeClampVector(velocityState.xyz + acceleration * deltaTime, maxSpeed);
  positionState.xyz += velocityState.xyz * deltaTime;
  velocityState.w += deltaTime * 0.7;

  if (!finiteLike(positionState.xyz) || !finiteLike(velocityState.xyz) || velocityState.w != velocityState.w) {
    destinationPositions[instanceId] = recoverPosition(seed, positionState.w);
    destinationVelocities[instanceId] = recoverVelocity(seed);
    return;
  }
  destinationPositions[instanceId] = positionState;
  destinationVelocities[instanceId] = velocityState;
}
