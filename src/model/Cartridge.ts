import * as THREE from 'three';
import { CART } from '../config';
import { cartridgeShape, roundedRect, tag } from './shapes';
import type { CartridgeMaterials } from './materials';
import { LABEL } from '../art/layout';

/**
 * Procedural game cartridge (inspired by Nintendo Switch game card form factor).
 *
 * Details:
 * - Matte dark body with notched edge and bevelled perimeter
 * - Glossy label recessed into the front face
 * - Molded directional arrow indicator
 * - Recessed top grip, serial block, and gold contacts sunk into the back
 */
export class Cartridge {
  readonly root = new THREE.Group();
  /** Pivot for flipping between front and back during inspection */
  readonly spinner = new THREE.Group();

  constructor(private readonly mats: CartridgeMaterials) {
    this.root.name = 'Cartridge';
    this.root.add(this.spinner);

    this.buildBody();
    this.buildLabel();
    this.buildBackDetails();

    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        tag(obj, 'cartridge');
      }
    });
  }

  private mesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Object3D,
    name?: string,
  ) {
    const m = new THREE.Mesh(geo, mat);
    if (name) m.name = name;
    parent.add(m);
    return m;
  }

  private buildBody() {
    const { w, h, d, r } = CART;
    const grip = this.gripPocket(w, h);
    const terminal = this.terminalPocket(h);
    const shape = cartridgeShape(w, h, r, 0.45, 0.55, 0.08);
    this.addHole(shape, grip);
    this.addHole(shape, terminal);
    this.mesh(this.extrudeCard(shape, -d / 2, d), this.mats.body, this.spinner, 'cartridge-body');

    const gripFloor = this.mesh(
      this.plate(grip.w + 0.1, grip.h + 0.1, grip.r),
      this.mats.body,
      this.spinner,
      'cartridge-top-recess',
    );
    gripFloor.position.set(grip.x, grip.y, d / 2 - grip.depth);
    this.cap(grip, -d / 2, 'back');
    // Covers the contact cut on the label side. The body face underneath still
    // has that hole, so the dent opens only on the back.
    const skin = cartridgeShape(w, h, r, 0.45, 0.55, 0.08);
    this.addHole(skin, grip);
    const skinMesh = this.mesh(
      new THREE.ShapeGeometry(skin, 8),
      this.frontSkinMaterial(),
      this.spinner,
      'cartridge-front-skin',
    );
    skinMesh.position.z = d / 2;

    // Molded directional arrow below the label (pointing down towards contacts).
    const arrowShape = new THREE.Shape();
    const aw = 0.28;
    const ah = 0.18;
    arrowShape.moveTo(-aw / 2, ah / 2);
    arrowShape.lineTo(aw / 2, ah / 2);
    arrowShape.lineTo(0, -ah / 2);
    arrowShape.closePath();

    const arrowGeo = new THREE.ExtrudeGeometry(arrowShape, {
      depth: 0.025,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 1,
    });
    arrowGeo.translate(0, -h / 2 + 0.32, d / 2 + 0.01);
    this.mesh(arrowGeo, this.mats.ridge, this.spinner, 'cartridge-arrow');
  }

  private buildLabel() {
    const { d } = CART;
    const lw = LABEL.w;
    const lh = LABEL.h;
    const lr = 0.08;

    // Recessed label plane with rounded corners
    const shape = new THREE.Shape();
    const x0 = -lw / 2;
    const x1 = lw / 2;
    const y0 = -lh / 2;
    const y1 = lh / 2;

    shape.moveTo(x0 + lr, y0);
    shape.lineTo(x1 - lr, y0);
    shape.absarc(x1 - lr, y0 + lr, lr, -Math.PI / 2, 0, false);
    shape.lineTo(x1, y1 - lr);
    shape.absarc(x1 - lr, y1 - lr, lr, 0, Math.PI / 2, false);
    shape.lineTo(x0 + lr, y1);
    shape.absarc(x0 + lr, y1 - lr, lr, Math.PI / 2, Math.PI, false);
    shape.lineTo(x0, y0 + lr);
    shape.absarc(x0 + lr, y0 + lr, lr, Math.PI, Math.PI * 1.5, false);

    const geo = new THREE.ShapeGeometry(shape, 8);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + lw / 2) / lw;
      const v = (pos.getY(i) + lh / 2) / lh;
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;

    // Positioned slightly above the body center and slightly proud of the recessed rim
    const labelMesh = this.mesh(geo, this.mats.label, this.spinner, 'cartridge-label');
    labelMesh.position.set(0, 0.12, d / 2 + 0.003);
  }

  private buildBackDetails() {
    const { w, h, d } = CART;
    const terminal = this.terminalPocket(h);
    const floorZ = -d / 2 + terminal.depth;
    const goldZ = floorZ - 0.012;

    const win = this.mesh(
      this.plate(terminal.w + 0.1, terminal.h + 0.1, terminal.r),
      this.mats.window,
      this.spinner,
      'back-window',
    );
    win.rotation.y = Math.PI;
    win.position.set(terminal.x, terminal.y, floorZ);

    // Gold pads set back from the outer back face.
    const stripW = terminal.w - 0.1;
    const stripH = terminal.h - 0.08;
    const contactsGeo = new THREE.PlaneGeometry(stripW, stripH);
    const contacts = this.mesh(
      contactsGeo,
      this.mats.contacts,
      this.spinner,
      'cartridge-contacts',
    );
    contacts.rotation.y = Math.PI;
    contacts.position.set(terminal.x, terminal.y, goldZ);

    // Plastic ribs stand above the gold and stop short of the outer face.
    const numPins = 8;
    const toothW = 0.022;
    const pinSpacing = stripW / numPins;
    const toothOuterZ = -d / 2 + 0.016;
    const toothDepth = goldZ + 0.004 - toothOuterZ;
    const toothGeo = new THREE.BoxGeometry(toothW, stripH, toothDepth);
    for (let i = 1; i < numPins; i++) {
      const tooth = this.mesh(
        toothGeo,
        this.mats.body,
        this.spinner,
        `contact-divider-${i}`,
      );
      tooth.position.set(
        -stripW / 2 + i * pinSpacing,
        terminal.y,
        toothOuterZ + toothDepth / 2,
      );
    }

    // Rear textured model / warning panel (middle section)
    const backPanelGeo = new THREE.PlaneGeometry(w * 0.8, h * 0.42);
    const backPanel = this.mesh(
      backPanelGeo,
      this.mats.back,
      this.spinner,
      'cartridge-back-print',
    );
    backPanel.rotation.y = Math.PI;
    backPanel.position.set(0, 0.42, -d / 2 - 0.002);
  }

  /** Shallow groove near the top of the front face. */
  private gripPocket(w: number, h: number) {
    return { x: 0, y: h / 2 - 0.12, w: w * 0.72, h: 0.1, r: 0.032, depth: 0.06 };
  }

  /** Contact window on the back, kept inside the corner radii. */
  private terminalPocket(h: number) {
    const pocketH = 0.6;
    return { x: 0, y: -h / 2 + 0.2 + pocketH / 2, w: 1.46, h: pocketH, r: 0.045, depth: 0.07 };
  }

  private addHole(
    shape: THREE.Shape,
    p: { x: number; y: number; w: number; h: number; r: number },
  ) {
    shape.holes.push(roundedRect(
      new THREE.Path(),
      p.x - p.w / 2,
      p.y - p.h / 2,
      p.x + p.w / 2,
      p.y + p.h / 2,
      [p.r, p.r, p.r, p.r],
    ));
  }

  private extrudeCard(shape: THREE.Shape, zBack: number, thickness: number) {
    const b = 0.024;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, thickness - 2 * b),
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 2,
      curveSegments: 8,
    });
    geo.translate(0, 0, zBack + b);
    geo.computeVertexNormals();
    return geo;
  }

  private skinMat?: THREE.MeshPhysicalMaterial;

  /** Draws over the front lid so the contact hole does not show there. */
  private frontSkinMaterial() {
    this.skinMat ??= this.mats.body.clone();
    this.skinMat.polygonOffset = true;
    this.skinMat.polygonOffsetFactor = -2;
    this.skinMat.polygonOffsetUnits = -2;
    return this.skinMat;
  }

  /** Fills a pocket mouth so the cut stays on one face. */
  private cap(
    p: { x: number; y: number; w: number; h: number; r: number },
    z: number,
    face: 'front' | 'back',
  ) {
    const cap = this.mesh(this.plate(p.w, p.h, p.r), this.mats.body, this.spinner);
    cap.position.set(p.x, p.y, z);
    if (face === 'back') cap.rotation.y = Math.PI;
    return cap;
  }

  private plate(w: number, h: number, r: number) {
    const shape = roundedRect(
      new THREE.Shape(),
      -w / 2,
      -h / 2,
      w / 2,
      h / 2,
      [r, r, r, r],
    );
    const geo = new THREE.ShapeGeometry(shape, 8);
    geo.computeVertexNormals();
    return geo;
  }

  updateLabelMap(texture: THREE.Texture) {
    (this.mats.label as THREE.MeshPhysicalMaterial).map = texture;
    this.mats.label.needsUpdate = true;
  }
}
