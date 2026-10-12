import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CART, DIM } from '../config';
import { HINGE_EDGE, jacketLayout } from '../art/layout';
import { extrudePanel, roundedPlane, tag, type Radii } from './shapes';
import type { PlasticSet } from './materials';

export interface CaseMaterials {
  plastic: PlasticSet;
  paperOuter: THREE.Material;
  paperInner: THREE.Material;
}

/** Holder geometry constants (shared with the cartridge inspector). */
export const HOLDER = {
  clearance: 0.04,
  frame: 0.14,
  base: 0.05,
  tabOverlap: 0.03,
  tabFlex: 0.085,
} as const;

/**
 * Procedural clamshell game case.
 *
 * Hierarchy:
 *   root (user rotation, owned by the app)
 *    └ presenter (subtle yaw so the open case faces the viewer)
 *       └ centerer (keeps the opened assembly centred on the pivot)
 *          ├ backHalf  — fixed tray, cartridge holder, back print
 *          └ spinePivot (back-left hinge axis, rotates θ/2)
 *             ├ spine
 *             └ frontPivot (front-left hinge axis, rotates another θ/2)
 *                └ front cover
 *
 * Splitting the opening angle between two hinge axes is what real
 * clamshell cases do; it lets the covers swing without intersecting.
 */
export class GameCase {
  readonly root = new THREE.Group();
  readonly presenter = new THREE.Group();
  readonly centerer = new THREE.Group();
  readonly backHalf = new THREE.Group();
  readonly spinePivot = new THREE.Group();
  readonly frontPivot = new THREE.Group();
  /** Docked pose of the cartridge (child of the holder). */
  readonly cartridgeAnchor = new THREE.Object3D();
  /** Retaining tabs that flex outward when the cartridge is pulled. */
  private readonly tabs: { mesh: THREE.Object3D; baseX: number; dir: number }[] = [];

  /** 0 = closed, 1 = fully open. */
  open = 0;

