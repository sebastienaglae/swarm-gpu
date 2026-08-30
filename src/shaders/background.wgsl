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

struct BackgroundOutput {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexId: u32) -> BackgroundOutput {
  let x = f32((vertexId << 1u) & 2u);
  let y = f32(vertexId & 2u);
  var output: BackgroundOutput;
  output.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.999999, 1.0);
  return output;
}

fn hash2(cell: vec2<f32>) -> f32 {
  let value = dot(cell, vec2<f32>(127.1, 311.7));
  return fract(sin(value) * 43758.5453);
}

@fragment
fn fragmentMain(input: BackgroundOutput) -> @location(0) vec4<f32> {
  let viewport = max(globals.viewportAndCount.xy, vec2<f32>(1.0));
  let uv = input.position.xy / viewport;
  let radial = max(0.0, 1.0 - distance(uv, vec2<f32>(0.5)) * 1.35);
  let base = mix(vec3<f32>(0.003, 0.007, 0.015), vec3<f32>(0.012, 0.045, 0.072), radial);
  let cell = floor(input.position.xy * 0.42);
  let starNoise = hash2(cell);
  let star = pow(max(starNoise - 0.992, 0.0) / 0.008, 3.0);
  let coolStar = vec3<f32>(0.55, 0.82, 1.0) * star * 0.72;
  let attractorClip = globals.viewProjection * vec4<f32>(globals.attractorAndStrength.xyz, 1.0);
  let attractorNdc = attractorClip.xy / max(0.0001, attractorClip.w);
  let attractorPixel = (attractorNdc * vec2<f32>(0.5, -0.5) + 0.5) * viewport;
  let ringDistance = abs(distance(input.position.xy, attractorPixel) - 9.0);
  let marker = (1.0 - smoothstep(0.0, 1.5, ringDistance)) * globals.visualParameters.z;
  let markerColor = mix(vec3<f32>(1.0, 0.3, 0.48), vec3<f32>(0.15, 0.92, 1.0), step(0.0, globals.attractorAndStrength.w));
  return vec4<f32>(base + coolStar + markerColor * marker, 1.0);
}
