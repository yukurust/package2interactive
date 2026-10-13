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

  it('uses a camera-relative inspection destination after responsive camera moves', () => {
    const { interaction: c, camera, card } = rig();
    c.setOpen(true); c['caseOpenTween']!.progress(1);
    c.toggleInspectCartridge(); c['cartExtractTween']!.progress(1);
    camera.position.z = 62; camera.updateMatrixWorld();
    c.update(1 / 60);
    expect(card.root.position.z).toBeCloseTo(52);
  });
});

describe('molded geometry', () => {
  it('puts cartridge contacts outside the body, facing the back', () => {
    const { card } = rig();
    const contacts = card.root.getObjectByName('cartridge-contacts')!;
    expect(contacts.position.z).toBeLessThan(-CART.d / 2);
    expect(new THREE.Vector3(0, 0, 1).applyEuler(contacts.rotation).z).toBeCloseTo(-1);
  });
  it('puts front booklet clips inside the lid and leaves a closed-shell clearance', () => {
    const { gameCase } = rig();
    const clip = gameCase.frontPivot.getObjectByName('clip-lip')!;
    expect(clip.position.z).toBeLessThan(-DIM.panel);
    expect(DIM.T - DIM.rimBack - DIM.rimFront).toBeGreaterThan(0);
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
