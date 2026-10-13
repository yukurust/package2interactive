import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameCase } from '../src/model/GameCase';
import { inspectionDistance, packageDistance } from '../src/scene/framing';

describe('responsive framing', () => {
  it('contains every shell through opening, full yaw and vertical tilt', () => {
    const material = new THREE.MeshPhysicalMaterial();
    const gameCase = new GameCase({
      plastic: { panel: material, rim: material, sleeve: material, detail: material } as any,
      paperInner: material, paperOuter: material,
    });
    const bounds = new THREE.Box3();
    const actual = new THREE.Box3();
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 1000);
    const point = new THREE.Vector3();
    for (const open of [0, 0.25, 0.5, 0.75, 1]) {
      gameCase.open = open;
      gameCase.update();
      for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        for (const pitch of [-Math.PI / 2.8, 0, Math.PI / 2.8]) {
          gameCase.root.rotation.set(pitch, yaw, 0);
          gameCase.framingBounds(bounds);
          gameCase.root.updateMatrixWorld(true);
          actual.setFromObject(gameCase.root, true);
          // Includes the curved spine and the nearest rotated shell corners.
          expect(bounds.clone().expandByScalar(0.01).containsBox(actual), JSON.stringify({ open, yaw, pitch, bounds, actual })).toBe(true);
          for (const aspect of [0.3, 0.9, 1.8, 3]) {
            camera.aspect = aspect;
            camera.position.z = packageDistance(bounds, camera.fov, aspect);
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld();
            for (const x of [actual.min.x, actual.max.x]) {
              for (const y of [actual.min.y, actual.max.y]) {
                for (const z of [actual.min.z, actual.max.z]) {
                  point.set(x, y, z).project(camera);
                  expect(Math.abs(point.x)).toBeLessThan(0.9);
                  expect(Math.abs(point.y)).toBeLessThan(0.9);
                }
              }
            }
          }
        }
      }
    }
  });

  it('keeps a rotated cartridge inside narrow and wide inspection stages', () => {
    for (const aspect of [0.2, 0.35, 1, 3]) {
      const distance = inspectionDistance(34, aspect);
      const halfWidth = distance * Math.tan(34 * Math.PI / 360) * aspect;
      expect(halfWidth).toBeGreaterThan(1.2);
      expect(distance).toBeGreaterThanOrEqual(10);
    }
  });
});
