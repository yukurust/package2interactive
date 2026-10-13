import * as THREE from 'three';

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
  ) {
    this.group.name = 'StudioLighting';

    // 1. Studio Environment Map (Crucial for MeshPhysicalMaterial transmission & clearcoat)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const room = new THREE.Scene();
    room.background = new THREE.Color('#353b46');
    const softbox = (x: number, y: number, z: number, w: number, h: number, intensity: number) => {
      const light = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('white').multiplyScalar(intensity), side: THREE.DoubleSide }));
      light.position.set(x, y, z);
      light.lookAt(0, 0, 0);
      room.add(light);
    };
    softbox(-10, 6, 9, 5, 18, 3);
    softbox(12, 3, 4, 3, 20, 3);
    softbox(0, 15, 0, 18, 8, 2.5);
    softbox(-3, 2, -12, 8, 14, 2);
    softbox(0, 0, 14, 8, 10, 1.5);
    const envTexture = pmremGenerator.fromScene(room, 0.025).texture;
    room.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    pmremGenerator.dispose();
    this.scene.environment = envTexture;

    // 2. Key Light (Soft, warm-white from top-right-front)
    this.mainLight = new THREE.DirectionalLight('#ffffff', 2.1);
    this.mainLight.position.set(12, 22, 16);
    this.group.add(this.mainLight);

    // 3. Fill Light (Cool tinted, soft from left)
    this.fillLight = new THREE.DirectionalLight('#e7eeff', 0.7);
    this.fillLight.position.set(-16, 10, 10);
    this.group.add(this.fillLight);

    // 4. Rim / Edge Light (High back-right to illuminate the clear plastic bevels)
    this.rimLight = new THREE.DirectionalLight('#ffffff', 1.6);
    this.rimLight.position.set(8, 16, -18);
    this.group.add(this.rimLight);

    // 5. Subtle bottom bounce light to soften underside
    this.bottomLight = new THREE.DirectionalLight('#f0ede6', 0.15);
    this.bottomLight.position.set(0, -10, 8);
    this.group.add(this.bottomLight);

    // 6. Base Ambient Light
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.15);
    this.group.add(this.ambientLight);

    // Soft studio contact shadow, generated locally without an image asset.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(30, 36, 46, 0.22)');
    gradient.addColorStop(0.4, 'rgba(30, 36, 46, 0.12)');
    gradient.addColorStop(1, 'rgba(30, 36, 46, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    this.shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(18, 3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
    this.shadowPlane.position.set(0, -9.1, -2);
    this.group.add(this.shadowPlane);
  }
}
