import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.12 },
    uSaturate: { value: 1.22 },
    uLift: { value: 0.015 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturate;
    uniform float uLift;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(luma), color.rgb, uSaturate);
      color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
      color.rgb += uLift;
      vec2 p = vUv - 0.5;
      float vig = smoothstep(0.85, 0.28, dot(p, p) * 2.6);
      color.rgb *= mix(0.72, 1.0, vig);
      gl_FragColor = vec4(color.rgb, color.a);
    }
  `,
}

export function createPresenter(renderer, scene, camera) {
  const composer = new EffectComposer(renderer)
  const bloom = new UnrealBloomPass(new THREE.Vector2(384, 216), 0.2, 0.3, 0.96)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(bloom)
  composer.addPass(new ShaderPass(GradeShader))
  composer.addPass(new OutputPass())
  return {
    render() {
      composer.render()
    },
    setSize(w, h) {
      composer.setSize(w, h)
    },
    setQuality(level) {
      bloom.enabled = level !== 'low'
      bloom.strength = level === 'high' ? 0.28 : 0.16
    },
  }
}
