// "Shape-based particles" Figma shader effect, vendored verbatim from the
// exported source (main.ts). Only the `figma:shaders` import is replaced:
// defineProperties() is editor-only metadata, so it is a no-op here.
function defineProperties(_component, _properties) {}

// Figma shader module: exports setup(device, frame) and render(device, frame).

export default function Effect() {}

export function setup(device, frame) {
  // ── Pass 1: Combined XY and Z simulation update ──
  // A single fullscreen pass writes both rgba16float ping-pong targets.
  // Attachment 0 stores XY velocity/displacement; attachment 1 stores
  // Z velocity/displacement plus the spring-smoothed mouse response.
  var velWgsl = `diagnostic(off,derivative_uniformity);
struct VelUniforms {
  mousePx:      vec4f,
  gridParams:   vec4f,
  mouseParams:  vec4f,
  timeDelta:    vec4f,
};
@group(0) @binding(0) var<uniform> u: VelUniforms;
@group(0) @binding(1) var prevVel: texture_2d<f32>;
@group(0) @binding(2) var prevVelZ: texture_2d<f32>;
struct VsIn  { @location(0) pos: vec2f, @location(1) uv: vec2f };
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };
struct FsOut { @location(0) xy: vec4f, @location(1) z: vec4f };
fn shapeMouseFalloff(distance: f32, radius: f32, shape: f32) -> f32 {
  let t = clamp(distance / max(radius, 1.0), 0.0, 1.0);
  // Every profile reaches zero with a smooth slope at the radius boundary.
  if (shape < 0.5) {
    // Plateau: a broad, nearly uniform centre with a rounded outer rim.
    return 1.0 - smoothstep(0.65, 1.0, t);
  }
  if (shape < 1.5) {
    // Dome: preserve the established spherical profile.
    return pow(max(1.0 - t * t, 0.0), 1.5);
  }
  if (shape < 2.5) {
    // Pinch: a deliberately narrow response concentrated at the mouse.
    let pinchBase = 1.0 - smoothstep(0.0, 1.0, t);
    return pinchBase * pinchBase * pinchBase * pinchBase;
  }
  if (shape < 3.5) {
    // Ring: no response at the centre, strongest halfway to the edge.
    let ring = sin(3.14159265 * t);
    return ring * ring;
  }
  // Wave: three non-negative concentric pulses inside a soft envelope.
  // Keeping the signal non-negative avoids reversing XY force or Z direction.
  let envelope = 1.0 - smoothstep(0.0, 1.0, t);
  let rings = 0.15 + 0.85 * (0.5 + 0.5 * cos(18.8495559 * t));
  return envelope * rings;
}
fn dragFollowAmount(velocityRetention: f32, dt: f32) -> f32 {
  if (dt <= 0.0) { return 0.0; }
  // Damping 0–100% maps to retention 1.0–0.625 and drag 0.0–1.5.
  let drag = clamp((1.0 - velocityRetention) * 4.0, 0.0, 1.5);
  if (drag <= 0.0001) { return 1.0; }
  let perFrameFollow = exp2(-4.0 * drag);
  return 1.0 - pow(max(1.0 - perFrameFollow, 0.0), dt * 60.0);
}
fn closestPointOnSegment(point: vec2f, start: vec2f, end: vec2f) -> vec2f {
  let segment = end - start;
  let segmentLengthSq = dot(segment, segment);
  let amount = clamp(dot(point - start, segment) / max(segmentLengthSq, 0.0001), 0.0, 1.0);
  return start + segment * amount;
}
@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}
@fragment fn fs_main(in: VsOut) -> FsOut {
  let cellsX   = u.gridParams.y;
  let cellsY   = u.gridParams.z;
  let gridSize = u.gridParams.x;
  let cellCoord = vec2f(floor(in.uv * vec2f(cellsX, cellsY)));
  let cc = clamp(cellCoord, vec2f(0.0), vec2f(cellsX - 1.0, cellsY - 1.0));
  let cellCenter = (cc + vec2f(0.5)) * gridSize;
  let texCoord = vec2i(i32(cc.x), i32(cc.y));
  let prevXY = textureLoad(prevVel, texCoord, 0);
  let prevZ  = textureLoad(prevVelZ, texCoord, 0);
  var vel  = prevXY.xy;
  var disp = prevXY.zw;
  var zVel  = prevZ.x;
  var zDisp = prevZ.y;
  var responseVel = prevZ.z;
  var response = prevZ.w;
  let mousePx      = u.mousePx.xy;
  let mouseRadius = u.mouseParams.x;
  let velocityRetention = u.mouseParams.y;
  let mouseShape = u.mouseParams.z;
  let mouseZOffset = u.mouseParams.w;
  let mouseStrength = u.mousePx.w;
  let mouseStrengthScale = mouseStrength / 300.0;
  let dt           = u.timeDelta.x;
  let previousMousePx = u.timeDelta.yz;
  let mouseSpringMultiplier = u.mousePx.z;
  // Physics is calibrated to the 8px spacing produced by Dot density 50%.
  // Actual grid spacing only changes topology—not response strength or timing.
  let physicsGridSize = 8.0;
  let baseStiffness = 300.0 / (14.0 * physicsGridSize);
  let stiffness = baseStiffness * mouseSpringMultiplier;
  let springMix = clamp(mouseSpringMultiplier, 0.0, 1.0);
  let radiusScale = clamp(mouseRadius / 400.0, 0.0, 1.0);
  // Advance through ordered positions along this frame's mouse path. Squared
  // distances avoid two square roots when deciding whether substeps are needed.
  let mouseDelta = mousePx - previousMousePx;
  let mouseTravelSq = dot(mouseDelta, mouseDelta);
  let closestPathPx = closestPointOnSegment(cellCenter, previousMousePx, mousePx);
  let pathDelta = cellCenter - closestPathPx;
  let pathDistanceSq = dot(pathDelta, pathDelta);
  var substepCount = 1u;
  if (mouseTravelSq > 0.25 && mouseRadius > 0.0 && pathDistanceSq < mouseRadius * mouseRadius) { substepCount = 8u; }
  let substepCountF = f32(substepCount);
  let subDt = dt / substepCountF;
  let substepRetention = pow(clamp(velocityRetention, 0.0, 1.0), 1.0 / substepCountF);
  let directFollow = dragFollowAmount(velocityRetention, subDt);

  for (var sampleIndex = 0u; sampleIndex < 8u; sampleIndex = sampleIndex + 1u) {
    if (sampleIndex >= substepCount) { break; }
    let sampleAmount = f32(sampleIndex + 1u) / substepCountF;
    let sampledMousePx = mix(previousMousePx, mousePx, sampleAmount);
    let toMouse = cellCenter - sampledMousePx;
    let dist = length(toMouse);
    var targetResponse = 0.0;
    var targetDisp = vec2f(0.0);
    if (dist < mouseRadius) {
      let falloff = shapeMouseFalloff(dist, mouseRadius, mouseShape);
      targetResponse = falloff;
      if (dist > 0.001) {
        let force = normalize(toMouse) * falloff * mouseStrength * radiusScale;
        targetDisp = force / baseStiffness;
      }
    }

    vel = vel + (targetDisp - disp) * stiffness * subDt * 60.0;
    vel = vel * substepRetention;
    let springDisp = disp + vel * subDt;
    let draggedDisp = mix(disp, targetDisp, directFollow);
    disp = mix(draggedDisp, springDisp, springMix);
    vel = vel * springMix;

    zVel = zVel + (-stiffness * zDisp) * subDt * 60.0;
    let zTarget = -mouseZOffset * targetResponse;
    let diff = zTarget - zDisp;
    zVel = zVel + diff * 8.0 * mouseStrengthScale * mouseSpringMultiplier * subDt * 60.0 * targetResponse;
    zVel = zVel * substepRetention;
    let springZDisp = zDisp + zVel * subDt;

    responseVel = responseVel + (targetResponse - response) * stiffness * subDt * 60.0;
    responseVel = responseVel * substepRetention;
    let springResponse = response + responseVel * subDt;

    let directZTarget = -mouseZOffset * targetResponse * mouseStrengthScale;
    let draggedZDisp = mix(zDisp, directZTarget, directFollow);
    let draggedResponse = mix(response, targetResponse, directFollow);

    zDisp = mix(draggedZDisp, springZDisp, springMix);
    response = mix(draggedResponse, springResponse, springMix);
    zVel = zVel * springMix;
    responseVel = responseVel * springMix;
  }
  var out: FsOut;
  out.xy = vec4f(vel, disp);
  out.z  = vec4f(zVel, zDisp, responseVel, response);
  return out;
}
`;
  // ── Pass 3: Particle gen compute ──
  // Reads velXY, velZ, input textures → writes particle storage buffer
  // struct Particle { posRad: vec4f, colorAlpha: vec4f }
  //   posRad.x = projected center X (output pixels)
  //   posRad.y = projected center Y (output pixels)
  //   posRad.z = finalRadius
  //   posRad.w = normalized camera depth (0.0 = inactive/clipped)
  //   colorAlpha = particle color + alpha
  var particleGenWgsl = `diagnostic(off,derivative_uniformity);
struct GradientStop {
  color: vec4f,
  data:  vec4f,
};
struct SU {
  frameData:    vec4f,
  inputDims:    vec4f,
  gridParams:   vec4f,
  dotAndInput:  vec4f,
  renderParams: vec4f,
  extraParams:  vec4f,
  mouseData:    vec4f,
  gradientStops: array<GradientStop, 8>,
  gradientMeta: vec4f,
};
struct Particle {
  posRad:     vec4f,
  colorAlpha: vec4f,
};
@group(0) @binding(0) var<uniform> u: SU;
@group(0) @binding(1) var inputTex:  texture_2d<f32>;
@group(0) @binding(2) var velXYTex:  texture_2d<f32>;
@group(0) @binding(3) var velZTex:   texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> particles: array<Particle>;

fn hash2(p: vec2f) -> vec2f {
  var q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}

fn sampleParticleGradient(value: f32) -> vec4f {
  let t = clamp(value, 0.0, 1.0);
  let stopCount = u32(clamp(round(u.gradientMeta.x), 1.0, 8.0));
  var previous = u.gradientStops[0];
  for (var i = 1u; i < 8u; i = i + 1u) {
    if (i >= stopCount) { break; }
    let next = u.gradientStops[i];
    if (t <= next.data.x) {
      let span = max(next.data.x - previous.data.x, 0.0001);
      let amount = clamp((t - previous.data.x) / span, 0.0, 1.0);
      return mix(previous.color, next.color, amount);
    }
    previous = next;
  }
  return previous.color;
}

fn loadInputAt(worldPx: vec2f) -> vec4f {
  let iW   = i32(u.inputDims.x);
  let iH   = i32(u.inputDims.y);
  let iPad = i32(u.inputDims.z);
  let px   = i32(floor(worldPx.x));
  let py   = i32(floor(worldPx.y));
  if (px < 0 || py < 0 || px >= iW || py >= iH) { return vec4f(0.0); }
  return textureLoad(inputTex, vec2i(px + iPad, py + iPad), 0);
}

fn loadInput(cellX: u32, cellY: u32) -> vec4f {
  let gs = u.gridParams.x;
  let px = i32(round(f32(cellX) * gs + gs * 0.5));
  let py = i32(round(f32(cellY) * gs + gs * 0.5));
  let iW = i32(u.inputDims.x);
  let iH = i32(u.inputDims.y);
  let iPad = i32(u.inputDims.z);
  if (px < 0 || py < 0 || px >= iW || py >= iH) { return vec4f(0.0); }
  return textureLoad(inputTex, vec2i(px + iPad, py + iPad), 0);
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let cellsX = u32(u.gridParams.y);
  let cellsY = u32(u.gridParams.z);
  let cx = gid.x;
  let cy = gid.y;

  let particleIdx = cy * cellsX + cx;
  let totalParticles = cellsX * cellsY;

  // Out-of-bounds invocations: just bail. Each valid slot is written by exactly
  // one in-bounds invocation, so we must not alias-write zeros into valid slots.
  if (cx >= cellsX || cy >= cellsY) { return; }

  var particle = Particle(vec4f(0.0), vec4f(0.0));

  let gs           = u.gridParams.x;
  let outPad       = u.frameData.w;
  let inPad        = u.inputDims.z;
  let iDims        = u.inputDims.xy;
  let outW         = u.frameData.y;
  let outH         = u.frameData.z;
  let ds           = u.dotAndInput.x;
  // 0 Alpha, 1 Inverse Alpha, 2 Luma, 3 Inverse Luma.
  let inputMode    = i32(round(u.dotAndInput.w));
  let perspective  = u.renderParams.x;
  let threshold    = u.renderParams.y;
  let mouseStrengthScale = u.extraParams.x;
  let mouseZOffset = u.extraParams.z;
  let arrangement  = i32(round(u.extraParams.w));
  let mousePx      = u.mouseData.xy;
  let mouseRadius  = u.mouseData.z;
  let mouseScale   = u.mouseData.w;

  // Compute rest (home) position based on arrangement
  var restX: f32;
  var restY: f32;
  let col = f32(cx);
  let row = f32(cy);
  if (arrangement == 1) {
    // Noise: jitter rest position, then sample at that visual position
    // so cull/brightness decisions match where the particle actually appears
    let h = hash2(vec2f(col, row));
    restX = (col + 0.5 + (h.x - 0.5)) * gs;
    restY = (row + 0.5 + (h.y - 0.5)) * gs;
  } else {
    // Grid (default): cell center — sample directly, no round-trip
    restX = (col + 0.5) * gs;
    restY = (row + 0.5) * gs;
  }

  if (restX < 0.0 || restY < 0.0 || restX >= iDims.x || restY >= iDims.y) {
    particles[particleIdx] = particle;
    return;
  }
  let smp = loadInputAt(vec2f(restX, restY));
  var signal = clamp(smp.a, 0.0, 1.0);
  if (inputMode >= 2) {
    let luma = dot(smp.rgb / max(smp.a, 0.0001), vec3f(0.2126, 0.7152, 0.0722));
    signal = clamp(luma, 0.0, 1.0);
  }
  let doInvert = inputMode == 1 || inputMode == 3;
  if (doInvert) { signal = 1.0 - signal; }

  if (signal < threshold) { particles[particleIdx] = particle; return; }

  // Input alpha/luma is only the inclusion gate. Every surviving particle uses
  // the same base radius so Dot scale is independent of source brightness.
  let maxRadius = gs * ds * 0.5;
  let dotRadius = maxRadius;
  if (dotRadius < 0.5) { particles[particleIdx] = particle; return; }

  let velXY = textureLoad(velXYTex, vec2i(i32(cx), i32(cy)), 0);
  let velZ  = textureLoad(velZTex,  vec2i(i32(cx), i32(cy)), 0);
  let xDisp = velXY.z;
  let yDisp = velXY.w;
  let zDisp = velZ.y;
  let simulatedMouseInfluence = clamp(velZ.w, 0.0, 1.0);

  let centerX = iDims.x * 0.5;
  let centerY = iDims.y * 0.5;
  let wx0 = restX - centerX;
  let wy0 = restY - centerY;
  let wx = wx0 + xDisp;
  let wy = wy0 + yDisp;

  // Reserve 15% of the Z response for a proximity term, but use the simulated
  // response rather than raw mouse distance so it follows spring/damping timing.
  let effectiveZ = zDisp - mouseZOffset * simulatedMouseInfluence * mouseStrengthScale * 0.15;

  // XY projection uses mouse-induced Z displacement for perspective.
  let denomXY = max(perspective + effectiveZ, 1.0);
  let projX = perspective * wx / denomXY + centerX;
  let projY = perspective * wy / denomXY + centerY;
  let particleDepth = 0.05 + 0.9 * clamp(denomXY / max(perspective, 1.0), 0.0, 1.0);
  let directMouseScale = max(0.01, 1.0 + simulatedMouseInfluence * mouseScale * 0.01);
  let projRadius = dotRadius * perspective / max(perspective + effectiveZ, 1.0) * directMouseScale;
  let finalRadius = projRadius;
  if (finalRadius < 0.5) { particles[particleIdx] = particle; return; }

  let dColor = sampleParticleGradient(simulatedMouseInfluence);

  let offX  = inPad + outPad;
  let offY  = inPad + outPad;
  let outCX = projX + offX;
  let outCY = projY + offY;

  // Clip particles that are entirely outside the output
  if (outCX + finalRadius < 0.0 || outCX - finalRadius > outW ||
      outCY + finalRadius < 0.0 || outCY - finalRadius > outH) {
    particles[particleIdx] = particle;
    return;
  }

  let alpha = dColor.a;
  particle.posRad = vec4f(outCX, outCY, finalRadius, particleDepth);
  particle.colorAlpha = vec4f(dColor.rgb, alpha);
  particles[particleIdx] = particle;
}
`

  // ── Pass 4: Nearest-depth prepass ──
  // Writes only the solid core of each particle. Soft edges remain available to
  // blend in the color pass instead of becoming hard depth cutouts.
  var depthPrepassWgsl = `diagnostic(off,derivative_uniformity);
struct Particle {
  posRad:     vec4f,
  colorAlpha: vec4f,
};
struct ScatterDims { dims: vec4f };
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> sd: ScatterDims;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) localPx: vec2f,
  @location(1) radius: f32,
};

@vertex fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
) -> VsOut {
  var out: VsOut;
  let p = particles[iid];
  let radius = p.posRad.z;
  if (radius < 0.5) {
    out.position = vec4f(10.0, 10.0, 1.0, 1.0);
    out.localPx = vec2f(0.0);
    out.radius = 0.0;
    return out;
  }
  var corners = array<vec2f, 4>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0,  1.0),
  );
  let corner = corners[vid];
  let halfExt = radius + 2.0;
  let px = p.posRad.x + corner.x * halfExt;
  let py = p.posRad.y + corner.y * halfExt;
  let nx = px / sd.dims.x * 2.0 - 1.0;
  let ny = -(py / sd.dims.y * 2.0 - 1.0);
  out.position = vec4f(nx, ny, p.posRad.w, 1.0);
  out.localPx = corner * halfExt;
  out.radius = radius;
  return out;
}

@fragment fn fs_main(in: VsOut) {
  let d = length(in.localPx);
  let feather = max(1.0, in.radius * clamp(sd.dims.w, 0.0, 1.0));
  let edge = 1.0 - smoothstep(in.radius - feather, in.radius + 1.0, d);
  // Only the more opaque part of a soft particle writes nearest depth. Its
  // translucent halo remains available to the weighted color pass below.
  if (edge < 0.5) { discard; }
}
`

  // ── Pass 5: Scatter instanced render ──
  // One quad (6 verts) per particle instance, NO vertex buffers
  // Particles accumulate additively into the scatter texture.
  var scatterRenderWgsl = `diagnostic(off,derivative_uniformity);
struct Particle {
  posRad:     vec4f,
  colorAlpha: vec4f,
};
struct ScatterDims { dims: vec4f };
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> sd: ScatterDims;
@group(0) @binding(2) var nearestDepthTex: texture_depth_2d;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) localPx: vec2f,
  @location(1) radius: f32,
  @location(2) color: vec4f,
  @location(3) particleDepth: f32,
};

@vertex fn vs_main(
  @builtin(vertex_index)   vid: u32,
  @builtin(instance_index) iid: u32,
) -> VsOut {
  var out: VsOut;

  let p = particles[iid];
  let radius = p.posRad.z;

  // Degenerate vertex for inactive or tiny particles
  if (radius < 0.5) {
    out.position = vec4f(10.0, 10.0, 0.0, 1.0);
    out.localPx  = vec2f(0.0);
    out.radius   = 0.0;
    out.color    = vec4f(0.0);
    out.particleDepth = 1.0;
    return out;
  }

  var corners = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0),
  );

  let outW = sd.dims.x;
  let outH = sd.dims.y;
  let corner  = corners[vid];
  let halfExt = radius + 2.0;
  let px = p.posRad.x + corner.x * halfExt;
  let py = p.posRad.y + corner.y * halfExt;

  // Pixel coords to NDC (y-flip: screen y down, NDC y up)
  let nx = px / outW * 2.0 - 1.0;
  let ny = -(py / outH * 2.0 - 1.0);

  out.position = vec4f(nx, ny, 0.0, 1.0);
  out.localPx  = corner * halfExt;
  out.radius   = radius;
  out.color    = p.colorAlpha;
  out.particleDepth = p.posRad.w;
  return out;
}

@fragment fn fs_main(in: VsOut) -> @location(0) vec4f {
  let d    = length(in.localPx);
  let feather = max(1.0, in.radius * clamp(sd.dims.w, 0.0, 1.0));
  let edge = 1.0 - smoothstep(in.radius - feather, in.radius + 1.0, d);
  if (edge < 0.001) { discard; }
  let a = in.color.a * edge;
  var depthWeight = 1.0;
  if (sd.dims.z > 0.5) {
    let nearestDepth = textureLoad(nearestDepthTex, vec2i(in.position.xy), 0);
    let depthDelta = max(in.particleDepth - nearestDepth, 0.0);
    depthWeight = exp2(-depthDelta * 256.0);
  }
  let weightedAlpha = a * depthWeight;
  return vec4f(in.color.rgb * weightedAlpha, weightedAlpha);
}
`

  // ── Pass 6: Composite the optional input, background, and particles ──
  var blitWgsl = `diagnostic(off,derivative_uniformity);
struct BlitUniforms {
  bgColor: vec4f,
  params:  vec4f,
}
@group(0) @binding(0) var scatterTex: texture_2d<f32>;
@group(0) @binding(1) var inputTex:   texture_2d<f32>;
@group(0) @binding(2) var<uniform> bu: BlitUniforms;
struct VsIn  { @location(0) pos: vec2f, @location(1) uv: vec2f }
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims    = vec2f(textureDimensions(scatterTex));
  let tc      = vec2i(i32(uv.x * dims.x), i32(uv.y * dims.y));
  let scatter = textureLoad(scatterTex, tc, 0);
  let premultBg = vec4f(bu.bgColor.rgb * bu.bgColor.a, bu.bgColor.a);
  let sourceMix = clamp(bu.params.x, 0.0, 1.0);
  var base = premultBg;
  if (sourceMix > 0.0) {
    let iDims = vec2i(textureDimensions(inputTex));
    let outPx = vec2i(floor(uv * dims));
    let inputOffset = i32(round(bu.params.w - bu.params.z));
    let itc = outPx + vec2i(inputOffset);
    var inputPx = vec4f(0.0);
    if (itc.x >= 0 && itc.y >= 0 && itc.x < iDims.x && itc.y < iDims.y) {
      inputPx = textureLoad(inputTex, itc, 0);
    }
    let inputLayer = inputPx * sourceMix;
    base = inputLayer + premultBg * (1.0 - inputLayer.a);
  }
  // Scatter stores locally depth-weighted premultiplied color and coverage.
  let summedAlpha = max(scatter.a, 0.0);
  let particleAlpha = clamp(summedAlpha, 0.0, 1.0);
  let averageRgb = scatter.rgb / max(summedAlpha, 0.00001);
  // Normal resolves overlapping samples to their weighted average. Add keeps
  // their accumulated premultiplied RGB while retaining the same coverage and
  // Z visibility, so blend mode never changes which particles are considered.
  var particleRgb = averageRgb * particleAlpha;
  if (bu.params.y > 0.5) {
    particleRgb = scatter.rgb;
  }
  let particles = vec4f(particleRgb, particleAlpha);
  let outColor  = particles + base * (1.0 - particles.a);
  return outColor;
}
`

  frame.state.velModule          = device.createShaderModule({ code: velWgsl })
  frame.state.particleGenModule  = device.createShaderModule({ code: particleGenWgsl })
  frame.state.depthPrepassModule = device.createShaderModule({ code: depthPrepassWgsl })
  frame.state.scatterRenderModule = device.createShaderModule({ code: scatterRenderWgsl })
  frame.state.blitModule         = device.createShaderModule({ code: blitWgsl })

  // Fullscreen quad — used by the combined velocity and blit passes.
  frame.state.quad = device.createBuffer({
    size: 6 * 4 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  })
  new Float32Array(frame.state.quad.getMappedRange()).set([
    -1, -1,   0, 1,
     1, -1,   1, 1,
    -1,  1,   0, 0,
    -1,  1,   0, 0,
     1, -1,   1, 1,
     1,  1,   1, 0,
  ])
  frame.state.quad.unmap()

  // Combined velocity uniform: 4 vec4f = 64 bytes.
  frame.state.velUniformBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // Particle gen uniform: 7 vec4f + 8 gradient stops (2 vec4f each)
  // + 1 metadata vec4f = 24 vec4f = 384 bytes.
  frame.state.particleGenUniformBuf = device.createBuffer({
    size: 384,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // Scatter dims uniform: 1 vec4f = 16 bytes
  frame.state.scatterDimsBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  // Blit uniforms: background color + input blend params = 2 vec4f / 32 bytes
  frame.state.blitUniformBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  frame.state.placeholder = device.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture(
    { texture: frame.state.placeholder },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4 },
    { width: 1, height: 1, depthOrArrayLayers: 1 },
  )

  // Ping-pong texture state (allocated lazily)
  frame.state.velXYTexA = null
  frame.state.velXYTexB = null
  frame.state.velZTexA  = null
  frame.state.velZTexB  = null
  frame.state.velCellsX = 0
  frame.state.velCellsY = 0

  // Particle storage buffer (allocated lazily)
  frame.state.particleBuf      = null
  frame.state.particleBufCount = 0

  // Scatter texture (rgba16float, allocated lazily)
  frame.state.scatterTex  = null
  frame.state.scatterDepthTex = null
  frame.state.scatterTexW = 0
  frame.state.scatterTexH = 0

  frame.state.velPipelineBuilt        = false
  frame.state.particleGenPipelineBuilt = false
  frame.state.depthPrepassPipeline      = null
  frame.state.scatterRenderPipeline   = null
  frame.state.blitPipeline            = null
  frame.state.blitPipelineFormat      = null

  // Cached resource views and bind groups. Every cache is explicitly
  // invalidated when one of the resources it captures is replaced.
  frame.state.velBindGroups = null
  frame.state.particleGenBindGroups = null
  frame.state.depthPrepassBindGroup = null
  frame.state.scatterRenderBindGroup = null
  frame.state.blitBindGroup = null
  frame.state.inputTextureRef = null
  frame.state.inputView = null

  frame.state.frameIndex  = 0
  frame.state.previousTimelineTime = null
  frame.state.previousMouseValid = false
  frame.state.previousMouseInputX = 0
  frame.state.previousMouseInputY = 0
  frame.state.previousMouseWidth = 0
  frame.state.previousMouseHeight = 0
  frame.state.previousMouseInputPad = 0
  frame.state.previousMouseOutputPad = 0
}

export function render(device, frame) {
  var params = frame.params || {}

  function finiteNumber(value, fallback) {
    var num = Number(value)
    return Number.isFinite(num) ? num : fallback
  }
  function numberParam(name, fallback) {
    return finiteNumber(params[name], fallback)
  }
  function colorParam(name, fallback) {
    var value = params[name] || {}
    return [
      finiteNumber(value.r, fallback[0]),
      finiteNumber(value.g, fallback[1]),
      finiteNumber(value.b, fallback[2]),
      finiteNumber(value.a, fallback[3]),
    ]
  }
  function gradientParam(name, fallbackStops) {
    var value = params[name] || {}
    var inputStops = Array.isArray(value.stops) && value.stops.length
      ? value.stops
      : fallbackStops
    var stops = Array()
    for (var i = 0; i < inputStops.length; i++) {
      var inputStop = inputStops[i] || {}
      var inputColor = inputStop.color || {}
      var fallbackStop = fallbackStops[Math.min(i, fallbackStops.length - 1)]
      var fallbackColor = fallbackStop.color
      stops.push({
        position: Math.max(0, Math.min(1, finiteNumber(inputStop.position, fallbackStop.position))),
        color: [
          finiteNumber(inputColor.r, fallbackColor[0]),
          finiteNumber(inputColor.g, fallbackColor[1]),
          finiteNumber(inputColor.b, fallbackColor[2]),
          finiteNumber(inputColor.a, fallbackColor[3]),
        ],
      })
    }
    stops.sort(function (a, b) { return a.position - b.position })
    if (stops.length === 1) {
      stops = [
        { position: 0, color: stops[0].color },
        { position: 1, color: stops[0].color },
      ]
    }
    // The uniform supports up to eight native gradient stops. If Figma ever
    // supplies more, retain an evenly distributed subset including both ends.
    if (stops.length > 8) {
      var reducedStops = Array()
      for (var stopIndex = 0; stopIndex < 8; stopIndex++) {
        reducedStops.push(stops[Math.round(stopIndex * (stops.length - 1) / 7)])
      }
      stops = reducedStops
    }
    return stops
  }
  function stringParam(name, fallback) {
    var value = params[name]
    if (value && typeof value.characters === "string") { return value.characters }
    return typeof value === "string" ? value : fallback
  }

  var output = frame.output || {}
  var width  = Math.max(1, finiteNumber(output.width, 1))
  var height = Math.max(1, finiteNumber(output.height, 1))
  var time = finiteNumber(frame.time, 0)
  var previousTimelineTime = frame.state.previousTimelineTime
  var timelineMovedBackward = previousTimelineTime != null && time < previousTimelineTime
  frame.state.previousTimelineTime = time

  // Motion timelines can report a large negative delta when their playhead loops.
  // Freeze integration for that one frame so the spring simulation cannot explode.
  var deltaTimeMs = finiteNumber(frame.deltaTime, 16)
  var timeDiscontinuity = timelineMovedBackward || deltaTimeMs < 0
  if (timeDiscontinuity) { deltaTimeMs = 0 }
  var deltaTime = Math.max(0, Math.min(deltaTimeMs, 100)) * 0.001
  var outputPad = finiteNumber(frame.outputPadding, 0)
  var inputPad  = finiteNumber(frame.inputPadding, 0)
  var inputWidth  = Math.max(1, width  - 2 * outputPad)
  var inputHeight = Math.max(1, height - 2 * outputPad)

  var mousePosition = frame.mousePosition || {}
  var mouseX = finiteNumber(mousePosition.x, -9999)
  var mouseY = finiteNumber(mousePosition.y, -9999)
  var mouseInputX = mouseX - (inputPad + outputPad)
  var mouseInputY = mouseY - (inputPad + outputPad)
  var mouseIsValid = mousePosition.x != null && mousePosition.y != null &&
    Number.isFinite(Number(mousePosition.x)) && Number.isFinite(Number(mousePosition.y))
  var mouseSpaceChanged = frame.state.previousMouseWidth !== width ||
    frame.state.previousMouseHeight !== height ||
    frame.state.previousMouseInputPad !== inputPad ||
    frame.state.previousMouseOutputPad !== outputPad
  var previousMouseInputX = mouseInputX
  var previousMouseInputY = mouseInputY
  if (mouseIsValid && frame.state.previousMouseValid && !timeDiscontinuity && !mouseSpaceChanged && deltaTime > 0) {
    previousMouseInputX = frame.state.previousMouseInputX
    previousMouseInputY = frame.state.previousMouseInputY
  }
  // Always advance the endpoint state. Invalid/missing positions deliberately
  // break the sweep so re-entering the frame cannot draw a long teleport path.
  frame.state.previousMouseValid = mouseIsValid
  frame.state.previousMouseInputX = mouseInputX
  frame.state.previousMouseInputY = mouseInputY
  frame.state.previousMouseWidth = width
  frame.state.previousMouseHeight = height
  frame.state.previousMouseInputPad = inputPad
  frame.state.previousMouseOutputPad = outputPad

  // UI percentages are mapped back onto the established physical ranges.
  var dotDensityPercent = Math.max(0, Math.min(100, numberParam("dotDensity", 50)))
  var dotDensity   = 10 + dotDensityPercent * 1.9
  // Keep spacing continuous. Rounding created abrupt spacing and particle-count
  // jumps—especially when crossing from 3px to 2px.
  var gridSize     = Math.max(2, Math.min(32, 400 / dotDensity))
  var dotScale     = Math.max(0.1, Math.min(5, numberParam("dotScale", 100) * 0.01))
  var particleSoftness = Math.max(0, Math.min(100, numberParam("particleSoftness", 0))) * 0.01
  var mouseRadius  = numberParam("mouseRadius", 220)
  var mouseShapeStr = stringParam("mouseShape", "Dome")
  var mouseShapeInt = mouseShapeStr === "Plateau" || mouseShapeStr === "Soft" ? 0
    : mouseShapeStr === "Pinch" ? 2
    : mouseShapeStr === "Ring" ? 3
    : mouseShapeStr === "Wave" ? 4
    : 1
  var mouseStrengthPercent = Math.max(0, Math.min(100, numberParam("mouseStrength", 50)))
  var mouseStrength = mouseStrengthPercent * 2 * 3
  var mouseScale   = Math.max(-100, Math.min(500, numberParam("mouseScale", 100)))
  var mouseZOffset = Math.max(0, Math.min(300, numberParam("mouseZOffset", 150)))
  var depthResolveEnabled = mouseZOffset > 0.001
  var simulatedMouseZOffset = mouseZOffset * 0.85
  var perspective  = Math.max(350, 1200 - mouseZOffset * 4)
  var mouseSpringDisplayPercent = Math.max(0, Math.min(100, numberParam("mouseSpring", 33)))
  var mouseSpringPercent = mouseSpringDisplayPercent * 3
  var mouseSpringMultiplier = mouseSpringPercent <= 100
    ? mouseSpringPercent * 0.01
    : 1 + (mouseSpringPercent - 100) * 0.02
  var mouseDampingPercent = Math.max(0, Math.min(100, numberParam("mouseDamping", 50)))
  // 0% has no drag; 100% now applies 50% more velocity damping and
  // target-follow drag than the previous maximum.
  var mouseDamping = mouseDampingPercent * 0.00375
  // Legacy color parameters are used as fallbacks so existing effect instances
  // retain their chosen endpoints when upgraded to the gradient property.
  var legacyActiveColor = colorParam("activeColor", [0, 1, 0.9921568627450981, 1])
  var legacyInactiveColor = colorParam("inactiveColor", [0.30196078431372547, 0.5019607843137255, 1, 1])
  var particleGradientStops = gradientParam("particleGradient", [
    { position: 0, color: legacyInactiveColor },
    { position: 1, color: legacyActiveColor },
  ])
  var bgColor      = colorParam("backgroundColor", [0, 0, 0, 1])
  var particleBlendStr = stringParam("particleBlend", "Normal")
  var particleBlendInt = particleBlendStr === "Add" ? 1 : 0
  var sourceMix     = Math.max(0, Math.min(100, numberParam("sourceMix", 0))) * 0.01
  var threshold    = Math.max(0, Math.min(100, numberParam("threshold", 5))) * 0.01

  var rawMode = params.mode
  var legacyMode = stringParam("mode", "Alpha")
  var modeInt = typeof rawMode === "number"
    ? Math.max(0, Math.min(3, Math.round(finiteNumber(rawMode, 0))))
    : legacyMode === "Inverse Alpha" ? 1
    : legacyMode === "Luma" ? 2
    : legacyMode === "Inverse Luma" ? 3
    : 0
  var arrangementStr = stringParam("arrangement", "Grid")
  var arrangementInt = arrangementStr === "Noise" || arrangementStr === "Blue Noise" ? 1 : 0

  var cellsX = Math.max(1, Math.ceil(inputWidth  / gridSize))
  var cellsY = Math.max(1, Math.ceil(inputHeight / gridSize))

  // ── Allocate / reallocate velocity ping-pong textures when grid changes ──
  if (
    frame.state.velXYTexA == null ||
    frame.state.velCellsX !== cellsX ||
    frame.state.velCellsY !== cellsY
  ) {
    if (frame.state.velXYTexA) { frame.state.velXYTexA.destroy() }
    if (frame.state.velXYTexB) { frame.state.velXYTexB.destroy() }
    if (frame.state.velZTexA)  { frame.state.velZTexA.destroy() }
    if (frame.state.velZTexB)  { frame.state.velZTexB.destroy() }
    var velUsage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
    frame.state.velXYTexA = device.createTexture({ size: [cellsX, cellsY, 1], format: 'rgba16float', usage: velUsage })
    frame.state.velXYTexB = device.createTexture({ size: [cellsX, cellsY, 1], format: 'rgba16float', usage: velUsage })
    frame.state.velZTexA  = device.createTexture({ size: [cellsX, cellsY, 1], format: 'rgba16float', usage: velUsage })
    frame.state.velZTexB  = device.createTexture({ size: [cellsX, cellsY, 1], format: 'rgba16float', usage: velUsage })
    var clearData = new Uint16Array(cellsX * cellsY * 4)
    var bpr = cellsX * 8
    var sz  = { width: cellsX, height: cellsY, depthOrArrayLayers: 1 }
    device.queue.writeTexture({ texture: frame.state.velXYTexA }, clearData, { bytesPerRow: bpr }, sz)
    device.queue.writeTexture({ texture: frame.state.velXYTexB }, clearData, { bytesPerRow: bpr }, sz)
    device.queue.writeTexture({ texture: frame.state.velZTexA  }, clearData, { bytesPerRow: bpr }, sz)
    device.queue.writeTexture({ texture: frame.state.velZTexB  }, clearData, { bytesPerRow: bpr }, sz)
    frame.state.velCellsX = cellsX
    frame.state.velCellsY = cellsY
    frame.state.velBindGroups = null
    frame.state.particleGenBindGroups = null
  }

  // ── Allocate / grow particle storage buffer when grid grows ──
  var particleCount = cellsX * cellsY
  if (frame.state.particleBuf == null || frame.state.particleBufCount < particleCount) {
    if (frame.state.particleBuf) { frame.state.particleBuf.destroy() }
    // Each particle is 2 vec4f = 32 bytes
    frame.state.particleBuf = device.createBuffer({
      size: particleCount * 32,
      usage: GPUBufferUsage.STORAGE,
    })
    frame.state.particleBufCount = particleCount
    frame.state.particleGenBindGroups = null
    frame.state.depthPrepassBindGroup = null
    frame.state.scatterRenderBindGroup = null
  }

  // ── Allocate / reallocate scatter texture when output dims change ──
  if (
    frame.state.scatterTex == null ||
    frame.state.scatterTexW !== width ||
    frame.state.scatterTexH !== height
  ) {
    if (frame.state.scatterTex) { frame.state.scatterTex.destroy() }
    if (frame.state.scatterDepthTex) { frame.state.scatterDepthTex.destroy() }
    frame.state.scatterTex = device.createTexture({
      size: [width, height, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    frame.state.scatterDepthTex = device.createTexture({
      size: [width, height, 1],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    frame.state.scatterTexW = width
    frame.state.scatterTexH = height
    frame.state.scatterRenderBindGroup = null
    frame.state.blitBindGroup = null
  }

  // ── Build pipelines ──
  if (!frame.state.velPipelineBuilt) {
    frame.state.velPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: frame.state.velModule, entryPoint: 'vs_main',
        buffers: [{ arrayStride: 16, attributes: [
          { shaderLocation: 0, format: 'float32x2', offset: 0 },
          { shaderLocation: 1, format: 'float32x2', offset: 8 },
        ]}],
      },
      fragment: {
        module: frame.state.velModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    })
    frame.state.velPipelineBuilt = true
  }

  if (!frame.state.particleGenPipelineBuilt) {
    frame.state.particleGenPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: frame.state.particleGenModule, entryPoint: 'cs_main' },
    })
    frame.state.particleGenPipelineBuilt = true
  }

  if (frame.state.depthPrepassPipeline == null) {
    frame.state.depthPrepassPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: frame.state.depthPrepassModule, entryPoint: 'vs_main',
        buffers: [],
      },
      fragment: {
        module: frame.state.depthPrepassModule, entryPoint: 'fs_main',
        targets: [],
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    })
  }

  if (frame.state.scatterRenderPipeline == null) {
    var scatterBlend = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    }
    frame.state.scatterRenderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: frame.state.scatterRenderModule, entryPoint: 'vs_main',
        buffers: [],
      },
      fragment: {
        module: frame.state.scatterRenderModule, entryPoint: 'fs_main',
        targets: [{
          format: 'rgba16float',
          blend: scatterBlend,
        }],
      },
      primitive: { topology: 'triangle-strip' },
    })
  }

  var outputFormat = frame.output.format
  if (frame.state.blitPipeline == null || frame.state.blitPipelineFormat !== outputFormat) {
    frame.state.blitPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: frame.state.blitModule, entryPoint: 'vs_main',
        buffers: [{ arrayStride: 16, attributes: [
          { shaderLocation: 0, format: 'float32x2', offset: 0 },
          { shaderLocation: 1, format: 'float32x2', offset: 8 },
        ]}],
      },
      fragment: { module: frame.state.blitModule, entryPoint: 'fs_main', targets: [{ format: outputFormat }] },
      primitive: { topology: 'triangle-list' },
    })
    frame.state.blitPipelineFormat = outputFormat
    frame.state.blitBindGroup = null
  }

  // Ping-pong selection
  var fi = frame.state.frameIndex
  var writeXY = (fi % 2 === 0) ? frame.state.velXYTexB : frame.state.velXYTexA
  var writeZ  = (fi % 2 === 0) ? frame.state.velZTexB  : frame.state.velZTexA
  frame.state.frameIndex = fi + 1

  // Write the shared XY/Z simulation uniform once.
  device.queue.writeBuffer(
    frame.state.velUniformBuf, 0,
    new Float32Array([
      mouseInputX, mouseInputY, mouseSpringMultiplier, mouseStrength,
      gridSize, cellsX, cellsY, 0,
      mouseRadius, 1.0 - mouseDamping, mouseShapeInt, simulatedMouseZOffset,
      deltaTime, previousMouseInputX, previousMouseInputY, 0,
    ]),
  )

  // Write particle gen uniforms, including up to eight ordered gradient stops.
  var particleGenUniformData = [
    time * 0.001, width, height, outputPad,
    inputWidth, inputHeight, inputPad, 0,
    gridSize, cellsX, cellsY, 0,
    dotScale, 0, 0, modeInt,
    perspective, threshold, 0, 0,
    mouseStrength / 300, 0, mouseZOffset, arrangementInt,
    mouseInputX, mouseInputY, mouseRadius, mouseScale,
  ]
  var finalGradientStop = particleGradientStops[particleGradientStops.length - 1]
  for (var gradientIndex = 0; gradientIndex < 8; gradientIndex++) {
    var gradientStop = particleGradientStops[gradientIndex] || finalGradientStop
    particleGenUniformData.push(
      gradientStop.color[0], gradientStop.color[1], gradientStop.color[2], gradientStop.color[3],
      gradientStop.position, 0, 0, 0,
    )
  }
  particleGenUniformData.push(particleGradientStops.length, 0, 0, 0)
  device.queue.writeBuffer(
    frame.state.particleGenUniformBuf, 0,
    new Float32Array(particleGenUniformData),
  )

  // Write scatter dims uniform (outW, outH, depth resolve enabled, softness)
  device.queue.writeBuffer(
    frame.state.scatterDimsBuf, 0,
    new Float32Array([width, height, depthResolveEnabled ? 1 : 0, particleSoftness]),
  )

  // Write blit uniforms
  device.queue.writeBuffer(
    frame.state.blitUniformBuf, 0,
    new Float32Array([
      bgColor[0], bgColor[1], bgColor[2], bgColor[3],
      sourceMix, particleBlendInt, outputPad, inputPad,
    ]),
  )

  // A Figma input texture may persist for many frames. Keep its view and only
  // rebuild the two bind-group families that actually capture it when it changes.
  var inputTexture = frame.input != null ? frame.input : frame.state.placeholder
  if (frame.state.inputTextureRef !== inputTexture) {
    frame.state.inputTextureRef = inputTexture
    frame.state.inputView = inputTexture.createView()
    frame.state.particleGenBindGroups = null
    frame.state.blitBindGroup = null
  }
  var inputView = frame.state.inputView

  // Pair 0 reads A and writes B; pair 1 reads B and writes A.
  if (frame.state.velBindGroups == null) {
    frame.state.velBindGroups = [
      device.createBindGroup({
        layout: frame.state.velPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frame.state.velUniformBuf } },
          { binding: 1, resource: frame.state.velXYTexA.createView() },
          { binding: 2, resource: frame.state.velZTexA.createView() },
        ],
      }),
      device.createBindGroup({
        layout: frame.state.velPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frame.state.velUniformBuf } },
          { binding: 1, resource: frame.state.velXYTexB.createView() },
          { binding: 2, resource: frame.state.velZTexB.createView() },
        ],
      }),
    ]
  }
  var velBindGroup = frame.state.velBindGroups[fi % 2]

  // Particle generation reads the velocity targets just written this frame.
  if (frame.state.particleGenBindGroups == null) {
    frame.state.particleGenBindGroups = [
      device.createBindGroup({
        layout: frame.state.particleGenPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frame.state.particleGenUniformBuf } },
          { binding: 1, resource: inputView },
          { binding: 2, resource: frame.state.velXYTexB.createView() },
          { binding: 3, resource: frame.state.velZTexB.createView() },
          { binding: 4, resource: { buffer: frame.state.particleBuf } },
        ],
      }),
      device.createBindGroup({
        layout: frame.state.particleGenPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frame.state.particleGenUniformBuf } },
          { binding: 1, resource: inputView },
          { binding: 2, resource: frame.state.velXYTexA.createView() },
          { binding: 3, resource: frame.state.velZTexA.createView() },
          { binding: 4, resource: { buffer: frame.state.particleBuf } },
        ],
      }),
    ]
  }
  var particleGenBindGroup = frame.state.particleGenBindGroups[fi % 2]

  if (frame.state.scatterRenderBindGroup == null) {
    frame.state.scatterRenderBindGroup = device.createBindGroup({
      layout: frame.state.scatterRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frame.state.particleBuf } },
        { binding: 1, resource: { buffer: frame.state.scatterDimsBuf } },
        { binding: 2, resource: frame.state.scatterDepthTex.createView() },
      ],
    })
  }
  var scatterRenderBindGroup = frame.state.scatterRenderBindGroup

  if (frame.state.depthPrepassBindGroup == null) {
    frame.state.depthPrepassBindGroup = device.createBindGroup({
      layout: frame.state.depthPrepassPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frame.state.particleBuf } },
        { binding: 1, resource: { buffer: frame.state.scatterDimsBuf } },
      ],
    })
  }
  var depthPrepassBindGroup = frame.state.depthPrepassBindGroup

  if (frame.state.blitBindGroup == null) {
    frame.state.blitBindGroup = device.createBindGroup({
      layout: frame.state.blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: frame.state.scatterTex.createView() },
        { binding: 1, resource: inputView },
        { binding: 2, resource: { buffer: frame.state.blitUniformBuf } },
      ],
    })
  }
  var blitBindGroup = frame.state.blitBindGroup

  var encoder = device.createCommandEncoder()

  // Pass 1: Combined XY/Z simulation update via two color attachments.
  var velPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: writeXY.createView(),
        loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store',
      },
      {
        view: writeZ.createView(),
        loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store',
      },
    ],
  })
  velPass.setPipeline(frame.state.velPipeline)
  velPass.setBindGroup(0, velBindGroup)
  velPass.setVertexBuffer(0, frame.state.quad)
  velPass.draw(6)
  velPass.end()

  // Pass 2: Particle gen compute — writes positions/colors into particleBuf
  var particleGenPass = encoder.beginComputePass()
  particleGenPass.setPipeline(frame.state.particleGenPipeline)
  particleGenPass.setBindGroup(0, particleGenBindGroup)
  particleGenPass.dispatchWorkgroups(Math.ceil(cellsX / 8), Math.ceil(cellsY / 8), 1)
  particleGenPass.end()

  // Pass 3: Find the nearest solid particle core only when Z projection is active.
  if (depthResolveEnabled) {
    var depthPrepass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: frame.state.scatterDepthTex.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })
    depthPrepass.setPipeline(frame.state.depthPrepassPipeline)
    depthPrepass.setBindGroup(0, depthPrepassBindGroup)
    depthPrepass.draw(4, cellsX * cellsY, 0, 0)
    depthPrepass.end()
  }

  // Pass 4: Scatter instanced render
  var scatterPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: frame.state.scatterTex.createView(),
      loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store',
    }],
  })
  scatterPass.setPipeline(frame.state.scatterRenderPipeline)
  scatterPass.setBindGroup(0, scatterRenderBindGroup)
  scatterPass.draw(4, cellsX * cellsY, 0, 0)
  scatterPass.end()

  // Pass 5: Blit to output
  var blitPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: frame.output.createView(),
      loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store',
    }],
  })
  blitPass.setPipeline(frame.state.blitPipeline)
  blitPass.setBindGroup(0, blitBindGroup)
  blitPass.setVertexBuffer(0, frame.state.quad)
  blitPass.draw(6)
  blitPass.end()

  device.queue.submit([encoder.finish()])
}

