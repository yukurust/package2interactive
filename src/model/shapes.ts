import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Corner radii in the order top-left, top-right, bottom-right, bottom-left. */
export type Radii = [number, number, number, number];

const clampRadii = (r: Radii, w: number, h: number): Radii => {
  const m = Math.max(0, Math.min(w, h) / 2 - 1e-4);
  return r.map((v) => THREE.MathUtils.clamp(v, 0, m)) as Radii;
};

/** Traces a rounded rectangle into a Shape or Path (counter-clockwise). */
export function roundedRect<T extends THREE.Path>(
  p: T,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radii: Radii,
): T {
  const [tl, tr, br, bl] = clampRadii(radii, x1 - x0, y1 - y0);
  p.moveTo(x0 + bl, y0);
  p.lineTo(x1 - br, y0);
  if (br > 0) p.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  p.lineTo(x1, y1 - tr);
  if (tr > 0) p.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  p.lineTo(x0 + tl, y1);
  if (tl > 0) p.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, y0 + bl);
  if (bl > 0) p.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false);
  return p;
}

export interface PanelOptions {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: Radii;
  /** Back face position along Z. */
  z0: number;
  /** Total thickness along +Z (bevel included). */
  depth: number;
  /** Rounded edge size. */
  bevel?: number;
  /** When set, cuts a hole leaving a wall of this thickness (a rim / ring). */
  wall?: number;
  curveSegments?: number;
  bevelSegments?: number;
}

/**
 * Extrudes a rounded rectangle (or a rounded ring when `wall` is given) whose
 * final outer bounds — bevel included — exactly match the requested box.
 * ExtrudeGeometry grows contours by `bevelSize`, so we pre-shrink them.
 */
export function extrudePanel(o: PanelOptions): THREE.BufferGeometry {
  const w = o.x1 - o.x0;
  const h = o.y1 - o.y0;
  const b = Math.max(0, Math.min(o.bevel ?? 0, o.depth * 0.45, (o.wall ?? Infinity) * 0.4, w * 0.2, h * 0.2));
  const shrink = (r: Radii, d: number) => r.map((v) => Math.max(0.001, v - d)) as Radii;

  const shape = roundedRect(new THREE.Shape(), o.x0 + b, o.y0 + b, o.x1 - b, o.y1 - b, shrink(o.r, b));

  if (o.wall !== undefined) {
    const t = o.wall;
    // Hole contours shrink into the opening by `b` when bevelled, so pre-grow them.
    const hole = roundedRect(
      new THREE.Path(),
      o.x0 + t - b,
      o.y0 + t - b,
      o.x1 - t + b,
      o.y1 - t + b,
      o.r.map((v) => Math.max(0.02, v - t) + b) as Radii,
    );
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, o.depth - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: o.bevelSegments ?? 3,
    curveSegments: o.curveSegments ?? 10,
  });
  geo.translate(0, 0, o.z0 + b);
  geo.computeVertexNormals();
  return geo;
}

export interface OpenRimOptions extends PanelOptions {
  /** Hinge side with no wall. The spine closes this side when the case is shut. */
  open: 'left';
  wall: number;
  /**
   * Drops the opening-edge wall between these Y values so a finger recess
   * can sit in the gap. The top and bottom of the rim stay connected around it.
   */
  notchY0?: number;
  notchY1?: number;
}

/**
 * A C-shaped rim, open on the hinge side. Final outer bounds match the
 * requested box, bevel included — same compensation as `extrudePanel`.
 */
