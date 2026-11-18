# Font render

> [!NOTE]
> I did not use LLMs to author any of the code, but I did use
> it to help me understand the concepts.

Rendering a font using WebGPU and JavaScript, based
primarily on [GreenLightning's C++/GLSL project][green-lightning].
I've simplified it to make the core concept of generating and
rasterizing curve data clearer.

## Development

This project uses [Vite](https://vite.dev/).

```sh
npm install
npm run dev
```

[green-lightning]: https://github.com/GreenLightning/gpu-font-rendering
