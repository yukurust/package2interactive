import * as THREE from 'three';
import gsap from 'gsap';
import type { GameCase } from '../model/GameCase';
import type { Cartridge } from '../model/Cartridge';
import type { SceneManager } from '../scene/SceneManager';

export type ViewState = 'closed' | 'open' | 'inspecting';

export class InteractionManager {
  private isPointerDown = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerMoved = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Case Orbit Rotation (Spherical coordinates / Euler)
  private rotY = -0.15;
  private rotX = 0.08;
  private targetRotY = -0.15;
  private targetRotX = 0.08;
  private velY = 0;
  private velX = 0;

  // Cartridge Inspection Flip Rotation
  private cartRotY = 0;
  private cartRotX = 0;
  private targetCartRotY = 0;
  private targetCartRotX = 0;

  // Animation states
  private caseOpenTween?: gsap.core.Tween;
  private cartExtractTween?: gsap.core.Tween;
  private resetTween?: gsap.core.Timeline;

  /** 0 = docked in holder, 1 = floating in inspection pose */
  private inspectProgress = 0;
  private isInspecting = false;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  // Temporary vectors for matrix calculations
  private readonly tempPos = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();
  private readonly inspectTargetPos = new THREE.Vector3(0, 0, 16);
  private readonly inspectTargetQuat = new THREE.Quaternion();

  onStateChange?: (state: ViewState) => void;

  constructor(
    private readonly sm: SceneManager,
    private readonly gameCase: GameCase,
    private readonly cartridge: Cartridge,
  ) {
    // Add cartridge directly to scene root so it can seamlessly travel between docked & inspection space
    this.sm.scene.add(this.cartridge.root);

    // Initial default rotation
    this.gameCase.root.rotation.set(this.rotX, this.rotY, 0);

    this.bindEvents();
  }

  get currentState(): ViewState {
    if (this.isInspecting) return 'inspecting';
    return this.gameCase.open > 0.5 ? 'open' : 'closed';
  }