export function extrudeOpenRim(o: OpenRimOptions): THREE.BufferGeometry {
  const w = o.x1 - o.x0;
  const h = o.y1 - o.y0;
  const wall = o.wall;
  const b = Math.max(0, Math.min(o.bevel ?? 0, o.depth * 0.45, wall * 0.35, w * 0.2, h * 0.2));
  const x0 = o.x0 + b;
  const y0 = o.y0 + b;
  const x1 = o.x1 - b;
  const y1 = o.y1 - b;
  const [tl0, tr0, br0, bl0] = o.r;
  const tr = Math.max(0, tr0 - b);
  const br = Math.max(0, br0 - b);
  // Arm tips are only `wall` thick, so the hinge-end radii have to fit that.
  const tip = Math.max(0.001, wall * 0.55);
  const tl = Math.min(Math.max(0, tl0 - b), tip);
  const bl = Math.min(Math.max(0, bl0 - b), tip);

  // Bevel grows the solid into the void, so the inner edges start `b` inside it.
  const innerTop = o.y1 - wall - b;
  const innerBot = o.y0 + wall + b;
  const innerRight = o.x1 - wall - b;
  const shape = new THREE.Shape();
  shape.moveTo(x0 + bl, y0);
  shape.lineTo(x1 - br, y0);
  if (br > 0.001) shape.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  shape.lineTo(x1, y1 - tr);
  if (tr > 0.001) shape.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  shape.lineTo(x0 + tl, y1);
  if (tl > 0.001) shape.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  shape.lineTo(x0, innerTop);

  // Inner fillets share the outer corner centers, with the radius reduced by
  // the wall, so the opening-edge corner stays a clean offset of the outside.
  const gapTop = y1 - innerTop;
  const irTop = tr - gapTop;
  const irBot = br - (innerBot - y0);
  if (irTop > 0.02) {
    const cx = x1 - tr;
    const cy = y1 - tr;
    shape.lineTo(cx, innerTop);
    shape.absarc(cx, cy, irTop, Math.PI / 2, 0, true);
  } else {
    shape.lineTo(innerRight, innerTop);
  }
  if (irBot > 0.02) {
    const cx = x1 - br;
    const cy = y0 + br;
    shape.lineTo(innerRight, cy);
    shape.absarc(cx, cy, irBot, 0, -Math.PI / 2, true);
    shape.lineTo(x0, innerBot);
  } else {
    shape.lineTo(innerRight, innerBot);
    shape.lineTo(x0, innerBot);
  }
  shape.lineTo(x0, y0 + bl);
  if (bl > 0.001) shape.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false);

  const extrude = (contour: THREE.Shape) => {
    const geo = new THREE.ExtrudeGeometry(contour, {
      depth: Math.max(0.0005, o.depth - 2 * b),
      bevelEnabled: b > 0,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: o.bevelSegments ?? 2,
      curveSegments: o.curveSegments ?? 10,
    });
    geo.translate(0, 0, o.z0 + b);
    geo.computeVertexNormals();
    return geo;
  };

  if (o.notchY0 === undefined || o.notchY1 === undefined || o.notchY1 - o.notchY0 < wall * 2) {
    return extrude(shape);
  }

  // Bevel grows each strip into the notch, so the cut starts `b` outside it.
  const yCutU = o.notchY1 + b;
  const yCutL = o.notchY0 - b;
  const upper = new THREE.Shape();
  upper.moveTo(innerRight, yCutU);
  upper.lineTo(x1, yCutU);
  upper.lineTo(x1, y1 - tr);
  if (tr > 0.001) upper.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  upper.lineTo(x0 + tl, y1);
  if (tl > 0.001) upper.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  upper.lineTo(x0, innerTop);
  if (irTop > 0.02) {
    upper.lineTo(x1 - tr, innerTop);
    upper.absarc(x1 - tr, y1 - tr, irTop, Math.PI / 2, 0, true);
  } else {
    upper.lineTo(innerRight, innerTop);
  }
  upper.lineTo(innerRight, yCutU);

  const lower = new THREE.Shape();
  lower.moveTo(x0 + bl, y0);
  lower.lineTo(x1 - br, y0);
  if (br > 0.001) lower.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  lower.lineTo(x1, yCutL);
  lower.lineTo(innerRight, yCutL);
  if (irBot > 0.02) {
    lower.lineTo(innerRight, y0 + br);
    lower.absarc(x1 - br, y0 + br, irBot, 0, -Math.PI / 2, true);
  } else {
    lower.lineTo(innerRight, innerBot);
  }
  lower.lineTo(x0, innerBot);
  lower.lineTo(x0, y0 + bl);
  if (bl > 0.001) lower.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false);

  const merged = mergeGeometries([extrude(upper), extrude(lower)]);
  if (!merged) throw new Error('open rim strips did not merge');
  merged.computeVertexNormals();
  return merged;
}

