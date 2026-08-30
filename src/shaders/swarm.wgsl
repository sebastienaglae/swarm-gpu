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

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> instancePositions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> instanceAppearance: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> instanceVelocities: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> visibleInstanceIds: array<u32>;

override USE_VISIBLE_IDS: bool = true;

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
  let sourceId = select(instanceId, visibleInstanceIds[instanceId], USE_VISIBLE_IDS);
  let state = instancePositions[sourceId];
  let appearance = instanceAppearance[sourceId];
  let velocity = instanceVelocities[sourceId].xyz;
  let storedHeading = bitcast<f32>(appearance.y);
  let heading = select(storedHeading, atan2(velocity.x, velocity.z), dot(velocity.xz, velocity.xz) > 0.0001);
  let sine = sin(heading);
  let cosine = cos(heading);
  let scaled = input.position * state.w;
  let rotatedPosition = vec3<f32>(
    cosine * scaled.x + sine * scaled.z,
    scaled.y,
    -sine * scaled.x + cosine * scaled.z
  );
  let rotatedNormal = normalize(vec3<f32>(
    cosine * input.normal.x + sine * input.normal.z,
    input.normal.y,
    -sine * input.normal.x + cosine * input.normal.z
  ));
  let worldPosition = state.xyz + rotatedPosition;

  var output: VertexOutput;
  output.clipPosition = globals.viewProjection * vec4<f32>(worldPosition, 1.0);
  output.worldPosition = worldPosition;
  output.worldNormal = rotatedNormal;
  output.color = unpackRgb(appearance.x);
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
  let distanceToCamera = distance(globals.cameraAndTime.xyz, input.worldPosition);
  let fog = smoothstep(90.0, 175.0, distanceToCamera);
  let fogColor = vec3<f32>(0.008, 0.018, 0.035);
  return vec4<f32>(mix(litColor, fogColor, fog), 1.0);
}
