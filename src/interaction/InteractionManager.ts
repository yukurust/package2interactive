import * as THREE from 'three';
import gsap from 'gsap';
import { prefersReducedMotion } from '../config';
import type { GameCase } from '../model/GameCase';
import type { Cartridge } from '../model/Cartridge';
import type { SceneManager } from '../scene/SceneManager';

export type ViewState = 'closed' | 'open' | 'inspecting';
const REST = { x: 0.055, y: 0.48 };
const TILT_LIMIT = Math.PI / 2.8;

export class InteractionManager {
  private pointerId: number | null = null;
  private pointerStart = new THREE.Vector2();
  private lastPointer = new THREE.Vector2();
  private pointerMoved = false;
  private lastMoveTime = 0;
  private rotY = REST.y;
  private rotX = REST.x;
  private targetRotY = REST.y;
  private targetRotX = REST.x;
  private velY = 0;
  private velX = 0;
  private cartRotY = 0;
  private cartRotX = 0;
  private targetCartRotY = 0;
  private targetCartRotX = 0;
  private caseOpenTween?: gsap.core.Tween;
  private cartExtractTween?: gsap.core.Tween;
  private viewTween?: gsap.core.Tween;
  /** Orbit captured when the case leaves the closed pose, restored on close. */
  private heldRotX = REST.x;
  private heldRotY = REST.y;
  private viewHeld = false;
  private inspectProgress = 0;
  private isInspecting = false;
  private targetOpen = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dockPos = new THREE.Vector3();
  private readonly dockQuat = new THREE.Quaternion();
  private readonly liftPos = new THREE.Vector3();
  private readonly inspectPos = new THREE.Vector3();
  private readonly inspectQuat = new THREE.Quaternion();
  onStateChange?: (state: ViewState) => void;

  constructor(
    private readonly sm: SceneManager,
    private readonly gameCase: GameCase,
    private readonly cartridge: Cartridge,
  ) {
    sm.scene.add(cartridge.root);
    gameCase.root.rotation.set(this.rotX, this.rotY, 0);
    this.bindEvents();
  }

  get currentState(): ViewState {
    return this.isInspecting ? 'inspecting' : this.targetOpen ? 'open' : 'closed';
  }

  get canInspect() {
    return this.targetOpen && this.gameCase.open > 0.92;
  }

  private duration(seconds: number) {
    return prefersReducedMotion() ? 0 : seconds;
  }

