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
  visualParameters: vec4<f32>,
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> instancePositions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> instanceAppearance: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> instanceVelocities: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> visibleInstanceIds: array<u32>;

override USE_VISIBLE_IDS: bool = true;
override LOD_INDEX: u32 = 0u;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) color: vec3<f32>,
  @location(3) variation: f32,
};

fn unpackRgb(packed: u32) -> vec3<f32> {
  return vec3<f32>(
    f32(packed & 0xffu),
    f32((packed >> 8u) & 0xffu),
    f32((packed >> 16u) & 0xffu)
  ) / 255.0;
}

@vertex
fn vertexMain(input: VertexInput, @builtin(instance_index) instanceId: u32) -> VertexOutput {
  let listCapacity = u32(globals.simulationC.w);
  let visibleIndex = LOD_INDEX * listCapacity + instanceId;
  let sourceId = select(instanceId, visibleInstanceIds[visibleIndex], USE_VISIBLE_IDS);
  let state = instancePositions[sourceId];
  let appearance = instanceAppearance[sourceId];
  let velocity = instanceVelocities[sourceId].xyz;
  let storedHeading = bitcast<f32>(appearance.y);
  var forward = vec3<f32>(sin(storedHeading), 0.0, cos(storedHeading));
  let speedSquared = dot(velocity, velocity);
  if (speedSquared > 0.0001) {
    forward = velocity * inverseSqrt(speedSquared);
  }
  let referenceUp = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(forward.y) > 0.98);
  let right = normalize(cross(referenceUp, forward));
  let localUp = normalize(cross(forward, right));
  let scaled = input.position * state.w;
  let rotatedPosition = right * scaled.x + localUp * scaled.y + forward * scaled.z;
  let rotatedNormal = normalize(right * input.normal.x + localUp * input.normal.y + forward * input.normal.z);
  var worldPosition = state.xyz + rotatedPosition;
  var worldNormal = rotatedNormal;
  if (LOD_INDEX == 2u) {
    let right = normalize(vec3<f32>(globals.view[0].x, globals.view[1].x, globals.view[2].x));
    let up = normalize(vec3<f32>(globals.view[0].y, globals.view[1].y, globals.view[2].y));
    let billboardScale = max(0.32, state.w * 1.8);
    worldPosition = state.xyz + (right * input.position.x + up * input.position.y) * billboardScale;
    worldNormal = normalize(globals.cameraAndTime.xyz - state.xyz);
  }

  var output: VertexOutput;
  output.clipPosition = globals.viewProjection * vec4<f32>(worldPosition, 1.0);
  output.worldPosition = worldPosition;
  output.worldNormal = worldNormal;
  output.color = unpackRgb(appearance.x);
  if (globals.visualParameters.x > 0.5) {
    let lodColors = array<vec3<f32>, 3>(
      vec3<f32>(0.15, 0.95, 1.0),
      vec3<f32>(1.0, 0.72, 0.12),
      vec3<f32>(1.0, 0.18, 0.72)
    );
    output.color = lodColors[LOD_INDEX];
  }
  output.variation = f32(appearance.w & 3u) / 3.0;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let lightDirection = normalize(vec3<f32>(0.45, 0.8, 0.35));
  let diffuse = max(dot(input.worldNormal, lightDirection), 0.0);
  let facing = pow(1.0 - max(dot(
    input.worldNormal,
    normalize(globals.cameraAndTime.xyz - input.worldPosition)
  ), 0.0), 2.0);
  let litColor = input.color * (0.28 + diffuse * 0.72) + input.color * facing * 0.38;
  let farGlow = select(vec3<f32>(0.0), input.color * 0.7, LOD_INDEX == 2u);
  let distanceToCamera = distance(globals.cameraAndTime.xyz, input.worldPosition);
  let fog = smoothstep(90.0, 175.0, distanceToCamera) * globals.visualParameters.y;
  let fogColor = vec3<f32>(0.008, 0.018, 0.035);
  return vec4<f32>(mix(litColor + farGlow, fogColor, fog), 1.0);
}
