async function main() {
  // Set up WebGPU

  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("canvas#main");
  if (!canvas) {
    console.error("Could not find canvas");
    return;
  }
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
  })

  const module = device.createShaderModule({
    label: "red triangle",
    code: /* wgsl */ `
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex: u32
      ) -> @builtin(position) vec4f {
        let pos = array(
          vec2f(0.0, 0.5),
          vec2f(-0.5, -0.5),
          vec2f(0.5, -0.5),
        );
        return vec4f(pos[vertexIndex], 0.0, 1.0);
      }

      @fragment fn fs() -> @location(0) vec4f {
        return vec4f(1.0, 0.0, 0.0, 1.0);
      }
    `
  })

  const pipeline = device.createRenderPipeline({
    label: "pipeline",
    layout: "auto",
    vertex: {
      entryPoint: "vs",
      module,
    },
    fragment: {
      entryPoint: "fs",
      module,
      targets: [{ format }],
    },
  });

  /** @type {GPURenderPassDescriptor} */
  const renderPassDescriptor = {
    label :"canvas render pass",
    colorAttachments: [
      {
        clearValue: [0.3, 0.3, 0.3, 1],
        loadOp: "clear",
        storeOp: "store",
      }
    ]
  }

  function render() {
    renderPassDescriptor.colorAttachments[0].view =
      context.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder({ label: "encoder" });

    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  render();
}

main();
