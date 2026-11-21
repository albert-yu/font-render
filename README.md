# Font render

> [!NOTE]
> No LLMs were used in authoring the code

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
