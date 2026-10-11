// Host for the Figma "Shape-based particles" shader (js/shaders/). It plays the
// role of Figma's shader runtime: the input texture is the source image drawn
// at the canvas's CSS size, and setup()/render() receive the same frame shape
// ({ input, output, time, deltaTime, mousePosition, params, state }).
//
// Without WebGPU, or with reduced motion, the same rest-state stipple is drawn
// once with Canvas 2D, so the graphic is always present.

import * as effect from "./shaders/shape-based-particles.js";

// Parameters as set on the "Object" layers in the Figma file.
export const PARAMS = {
  backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
  dotDensity: 36,
  mouseSpring: 33,
  mouseShape: "Pinch",
  particleBlend: "Normal",
  mouseDamping: 80,
  particleSoftness: 0,
  particleGradient: {
    stops: [
      { position: 0, color: { r: 0.5989896059036255, g: 0.3567749857902527, b: 0.41732871532440186, a: 1 } },
      { position: 1, color: { r: 0.6000000238418579, g: 0.35686275362968445, b: 0.4156862795352936, a: 1 } },
    ],
  },
  arrangement: "Noise",
  mouseZOffset: 200,
  mouseRadius: 220,
  threshold: 44,
  dotScale: 25,
  mode: 0,
  mouseScale: 0,
  sourceMix: 0,
  mouseStrength: 16,
};

// In Figma the image sits 1.11% / 3.52% inside the layer and keeps the
// layer's size, so it is clipped slightly on the right and bottom.
const IMAGE_OFFSET = { x: 0.0111, y: 0.0352 };

let devicePromise = null;
function acquireDevice() {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (!navigator.gpu) throw new Error("WebGPU unsupported");
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter");
      const device = await adapter.requestDevice();
      device.addEventListener("uncapturederror", (e) => console.warn("WebGPU:", e.error.message));
      return device;
    })();
    devicePromise.catch(() => { devicePromise = null; });
  }
  return devicePromise;
}

function loadImage(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img.decode().then(() => img);
}

function cssSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
}

// The source image laid out as the Figma layer, at the canvas's CSS size.
function rasterizeSource(img, width, height) {
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext("2d");
  ctx.drawImage(img, IMAGE_OFFSET.x * width, IMAGE_OFFSET.y * height, width, height);
  return scratch;
}

/* ---------- Canvas 2D: the shader's rest state, drawn once ---------- */

function fract(x) { return x - Math.floor(x); }

function drawStatic(canvas, img) {
  const { width, height } = cssSize(canvas);
  canvas.width = width;
  canvas.height = height;
  const source = rasterizeSource(img, width, height).getContext("2d").getImageData(0, 0, width, height).data;

  const ctx = canvas.getContext("2d");
  const bg = PARAMS.backgroundColor;
  ctx.fillStyle = `rgb(${bg.r * 255}, ${bg.g * 255}, ${bg.b * 255})`;
  ctx.fillRect(0, 0, width, height);

  // Same mapping as render(): density -> grid spacing, scale -> radius.
  const gridSize = Math.max(2, Math.min(32, 400 / (10 + PARAMS.dotDensity * 1.9)));
  const radius = gridSize * (PARAMS.dotScale / 100) * 0.5;
  const threshold = PARAMS.threshold / 100;
  const c = PARAMS.particleGradient.stops[0].color;
  ctx.fillStyle = `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})`;
  if (radius < 0.5) return;

  const cellsX = Math.ceil(width / gridSize);
  const cellsY = Math.ceil(height / gridSize);
  ctx.beginPath();
  for (let row = 0; row < cellsY; row++) {
    for (let col = 0; col < cellsX; col++) {
      // "Noise" arrangement: hash2() jitter from the particle-gen pass.
      const hx = fract(Math.sin(col * 127.1 + row * 311.7) * 43758.5453);
      const hy = fract(Math.sin(col * 269.5 + row * 183.3) * 43758.5453);
      const x = (col + hx) * gridSize;
      const y = (row + hy) * gridSize;
      if (x >= width || y >= height) continue;
      const alpha = source[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] / 255;
      if (alpha < threshold) continue;
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

/* ---------- WebGPU: the shader itself ---------- */

async function runShader(canvas, img, { animate }) {
  const device = await acquireDevice();
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("No WebGPU canvas context");
  const format = "rgba8unorm";
  context.configure({ device, format, alphaMode: "premultiplied" });

  const frame = {
    gpu: { device, context, format },
    input: null,
    output: null,
    time: 0,
    deltaTime: 0,
    frame: 0,
    // Undefined until the pointer is seen, which the shader treats as "no mouse".
    mousePosition: { x: undefined, y: undefined, down: false },
    renderScale: 1,
    dpr: 1,
    params: PARAMS,
    state: {},
  };

  // The shader works in CSS pixels (grid spacing and mouse radius are in px),
  // so the canvas backing store matches its CSS size.
  function allocate() {
    const { width, height } = cssSize(canvas);
    canvas.width = width;
    canvas.height = height;
    frame.input?.destroy();
    frame.input = device.createTexture({
      size: [width, height, 1],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: rasterizeSource(img, width, height) },
      { texture: frame.input, premultipliedAlpha: true },
      [width, height],
    );
  }

  function paint() {
    frame.output = context.getCurrentTexture();
    effect.render(device, frame);
  }

  allocate();
  effect.setup(device, frame);
  paint();

  if (!animate) return;

  let raf = null;
  let last = null;
  let onScreen = false;
  const tick = (ts) => {
    raf = requestAnimationFrame(tick);
    frame.deltaTime = last == null ? 0 : ts - last;
    last = ts;
    frame.time += frame.deltaTime;
    frame.frame += 1;
    paint();
  };
  const start = () => {
    if (raf == null && onScreen && !document.hidden) {
      last = null;
      raf = requestAnimationFrame(tick);
    }
  };
  const stop = () => {
    if (raf != null) cancelAnimationFrame(raf);
    raf = null;
  };

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    onScreen ? start() : stop();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  let resizeQueued = false;
  new ResizeObserver(() => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      const { width, height } = cssSize(canvas);
      if (width === canvas.width && height === canvas.height) return;
      allocate();
      paint();
    });
  }).observe(canvas);

  const pointer = frame.mousePosition;
  window.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.x = undefined;
    pointer.y = undefined;
  });
}

export async function mountParticles(canvas) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let img;
  try {
    img = await loadImage(canvas.dataset.src);
  } catch {
    canvas.hidden = true;
    return;
  }

  if (!reducedMotion && "gpu" in navigator) {
    try {
      await runShader(canvas, img, { animate: true });
      canvas.dataset.renderer = "webgpu";
      return;
    } catch (error) {
      console.warn("Particle shader unavailable, drawing a static stipple instead.", error);
      // A canvas that has had a webgpu context can't switch to 2d, so swap it.
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      canvas = fresh;
    }
  }

  drawStatic(canvas, img);
  canvas.dataset.renderer = "2d";
  let lastWidth = canvas.width;
  new ResizeObserver(() => {
    const { width } = cssSize(canvas);
    if (width === lastWidth) return;
    lastWidth = width;
    drawStatic(canvas, img);
  }).observe(canvas);
}
