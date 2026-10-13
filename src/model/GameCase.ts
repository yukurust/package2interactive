import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CART, DIM } from '../config';
import { HINGE_EDGE, jacketLayout } from '../art/layout';
import { extrudeOpenRim, extrudePanel, pillEdgeRecess, roundedPlane, spinePaper, spineShell, tag, type Radii } from './shapes';
import type { PlasticSet } from './materials';

export interface CaseMaterials {
  plastic: PlasticSet;
  paperOuter: THREE.Material;
  paperInner: THREE.Material;
}

/** Finger pull recessed into the closed case's long opening edge. */
const EDGE_PULL = {
  /** Fraction of the case height, which is the long edge. */
  span: 0.7,
  /** Depth of the dent, inward from the edge. */
  depth: 0.55,
  /** Width across the thickness. Stays clear of the cover panels and straddles the split. */
  widthRatio: 0.76,
} as const;

function pullNotch() {
  const half = (DIM.H * EDGE_PULL.span) / 2;
  return { notchY0: -half, notchY1: half };
}
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
 *    └ presenter (yaw so the open center faces local +Z)
 *       └ centerer (keeps the opened assembly centred on the pivot)
 *          ├ backHalf  — fixed tray, cartridge holder, back print
 *          └ spinePivot (back-left hinge axis, rotates θ/2)
 *             ├ spine + hinge seals (they plug each shell's open side)
 *             └ frontPivot (front-left hinge axis, rotates another θ/2)
 *                └ front cover
 *
 * Each shell's rim is a C, open toward the hinge. Closed, the spine seals
 * sit in that opening. The shells meet on the mid-plane.
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
  private readonly framingParts: { part: THREE.Object3D; bounds: THREE.Box3 }[] = [];
  private readonly transformedBounds = new THREE.Box3();

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
    this.buildHingeSeals();
    this.buildFront();
    this.buildHolder();
    this.buildMolding();

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) tag(o, o.userData.part ?? 'case');
    });
    // Cache geometry bounds in each moving half's local coordinates once.
    for (const part of [this.backHalf, this.spinePivot, this.frontPivot]) {
      const bounds = new THREE.Box3();
      const collect = (node: THREE.Object3D, matrix: THREE.Matrix4) => {
        for (const child of node.children) {
          if (child === this.frontPivot) continue;
          child.updateMatrix();
          const local = matrix.clone().multiply(child.matrix);
          if (child instanceof THREE.Mesh) {
            child.geometry.computeBoundingBox();
            bounds.union(child.geometry.boundingBox!.clone().applyMatrix4(local));
          }
          collect(child, local);
        }
      };
      collect(part, new THREE.Matrix4());
      this.framingParts.push({ part, bounds });
    }
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

    const pull = pullNotch();
    // C-shaped rim, open on the hinge (left). The long edge is notched for the finger pull.
    this.mesh(extrudeOpenRim({ x0, y0: -H / 2, x1, y1: H / 2, r, z0: -T / 2, depth: rimBack, bevel: 0.024, wall: rim, open: 'left', ...pull }), P.rim, g, 'back-rim');
    const fi = rim - 0.014;
    const floorR: Radii = [rHinge, Math.max(0.04, rOpen - fi), Math.max(0.04, rOpen - fi), rHinge];
    this.mesh(
      extrudePanel({ x0, y0: -H / 2 + fi, x1: x1 - fi, y1: H / 2 - fi, r: floorR, z0: -T / 2, depth: panel, bevel: 0.012 }),
      P.panel,
      g,
      'back-floor',
    );

    // Outer print is a sticker on the outside of the clear film. Inner print
    // sits behind the tinted floor, so the resin colors it from the inside.
    const L = jacketLayout();
    const px0 = -W / 2 + HINGE_EDGE;
    const px1 = W / 2 - paperInset;
    const pcx = (px0 + px1) / 2;
    const ro = rOpen - paperInset;
    const sleeveOuter = -T / 2 - paperGap - sleeve;
    const outer = this.mesh(roundedPlane(L.coverW, L.h, [ro, 0.03, 0.03, ro], 0, L.uSpine0), this.m.paperOuter, g, 'paper-back-outer');
    outer.rotation.y = Math.PI;
    outer.position.set(pcx, 0, sleeveOuter - 0.004);
    const inner = this.mesh(roundedPlane(L.coverW, L.h, [0.03, ro, ro, 0.03], L.uSpine1, 1), this.m.paperInner, g, 'paper-back-inner');
    inner.position.set(pcx, 0, -T / 2 - paperGap * 0.38);

    // Outer clear sleeve that holds the jacket.
    this.mesh(
      extrudePanel({ x0: px0, y0: -L.h / 2, x1: px1, y1: L.h / 2, r: [0.03, ro, ro, 0.03], z0: -T / 2 - paperGap - sleeve, depth: sleeve, bevel: 0.009 }),
      P.sleeve,
      g,
      'back-sleeve',
    );

    // Leaflet clips along the hinge side.
    const zIn = -T / 2 + panel;
    for (const y of [H / 2 - 2.6, 1.2]) {
      this.clip(g, x0 + rim + 0.26, y, zIn, 1);
    }

    this.edgePull(g, x1, -T / 2, -T / 2 + rimBack, 0, 'z1');
  }

  /** Small L-shaped leaflet clip. `dir` points toward the case interior along X. */
  private clip(parent: THREE.Object3D, x: number, y: number, zIn: number, dir: number, height = 0.24) {
    const P = this.m.plastic;
    const post = this.mesh(new RoundedBoxGeometry(0.12, 0.9, height, 2, 0.04), P.detail, parent, 'clip');
    const inward = parent === this.frontPivot ? -1 : 1;
    post.position.set(x, y, zIn + height / 2 * inward);
    const lip = this.mesh(new RoundedBoxGeometry(0.34, 0.9, 0.06, 2, 0.025), P.detail, parent, 'clip-lip');
    const top = zIn + inward * (height - 0.03);
    lip.position.set(x + dir * 0.12, y, top);
  }

  private buildSpine() {
    const { H, T, wall, sleeve, paperGap, rSpine } = DIM;
    const P = this.m.plastic;
    const g = this.spinePivot;
    const L = jacketLayout();

    // Rounded shoulders keep the two hinge endpoints fixed; the spine bulges
    // outward, so opening does not drive the curved wall into either cover.
    this.mesh(spineShell(T, H, rSpine, HINGE_EDGE, 0, wall), P.panel, g, 'spine');
    // Sticker sits outside the clear film. Inner print stays behind it.
    this.mesh(spinePaper(T, L.h, rSpine, HINGE_EDGE, paperGap + sleeve + 0.004,
      L.uSpine0, L.uSpine1), this.m.paperOuter, g, 'paper-spine-outer');
    this.mesh(spinePaper(T, L.h, rSpine, HINGE_EDGE, paperGap * 0.38,
      L.uSpine0, L.uSpine1, true), this.m.paperInner, g, 'paper-spine-inner');
    this.mesh(spineShell(T, H, rSpine, HINGE_EDGE, paperGap + sleeve, sleeve, 0.003),
      P.sleeve, g, 'spine-sleeve');
  }

  /**
   * Plugs that sit in each shell's open hinge side while the case is closed.
   * They stay on the spine and swing clear of both covers as it opens.
   */
  private buildHingeSeals() {
    const reach = DIM.wall + DIM.gap - 0.02;
    const x0 = 0.02;
    const w = reach - x0;
    const h = DIM.H - 2 * (DIM.rim + 0.08);
    const cx = (x0 + reach) / 2;
    const g = this.spinePivot;

    const backD = DIM.rimBack - 0.08;
    const back = this.mesh(new RoundedBoxGeometry(w, h, backD, 3, 0.035), this.m.plastic.rim, g, 'hinge-seal-back');
    back.position.set(cx, 0, 0.04 + backD / 2);

    const frontD = DIM.rimFront - 0.24;
    const frontZ = DIM.T - DIM.rimFront + 0.12;
    const front = this.mesh(new RoundedBoxGeometry(w, h, frontD, 3, 0.035), this.m.plastic.rim, g, 'hinge-seal-front');
    front.position.set(cx, 0, frontZ + frontD / 2);
  }

  private buildFront() {
    const { H, W, wall, gap, panel, rim, rimFront, rOpen, rHinge, sleeve, paperGap, paperInset } = DIM;
    const P = this.m.plastic;
    const g = this.frontPivot;
    const x0 = wall + gap;
    const x1 = W;
    const r: Radii = [rHinge, rOpen, rOpen, rHinge];

    const pull = pullNotch();
    this.mesh(extrudeOpenRim({ x0, y0: -H / 2, x1, y1: H / 2, r, z0: -rimFront, depth: rimFront, bevel: 0.024, wall: rim, open: 'left', ...pull }), P.rim, g, 'front-rim');
    const fi = rim - 0.014;
    const floorR: Radii = [rHinge, Math.max(0.04, rOpen - fi), Math.max(0.04, rOpen - fi), rHinge];
    this.mesh(
      extrudePanel({ x0, y0: -H / 2 + fi, x1: x1 - fi, y1: H / 2 - fi, r: floorR, z0: -panel, depth: panel, bevel: 0.012 }),
      P.panel,
      g,
      'front-floor',
    );

    const L = jacketLayout();
    const px0 = HINGE_EDGE;
    const px1 = W - paperInset;
    const pcx = (px0 + px1) / 2;
    const ro = rOpen - paperInset;
    const sleeveOuter = paperGap + sleeve;
    const outer = this.mesh(roundedPlane(L.coverW, L.h, [0.03, ro, ro, 0.03], L.uSpine1, 1), this.m.paperOuter, g, 'paper-front-outer');
    outer.position.set(pcx, 0, sleeveOuter + 0.004);
    const inner = this.mesh(roundedPlane(L.coverW, L.h, [ro, 0.03, 0.03, ro], 0, L.uSpine0), this.m.paperInner, g, 'paper-front-inner');
    inner.rotation.y = Math.PI;
    inner.position.set(pcx, 0, paperGap * 0.38);

    this.mesh(
      extrudePanel({ x0: px0, y0: -L.h / 2, x1: px1, y1: L.h / 2, r: [0.03, ro, ro, 0.03], z0: paperGap, depth: sleeve, bevel: 0.009 }),
      P.sleeve,
      g,
      'front-sleeve',
    );

    // Leaflet clips along the opening edge, clear of the finger pull.
    const half = (DIM.H * EDGE_PULL.span) / 2;
    for (const y of [H / 2 - 2.2, 0.4, -H / 2 + 3.4]) {
      if (Math.abs(y) < half + 0.35) continue;
      this.clip(g, x1 - rim - 0.26, y, -panel, -1);
    }

    this.edgePull(g, x1, -rimFront, 0, -DIM.T / 2, 'z0');
  }

  /**
   * Pill dent along the opening edge. Each shell owns the half on its side of
   * the split; closed, they read as one groove 70% the length of the long edge.
   */
  private edgePull(parent: THREE.Object3D, xOuter: number, z0: number, z1: number, zCenter: number, parting: 'z0' | 'z1') {
    this.mesh(pillEdgeRecess({
      xOuter,
      depth: EDGE_PULL.depth,
      length: DIM.H * EDGE_PULL.span,
      width: DIM.T * EDGE_PULL.widthRatio,
      zCenter,
      z0,
      z1,
      parting,
      wall: DIM.rim,
    }), this.m.plastic.rim, parent, 'edge-recess');
  }

  private buildHolder() {
    const { H, T, panel } = DIM;
    const P = this.m.plastic;
    const { clearance: c, frame: fw, base: bh, tabOverlap } = HOLDER;
    const cw = CART.w;
    const ch = CART.h;

    const holder = new THREE.Group();
    holder.name = 'cartridge-holder';
    // Center on the right leaf, slightly below its midpoint.
    const hx = (DIM.wall + DIM.gap) / 2;
    const hy = -H * 0.18;
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

  /** Thin nested rails, living-hinge folds and registration ribs catch the studio strips. */
  private buildMolding() {
    const P = this.m.plastic;
    for (const front of [false, true]) {
      const parent = front ? this.frontPivot : this.backHalf;
      const left = front ? DIM.wall + DIM.gap : -DIM.W / 2 + DIM.wall + DIM.gap;
      const right = front ? DIM.W : DIM.W / 2;
      const z = front ? -DIM.panel - 0.045 : -DIM.T / 2 + DIM.panel;
      const pull = pullNotch();
      this.mesh(extrudeOpenRim({
        x0: left + 0.17, x1: right - 0.17,
        y0: -DIM.H / 2 + 0.17, y1: DIM.H / 2 - 0.17,
        r: [0.15, 0.34, 0.34, 0.15], z0: z, depth: 0.055,
        wall: 0.045, bevel: 0.012, open: 'left', ...pull,
      }), P.detail, parent, 'molded-inner-rail');
      for (const y of [-DIM.H / 2 + 0.2, DIM.H / 2 - 0.2]) {
        for (const x of [left + 1, right - 1.1, (left + right) / 2]) {
          const rib = this.mesh(new RoundedBoxGeometry(0.28, 0.18, 0.09, 2, 0.03), P.detail, parent, 'registration-rib');
          rib.position.set(x, y, z);
        }
      }
    }
    for (const z of [0.035, DIM.T - 0.035]) {
      const fold = this.mesh(new THREE.CylinderGeometry(0.065, 0.065, DIM.H - 0.36, 10),
        P.detail, this.spinePivot, 'living-hinge-fold');
      fold.position.set(DIM.wall, 0, z);
    }
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

  /** Conservative envelope, transformed with the user's current rotation. */
  framingBounds(target: THREE.Box3) {
    target.makeEmpty();
    for (const { part, bounds } of this.framingParts) {
      part.updateWorldMatrix(true, false);
      target.union(this.transformedBounds.copy(bounds).applyMatrix4(part.matrixWorld));
    }
    return target;
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
    // Fully open, the hinge bisector sits this far from +Z. Closed, leave it alone.
    const face = DIM.openAngle / 2 - Math.PI / 2;
    this.presenter.rotation.y = face * e;
  }
}
