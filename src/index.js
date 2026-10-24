import { parse } from "opentype.js";
import { mat4 } from "webgpu-matrix";

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

  // Read the font data
  const LETTER = "R";
  console.log(font.charToGlyph(LETTER).path.commands);

  // biome-ignore format: preserve layout
  const vertexArray = new Float32Array([
    // x   y    u    v
    -0.5, -0.5, 0.0, 0.0,  // b0
     0.0,  0.5, 0.5, 0.0,  // b1
     0.5, -0.5, 1.0, 1.0,  // b2
  ]);

  const vertexBuffer = device.createBuffer({
    size: vertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexArray);

  const uniformArr = mat4.identity();

  const uniformBuffer = device.createBuffer({
    size: uniformArr.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformArr);

  const module = device.createShaderModule({
    label: "main module",
    code: /* wgsl */ `
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
    `,
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

  function render() {
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
