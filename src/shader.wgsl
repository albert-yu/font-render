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
  let curveCount = arrayLength(&curves);

  let x = output.x;
  let y = output.y;

  var winding = 0;

  for (var i = 0u; i < curveCount; i++) {
    let curve = curves[i];
    let x0 = curve.p0.x;
    // Subtract coordinates by y
    // so that our ray is x = 0
    let y0 = curve.p0.y - y;
    let x1 = curve.p1.x;
    let y1 = curve.p1.y - y;
    let x2 = curve.p2.x;
    let y2 = curve.p2.y - y;

    // Quadratic Bezier solutions
    // see https://github.com/GreenLightning/gpu-font-rendering/blob/master/readme.md
    //
    // Simplified substituted quadratic formula:
    // (b +- sqrt(b^2 - ac)) / a
    // where a = y0 - 2y1 + y2
    //       b = y0 - y1
    //       c = y0
    let a = y0 - 2*y1 + y2;
    let b = y0 - y1;
    let c = y0;

    let real = (b*b - a*c) >= 0;
    let nonZeroDivisor = a != 0;
    if (!real || !nonZeroDivisor) {
      continue;
    }
    // d/dt of Cy(t0) = -2 * sqrt(b^2 - ac)
    //   which is always <= 0
    // d/dt of Cy(t1) =  2 * sqrt(b^2 - ac)
    //   which is always >= 0
    //
    // By construction, the filled area is always to the right of the
    // curve. So if the curve goes up (derivative is >=0), the left-to-right
    // ray intersects the curve at an entrance. Otherwise, the ray
    // intersects the curve at an exit.
    // The above shows that d/dt >= 0 iff t1, and d/dt <= 0 iff t0.
    // So t1 is always an entrance, and t0 is always an exit.
    let t0 = (b - sqrt(b*b - a*c)) / a;
    let t1 = (b + sqrt(b*b - a*c)) / a;
    if (t0 <= 1 && t0 >= 0) {
      winding = winding + 1;
    }
    if (t1 <= 1 && t1 >= 0) {
      winding = winding - 1;
    }
  }

  if (winding == 0) {
    discard;
  }
  return vec4f(1.0, 0.0, 0.0, 1.0);
}
