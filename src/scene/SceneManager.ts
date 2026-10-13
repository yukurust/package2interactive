import * as THREE from 'three';
import { detectQuality, prefersReducedMotion, type Quality } from '../config';
import { StudioLighting } from './lighting';

export class SceneManager {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly lighting: StudioLighting;
  readonly quality: Quality;

  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.quality = detectQuality();

    // Scene
    this.scene = new THREE.Scene();

    // Camera (Telephoto studio perspective for clean lines)
    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 120);
    this.camera.position.set(0, 0, 36);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });

    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;

    // Transmission pass resolution
    this.renderer.transmissionResolutionScale = this.quality.transmissionScale;

    // Lighting
    this.lighting = new StudioLighting(this.renderer, this.scene);
    this.scene.add(this.lighting.group);

    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement || document.body;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;

    if (w === this.width && h === this.height) return;

    this.width = w;
    this.height = h;

    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;

    this.camera.updateProjectionMatrix();
  }

  /** Fit the open silhouette to the actual stage, leaving the controls unobstructed. */
  fitPackage(open: number, delta: number) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfWidth = THREE.MathUtils.lerp(5.8, 10.7, open);
    const distance = Math.max(9.6 / tan, halfWidth / (tan * this.camera.aspect)) + 4;
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, distance,
      prefersReducedMotion() ? 1 : 1 - Math.exp(-9 * delta));
    this.camera.updateMatrixWorld();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
