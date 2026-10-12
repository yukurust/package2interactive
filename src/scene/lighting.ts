import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Quality } from '../config';

export class StudioLighting {
  readonly group = new THREE.Group();
  readonly mainLight: THREE.DirectionalLight;
  readonly fillLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly bottomLight: THREE.DirectionalLight;
  readonly ambientLight: THREE.AmbientLight;
  readonly shadowPlane: THREE.Mesh;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    quality: Quality,
  ) {
    this.group.name = 'StudioLighting';

    // 1. Studio Environment Map (Crucial for MeshPhysicalMaterial transmission & clearcoat)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTexture;

    // 2. Key Light (Soft, warm-white from top-right-front)
    this.mainLight = new THREE.DirectionalLight('#ffffff', 2.4);
    this.mainLight.position.set(12, 22, 16);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.width = quality.shadowRes;
    this.mainLight.shadow.mapSize.height = quality.shadowRes;
    this.mainLight.shadow.camera.near = 5;
    this.mainLight.shadow.camera.far = 50;
    const sCam = 14;
    this.mainLight.shadow.camera.left = -sCam;
    this.mainLight.shadow.camera.right = sCam;
    this.mainLight.shadow.camera.top = sCam;
    this.mainLight.shadow.camera.bottom = -sCam;
    this.mainLight.shadow.bias = -0.0004;
    this.mainLight.shadow.radius = 3;
    this.group.add(this.mainLight);

    // 3. Fill Light (Cool tinted, soft from left)
    this.fillLight = new THREE.DirectionalLight('#dbe8ff', 1.2);
    this.fillLight.position.set(-16, 10, 10);
    this.group.add(this.fillLight);

    // 4. Rim / Edge Light (High back-right to illuminate the clear plastic bevels)
    this.rimLight = new THREE.DirectionalLight('#ffffff', 2.8);
    this.rimLight.position.set(8, 16, -18);
    this.group.add(this.rimLight);

    // 5. Subtle bottom bounce light to soften underside
    this.bottomLight = new THREE.DirectionalLight('#f0ede6', 0.6);
    this.bottomLight.position.set(0, -10, 8);
    this.group.add(this.bottomLight);

    // 6. Base Ambient Light
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.85);
    this.group.add(this.ambientLight);

    // 7. Ground Shadow Receiver Plane
    const shadowGeo = new THREE.PlaneGeometry(80, 80);
    const shadowMat = new THREE.ShadowMaterial({
      opacity: 0.18,
    });
    this.shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.y = -8.7; // Just below the case bottom (-DIM.H/2)
    this.shadowPlane.receiveShadow = true;
    this.group.add(this.shadowPlane);
  }
}
