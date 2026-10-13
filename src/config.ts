/**
 * Shared dimensions and quality settings.
 *
 * Units: 1 world unit = 10 mm. The case follows the proportions of a
 * handheld-console game case (≈ 170 × 105 × 11 mm).
 */

const DEG = Math.PI / 180;

export const DIM = {
  /** Case height. */
  H: 17.0,
  /** Case width including the spine. */
  W: 10.5,
  /** Case thickness when closed. */
  T: 1.1,
  /** Spine wall thickness. */
  wall: 0.13,
  /** Clearance between the spine and the covers (keeps the hinge collision-free). */
  gap: 0.014,
  /** Cover panel thickness. */
  panel: 0.1,
  /** Perimeter rim wall thickness. */
  rim: 0.085,
  /** Back tray depth, measured from its outer surface to the rim top. */
  rimBack: 0.62,
  /** Front cover depth, measured from its outer surface to the rim bottom. */
  rimFront: 0.46,
  /** Corner radius at the opening edge. */
  rOpen: 0.44,
  /** Corner radius at the hinge edge. */
  rHinge: 0.16,
  /** Radius of the two long spine shoulders (≈ 1.6 mm). */
  rSpine: 0.16,
  /** Outer clear sleeve (film holding the paper jacket). */
  sleeve: 0.024,
  /** Space reserved for the paper jacket between panel and sleeve. */
  paperGap: 0.012,
  /** Inset of the printed paper from the plastic edge. */
  paperInset: 0.18,
  /** Fully-open hinge angle. */
  openAngle: 140 * DEG,
} as const;

/** Game cartridge (≈ 21 × 31 × 3.3 mm). */
export const CART = {
  w: 2.1,
  h: 3.1,
  d: 0.33,
  r: 0.14,
} as const;

export type Tier = 'high' | 'low';

export interface Quality {
  tier: Tier;
  maxDpr: number;
  transmissionScale: number;
  /** Pixels per world unit for the printed jacket canvas. */
  artPx: number;
  dispersion: number;
  anisotropy: number;
}

export function detectQuality(): Quality {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const low = (coarse && shortSide < 900) || mem <= 4 || cores <= 4;
  const forced = new URLSearchParams(location.search).get('quality');
  const tier: Tier = forced === 'high' ? 'high' : forced === 'low' ? 'low' : low ? 'low' : 'high';

  return tier === 'high'
    ? {
        tier,
        maxDpr: 2,
        transmissionScale: 1,
        artPx: 120,
        dispersion: 0.025,
        anisotropy: 8,
      }
    : {
        tier,
        maxDpr: 1.75,
        transmissionScale: 0.6,
        artPx: 92,
        dispersion: 0,
        anisotropy: 4,
      };
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
