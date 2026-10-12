import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CART } from '../config';
import { cartridgeShape, tag } from './shapes';
import type { CartridgeMaterials } from './materials';
import { LABEL } from '../art/layout';

/**
 * Procedural game cartridge (inspired by Nintendo Switch game card form factor).
 *
 * Details:
 * - Matte dark body with notched edge and bevelled perimeter
 * - Glossy label recessed into the front face
 * - Molded directional arrow indicator
 * - Rear grip ribs, serial block, and recessed gold contacts with separating teeth
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
    const b = 0.024; // Bevel size

    // Shape with keying notch on the right side
    const shape = cartridgeShape(w, h, r, 0.45, 0.55, 0.08);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: d - 2 * b,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 2,
      curveSegments: 8,
    });
    geo.translate(0, 0, -d / 2 + b);
    geo.computeVertexNormals();

    this.mesh(geo, this.mats.body, this.spinner, 'cartridge-body');

    // Molded directional arrow below the label (pointing down towards contacts)
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
    arrowGeo.translate(0, -h / 2 + 0.32, d / 2 - 0.015);
    this.mesh(arrowGeo, this.mats.ridge, this.spinner, 'cartridge-arrow');

    // Molded finger grip ridge at the top edge
    const gripGeo = new RoundedBoxGeometry(w * 0.72, 0.09, 0.04, 2, 0.015);
    const grip = this.mesh(gripGeo, this.mats.ridge, this.spinner, 'cartridge-top-grip');
    grip.position.set(0, h / 2 - 0.1, d / 2 - 0.01);
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

    // Back molded window / recessed circuit area at the bottom
    const winW = w * 0.78;
    const winH = 0.75;
    const winD = 0.04;
    const winGeo = new RoundedBoxGeometry(winW, winH, winD, 2, 0.02);
    const win = this.mesh(winGeo, this.mats.window, this.spinner, 'back-window');
    win.position.set(0, -h / 2 + winH / 2 + 0.12, -d / 2 + winD / 2);

    // Gold contact pins strip inside the recessed window
    const stripW = winW - 0.08;
    const stripH = winH - 0.08;
    const contactsGeo = new THREE.PlaneGeometry(stripW, stripH);
    const contacts = this.mesh(
      contactsGeo,
      this.mats.contacts,
      this.spinner,
      'cartridge-contacts',
    );
    contacts.rotation.y = Math.PI;
    contacts.position.set(0, -h / 2 + winH / 2 + 0.12, -d / 2 + 0.008);

    // Separating teeth / plastic dividers over the contacts
    const numPins = 8;
    const toothW = 0.022;
    const pinSpacing = stripW / numPins;
    const toothGeo = new THREE.BoxGeometry(toothW, stripH, 0.02);
    for (let i = 1; i < numPins; i++) {
      const tooth = this.mesh(
        toothGeo,
        this.mats.body,
        this.spinner,
        `contact-divider-${i}`,
      );
      tooth.position.set(
        -stripW / 2 + i * pinSpacing,
        -h / 2 + winH / 2 + 0.12,
        -d / 2 + 0.015,
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

  updateLabelMap(texture: THREE.Texture) {
    (this.mats.label as THREE.MeshPhysicalMaterial).map = texture;
    this.mats.label.needsUpdate = true;
  }
}
