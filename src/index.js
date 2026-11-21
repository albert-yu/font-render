import { parse } from "opentype.js";
import { mat4, vec3 } from "webgpu-matrix";
import shaderCode from "./shader.wgsl?raw";

/** @import { PathCommand } from "opentype.js" */
/** @import { Mat4 } from "webgpu-matrix" */

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

  // Read the font data
  const LETTER = "家";
  const glyph = font.charToGlyph(LETTER);
  const curves = convertCommandsToCurves(glyph.path.commands);
  const { xMin = 0, xMax = 0, yMin = 0, yMax = 0 } = glyph;

  const FLOATS_PER_VERTEX = 2;
  // biome-ignore format: preserve layout
  const vertexArray = new Float32Array([
    // quad
    xMin, yMax,
    xMin, yMin,
    xMax, yMin,

    xMax, yMin,
    xMax, yMax,
    xMin, yMax,
  ])

  const vertexBuffer = device.createBuffer({
    size: vertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexArray);

  const glyphH = yMax - yMin;
  const centerX = (xMin + xMax) / 2;
  const centerY = (yMin + yMax) / 2;
  const viewHeight = glyphH * 1.5;
  const viewWidth = (viewHeight * canvas.width) / canvas.height;

  const transform = mat4.ortho(
    centerX - viewWidth / 2,
    centerX + viewWidth / 2,
    centerY - viewHeight / 2,
    centerY + viewHeight / 2,
    -1,
    1,
  );

  handlePanZoom(canvas, transform);

  const uniformBuffer = device.createBuffer({
    size: transform.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

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
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();

async function fetchFont() {
  const res = await fetch(
    "fonts/NotoSerifSC/NotoSerifSC-VariableFont_wght.ttf",
  );
  const buf = await res.arrayBuffer();
  const font = parse(buf);
  return font;
}

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

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Mat4} transform
 * @returns {() => void} cleanup
 */
function handlePanZoom(canvas, transform) {
  /**
   * @param {WheelEvent} e
   */
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const dy = -e.deltaY;
      const ZOOM_SPEED = 0.01;

      const dk = Math.pow(2, dy * ZOOM_SPEED);

      const scale = mat4.scaling([dk, dk, 1]);

      const rect = canvas.getBoundingClientRect();
      // Map points to [-1, 1] clip space
      const ptX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      // y-axis in screen space is inverted.
      // It increases as it goes down, but in clip space,
      // it's the opposite.
      const ptY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      const tp = mat4.translation([ptX, ptY, 0]);
      const invTp = mat4.inverse(tp);
      const t = mat4.multiply(tp, mat4.multiply(scale, invTp));
      mat4.multiply(t, transform, transform);
      return;
    }
    const SCROLL_SPEED = 0.005;
    const [k] = mat4.getScaling(transform);
    const dx = (e.deltaX * -SCROLL_SPEED * 1) / k;
    const dy = (e.deltaY * SCROLL_SPEED * 1) / k;
    mat4.translate(transform, vec3.create(dx, dy), transform);
  };
  canvas.addEventListener("wheel", handleWheel);
  return () => {
    canvas.removeEventListener("wheel", handleWheel);
  };
}
