import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import gsap from 'gsap';
import { GameCase } from '../src/model/GameCase';
import { Cartridge } from '../src/model/Cartridge';
import { InteractionManager } from '../src/interaction/InteractionManager';
import { CART, DIM } from '../src/config';
import { makeCartridgeMaterials } from '../src/model/materials';

class Canvas extends EventTarget {
  captured = new Set<number>();
  setPointerCapture(id: number) { this.captured.add(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
}

function rig() {
  const plastic = new THREE.MeshPhysicalMaterial({ transmission: 1 });
  const paper = new THREE.MeshStandardMaterial();
  const gameCase = new GameCase({
    plastic: { panel: plastic, rim: plastic, sleeve: plastic, detail: plastic, accent: plastic } as any,
    paperOuter: paper, paperInner: paper,
  });
  const card = new Cartridge(makeCartridgeMaterials(new THREE.Texture(), new THREE.Texture()));
  const canvas = new Canvas();
  const camera = new THREE.PerspectiveCamera(34, 1.25, 1, 120);
  camera.position.z = 36;
  camera.updateMatrixWorld();
  const scene = new THREE.Scene();
  scene.add(gameCase.root);
  const interaction = new InteractionManager({ canvas, camera, scene, fitPackage() {} } as any, gameCase, card);
  return { gameCase, card, canvas, interaction, camera };
}

function pointer(canvas: Canvas, type: string, x: number, y: number, time: number, id = 1) {
  const event = new Event(type);
  Object.defineProperties(event, Object.fromEntries(Object.entries({
    clientX: x, clientY: y, timeStamp: time, pointerId: id, isPrimary: id === 1, button: 0,
  }).map(([key, value]) => [key, { value }])));
  canvas.dispatchEvent(event);
}

beforeEach(() => {
  const win = new EventTarget();
  Object.assign(win, { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('window', win);
});
afterEach(() => { gsap.globalTimeline.clear(); vi.unstubAllGlobals(); });

describe('package interactions', () => {
  it('reverses the requested lid state before halfway, even under rapid clicks', () => {
    const { interaction: c, gameCase } = rig();
    c.toggleOpen();
    c['caseOpenTween']!.progress(0.2);
    expect(gameCase.open).toBeLessThan(0.5);
    c.toggleOpen();
    c['caseOpenTween']!.progress(1);
    expect(gameCase.open).toBe(0);
    expect(c.currentState).toBe('closed');
    c.setOpen(true);
    c.setOpen(true);
    c['caseOpenTween']!.progress(1);
    expect(gameCase.open).toBe(1);
  });

  it('waits for docking before closing and restores the precise anchor pose', () => {
    const { interaction: c, gameCase, card } = rig();
    c.setOpen(true); c['caseOpenTween']!.progress(1);
    c.toggleInspectCartridge(); c['cartExtractTween']!.progress(1);
    c.update(1 / 60);
    expect(c.currentState).toBe('inspecting');
    expect(card.root.position.z).toBeCloseTo(26);
    c.setOpen(false);
    expect(gameCase.open).toBe(1);
    c['cartExtractTween']!.progress(1);
    c['caseOpenTween']!.progress(1);
    c.update(1 / 60);
    expect(gameCase.open).toBe(0);
    expect(card.root.position.distanceTo(gameCase.cartridgeAnchor.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-8);
  });

  it('can close immediately after extraction starts, or reopen during return', () => {
    const { interaction: c, gameCase } = rig();
    c.setOpen(true); c['caseOpenTween']!.progress(1);
    c.toggleInspectCartridge();
    c.setOpen(false);
    expect(c['isInspecting']).toBe(false);
    c.setOpen(true);
    c['cartExtractTween']!.progress(1);
    c['caseOpenTween']!.progress(1);
    expect(c.currentState).toBe('open');
    expect(gameCase.open).toBe(1);
  });

  it('does not extract from a closed case or turn a cancelled touch into a click', () => {
    const { interaction: c, canvas } = rig();
    c.toggleInspectCartridge();
    expect(c.currentState).toBe('closed');
    const click = vi.spyOn(c as any, 'handleClick');
    pointer(canvas, 'pointerdown', 500, 400, 0);
    pointer(canvas, 'pointerdown', 500, 400, 1, 2);
    pointer(canvas, 'pointercancel', 500, 400, 10);
    expect(click).not.toHaveBeenCalled();
    expect(canvas.captured.size).toBe(0);
  });

  it('has equivalent inertia at 30 and 120 Hz, and clamps vertical tilt', () => {
    function simulate(hz: number) {
      const { interaction: c, canvas, gameCase } = rig();
      pointer(canvas, 'pointerdown', 100, 100, 0);
      pointer(canvas, 'pointermove', 130, 120, 16);
      pointer(canvas, 'pointerup', 130, 120, 17);
      for (let i = 0; i < hz * 3; i++) c.update(1 / hz);
      expect(Math.abs(gameCase.root.rotation.x)).toBeLessThanOrEqual(Math.PI / 2.8);
      return gameCase.root.rotation.y;
    }
    expect(simulate(30)).toBeCloseTo(simulate(120), 4);
  });

  it('faces the open center forward, then restores the angle when it closes', () => {
    const { interaction: c, gameCase } = rig();
    c['rotY'] = c['targetRotY'] = 1.1;
    c['rotX'] = c['targetRotX'] = 0.3;
    c.setOpen(true);
    c['caseOpenTween']!.progress(1);
    c['viewTween']!.progress(1);
    c.update(1);
    gameCase.root.updateMatrixWorld(true);
    const center = new THREE.Vector3(Math.sin(DIM.openAngle), 0, 1 - Math.cos(DIM.openAngle)).normalize();
    center.applyQuaternion(gameCase.presenter.getWorldQuaternion(new THREE.Quaternion()));
    expect(center.x).toBeCloseTo(0, 2);
    expect(center.y).toBeCloseTo(0, 2);
    expect(center.z).toBeCloseTo(1, 2);

    c.setOpen(false);
    c['caseOpenTween']!.progress(1);
    c['viewTween']!.progress(1);
    c.update(1);
    expect(gameCase.root.rotation.y).toBeCloseTo(1.1, 2);
    expect(gameCase.root.rotation.x).toBeCloseTo(0.3, 2);
  });

  it('uses a camera-relative inspection destination after responsive camera moves', () => {
    const { interaction: c, camera, card } = rig();
    c.setOpen(true); c['caseOpenTween']!.progress(1);
    c.toggleInspectCartridge(); c['cartExtractTween']!.progress(1);
    camera.position.z = 62; camera.updateMatrixWorld();
    c.update(1 / 60);
    expect(card.root.position.z).toBeCloseTo(52);
  });
});

function parentBox(mesh: THREE.Mesh) {
  mesh.updateMatrix();
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix);
}

describe('molded geometry', () => {
  it('recesses the top grip and sinks the contacts into the back', () => {
    const { card } = rig();
    card.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();

    const gripY = CART.h / 2 - 0.12;
    ray.set(new THREE.Vector3(0, gripY, 1), new THREE.Vector3(0, 0, -1));
    const gripHit = ray.intersectObject(card.root, true)[0];
    expect(gripHit.object.name).toBe('cartridge-top-recess');
    expect(gripHit.point.z).toBeLessThan(CART.d / 2 - 0.03);
    expect(gripHit.point.z).toBeGreaterThan(0);

    ray.set(new THREE.Vector3(0, gripY, -1), new THREE.Vector3(0, 0, 1));
    const gripBack = ray.intersectObject(card.root, true)[0];
    expect(gripBack.point.z).toBeGreaterThan(-CART.d / 2 - 1e-4);
    expect(gripBack.point.z).toBeLessThan(-CART.d / 2 + 0.02);

    const terminalY = -CART.h / 2 + 0.5;
    ray.set(new THREE.Vector3(0, terminalY, -1), new THREE.Vector3(0, 0, 1));
    const backHits = ray.intersectObject(card.root, true);
    const gold = backHits.find((hit) => hit.object.name === 'cartridge-contacts');
    expect(gold).toBeTruthy();
    expect(gold!.point.z).toBeGreaterThan(-CART.d / 2 + 0.02);
    expect(backHits[0].point.z).toBeGreaterThan(-CART.d / 2 + 0.01);
    expect(new THREE.Vector3(0, 0, 1).applyEuler(gold!.object.rotation).z).toBeCloseTo(-1);

    for (const hit of backHits) {
      if (!hit.object.name.startsWith('contact-divider')) continue;
      expect(hit.point.z).toBeGreaterThan(-CART.d / 2 + 0.01);
    }
  });

  it('sets the label into a shallow front well', () => {
    const { card } = rig();
    card.root.updateMatrixWorld(true);
    const label = card.root.getObjectByName('cartridge-label') as THREE.Mesh;
    expect(label.position.z).toBeLessThan(CART.d / 2 - 0.008);
    expect(label.position.z).toBeGreaterThan(CART.d / 2 - 0.024);
    const ray = new THREE.Raycaster();
    const target = new THREE.Vector3(0, 0.12, label.position.z);
    for (const origin of [
      new THREE.Vector3(0, 0.12, 3),
      new THREE.Vector3(1.1, 0.85, 2.4),
      new THREE.Vector3(-0.9, -0.15, 1.8),
    ]) {
      ray.set(origin, target.clone().sub(origin).normalize());
      expect(ray.intersectObject(card.root, true)[0]?.object.name).toBe('cartridge-label');
    }
  });

  it('recesses the insertion arrow into the front face', () => {
    const { card } = rig();
    card.root.updateMatrixWorld(true);
    const arrow = card.root.getObjectByName('cartridge-arrow') as THREE.Mesh;
    arrow.geometry.computeBoundingBox();
    const box = arrow.geometry.boundingBox!.clone().applyMatrix4(arrow.matrixWorld);
    expect(box.max.z).toBeLessThan(CART.d / 2 - 0.01);
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(0, -CART.h / 2 + 0.32, 1), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(card.root, true)[0];
    expect(hit.object.name).toBe('cartridge-arrow');
    expect(hit.point.z).toBeLessThan(CART.d / 2 - 0.01);
  });
  it('puts front booklet clips inside the lid and leaves a closed-shell clearance', () => {
    const { gameCase } = rig();
    const clip = gameCase.frontPivot.getObjectByName('clip-lip')!;
    expect(clip.position.z).toBeLessThan(-DIM.panel);
    expect(DIM.T - DIM.rimBack - DIM.rimFront).toBeGreaterThan(0);
  });

  it('splits the two shells on the mid-plane', () => {
    expect(DIM.rimBack).toBe(DIM.rimFront);
    const backLip = -DIM.T / 2 + DIM.rimBack;
    const frontLip = DIM.T / 2 - DIM.rimFront;
    expect(backLip + frontLip).toBeCloseTo(0, 6);
  });

  it('leaves each shell open toward the hinge', () => {
    const { gameCase } = rig();
    const back = gameCase.backHalf.getObjectByName('back-rim') as THREE.Mesh;
    const front = gameCase.frontPivot.getObjectByName('front-rim') as THREE.Mesh;
    const backX0 = -DIM.W / 2 + DIM.wall + DIM.gap;
    const frontX0 = DIM.wall + DIM.gap;
    const crosses = (mesh: THREE.Mesh, yLine: number, accept: (minX: number) => boolean) => {
      const pos = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.getIndex();
      const at = (i: number, k: number) => (index ? index.getX(i + k) : i + k);
      const nVerts = index ? index.count : pos.count;
      let n = 0;
      for (let i = 0; i < nVerts; i += 3) {
        const xs = [0, 1, 2].map((k) => pos.getX(at(i, k)));
        const ys = [0, 1, 2].map((k) => pos.getY(at(i, k)));
        if (Math.min(...ys) < yLine && Math.max(...ys) > yLine && accept(Math.min(...xs))) n++;
      }
      return n;
    };
    expect(crosses(back, 0, (x) => x < backX0 + DIM.rim)).toBe(0);
    expect(crosses(front, 0, (x) => x < frontX0 + DIM.rim)).toBe(0);
    const abovePull = DIM.H * 0.35 + 0.5;
    expect(crosses(back, abovePull, (x) => x > DIM.W / 2 - DIM.rim * 2)).toBeGreaterThan(0);
    expect(crosses(front, abovePull, (x) => x > DIM.W - DIM.rim * 2)).toBeGreaterThan(0);
  });

  it('recesses one pill across the closed long edge, seventy percent of its length', () => {
    const { gameCase } = rig();
    const back = gameCase.backHalf.getObjectByName('edge-recess') as THREE.Mesh;
    const front = gameCase.frontPivot.getObjectByName('edge-recess') as THREE.Mesh;
    for (const mesh of [back, front]) {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!;
      expect((b.max.y - b.min.y) / DIM.H).toBeCloseTo(0.7, 2);
      expect(b.max.x - b.min.x).toBeGreaterThan(0.3);
    }
    expect(back.geometry.boundingBox!.max.z).toBeCloseTo(-DIM.T / 2 + DIM.rimBack, 2);
    expect(front.geometry.boundingBox!.min.z).toBeCloseTo(-DIM.rimFront, 2);
    expect(back.geometry.boundingBox!.max.x).toBeCloseTo(DIM.W / 2, 2);
    expect(front.geometry.boundingBox!.max.x).toBeCloseTo(DIM.W, 2);
  });

  it('sticks the outer jacket on the outside of the clear film', () => {
    const { gameCase } = rig();
    const backPaper = parentBox(gameCase.backHalf.getObjectByName('paper-back-outer') as THREE.Mesh);
    const backSleeve = parentBox(gameCase.backHalf.getObjectByName('back-sleeve') as THREE.Mesh);
    const backInner = parentBox(gameCase.backHalf.getObjectByName('paper-back-inner') as THREE.Mesh);
    const backFloor = parentBox(gameCase.backHalf.getObjectByName('back-floor') as THREE.Mesh);
    expect(backPaper.max.z).toBeLessThan(backSleeve.min.z);
    expect(backInner.max.z).toBeLessThan(backFloor.min.z);

    const frontPaper = parentBox(gameCase.frontPivot.getObjectByName('paper-front-outer') as THREE.Mesh);
    const frontSleeve = parentBox(gameCase.frontPivot.getObjectByName('front-sleeve') as THREE.Mesh);
    expect(frontPaper.min.z).toBeGreaterThan(frontSleeve.max.z);
  });

  it('keeps the hinge seals out of both shells while opening', () => {
    const { gameCase } = rig();
    const seals = ['hinge-seal-back', 'hinge-seal-front'].map(
      (name) => gameCase.spinePivot.getObjectByName(name) as THREE.Mesh,
    );
    const backMinX = -DIM.W / 2 + DIM.wall + DIM.gap;
    const frontMinX = DIM.wall + DIM.gap;
    const into = (seal: THREE.Mesh, space: THREE.Object3D, minX: number) => {
      const pos = seal.geometry.getAttribute('position');
      const m = new THREE.Matrix4().copy(space.matrixWorld).invert().multiply(seal.matrixWorld);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m);
        if (v.x > minX - 0.004) return true;
      }
      return false;
    };
    for (const open of [0, 0.25, 0.5, 0.75, 1]) {
      gameCase.open = open;
      gameCase.update();
      gameCase.root.updateMatrixWorld(true);
      for (const seal of seals) {
        expect(into(seal, gameCase.backHalf, backMinX)).toBe(false);
        expect(into(seal, gameCase.frontPivot, frontMinX)).toBe(false);
      }
    }
  });
});

it('wraps the spine jacket continuously around both rounded shoulders', () => {
  const { gameCase } = rig();
  const paper = gameCase.spinePivot.getObjectByName('paper-spine-outer') as THREE.Mesh;
  const positions = paper.geometry.getAttribute('position');
  const normals = paper.geometry.getAttribute('normal');
  const uv = paper.geometry.getAttribute('uv');
  const last = positions.count - 2;
  expect(positions.getX(0)).toBeCloseTo(positions.getX(last));
  expect(positions.getZ(0)).toBeLessThan(0);
  expect(positions.getZ(last)).toBeGreaterThan(DIM.T);
  expect(normals.getZ(0)).toBeLessThan(-0.95);
  expect(normals.getZ(last)).toBeGreaterThan(0.95);
  expect(normals.getX(Math.floor(positions.count / 2))).toBeLessThan(-0.95);
  for (let i = 2; i < positions.count; i += 2) {
    expect(uv.getX(i)).toBeGreaterThan(uv.getX(i - 2));
  }
});