defineProperties(Effect, {
  "mode": {
    type: "number",
    label: "Input mode",
    defaultValue: 0,
    control: "select",
    options: [
      { value: 0, label: "Alpha" },
      { value: 1, label: "Inverse Alpha" },
      { value: 2, label: "Luma" },
      { value: 3, label: "Inverse Luma" },
    ],
  },
  "threshold": {
    type: "number",
    label: "Threshold",
    defaultValue: 5,
    control: "slider",
    min: 0,
    max: 100,
    step: 1,
    unitLabel: "%",
  },
  "arrangement": {
    type: "string",
    label: "Arrangement",
    defaultValue: "Grid",
    control: "select",
    options: [
      { value: "Grid",  label: "Grid" },
      { value: "Noise", label: "Noise" },
    ],
  },
  "dotDensity": {
    type: "number",
    label: "Dot density",
    defaultValue: 50,
    control: "slider",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
  "dotScale": {
    type: "number",
    label: "Dot scale",
    defaultValue: 100,
    control: "slider",
    min: 10,
    max: 500,
    step: 1,
    unit: "%",
  },
  "particleSoftness": {
    type: "number",
    label: "Particle softness",
    defaultValue: 0,
    control: "slider",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
  "mouseRadius": {
    type: "number",
    label: "Mouse radius",
    defaultValue: 220,
    control: "slider",
    min: 20,
    max: 400,
    step: 1,
    unitLabel: "px",
  },
  "mouseShape": {
    type: "string",
    label: "Mouse shape",
    defaultValue: "Dome",
    control: "select",
    options: [
      { value: "Plateau", label: "Plateau" },
      { value: "Dome",    label: "Dome" },
      { value: "Pinch",   label: "Pinch" },
      { value: "Ring",    label: "Ring" },
      { value: "Wave",    label: "Wave" },
    ],
  },
  "mouseStrength": {
    type: "number",
    label: "Mouse strength",
    defaultValue: 50,
    control: "slider",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
  "mouseSpring": {
    type: "number",
    label: "Mouse spring",
    defaultValue: 33,
    control: "slider",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
  "mouseDamping": {
    type: "number",
    label: "Mouse damping",
    defaultValue: 50,
    control: "slider",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
  "mouseScale": {
    type: "number",
    label: "Mouse scale",
    defaultValue: 100,
    control: "slider",
    min: -100,
    max: 500,
    step: 1,
    unit: "%",
  },
  "mouseZOffset": {
    type: "number",
    label: "Mouse Z offset",
    defaultValue: 150,
    control: "slider",
    min: 0,
    max: 300,
    step: 1,
    unitLabel: "px",
  },
  "particleBlend": {
    type: "string",
    label: "Particle blend",
    defaultValue: "Normal",
    control: "select",
    options: [
      { value: "Normal", label: "Normal" },
      { value: "Add",    label: "Add" },
    ],
  },
  "particleGradient": {
    type: "gradient",
    label: "Color",
    defaultValue: {
      stops: [
        {
          position: 0,
          color: { r: 0.30196078431372547, g: 0.5019607843137255, b: 1, a: 1 },
        },
        {
          position: 1,
          color: { r: 0, g: 1, b: 0.9921568627450981, a: 1 },
        },
      ],
    },
  },
  "backgroundColor": {
    type: "color",
    label: "Background color",
    defaultValue: { r: 0, g: 0, b: 0, a: 1 },
  },
  "sourceMix": {
    type: "number",
    label: "Source mix",
    defaultValue: 0,
    control: "slider",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
})

export const manifest = {
  "version": 2,
  "name": "Shape-based particles",
  "isAnimated": true,
  "usesMouse": true
}
