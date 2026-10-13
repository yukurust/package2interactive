import * as THREE from 'three';
import { detectQuality, prefersReducedMotion, type Quality } from '../config';
import { StudioLighting } from './lighting';
import { packageDistance } from './framing';
import { RenderGate } from './RenderGate';

export class SceneManager {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly lighting: StudioLighting;
  readonly quality: Quality;

  private width = 0;
  private height = 0;
  private dpr = 0;
  private readonly renderGate = new RenderGate();
  private readonly inspectionVeil: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

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

    // A neutral scrim behind the inspected card quiets the open jacket without
    // post-processing or changing any of the package's materials.
    const veilCanvas = document.createElement('canvas');
    veilCanvas.width = veilCanvas.height = 128;
    const ctx = veilCanvas.getContext('2d')!;
    const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    fade.addColorStop(0, 'rgba(255,255,255,1)');
    fade.addColorStop(0.65, 'rgba(255,255,255,1)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
    this.inspectionVeil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#eeeee9', map: new THREE.CanvasTexture(veilCanvas), transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false }));
    this.inspectionVeil.visible = false;
    this.camera.add(this.inspectionVeil);
    this.scene.add(this.camera);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement || document.body);
    this.canvas.addEventListener('webglcontextrestored', () => this.renderGate.invalidate());
  }

  resize() {
    const parent = this.canvas.parentElement || document.body;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr);
    if (w === this.width && h === this.height && dpr === this.dpr) return;

    this.width = w;
    this.height = h;

    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;

    this.camera.updateProjectionMatrix();
    this.renderGate.invalidate();
  }

  /** Fit the open silhouette to the actual stage, leaving the controls unobstructed. */
  fitPackage(bounds: THREE.Box3, delta: number) {
    const distance = packageDistance(bounds, this.camera.fov, this.camera.aspect);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, distance,
      prefersReducedMotion() ? 1 : 1 - Math.exp(-9 * delta));
    // Smooth zoom-in, but never let a rapid drag or resize crop the package.
    this.camera.position.z = Math.max(this.camera.position.z,
      packageDistance(bounds, this.camera.fov, this.camera.aspect, 0.98));
    const far = Math.max(120, this.camera.position.z + 40);
    if (far !== this.camera.far) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  setInspectionProgress(progress: number, distance: number) {
    const z = distance + 4;
    const height = 2 * z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.inspectionVeil.position.z = -z;
    this.inspectionVeil.scale.set(height * this.camera.aspect, height, 1);
    this.inspectionVeil.material.opacity = progress * 0.88;
    this.inspectionVeil.visible = progress > 0;
  }

  render(state: number[]) {
    if (this.renderGate.changed(state)) this.renderer.render(this.scene, this.camera);
  }
}
