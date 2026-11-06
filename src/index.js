import { parse } from "opentype.js";
import { mat4 } from "webgpu-matrix";
import shaderCode from "./shader.wgsl?raw";

/** @import { PathCommand } from "opentype.js" */

/**
 * @typedef {{ x0: number; y0: number; x1: number; y1: number; x2: number; y2: number }} Curve
 */

const BYTES_PER_FLOAT = 4;

async function main() {
  const font = await fetchFont();
  // Set up WebGPU

  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("canvas#main");
  if (!canvas) {
    console.error("Could not find canvas");
    return;
  }
  // Set canvas resolution for higher res
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;

  if (!navigator.gpu) {
    console.error("WebGPU not supported on this device");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.error("No adapter found");
    return;
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) {
    console.error("Could not get rendering context");
    return;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
  });

  const FLOATS_PER_VERTEX = 2;
  // biome-ignore format: preserve layout
  const vertexArray = new Float32Array([
    // quad
    -1.0,  1.0,
    -1.0, -1.0,
     1.0, -1.0,

     1.0, -1.0,
     1.0,  1.0,
    -1.0,  1.0,
  ])

  const vertexBuffer = device.createBuffer({
    size: vertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexArray);

  const transform = mat4.identity();

  const uniformBuffer = device.createBuffer({
    size: transform.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Read the font data
  const LETTER = "R";
  const glyph = font.charToGlyph(LETTER);
  const curves = convertCommandsToCurves(glyph.path.commands);
  console.log(glyph.path.commands, curves);

  // convert curves into float array
  const FLOATS_PER_CURVE = 6;
  const curveData = new Float32Array(curves.length * FLOATS_PER_CURVE);
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    curveData.set(
      [curve.x0, curve.y0, curve.x1, curve.y1, curve.x2, curve.y2],
      FLOATS_PER_CURVE * i,
    );
  }

  const curveBuffer = device.createBuffer({
    size: curveData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(curveBuffer, 0, curveData);

  const module = device.createShaderModule({
    label: "main module",
    code: shaderCode,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: "bind group layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: "bind group",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: curveBuffer,
        },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  /**
   * Four bytes per float, four floats per vertex
   */
  const arrayStride = FLOATS_PER_VERTEX * BYTES_PER_FLOAT;

  const pipeline = device.createRenderPipeline({
    label: "pipeline",
    layout: pipelineLayout,
    vertex: {
      entryPoint: "vs",
      module,
      buffers: [
        {
          arrayStride,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: "float32x2",
            },
          ],
        },
      ],
    },
    fragment: {
      entryPoint: "fs",
      module,
      targets: [{ format }],
    },
  });

  /** @type {GPURenderPassDescriptor} */
  const renderPassDescriptor = {
    label: "canvas render pass",
    colorAttachments: [
      {
        clearValue: [0.3, 0.3, 0.3, 1],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  };

  // const { xMin, xMax, yMin, yMax } = glyph;

  function render() {
    device.queue.writeBuffer(uniformBuffer, 0, transform);
    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();
    const encoder = device.createCommandEncoder({ label: "encoder" });

    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  render();
}

main();

async function fetchFont() {
  const res = await fetch("static/fonts/Inter/Inter_18pt-Medium.ttf");
  const buf = await res.arrayBuffer();
  const font = parse(buf);
  return font;
}

// quadratic Bezier solutions
// see https://github.com/GreenLightning/gpu-font-rendering/blob/master/readme.md
//
// Simplified substituted quadratic formula:
// (b +- sqrt(b^2 - ac)) / a
// where a = y0 - 2y1 + y2
//       b = y0 - y1
//       c = y0
//
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

/**
 * @param {PathCommand[]} commands
 * @returns Curve[]
 */
function convertCommandsToCurves(commands) {
  /** @type Curve[] */
  const curves = [];
  let xCurr = 0,
    yCurr = 0,
    xStart = 0,
    yStart = 0;
  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        xCurr = cmd.x;
        yCurr = cmd.y;
        xStart = cmd.x;
        yStart = cmd.y;
        break;
      case "L":
        curves.push({
          x0: xCurr,
          y0: yCurr,
          x1: (cmd.x + xCurr) / 2,
          y1: (cmd.y + yCurr) / 2,
          x2: cmd.x,
          y2: cmd.y,
        });
        xCurr = cmd.x;
        yCurr = cmd.y;
        break;
      case "Q":
        curves.push({
          x0: xCurr,
          y0: yCurr,
          x1: cmd.x1,
          y1: cmd.y1,
          x2: cmd.x,
          y2: cmd.y,
        });
        xCurr = cmd.x;
        yCurr = cmd.y;
        break;
      case "Z":
        // close the curve
        curves.push({
          x0: xCurr,
          y0: yCurr,
          x1: (xStart + xCurr) / 2,
          y1: (yStart + yCurr) / 2,
          x2: xStart,
          y2: yStart,
        });
        break;
      case "C":
        // unhandled
        break;
    }
  }
  return curves;
}
