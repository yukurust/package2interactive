import * as THREE from 'three';

/** Fit a world-space envelope in a +Z camera, including the nearest depth. */
export function packageDistance(bounds: THREE.Box3, fov: number, aspect: number, fill = 0.88) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const x = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
  const y = Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y));
  return bounds.max.z + Math.max(y / (tan * fill), x / (tan * aspect * fill));
}

/** Keep the entire card visible even in a narrow editor preview. */
export function inspectionDistance(fov: number, aspect: number) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  // Rotation can expose the depth; reserve a little room beyond the face.
  return Math.max(10, 1.2 / (tan * aspect * 0.76));
}