export interface PillRecessOptions {
  /** Outer face of the long edge. The recess opens here and deepens toward −X. */
  xOuter: number;
  /** How far the floor sits behind the outer face. */
  depth: number;
  /** Pill length along Y — the long edge. */
  length: number;
  /** Pill width along Z. Centered on `zCenter` so it straddles the closed edge. */
  width: number;
  zCenter: number;
  /** Slice of the edge this shell owns. */
  z0: number;
  z1: number;
  /** Which side of the slice meets the other shell, so the groove stays open there. */
  parting: 'z0' | 'z1';
  /** Thickness of the edge wall restored outside the pill. */
  wall: number;
}

/**
 * A pill-shaped dent in the long edge. The outline is a stadium along Y,
 * recessed in X, clipped to one shell. The other shell owns the matching half,
 * so the closed case shows one continuous finger pull.
 */
export function pillEdgeRecess(o: PillRecessOptions): THREE.BufferGeometry {
  const ny = 110;
  const nz = 32;
  const rad = o.width / 2;
  const hy = Math.max(0, o.length / 2 - rad);
  const yA = -o.length / 2;
  const yB = o.length / 2;
  // Flat finger pocket with a rounded lip, so the dent reads in clear plastic.
  const scoopX = (y: number, z: number) => {
    const dy = Math.abs(y) - hy;
    const dz = z - o.zCenter;
    const d = dy <= 0 ? Math.abs(dz) : Math.hypot(dy, dz);
    if (d >= rad) return o.xOuter;
    const t = d / rad;
    const lip = 0.62;
    const u = t <= lip ? 0 : (t - lip) / (1 - lip);
    const depthFrac = 1 - u * u * (3 - 2 * u);
    return o.xOuter - o.depth * depthFrac;
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const grid: number[][] = [];
  for (let iy = 0; iy <= ny; iy++) {
    const row: number[] = [];
    const y = yA + (yB - yA) * (iy / ny);
    for (let iz = 0; iz <= nz; iz++) {
      const z = o.z0 + (o.z1 - o.z0) * (iz / nz);
      row.push(positions.length / 3);
      positions.push(scoopX(y, z), y, z);
    }
    grid.push(row);
  }

  const push = (a: number, b: number, c: number) => indices.push(a, b, c);
  const quad = (a: number, b: number, c: number, d: number) => {
    push(a, b, c);
    push(a, c, d);
  };
  for (let iy = 0; iy < ny; iy++) {
    for (let iz = 0; iz < nz; iz++) {
      const a = grid[iy][iz];
      const b = grid[iy + 1][iz];
      const c = grid[iy + 1][iz + 1];
      const d = grid[iy][iz + 1];
      quad(a, b, c, d);
      const xs = [a, b, c, d].map((i) => positions[i * 3]);
      if (xs.every((x) => x > o.xOuter - 1e-4)) {
        // Restore the wall thickness beside the pill.
        const inner = xs.map(() => 0);
        for (let k = 0; k < 4; k++) {
          const i = [a, b, c, d][k];
          inner[k] = positions.length / 3;
          positions.push(o.xOuter - o.wall, positions[i * 3 + 1], positions[i * 3 + 2]);
        }
        quad(inner[0], inner[3], inner[2], inner[1]);
      }
    }
  }

  // Close the recess on every side except the parting plane, where the other shell continues it.
  const skirt = (edge: number[], open: boolean) => {
    if (open) return;
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i];
      const b = edge[i + 1];
      const ax = positions[a * 3];
      const bx = positions[b * 3];
      if (ax > o.xOuter - 1e-4 && bx > o.xOuter - 1e-4) continue;
      const ia = positions.length / 3;
      positions.push(o.xOuter, positions[a * 3 + 1], positions[a * 3 + 2]);
      const ib = positions.length / 3;
      positions.push(o.xOuter, positions[b * 3 + 1], positions[b * 3 + 2]);
      quad(a, b, ib, ia);
    }
  };
  skirt(grid[0], false);
  skirt([...grid[ny]].reverse(), false);
  skirt(grid.map((row) => row[0]), o.parting === 'z0');
  skirt([...grid.map((row) => row[nz])].reverse(), o.parting === 'z1');

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A flat rounded rectangle centred at the origin facing +Z, with UVs remapped
 * so that the local X axis spans u0 → u1 and Y spans v0 → v1 of a texture.
 */
