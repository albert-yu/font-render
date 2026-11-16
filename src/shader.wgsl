struct VertexInput {
  @location(0) position: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) glyphPos: vec2f,
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
  output.glyphPos = input.position;
  return output;
}

fn computeX(x0: f32, x1: f32, x2: f32, t: f32) -> f32 {
  return (1-t)*(1-t) * x0 + 2*t*(1-t) * x1 + t*t * x2;
}

@fragment fn fs(output: VertexOutput) -> @location(0) vec4f {
  let curveCount = arrayLength(&curves);

  let pos = output.glyphPos.xy;

  var winding = 0;

  for (var i = 0u; i < curveCount; i++) {
    let curve = curves[i];
    // offset by pos to compute
    // everything relative to the current point
    let p0 = curve.p0 - pos;
    let p1 = curve.p1 - pos;
    let p2 = curve.p2 - pos;
    let x0 = p0.x;
    let y0 = p0.y;
    let x1 = p1.x;
    let y1 = p1.y;
    let x2 = p2.x;
    let y2 = p2.y;

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
      let xt0 = computeX(x0, x1, x2, t0);
      // Comparing > 0, since we centered
      // all of the curve points w.r.t. pos
      if (xt0 > 0) {
        winding = winding + 1;
      }
    }
    if (t1 <= 1 && t1 >= 0) {
      let xt1 = computeX(x0, x1, x2, t1);
      if (xt1 > 0) {
        winding = winding - 1;
      }
    }
  }

  if (winding == 0) {
    discard;
  }
  return vec4f(1.0, 0.0, 0.0, 1.0);
}

