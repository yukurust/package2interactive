import { DIM } from '../config';

/**
 * Layout of the printed paper jacket. The jacket is one sheet that wraps
 * back → spine → front, so all three faces share a single canvas.
 *
 * Paper extends almost to the hinge corner (`hingeEdge`) so the print wraps
 * the corner without a visible gap.
 */
export const HINGE_EDGE = 0.022;

export function jacketLayout() {
  const coverW = DIM.W - HINGE_EDGE - DIM.paperInset;
  // Two quarter-round shoulders plus the flat middle of the spine.
  const spineW = DIM.T + (Math.PI - 2) * DIM.rSpine;
  const h = DIM.H - 2 * DIM.paperInset;
  const total = coverW * 2 + spineW;
  return {
    coverW,
    spineW,
    h,
    total,
    /** u where the back cover ends / spine begins. */
    uSpine0: coverW / total,
    /** u where the spine ends / front cover begins. */
    uSpine1: (coverW + spineW) / total,
  };
}

export type JacketLayout = ReturnType<typeof jacketLayout>;

/** Cartridge label size in world units. */
export const LABEL = { w: 1.82, h: 2.34 } as const;
