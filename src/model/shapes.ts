import * as THREE from 'three';

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