  private bindEvents() {
    const el = this.sm.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0 || this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      this.pointerMoved = false;
      this.pointerStart.set(e.clientX, e.clientY);
      this.lastPointer.copy(this.pointerStart);
      this.lastMoveTime = e.timeStamp;
      this.velX = this.velY = 0;
      this.viewTween?.kill();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      const dt = Math.max(8, e.timeStamp - this.lastMoveTime) / 1000;
      this.pointerMoved ||= Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) > 6;
      this.lastPointer.set(e.clientX, e.clientY);
      this.lastMoveTime = e.timeStamp;
      if (!this.pointerMoved) return;
      if (this.isInspecting) {
        this.targetCartRotY += dx * 0.012;
        this.targetCartRotX = THREE.MathUtils.clamp(this.targetCartRotX + dy * 0.012, -1.3, 1.3);
      } else {
        this.targetRotY += dx * 0.007;
        this.targetRotX = THREE.MathUtils.clamp(this.targetRotX + dy * 0.007, -TILT_LIMIT, TILT_LIMIT);
        this.velY = THREE.MathUtils.clamp(dx * 0.007 / dt, -4, 4);
        this.velX = THREE.MathUtils.clamp(dy * 0.007 / dt, -3, 3);
        if (!this.targetOpen) this.viewHeld = false;
      }
    });
    const release = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (cancelled || e.timeStamp - this.lastMoveTime > 90) this.velX = this.velY = 0;
      if (!cancelled && !this.pointerMoved) this.handleClick(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', (e) => release(e, false));
    el.addEventListener('pointercancel', (e) => release(e, true));
    el.addEventListener('lostpointercapture', (e) => release(e, true));
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key.toLowerCase() === 'o') this.toggleOpen();
      if (e.key.toLowerCase() === 'r') this.resetView();
      if (e.key.toLowerCase() === 'c') this.toggleInspectCartridge();
      if (e.key === 'Escape' && this.isInspecting) this.dockCartridge();
    });
  }

  private handleClick(x: number, y: number) {
    const rect = this.sm.canvas.getBoundingClientRect();
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.sm.camera);
    if (this.isInspecting) {
      this.dockCartridge();
      return;
    }
    // Sort both models together: never select a card through an opaque jacket.
    const hits = this.raycaster.intersectObjects([this.cartridge.root, this.gameCase.root], true);
    const hit = hits.find(({ object }) => {
      const material = (object as THREE.Mesh).material;
      return !(material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0.5);
    }) ?? hits[0];
    if (!hit) return;
    if (hit.object.userData.part === 'cartridge' && this.targetOpen && this.gameCase.open > 0.92) {
      this.toggleInspectCartridge();
    } else this.toggleOpen();
  }

  toggleOpen() {
    this.setOpen(!this.targetOpen);
  }

  setOpen(open: boolean) {
    const changed = open !== this.targetOpen;
    this.targetOpen = open;
    this.caseOpenTween?.kill();
    const docking = !open && (this.isInspecting || this.inspectProgress > 0);
    if (docking) this.dockCartridge();
    else this.animateLid();
    if (changed && open) this.presentOpen();
    else if (changed && !open && !docking) this.presentClosed();
    this.onStateChange?.(this.currentState);
  }

  private lidSeconds() {
    const span = Math.abs(Number(this.targetOpen) - this.gameCase.open);
    return (this.targetOpen ? 1.1 : 0.9) * span;
  }

  private animateLid() {
    this.caseOpenTween?.kill();
    this.caseOpenTween = gsap.to(this.gameCase, {
      open: this.targetOpen ? 1 : 0,
      duration: this.duration(this.lidSeconds()),
      ease: 'power2.inOut',
      onUpdate: () => this.gameCase.update(),
      onComplete: () => this.onStateChange?.(this.currentState),
    });
  }

  /** Shortest equivalent yaw, so the next turn does not unwind extra revolutions. */
  private unwrapYaw() {
    const yaw = THREE.MathUtils.euclideanModulo(this.rotY + Math.PI, Math.PI * 2) - Math.PI;
    this.rotY = this.targetRotY = yaw;
  }

  private orientView(x: number, y: number, onComplete?: () => void) {
    this.velX = this.velY = 0;
    this.viewTween?.kill();
    this.viewTween = gsap.to(this, {
      targetRotX: x,
      targetRotY: y,
      duration: this.duration(this.lidSeconds()),
      ease: 'power2.inOut',
      onComplete,
    });
  }

  /** Turn so the opening's center, which the case aims at local +Z, faces the camera. */
  private presentOpen() {
    if (!this.viewHeld) {
      this.unwrapYaw();
      this.heldRotX = this.targetRotX;
      this.heldRotY = this.targetRotY;
      this.viewHeld = true;
    }
    this.orientView(0, 0);
  }

  private presentClosed() {
    this.unwrapYaw();
    const x = this.viewHeld ? this.heldRotX : REST.x;
    const y = this.viewHeld ? this.heldRotY : REST.y;
    this.orientView(x, y, () => { this.viewHeld = false; });
  }

  toggleInspectCartridge() {
    if (this.isInspecting) this.dockCartridge();
    else if (this.targetOpen && this.gameCase.open > 0.92) {
      this.isInspecting = true;
      this.velX = this.velY = 0;
      this.cartExtractTween?.kill();
      this.cartExtractTween = gsap.to(this, {
        inspectProgress: 1,
        duration: this.duration(0.95),
        ease: 'power2.inOut',
      });
      this.onStateChange?.(this.currentState);
    }
  }

  private dockCartridge() {
    this.isInspecting = false;
    this.cartExtractTween?.kill();
    this.cartExtractTween = gsap.to(this, {
      inspectProgress: 0,
      duration: this.duration(0.8),
      ease: 'power2.inOut',
      onComplete: () => {
        this.cartRotX = this.cartRotY = this.targetCartRotX = this.targetCartRotY = 0;
        if (!this.targetOpen) {
          this.animateLid();
          this.presentClosed();
        }
      },
    });
    this.onStateChange?.(this.currentState);
  }

  resetView() {
    this.velX = this.velY = 0;
    if (this.isInspecting) this.dockCartridge();
    this.unwrapYaw();
    if (!this.targetOpen) this.viewHeld = false;
    const x = this.targetOpen ? 0 : REST.x;
    const y = this.targetOpen ? 0 : REST.y;
    this.viewTween?.kill();
    this.viewTween = gsap.to(this, {
      targetRotY: y, targetRotX: x,
      duration: this.duration(0.75), ease: 'power2.out',
    });
  }

  update(delta: number) {
    const reduced = prefersReducedMotion();
    if (this.pointerId === null) {
      const decay = Math.exp(-7 * delta);
      const travel = reduced ? 0 : (1 - decay) / 7;
      this.targetRotX += this.velX * travel;
      this.targetRotY += this.velY * travel;
      this.velX *= decay;
      this.velY *= decay;
    }
    this.targetRotX = THREE.MathUtils.clamp(this.targetRotX, -TILT_LIMIT, TILT_LIMIT);
    const blend = reduced ? 1 : 1 - Math.exp(-16 * delta);
    this.rotX = THREE.MathUtils.lerp(this.rotX, this.targetRotX, blend);
    this.rotY = THREE.MathUtils.lerp(this.rotY, this.targetRotY, blend);
    this.gameCase.root.rotation.set(this.rotX, this.rotY, 0);
    this.sm.fitPackage(this.gameCase.open, delta);
    this.cartRotX = THREE.MathUtils.lerp(this.cartRotX, this.targetCartRotX, blend);
    this.cartRotY = THREE.MathUtils.lerp(this.cartRotY, this.targetCartRotY, blend);

    this.gameCase.cartridgeAnchor.getWorldPosition(this.dockPos);
    this.gameCase.cartridgeAnchor.getWorldQuaternion(this.dockQuat);
    const t = this.inspectProgress;
    // Lift clear of the retaining tabs before moving toward the camera.
    this.liftPos.set(0, 0, 1.1).applyQuaternion(this.dockQuat).add(this.dockPos);
    this.inspectPos.set(0, 0.3, -10).applyMatrix4(this.sm.camera.matrixWorld);
    this.sm.camera.getWorldQuaternion(this.inspectQuat);
    const travel = THREE.MathUtils.smoothstep(t, 0.22, 1);
    this.cartridge.root.position.lerpVectors(this.dockPos, this.liftPos, THREE.MathUtils.smoothstep(t, 0, 0.28));
    this.cartridge.root.position.lerp(this.inspectPos, travel);
    this.cartridge.root.quaternion.slerpQuaternions(this.dockQuat, this.inspectQuat, travel);
    this.cartridge.spinner.rotation.set(this.cartRotX * travel, this.cartRotY * travel, 0);
    this.gameCase.setTabFlex(Math.sin(Math.PI * THREE.MathUtils.clamp(t / 0.35, 0, 1)));
  }
}