  private bindEvents() {
    const el = this.sm.canvas;

    el.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    window.addEventListener('pointercancel', this.onPointerUp.bind(this));

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        this.toggleOpen();
      } else if (e.key === 'r' || e.key === 'R') {
        this.resetView();
      } else if (e.key === 'c' || e.key === 'C') {
        if (this.gameCase.open > 0.4) {
          this.toggleInspectCartridge();
        }
      }
    });
  }

  private onPointerDown(e: PointerEvent) {
    this.isPointerDown = true;
    this.pointerMoved = false;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.velX = 0;
    this.velY = 0;
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.isPointerDown) return;

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;

    if (Math.abs(e.clientX - this.pointerStartX) > 5 || Math.abs(e.clientY - this.pointerStartY) > 5) {
      this.pointerMoved = true;
    }

    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (this.isInspecting) {
      // Rotating the inspected cartridge
      this.targetCartRotY += dx * 0.015;
      this.targetCartRotX += dy * 0.015;
      this.targetCartRotX = THREE.MathUtils.clamp(this.targetCartRotX, -Math.PI / 2.5, Math.PI / 2.5);
    } else {
      // Orbiting the entire case
      this.velY = dx * 0.007;
      this.velX = dy * 0.007;
      this.targetRotY += this.velY;
      this.targetRotX += this.velX;

      // Vertical tilt limits
      this.targetRotX = THREE.MathUtils.clamp(this.targetRotX, -Math.PI / 2.8, Math.PI / 2.8);
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    // Check if this was a tap/click rather than a drag
    if (!this.pointerMoved) {
      this.handleClick(e.clientX, e.clientY);
    }
  }

  private handleClick(clientX: number, clientY: number) {
    const rect = this.sm.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.sm.camera);

    // Check cartridge hit first
    const cartHits = this.raycaster.intersectObject(this.cartridge.root, true);
    if (cartHits.length > 0) {
      if (this.isInspecting) {
        this.toggleInspectCartridge();
        return;
      } else if (this.gameCase.open > 0.3) {
        this.toggleInspectCartridge();
        return;
      }
    }

    // Check case hit
    const caseHits = this.raycaster.intersectObject(this.gameCase.root, true);
    if (caseHits.length > 0) {
      if (this.isInspecting) {
        this.toggleInspectCartridge();
      } else {
        this.toggleOpen();
      }
    } else if (this.isInspecting) {
      // Clicked outside while inspecting -> dock back
      this.toggleInspectCartridge();
    }
  }

  toggleOpen() {
    if (this.isInspecting) {
      this.dockCartridge(() => this.toggleOpen());
      return;
    }

    const target = this.gameCase.open > 0.5 ? 0 : 1;
    this.caseOpenTween?.kill();

    const currentOpen = { val: this.gameCase.open };
    const isOpening = target === 1;

    this.caseOpenTween = gsap.to(currentOpen, {
      val: target,
      duration: isOpening ? 1.15 : 0.95,
      ease: isOpening ? 'power2.out' : 'power2.inOut',
      onUpdate: () => {
        this.gameCase.open = currentOpen.val;
        this.gameCase.update();
      },
      onComplete: () => {
        this.onStateChange?.(this.currentState);
      },
    });

    this.onStateChange?.(isOpening ? 'open' : 'closed');
  }

  setOpen(open: boolean) {
    if ((this.gameCase.open > 0.5) === open) return;
    this.toggleOpen();
  }

  toggleInspectCartridge() {
    if (this.isInspecting) {
      this.dockCartridge();
    } else {
      this.extractCartridge();
    }
  }

  private extractCartridge() {
    this.isInspecting = true;
    this.cartExtractTween?.kill();

    // Flex holder tabs outward
    gsap.fromTo(
      { flex: 0 },
      { flex: 1 },
      {
        duration: 0.25,
        yoyo: true,
        repeat: 1,
        ease: 'power2.out',
        onUpdate: function () {
          // @ts-expect-error GSAP target
          this.gameCase?.setTabFlex(this.targets()[0].flex);
        }.bind(this),
      },
    );

    const prog = { t: this.inspectProgress };
    this.cartExtractTween = gsap.to(prog, {
      t: 1,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => {
        this.inspectProgress = prog.t;
      },
      onComplete: () => {
        this.onStateChange?.(this.currentState);
      },
    });

    this.onStateChange?.('inspecting');
  }

  private dockCartridge(onComplete?: () => void) {
    this.isInspecting = false;
    this.cartExtractTween?.kill();

    const prog = { t: this.inspectProgress };
    this.cartExtractTween = gsap.to(prog, {
      t: 0,
      duration: 0.75,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.inspectProgress = prog.t;
      },
      onComplete: () => {
        // Tab snap flex effect when docking back
        gsap.fromTo(
          { flex: 0 },
          { flex: 0.6 },
          {
            duration: 0.18,
            yoyo: true,
            repeat: 1,
            ease: 'power2.out',
            onUpdate: function () {
              // @ts-expect-error GSAP target
              this.gameCase?.setTabFlex(this.targets()[0].flex);
            }.bind(this),
          },
        );
        this.targetCartRotX = 0;
        this.targetCartRotY = 0;
        this.onStateChange?.(this.currentState);
        onComplete?.();
      },
    });

    this.onStateChange?.(this.gameCase.open > 0.5 ? 'open' : 'closed');
  }

  resetView() {
    this.resetTween?.kill();
    this.resetTween = gsap.timeline();

    if (this.isInspecting) {
      this.dockCartridge();
    }

    this.resetTween.to(this, {
      targetRotY: -0.15,
      targetRotX: 0.08,
      velX: 0,
      velY: 0,
      duration: 0.85,
      ease: 'power2.out',
    });
  }

  update(delta: number) {
    // 1. Smooth case orbit with inertia damping
    if (!this.isPointerDown) {
      this.velX *= 0.92;
      this.velY *= 0.92;
      this.targetRotX += this.velX;
      this.targetRotY += this.velY;
    }

    const lerpSpeed = Math.min(1, delta * 12);
    this.rotX = THREE.MathUtils.lerp(this.rotX, this.targetRotX, lerpSpeed);
    this.rotY = THREE.MathUtils.lerp(this.rotY, this.targetRotY, lerpSpeed);
    this.gameCase.root.rotation.set(this.rotX, this.rotY, 0);

    // 2. Smooth cartridge inspection rotation
    this.cartRotX = THREE.MathUtils.lerp(this.cartRotX, this.targetCartRotX, lerpSpeed);
    this.cartRotY = THREE.MathUtils.lerp(this.cartRotY, this.targetCartRotY, lerpSpeed);

    // 3. Cartridge position interpolation (Docked <--> Inspected)
    this.gameCase.cartridgeAnchor.getWorldPosition(this.tempPos);
    this.gameCase.cartridgeAnchor.getWorldQuaternion(this.tempQuat);

    if (this.inspectProgress <= 0.001) {
      // Firmly docked
      this.cartridge.root.position.copy(this.tempPos);
      this.cartridge.root.quaternion.copy(this.tempQuat);
      this.cartridge.spinner.rotation.set(0, 0, 0);
    } else {
      // Floating in inspection or transitioning
      const t = this.inspectProgress;
      const smoothT = t * t * (3 - 2 * t); // Smoothstep

      // Camera relative inspection spot (centered, floating slightly above ground)
      this.inspectTargetPos.set(0, 0, 18);
      this.inspectTargetQuat.set(0, 0, 0, 1);

      this.cartridge.root.position.lerpVectors(this.tempPos, this.inspectTargetPos, smoothT);
      this.cartridge.root.quaternion.slerpQuaternions(this.tempQuat, this.inspectTargetQuat, smoothT);

      // Add gentle idle floating bob when inspected
      if (t > 0.8) {
        const time = performance.now() * 0.002;
        const bob = Math.sin(time) * 0.15;
        this.cartridge.root.position.y += bob * (t - 0.8) * 5;
      }

      this.cartridge.spinner.rotation.set(this.cartRotX * smoothT, this.cartRotY * smoothT, 0);
    }
  }
}
