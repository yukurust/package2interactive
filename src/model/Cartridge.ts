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
 * - Glossy label set into a shallow front well
 * - Recessed insertion arrow and top grip
 * - Gold contacts that run out to the outer back face
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
    const label = this.labelPocket();
    const arrow = this.arrowMark(h);
    const well = label.depth;

    const body = cartridgeShape(w, h, r, 0.45, 0.55, 0.08);
    this.addHole(body, grip);
    this.addHole(body, terminal);
    this.mesh(this.extrudeCard(body, -d / 2, d - well), this.mats.body, this.spinner, 'cartridge-body');

    const gripFloor = this.mesh(
      this.plate(grip.w + 0.1, grip.h + 0.1, grip.r),
      this.mats.body,
      this.spinner,
      'cartridge-top-recess',
    );
    gripFloor.position.set(grip.x, grip.y, d / 2 - grip.depth);
    this.cap(grip, -d / 2, 'back');

    // Front plate. The label and the insertion arrow are holes, so both sit
    // below the outer face. The plate stays solid over the rear contact cut.
    const skin = cartridgeShape(w, h, r, 0.45, 0.55, 0.08);
    this.addHole(skin, grip);
    this.addHole(skin, label);
    this.addArrowHole(skin, arrow);
    this.mesh(
      this.extrudeCard(skin, d / 2 - well, well, 0.012, 0.004),
      this.mats.body,
      this.spinner,
      'cartridge-front-skin',
    );

    // The label well overlaps the contact cut. Close that cut so the back
    // pins do not show through the front.
    const labelFloor = this.mesh(
      this.plate(label.w + 0.06, label.h + 0.06, label.r),
      this.mats.body,
      this.spinner,
      'label-well-floor',
    );
    labelFloor.position.set(label.x, label.y, d / 2 - well + 0.002);

    const mark = new THREE.Shape();
    mark.moveTo(arrow.x - arrow.w / 2, arrow.y + arrow.h / 2);
    mark.lineTo(arrow.x + arrow.w / 2, arrow.y + arrow.h / 2);
    mark.lineTo(arrow.x, arrow.y - arrow.h / 2);
    mark.closePath();
    const arrowMesh = this.mesh(
      new THREE.ShapeGeometry(mark, 1),
      this.mats.body,
      this.spinner,
      'cartridge-arrow',
    );
    arrowMesh.position.z = d / 2 - well + 0.003;
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

    // On the floor of the shallow well, still clear of the shell behind it.
    const labelMat = this.mats.label as THREE.MeshPhysicalMaterial;
    labelMat.polygonOffset = true;
    labelMat.polygonOffsetFactor = -1;
    labelMat.polygonOffsetUnits = -1;
    const labelMesh = this.mesh(geo, labelMat, this.spinner, 'cartridge-label');
    labelMesh.position.set(0, 0.12, d / 2 - this.labelPocket().depth + 0.01);
    labelMesh.renderOrder = 2;
  }

  private buildBackDetails() {
    const { w, h, d } = CART;
    const terminal = this.terminalPocket(h);
    const floorZ = -d / 2 + terminal.depth;

    const win = this.mesh(
      this.plate(terminal.w + 0.1, terminal.h + 0.1, terminal.r),
      this.mats.window,
      this.spinner,
      'back-window',
    );
    win.rotation.y = Math.PI;
    win.position.set(terminal.x, terminal.y, floorZ);

    // Gold fingers fill the pocket and stop on the outer back face,
    // so the metal is what meets the outside.
    const numPins = 8;
    const stripW = terminal.w - 0.1;
    const stripH = terminal.h - 0.08;
    const pinSpacing = stripW / numPins;
    const outerZ = -d / 2;
    const innerZ = floorZ - 0.004;
    const padDepth = innerZ - outerZ;
    const padGeo = new THREE.BoxGeometry(pinSpacing * 0.62, stripH, padDepth);
    for (let i = 0; i < numPins; i++) {
      const pad = this.mesh(
        padGeo,
        this.mats.contacts,
        this.spinner,
        'cartridge-contacts',
      );
      pad.position.set(
        terminal.x - stripW / 2 + (i + 0.5) * pinSpacing,
        terminal.y,
        outerZ + padDepth / 2,
      );
    }

    // Plastic ribs sit in the gaps and stop short of the gold tips.
    const toothW = 0.022;
    const toothOuterZ = outerZ + 0.02;
    const toothDepth = innerZ - toothOuterZ;
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

  /** Shallow pocket the label is stuck into. */
  private labelPocket() {
    return { x: 0, y: 0.12, w: LABEL.w + 0.04, h: LABEL.h + 0.04, r: 0.1, depth: 0.024 };
  }

  /** Downward triangle under the label, marking the insertion end. */
  private arrowMark(h: number) {
    return { x: 0, y: -h / 2 + 0.32, w: 0.28, h: 0.18 };
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

  private extrudeCard(
    shape: THREE.Shape,
    zBack: number,
    thickness: number,
    bevelSize = 0.024,
    bevelThickness = bevelSize,
  ) {
    const bt = Math.min(bevelThickness, thickness * 0.45);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, thickness - 2 * bt),
      bevelEnabled: bt > 0.0008,
      bevelThickness: bt,
      bevelSize,
      bevelSegments: 2,
      curveSegments: 8,
    });
    geo.translate(0, 0, zBack + bt);
    geo.computeVertexNormals();
    return geo;
  }

  private addArrowHole(shape: THREE.Shape, arrow: { x: number; y: number; w: number; h: number }) {
    const hole = new THREE.Path();
    hole.moveTo(arrow.x - arrow.w / 2, arrow.y + arrow.h / 2);
    hole.lineTo(arrow.x + arrow.w / 2, arrow.y + arrow.h / 2);
    hole.lineTo(arrow.x, arrow.y - arrow.h / 2);
    hole.closePath();
    shape.holes.push(hole);
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
