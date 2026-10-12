import * as THREE from 'three';
import { detectQuality, type Quality } from '../config';
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
  private frameCount = 0;

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
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Transmission pass resolution
    (this.renderer as unknown as { transmissionResolutionScale: number }).transmissionResolutionScale =
      this.quality.transmissionScale;

    // Lighting
    this.lighting = new StudioLighting(this.renderer, this.scene, this.quality);
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

    // Auto-adjust camera distance so case fits comfortably on portrait mobile screens
    const isPortrait = w < h;
    const targetDistance = isPortrait ? 40 * Math.max(1, 0.75 / (w / h)) : 36;
    this.camera.position.z = Math.min(55, Math.max(34, targetDistance));

    this.camera.updateProjectionMatrix();
  }

  render() {
    this.frameCount++;

    // Optional shadow throttling for lower power devices
    if (this.quality.shadowEveryNthFrame > 1) {
      this.renderer.shadowMap.autoUpdate = this.frameCount % this.quality.shadowEveryNthFrame === 0;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
