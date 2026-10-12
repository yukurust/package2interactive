import * as THREE from 'three';
import gsap from 'gsap';
import type { Quality } from '../config';

/* -------------------------------------------------------------------------- */
/*  Fresnel edge patch                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Shared uniforms for a small GLSL patch on top of MeshPhysicalMaterial.
 * Physical transmission already gives refraction & reflections; this adds the
 * bright, slightly tinted rim you see on thick moulded plastic at grazing
 * angles (where light is trapped and re-emitted along the edges).
 */
export const fresnelUniforms = {
  uEdgeColor: { value: new THREE.Color('#eef7ff') },
  uEdgeStrength: { value: 0.22 },
  uEdgePower: { value: 3.2 },
};

function patchFresnel(mat: THREE.MeshPhysicalMaterial, localStrength: number) {
  const uLocal = { value: localStrength };
  mat.userData.edge = uLocal;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeColor = fresnelUniforms.uEdgeColor;
    shader.uniforms.uEdgeStrength = fresnelUniforms.uEdgeStrength;
    shader.uniforms.uEdgePower = fresnelUniforms.uEdgePower;
    shader.uniforms.uEdgeLocal = uLocal;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform vec3 uEdgeColor;
uniform float uEdgeStrength;
uniform float uEdgePower;
uniform float uEdgeLocal;`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `#include <opaque_fragment>
{
  float ndv = clamp( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );
  float edge = pow( 1.0 - ndv, uEdgePower );
  gl_FragColor.rgb += uEdgeColor * edge * uEdgeStrength * uEdgeLocal;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'plastic-edge-v1';
}

/* -------------------------------------------------------------------------- */
/*  Case tints                                                                 */
/* -------------------------------------------------------------------------- */

export interface CaseTint {
  id: string;
  name: string;
  swatch: string;
  color: string;
  attenuation: string;
  distance: number;
  edge: string;
}

export const CASE_TINTS: CaseTint[] = [
  { id: 'crystal', name: 'Crystal', swatch: '#e8eef3', color: '#ffffff', attenuation: '#d9ecff', distance: 2.6, edge: '#eef7ff' },
  { id: 'crimson', name: 'Crimson', swatch: '#e1242c', color: '#ffe3e3', attenuation: '#e2061f', distance: 0.42, edge: '#ffd6d6' },
  { id: 'smoke', name: 'Smoke', swatch: '#46484f', color: '#e2e3e6', attenuation: '#34363d', distance: 0.45, edge: '#e9ebf0' },
  { id: 'ice', name: 'Ice Blue', swatch: '#79c4ff', color: '#f0f8ff', attenuation: '#3aa7ff', distance: 0.7, edge: '#dff1ff' },
  { id: 'mint', name: 'Mint', swatch: '#59d8a9', color: '#f0fff8', attenuation: '#16bd84', distance: 0.7, edge: '#e0fff1' },
];

/* -------------------------------------------------------------------------- */
/*  Plastic material set                                                       */
/* -------------------------------------------------------------------------- */

interface PlasticOptions {
  thickness: number;
  roughness?: number;
  edge?: number;
}

function makeClear(q: Quality, o: PlasticOptions) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: o.roughness ?? 0.035,
    transmission: 1,
    thickness: o.thickness,
    ior: 1.52,
    dispersion: q.dispersion,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    attenuationColor: new THREE.Color('#d9ecff'),
    attenuationDistance: 2.6,
    envMapIntensity: 1.2,
  });
  patchFresnel(m, o.edge ?? 1);
  return m;
}

/**
 * All case plastic materials. They share a tint that can be animated live
 * without rebuilding geometry or recompiling shaders.
 */
export class PlasticSet {
  readonly panel: THREE.MeshPhysicalMaterial;
  readonly rim: THREE.MeshPhysicalMaterial;
  readonly sleeve: THREE.MeshPhysicalMaterial;
  readonly detail: THREE.MeshPhysicalMaterial;
  readonly accent: THREE.MeshPhysicalMaterial;
  readonly shadowProxy = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private tintTween?: gsap.core.Tween;
  current: CaseTint = CASE_TINTS[0];

  constructor(q: Quality) {
    this.panel = makeClear(q, { thickness: 0.22, edge: 0.8 });
    this.rim = makeClear(q, { thickness: 0.7, edge: 1.4 });
    this.sleeve = makeClear(q, { thickness: 0.05, roughness: 0.02, edge: 0.9 });
    this.detail = makeClear(q, { thickness: 0.45, edge: 1.2 });

    this.accent = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ff3a3a'),
      roughness: 0.14,
      transmission: 0.82,
      thickness: 0.35,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      attenuationColor: new THREE.Color('#d0001a'),
      attenuationDistance: 0.22,
      envMapIntensity: 1.2,
    });
    patchFresnel(this.accent, 0.6);
    this.applyTint(CASE_TINTS[0], 1, CASE_TINTS[0]);
  }

  get tinted() {
    return [this.panel, this.rim, this.sleeve, this.detail];
  }

  private applyTint(to: CaseTint, t: number, from: CaseTint) {
    const c = new THREE.Color(from.color).lerp(new THREE.Color(to.color), t);
    const a = new THREE.Color(from.attenuation).lerp(new THREE.Color(to.attenuation), t);
    const d = THREE.MathUtils.lerp(from.distance, to.distance, t);
    for (const m of this.tinted) {
      m.color.copy(c);
      m.attenuationColor.copy(a);
      m.attenuationDistance = d;
    }
    fresnelUniforms.uEdgeColor.value.set(from.edge).lerp(new THREE.Color(to.edge), t);
  }

  setTint(id: string, animate = true) {
    const to = CASE_TINTS.find((t) => t.id === id) ?? CASE_TINTS[0];
    const from = this.current;
    this.current = to;
    this.tintTween?.kill();
    if (!animate) {
      this.applyTint(to, 1, to);
      return;
    }
    const p = { t: 0 };
    this.tintTween = gsap.to(p, {
      t: 1,
      duration: 0.7,
      ease: 'power2.inOut',
      onUpdate: () => this.applyTint(to, p.t, from),
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Paper & cartridge materials                                                */
/* -------------------------------------------------------------------------- */

export function makePaper(map: THREE.Texture, inner = false) {
  return new THREE.MeshStandardMaterial({
    map,
    roughness: inner ? 0.85 : 0.5,
    metalness: 0,
    envMapIntensity: inner ? 0.7 : 0.85,
  });
}

export function makeCartridgeMaterials(label: THREE.Texture, back: THREE.Texture) {
  return {
    body: new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#141417'),
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1.0,
    }),
    ridge: new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#1b1b1f'),
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
    label: new THREE.MeshPhysicalMaterial({
      map: label,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.9,
    }),
    back: new THREE.MeshStandardMaterial({
      map: back,
      bumpMap: back,
      bumpScale: 2.2,
      roughness: 0.58,
      metalness: 0,
    }),
    window: new THREE.MeshStandardMaterial({ color: '#08080a', roughness: 0.7 }),
    contacts: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e2b257'),
      metalness: 1,
      roughness: 0.26,
      envMapIntensity: 1.4,
    }),
  };
}

export type CartridgeMaterials = ReturnType<typeof makeCartridgeMaterials>;
