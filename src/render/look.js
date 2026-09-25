import * as THREE from 'three'

export function skyTexture(top, horizon, belly) {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 512
  const g = canvas.getContext('2d')
  const wash = g.createLinearGradient(0, 0, 0, 512)
  wash.addColorStop(0, top)
  wash.addColorStop(0.42, top)
  wash.addColorStop(0.58, horizon)
  wash.addColorStop(0.72, horizon)
  wash.addColorStop(1, belly)
  g.fillStyle = wash
  g.fillRect(0, 0, 8, 512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  return tex
}

function hash3(ix, iy, iz, seed) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1440662683) + (seed | 0)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function noise3(x, y, z, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fy = y - y0
  const fz = z - z0
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const uz = fz * fz * (3 - 2 * fz)
  let acc = 0
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz)
        acc += w * hash3(x0 + dx, y0 + dy, z0 + dz, seed)
      }
    }
  }
  return acc
}

function fbm3(x, y, z, seed) {
  let value = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < 4; i++) {
    value += amp * noise3(x * freq, y * freq, z * freq, seed + i * 17)
    freq *= 2
    amp *= 0.5
  }
  return value
}

function hexRgb(hex) {
  const h = String(hex || '#888888').replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function paintSphere(width, height, seed, shade) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1)
    const ny = (v - 0.5) * 2
    for (let x = 0; x < width; x++) {
      const u = x / width
      const ang = u * Math.PI * 2
      const nx = Math.cos(ang)
      const nz = Math.sin(ang)
      const rgb = shade(nx, ny, nz, v, seed)
      const i = (y * width + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = rgb[3]
    }
  }
  ctx.putImageData(image, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

export function planetTexture(biome, seed) {
  const ground = hexRgb(biome.ground)
  const high = hexRgb(biome.high)
  const low = hexRgb(biome.low)
  const sand = hexRgb(biome.sand)
  const water = hexRgb(biome.water)
  const accent = hexRgb(biome.accent)
  const key = (seed || 1) ^ 0x51a7
  return paintSphere(256, 128, key, (nx, ny, nz, v) => {
    const lat = Math.abs(v - 0.5) * 2
    const land = fbm3(nx * 1.7, ny * 1.4, nz * 1.7, key)
    const detail = fbm3(nx * 4.2 + 2, ny * 3.1, nz * 4.2, key + 9)
    let col = water
    if (lat > 0.78) col = mixRgb(high, [245, 248, 252], (lat - 0.78) / 0.22)
    else if (land < 0.46) col = mixRgb(water, low, land * 0.8)
    else if (land < 0.52) col = sand
    else col = mixRgb(mixRgb(low, ground, detail), high, Math.max(0, detail - 0.45))
    if (land > 0.62 && detail > 0.58 && lat < 0.7) col = mixRgb(col, accent, 0.28)
    return [col[0], col[1], col[2], 255]
  })
}

export function cloudTexture(seed) {
  const key = ((seed || 3) ^ 99) | 0
  return paintSphere(256, 128, key, (nx, ny, nz) => {
    const bank = fbm3(nx * 1.8, ny * 1.1, nz * 1.8, key)
    const puff = fbm3(nx * 3.6 + 1.2, ny * 2.2, nz * 3.6, key + 4)
    const cover = bank * 0.65 + puff * 0.35
    const alpha = Math.max(0, Math.min(1, (cover - 0.46) / 0.28))
    return [248, 250, 252, Math.round(alpha * alpha * 230)]
  })
}

const SPHERE_NOISE = `
float h31(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float n3(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * n3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
`

export function planetMaterial(biome, seed) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGround: { value: new THREE.Color(biome.ground) },
      uHigh: { value: new THREE.Color(biome.high) },
      uLow: { value: new THREE.Color(biome.low) },
      uSand: { value: new THREE.Color(biome.sand) },
      uWater: { value: new THREE.Color(biome.water) },
      uAccent: { value: new THREE.Color(biome.accent) },
      uLight: { value: new THREE.Vector3(1, 0.2, 0.4).normalize() },
      uSeed: { value: ((seed || 1) % 97) * 0.37 },
    },
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vObj = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      ${SPHERE_NOISE}
      uniform vec3 uGround;
      uniform vec3 uHigh;
      uniform vec3 uLow;
      uniform vec3 uSand;
      uniform vec3 uWater;
      uniform vec3 uAccent;
      uniform vec3 uLight;
      uniform float uSeed;
      varying vec3 vObj;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 p = normalize(vObj);
        float lat = abs(p.y);
        float land = fbm3(p * 2.2 + uSeed);
        float detail = fbm3(p * 5.8 + uSeed * 1.7);
        vec3 albedo = mix(uWater, uLow, land);
        if (lat > 0.78) albedo = mix(uHigh, vec3(0.93, 0.96, 1.0), smoothstep(0.78, 0.96, lat));
        else if (land < 0.47) albedo = mix(uWater * 0.72, uWater, land / 0.47);
        else if (land < 0.54) albedo = mix(uSand, uGround, (land - 0.47) / 0.07);
        else albedo = mix(mix(uLow, uGround, detail), uHigh, smoothstep(0.42, 0.78, detail));
        if (land > 0.64 && detail > 0.58 && lat < 0.72) albedo = mix(albedo, uAccent, 0.32);
        vec3 n = normalize(vNormal);
        vec3 light = normalize(uLight);
        float ndl = max(dot(n, light), 0.0);
        vec3 view = normalize(cameraPosition - vWorld);
        float spec = pow(max(dot(reflect(-light, n), view), 0.0), 36.0);
        float wet = 1.0 - smoothstep(0.42, 0.52, land);
        vec3 col = albedo * (0.14 + ndl * 1.08);
        col += vec3(0.85, 0.92, 1.0) * spec * (0.04 + wet * 0.55);
        float spark = step(0.993, n3(p * 48.0 + uSeed));
        col += vec3(1.0, 0.78, 0.42) * spark * smoothstep(0.22, 0.0, ndl);
        float facing = clamp(dot(n, view), 0.0, 1.0);
        col *= mix(0.84, 1.0, pow(facing, 0.65));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
}

