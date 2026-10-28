struct VertexInput {
  @location(0) position: vec2f,
  @location(1) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct Uniforms {
  transform: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex fn vs(
  input: VertexInput
) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.transform * vec4f(input.position, 0.0, 1.0);
  output.uv = input.uv;
  return output;
}

@fragment fn fs(output: VertexOutput) -> @location(0) vec4f {
  let u = output.uv[0];
  let v = output.uv[1];
  if (u * u - v > 0) {
    discard;
  }
  return vec4f(1.0, 0.0, 0.0, 1.0);
}
