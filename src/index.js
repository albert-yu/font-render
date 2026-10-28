import { parse } from "opentype.js";
import { mat4, vec3 } from "webgpu-matrix";
import shaderCode from "./shader.wgsl?raw";

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

  // biome-ignore format: preserve layout
  const vertexArray = new Float32Array([
    // x   y    u    v
    -1.0, -1.0, 0.0, 0.0,  // b0
     0.0,  1.0, 0.5, 0.0,  // b1
     1.0, -1.0, 1.0, 1.0,  // b2
  ]);

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

  const module = device.createShaderModule({
    label: "main module",
    code: shaderCode,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: "uniform bind group layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    label: "uniform bind group",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
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
  const arrayStride = 4 * BYTES_PER_FLOAT;

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
            {
              shaderLocation: 1,
              offset: 2 * BYTES_PER_FLOAT,
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

  // Read the font data
  const LETTER = "R";
  const glyph = font.charToGlyph(LETTER);
  console.log(glyph.path.commands);

  const { xMin, xMax, yMin, yMax } = glyph;

  // const normalized = 1 / (yMax - yMin);
  // const scale = vec3.create(normalized, normalized, normalized);
  // mat4.scale(transform, scale, transform);

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
    pass.draw(3);
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