export function roundedPlane(
  w: number,
  h: number,
  radii: Radii,
  u0 = 0,
  u1 = 1,
  v0 = 0,
  v1 = 1,
  segments = 8,
): THREE.BufferGeometry {
  const shape = roundedRect(new THREE.Shape(), -w / 2, -h / 2, w / 2, h / 2, radii);
  const geo = new THREE.ShapeGeometry(shape, segments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) + w / 2) / w;
    const y = (pos.getY(i) + h / 2) / h;
    uv.setXY(i, u0 + x * (u1 - u0), v0 + y * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Cartridge outline: a rounded rectangle with a small angled key notch cut
 * into the right edge.
 */
export function cartridgeShape(
  w: number,
  h: number,
  r: number,
  notchY: number,
  notchLen: number,
  notchDepth: number,
): THREE.Shape {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, notchY - notchLen / 2);
  s.lineTo(x1 - notchDepth, notchY - notchLen / 2 + notchDepth * 0.7);
  s.lineTo(x1 - notchDepth, notchY + notchLen / 2 - notchDepth * 0.7);
  s.lineTo(x1, notchY + notchLen / 2);
  s.lineTo(x1, y1 - r);
  s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1);
  s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r);
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Tags a mesh so the interaction layer knows what was hit. */
export function tag<T extends THREE.Object3D>(obj: T, part: string): T {
  obj.userData.part = part;
  return obj;
}


/** A continuous U profile around the back shoulder, spine and front shoulder. */
function spinePoint(t: number, depth: number, radius: number, offset: number, edge: number) {
  const arc = Math.PI * radius / 2;
  const straight = depth - 2 * radius;
  const length = arc * 2 + straight;
  const distance = t * length;
  let angle: number;
  let zCenter: number;
  if (distance < arc) {
    angle = -Math.PI / 2 - distance / radius;
    zCenter = radius;
  } else if (distance <= arc + straight) {
    return new THREE.Vector2(edge - radius - offset, radius + distance - arc);
  } else {
    angle = Math.PI - (distance - arc - straight) / radius;
    zCenter = depth - radius;
  }
  return new THREE.Vector2(edge + (radius + offset) * Math.cos(angle),
    zCenter + (radius + offset) * Math.sin(angle));
}

/** Rounded spine wall / clear film, with a real inner surface and soft top/bottom edges. */
export function spineShell(depth: number, height: number, radius: number, edge: number,
  offset: number, thickness: number, bevel = 0.012) {
  const shape = new THREE.Shape();
  const segments = 64;
  for (let i = 0; i <= segments; i++) {
    const p = spinePoint(i / segments, depth, radius, offset, edge);
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  }
  for (let i = segments; i >= 0; i--) {
    const p = spinePoint(i / segments, depth, radius, offset - thickness, edge);
    shape.lineTo(p.x, p.y);
  }
  shape.closePath();
  const endRound = Math.min(0.08, thickness / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * endRound,
    bevelEnabled: true, bevelThickness: endRound,
    bevelSize: Math.min(bevel, thickness * 0.25), bevelSegments: 4, steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height / 2 - endRound, 0);
  return geometry;
}

/** Jacket follows the rounded shoulders; UVs advance by physical arc length. */
export function spinePaper(depth: number, height: number, radius: number, edge: number,
  offset: number, u0: number, u1: number, inner = false) {
  const segments = 64;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = spinePoint(t, depth, radius, offset, edge);
    positions.push(p.x, -height / 2, p.y, p.x, height / 2, p.y);
    const u = THREE.MathUtils.lerp(u0, u1, inner ? 1 - t : t);
    uvs.push(u, 0, u, 1);
    if (i < segments) {
      const a = i * 2;
      if (inner) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
