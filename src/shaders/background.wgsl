struct Globals {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  viewProjection: mat4x4<f32>,
  cameraAndTime: vec4<f32>,
  viewportAndCount: vec4<f32>,
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
  return vec4<f32>(base + coolStar, 1.0);
}
