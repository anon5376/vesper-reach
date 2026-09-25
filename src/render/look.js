import * as THREE from 'three'
import { RNG } from '../rng/rng.js'

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

export function planetTexture(biome, seed) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const g = canvas.getContext('2d')
  const rng = new RNG((seed || 1) ^ 0x51a7)
  g.fillStyle = biome.ground
  g.fillRect(0, 0, 256, 128)
  const band = g.createLinearGradient(0, 0, 0, 128)
  band.addColorStop(0, biome.high)
  band.addColorStop(0.18, biome.ground)
  band.addColorStop(0.48, biome.low)
  band.addColorStop(0.62, biome.sand)
  band.addColorStop(0.78, biome.ground)
  band.addColorStop(1, biome.high)
  g.globalAlpha = 0.85
  g.fillStyle = band
  g.fillRect(0, 0, 256, 128)
  const inks = [biome.accent, biome.high, biome.low, biome.sand, biome.water]
  for (let i = 0; i < 48; i++) {
    g.globalAlpha = 0.28 + rng.next() * 0.45
    g.fillStyle = rng.pick(inks)
    g.beginPath()
    const x = rng.next() * 256
    const y = 12 + rng.next() * 104
    g.ellipse(x, y, 6 + rng.next() * 36, 3 + rng.next() * 16, rng.next() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 0.55
  g.fillStyle = biome.water
  for (let i = 0; i < 8; i++) {
    g.beginPath()
    g.ellipse(rng.next() * 256, 40 + rng.next() * 50, 10 + rng.next() * 22, 4 + rng.next() * 8, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

export function cloudTexture(seed) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const g = canvas.getContext('2d')
  const rng = new RNG((seed || 3) ^ 99)
  g.clearRect(0, 0, 256, 128)
  g.fillStyle = 'rgba(255,248,236,0.9)'
  for (let i = 0; i < 36; i++) {
    g.globalAlpha = 0.15 + rng.next() * 0.45
    g.beginPath()
    g.ellipse(rng.next() * 256, 20 + rng.next() * 90, 8 + rng.next() * 28, 3 + rng.next() * 8, 0, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
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
        float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.2);
        gl_FragColor = vec4(uColor, rim * 1.15);
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
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
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
        float wave = sin(vWorld.x * 0.42 + uTime * 1.3) * sin(vWorld.z * 0.31 - uTime);
        float rip = sin(vWorld.x * 1.7 + vWorld.z * 1.3 + uTime * 2.0);
        vec3 normal = normalize(vNormal + vec3(wave * 0.18, 0.0, rip * 0.08));
        vec3 viewDir = normalize(uCam - vWorld);
        float fres = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.1);
        vec3 col = mix(uDeep, uColor, 0.55 + wave * 0.2);
        col = mix(col, uFoam, smoothstep(0.72, 1.0, fres) * 0.55);
        col += vec3(1.0, 0.78, 0.55) * fres * 0.28;
        float dist = length(uCam - vWorld);
        float fade = smoothstep(50.0, 160.0, dist);
        float alpha = mix(0.5 + fres * 0.35, 0.12, fade);
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