export function cloudShellMaterial(seed, cover) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCover: { value: cover },
      uSeed: { value: ((seed || 3) % 80) * 0.21 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vObj = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      ${SPHERE_NOISE}
      uniform float uTime;
      uniform float uCover;
      uniform float uSeed;
      varying vec3 vObj;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 p = normalize(vObj);
        float spin = uTime * 0.015;
        vec3 q = vec3(p.x * cos(spin) - p.z * sin(spin), p.y, p.x * sin(spin) + p.z * cos(spin));
        float bank = fbm3(q * 2.4 + uSeed);
        float puff = fbm3(q * 5.2 + uSeed + 4.0);
        float cover = bank * 0.7 + puff * 0.3;
        vec3 n = normalize(vNormal);
        vec3 view = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 1.8);
        float alpha = smoothstep(0.4, 0.58, cover) * uCover * (1.0 - rim * 0.2);
        vec3 col = mix(vec3(0.78, 0.84, 0.9), vec3(1.0, 0.98, 0.94), smoothstep(0.55, 0.8, cover));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })
}

export function skyShellMaterial(top, horizon, belly) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uBelly: { value: new THREE.Color(belly) },
      uSun: { value: new THREE.Vector3(0.2, 0.8, 0.1) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBelly;
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uBelly, uHorizon, smoothstep(0.0, 0.42, h));
        col = mix(col, uTop, smoothstep(0.28, 0.92, h));
        vec3 zenith = mix(uTop, vec3(0.08, 0.22, 0.55), 0.78);
        col = mix(col, zenith, smoothstep(0.32, 0.88, h));
        float haze = pow(1.0 - abs(dir.y), 2.4);
        col = mix(col, uHorizon, haze * 0.28);
        float sun = pow(max(dot(dir, normalize(uSun)), 0.0), 64.0);
        float glow = pow(max(dot(dir, normalize(uSun)), 0.0), 6.0);
        col += vec3(1.0, 0.86, 0.55) * sun * 1.6;
        col += uHorizon * glow * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
}

export function atmosphereMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 3.4);
        gl_FragColor = vec4(uColor, rim * 0.9);
      }
    `,
  })
}

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color('#2a8fbf') },
      uDeep: { value: new THREE.Color('#0e3a4a') },
      uFoam: { value: new THREE.Color('#f7efe2') },
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 pos = position;
        float wave = sin(pos.x * 0.35 + uTime * 0.8) * cos(pos.y * 0.28 - uTime * 0.5);
        pos.z += wave * 0.22;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform float uTime;
      uniform vec3 uCam;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        float wave = sin(vWorld.x * 0.17 + uTime * 0.6) * sin(vWorld.z * 0.13 - uTime * 0.4);
        float rip = sin(vWorld.x * 0.83 + vWorld.z * 0.61 + uTime);
        vec3 normal = normalize(vNormal + vec3(wave * 0.08, 0.0, rip * 0.05));
        vec3 viewDir = normalize(uCam - vWorld);
        float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.4);
        vec3 col = mix(uDeep, uColor, 0.42 + wave * 0.08);
        col = mix(col, uFoam, smoothstep(0.82, 1.0, fres) * 0.28);
        col += vec3(0.85, 0.75, 0.55) * fres * 0.12;
        float dist = length(uCam - vWorld);
        float fade = smoothstep(220.0, 900.0, dist);
        float alpha = mix(0.72 + fres * 0.2, 0.38, fade);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })
}

export function plantGeometry() {
  const stem = new THREE.ConeGeometry(0.16, 1.15, 5)
  stem.translate(0, 0.55, 0)
  const fan = new THREE.ConeGeometry(0.62, 0.7, 5)
  fan.translate(0, 1.15, 0)
  const bulb = new THREE.SphereGeometry(0.18, 6, 5)
  bulb.translate(0.22, 0.95, 0.05)
  const geo = merge(stem, fan)
  return merge(geo, bulb)
}

function merge(a, b) {
  const group = [a, b]
  let count = 0
  for (const geo of group) count += geo.attributes.position.count
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  let offset = 0
  for (const geo of group) {
    const pos = geo.attributes.position
    const nor = geo.attributes.normal
    positions.set(pos.array, offset * 3)
    if (nor) normals.set(nor.array, offset * 3)
    offset += pos.count
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geo
}