  constructor(private readonly m: CaseMaterials) {
    this.root.name = 'GameCase';
    this.root.add(this.presenter);
    this.presenter.add(this.centerer);
    this.centerer.add(this.backHalf, this.spinePivot);

    this.spinePivot.position.set(-DIM.W / 2, 0, -DIM.T / 2);
    this.frontPivot.position.set(0, 0, DIM.T);
    this.spinePivot.add(this.frontPivot);

    this.buildBack();
    this.buildSpine();
    this.buildFront();
    this.buildHolder();

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) tag(o, o.userData.part ?? 'case');
    });
    this.update();
  }

  /* ------------------------------------------------------------------ */

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, name?: string) {
    const mesh = new THREE.Mesh(geo, mat);
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  }

  private buildBack() {
    const { H, W, T, wall, gap, panel, rim, rimBack, rOpen, rHinge, sleeve, paperGap, paperInset } = DIM;
    const P = this.m.plastic;
    const x0 = -W / 2 + wall + gap;
    const x1 = W / 2;
    const r: Radii = [rHinge, rOpen, rOpen, rHinge];
    const g = this.backHalf;

    // Moulded tray = perimeter rim + floor plate tucked inside it.
    this.mesh(extrudePanel({ x0, y0: -H / 2, x1, y1: H / 2, r, z0: -T / 2, depth: rimBack, bevel: 0.024, wall: rim }), P.rim, g, 'back-rim');
    const fi = rim - 0.014;
    this.mesh(
      extrudePanel({ x0: x0 + fi, y0: -H / 2 + fi, x1: x1 - fi, y1: H / 2 - fi, r: r.map((v) => Math.max(0.04, v - fi)) as Radii, z0: -T / 2, depth: panel, bevel: 0.012 }),
      P.panel,
      g,
      'back-floor',
    );

    // Paper jacket (outer print faces −Z, inner print faces +Z).
    const L = jacketLayout();
    const px0 = -W / 2 + HINGE_EDGE;
    const px1 = W / 2 - paperInset;
    const pcx = (px0 + px1) / 2;
    const ro = rOpen - paperInset;
    const outer = this.mesh(roundedPlane(L.coverW, L.h, [ro, 0.03, 0.03, ro], 0, L.uSpine0), this.m.paperOuter, g, 'paper-back-outer');
    outer.rotation.y = Math.PI;
    outer.position.set(pcx, 0, -T / 2 - paperGap * 0.62);
    const inner = this.mesh(roundedPlane(L.coverW, L.h, [0.03, ro, ro, 0.03], L.uSpine1, 1), this.m.paperInner, g, 'paper-back-inner');
    inner.position.set(pcx, 0, -T / 2 - paperGap * 0.38);

    // Outer clear sleeve that holds the jacket.
    this.mesh(
      extrudePanel({ x0: px0, y0: -H / 2, x1, y1: H / 2, r: [0.06, rOpen, rOpen, 0.06], z0: -T / 2 - paperGap - sleeve, depth: sleeve, bevel: 0.009 }),
      P.sleeve,
      g,
      'back-sleeve',
    );

    // Leaflet clips along the hinge side.
    const zIn = -T / 2 + panel;
    for (const y of [H / 2 - 2.6, 1.2]) {
      this.clip(g, x0 + rim + 0.26, y, zIn, 1);
    }

    // Latch bump on the outside of the rim (the front cover's tab snaps over it).
    const bump = this.mesh(new RoundedBoxGeometry(0.05, 1.3, 0.09, 2, 0.02), P.detail, g, 'latch-bump');
    bump.position.set(W / 2 + 0.022, 0, -T / 2 + rimBack - 0.1);
  }

  /** Small L-shaped leaflet clip. `dir` points toward the case interior along X. */
  private clip(parent: THREE.Object3D, x: number, y: number, zIn: number, dir: number, height = 0.24) {
    const P = this.m.plastic;
    const post = this.mesh(new RoundedBoxGeometry(0.12, 0.9, height, 2, 0.04), P.detail, parent, 'clip');
    post.position.set(x, y, zIn + (height / 2) * Math.sign(dir === 0 ? 1 : 1) * (zIn < 0 ? 1 : -1));
    const lip = this.mesh(new RoundedBoxGeometry(0.34, 0.9, 0.06, 2, 0.025), P.detail, parent, 'clip-lip');
    const top = zIn < 0 ? zIn + height - 0.03 : zIn - height + 0.03;
    lip.position.set(x + dir * 0.12, y, top);
  }

  private buildSpine() {
    const { H, T, wall, sleeve, paperGap } = DIM;
    const P = this.m.plastic;
    const g = this.spinePivot;

    // Profile drawn in (z, y) then turned so the extrusion runs along −X.
    const body = extrudePanel({ x0: 0, y0: -H / 2, x1: T, y1: H / 2, r: [0.14, 0.14, 0.14, 0.14], z0: 0, depth: wall, bevel: 0.03 });
    body.rotateY(-Math.PI / 2);
    body.translate(wall, 0, 0);
    this.mesh(body, P.rim, g, 'spine');

    const L = jacketLayout();
    const outer = this.mesh(roundedPlane(L.spineW, L.h, [0.04, 0.04, 0.04, 0.04], L.uSpine0, L.uSpine1), this.m.paperOuter, g, 'paper-spine-outer');
    outer.rotation.y = -Math.PI / 2;
    outer.position.set(-paperGap * 0.62, 0, T / 2);
    const inner = this.mesh(roundedPlane(L.spineW, L.h, [0.04, 0.04, 0.04, 0.04], L.uSpine0, L.uSpine1), this.m.paperInner, g, 'paper-spine-inner');
    inner.rotation.y = Math.PI / 2;
    inner.position.set(-paperGap * 0.38, 0, T / 2);

    const sl = extrudePanel({ x0: 0, y0: -H / 2, x1: T, y1: H / 2, r: [0.12, 0.12, 0.12, 0.12], z0: 0, depth: sleeve, bevel: 0.009 });
    sl.rotateY(-Math.PI / 2);
    sl.translate(-paperGap, 0, 0);
    this.mesh(sl, P.sleeve, g, 'spine-sleeve');
  }

  private buildFront() {
    const { H, W, wall, gap, panel, rim, rimFront, rOpen, rHinge, sleeve, paperGap, paperInset } = DIM;
    const P = this.m.plastic;
    const g = this.frontPivot;
    const x0 = wall + gap;
    const x1 = W;
    const r: Radii = [rHinge, rOpen, rOpen, rHinge];

    this.mesh(extrudePanel({ x0, y0: -H / 2, x1, y1: H / 2, r, z0: -rimFront, depth: rimFront, bevel: 0.024, wall: rim }), P.rim, g, 'front-rim');
    const fi = rim - 0.014;
    this.mesh(
      extrudePanel({ x0: x0 + fi, y0: -H / 2 + fi, x1: x1 - fi, y1: H / 2 - fi, r: r.map((v) => Math.max(0.04, v - fi)) as Radii, z0: -panel, depth: panel, bevel: 0.012 }),
      P.panel,
      g,
      'front-floor',
    );

    const L = jacketLayout();
    const px0 = HINGE_EDGE;
    const px1 = W - paperInset;
    const pcx = (px0 + px1) / 2;
    const ro = rOpen - paperInset;
    const outer = this.mesh(roundedPlane(L.coverW, L.h, [0.03, ro, ro, 0.03], L.uSpine1, 1), this.m.paperOuter, g, 'paper-front-outer');
    outer.position.set(pcx, 0, paperGap * 0.62);
    const inner = this.mesh(roundedPlane(L.coverW, L.h, [ro, 0.03, 0.03, ro], 0, L.uSpine0), this.m.paperInner, g, 'paper-front-inner');
    inner.rotation.y = Math.PI;
    inner.position.set(pcx, 0, paperGap * 0.38);

    this.mesh(
      extrudePanel({ x0: px0, y0: -H / 2, x1, y1: H / 2, r: [0.06, rOpen, rOpen, 0.06], z0: paperGap, depth: sleeve, bevel: 0.009 }),
      P.sleeve,
      g,
      'front-sleeve',
    );

    // Leaflet clips along the opening edge.
    for (const y of [H / 2 - 2.2, 0.4, -H / 2 + 3.4]) {
      this.clip(g, x1 - rim - 0.26, y, -panel, -1);
    }

    // Red latch tab on the opening edge — the case's accent part.
    const tab = this.mesh(new RoundedBoxGeometry(0.09, 1.7, 0.72, 3, 0.04), P.accent, g, 'latch-tab');
    tab.position.set(W + 0.1, 0, -0.34);
    const grip = this.mesh(new RoundedBoxGeometry(0.03, 1.1, 0.06, 2, 0.012), P.accent, g, 'latch-grip');
    grip.position.set(W + 0.15, 0, -0.34);
  }

  private buildHolder() {
    const { H, W, T, panel } = DIM;
    const P = this.m.plastic;
    const { clearance: c, frame: fw, base: bh, tabOverlap } = HOLDER;
    const cw = CART.w;
    const ch = CART.h;

    const holder = new THREE.Group();
    holder.name = 'cartridge-holder';
    const hx = W / 2 - 0.62 - (cw / 2 + c + fw);
    const hy = -H / 2 + 1.25 + (ch / 2 + c + fw);
    holder.position.set(hx, hy, -T / 2 + panel);
    this.backHalf.add(holder);

    const ox = cw / 2 + c + fw;
    const oy = ch / 2 + c + fw;
    // Raised pad.
    this.mesh(extrudePanel({ x0: -ox - 0.06, y0: -oy - 0.06, x1: ox + 0.06, y1: oy + 0.06, r: [0.26, 0.26, 0.26, 0.26], z0: -0.01, depth: bh + 0.01, bevel: 0.016 }), P.detail, holder, 'holder-pad');

    // Frame walls (top and bottom split by finger notches).
    const fh = bh + CART.d + 0.05;
    const wallGeo = (w: number, h: number) => new RoundedBoxGeometry(w, h, fh - bh, 2, 0.035);
    const zMid = bh + (fh - bh) / 2;
    for (const s of [-1, 1]) {
      const side = this.mesh(wallGeo(fw, oy * 2), P.detail, holder, 'holder-wall');
      side.position.set(s * (ox - fw / 2), 0, zMid);
      const notch = 0.95;
      const seg = (ox * 2 - notch) / 2;
      for (const t of [-1, 1]) {
        const bar = this.mesh(wallGeo(seg, fw), P.detail, holder, 'holder-wall');
        bar.position.set(t * (notch / 2 + seg / 2), s * (oy - fw / 2), zMid);
      }
    }

    // Flexible retaining tabs overhanging the cartridge edges.
    const tabW = 0.14;
    const tabZ = bh + CART.d + 0.006 + 0.025;
    for (const s of [-1, 1]) {
      for (const y of [-ch * 0.27, ch * 0.27]) {
        const tab = this.mesh(new RoundedBoxGeometry(tabW, 0.34, 0.05, 2, 0.02), P.detail, holder, 'holder-tab');
        const baseX = s * (cw / 2 - tabOverlap + tabW / 2);
        tab.position.set(baseX, y, tabZ);
        this.tabs.push({ mesh: tab, baseX, dir: s });
      }
    }

    this.cartridgeAnchor.position.set(0, 0, bh + CART.d / 2);
    holder.add(this.cartridgeAnchor);
  }

  /** 0 = rest, 1 = tabs fully flexed outward. */
  setTabFlex(f: number) {
    for (const t of this.tabs) t.mesh.position.x = t.baseX + t.dir * HOLDER.tabFlex * f;
  }

  /* ------------------------------------------------------------------ */

  /** Opened assembly bounds (XZ, in centerer space) used for centring and camera fit. */
  bounds(open = this.open) {
    const { W, T, wall } = DIM;
    const th = open * DIM.openAngle;
    const s = th / 2;
    const bx = -W / 2;
    const bz = -T / 2;
    const fx = bx - T * Math.sin(s);
    const fz = bz + T * Math.cos(s);
    const ex = fx + (W - wall * 0.5) * Math.cos(th);
    const ez = fz + (W - wall * 0.5) * Math.sin(th);
    const minX = Math.min(bx, fx, ex);
    const maxX = W / 2 + 0.15;
    const minZ = -T / 2;
    const maxZ = Math.max(T / 2, fz, ez);
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }

  /** Apply the current `open` value to hinges and presentation offsets. */
  update() {
    const o = THREE.MathUtils.clamp(this.open, 0, 1.08);
    const th = o * DIM.openAngle;
    this.spinePivot.rotation.y = -th / 2;
    this.frontPivot.rotation.y = -th / 2;

    const b = this.bounds(Math.min(o, 1));
    this.centerer.position.set(-b.cx, 0, -b.cz);
    const e = o * o * (3 - 2 * Math.min(o, 1));
    this.presenter.rotation.y = -0.34 * e;
  }

  /** Every mesh that should cast a contact shadow. */
  get shadowCasters() {
    return this.root;
  }
}
