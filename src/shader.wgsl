struct VertexInput {
  @location(0) position: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
}

struct Uniforms {
  transform: mat4x4<f32>,
}

struct Curve {
  p0: vec2f,
  p1: vec2f,
  p2: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> curves: array<Curve>;

@vertex fn vs(
  input: VertexInput
) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.transform * vec4f(input.position, 0.0, 1.0);
  return output;
}

@fragment fn fs(output: VertexOutput) -> @location(0) vec4f {
  return vec4f(1.0, 0.0, 0.0, 1.0);
}
