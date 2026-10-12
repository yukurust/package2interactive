import * as THREE from 'three';
import { jacketLayout, LABEL } from './layout';
import type { GamePreset } from './presets';
import type { Quality } from '../config';

export interface CustomizationState {
  title: string;
  subtitle: string;
  spineText: string;
  showTitleOverlay: boolean;
  spineColor: string;
  frontImageObj?: HTMLImageElement;
  backImageObj?: HTMLImageElement;
  labelImageObj?: HTMLImageElement;
}

export class ArtworkManager {
  readonly outerCanvas: HTMLCanvasElement;
  readonly innerCanvas: HTMLCanvasElement;
  readonly labelCanvas: HTMLCanvasElement;
  readonly backDetailCanvas: HTMLCanvasElement;

  readonly outerTexture: THREE.CanvasTexture;
  readonly innerTexture: THREE.CanvasTexture;
  readonly labelTexture: THREE.CanvasTexture;
  readonly backDetailTexture: THREE.CanvasTexture;

  private readonly ctxOuter: CanvasRenderingContext2D;
  private readonly ctxInner: CanvasRenderingContext2D;
  private readonly ctxLabel: CanvasRenderingContext2D;
  private readonly ctxBackDetail: CanvasRenderingContext2D;

  private imageCache = new Map<string, HTMLImageElement>();

  constructor(private readonly quality: Quality) {
    const layout = jacketLayout();
    const px = quality.artPx;

    // Jacket canvas dimensions
    const jacketW = Math.round(layout.total * px);
    const jacketH = Math.round(layout.h * px);

    this.outerCanvas = document.createElement('canvas');
    this.outerCanvas.width = jacketW;
    this.outerCanvas.height = jacketH;
    this.ctxOuter = this.outerCanvas.getContext('2d')!;

    this.innerCanvas = document.createElement('canvas');
    this.innerCanvas.width = jacketW;
    this.innerCanvas.height = jacketH;
    this.ctxInner = this.innerCanvas.getContext('2d')!;

    // Cartridge label canvas
    const labelW = Math.round(LABEL.w * px * 2.2);
    const labelH = Math.round(LABEL.h * px * 2.2);
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = labelW;
    this.labelCanvas.height = labelH;
    this.ctxLabel = this.labelCanvas.getContext('2d')!;

    // Cartridge back molding detail canvas
    this.backDetailCanvas = document.createElement('canvas');
    this.backDetailCanvas.width = 512;
    this.backDetailCanvas.height = 256;
    this.ctxBackDetail = this.backDetailCanvas.getContext('2d')!;

    // Textures
    this.outerTexture = new THREE.CanvasTexture(this.outerCanvas);
    this.innerTexture = new THREE.CanvasTexture(this.innerCanvas);
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.backDetailTexture = new THREE.CanvasTexture(this.backDetailCanvas);

    const setupTexture = (t: THREE.CanvasTexture) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = quality.anisotropy;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
    };

    setupTexture(this.outerTexture);
    setupTexture(this.innerTexture);
    setupTexture(this.labelTexture);
    setupTexture(this.backDetailTexture);

    this.renderBackMolding();
  }

  async loadImage(url: string): Promise<HTMLImageElement> {
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url)!;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  private drawCoverImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const imgRatio = img.width / img.height;
    const destRatio = w / h;
    let sx = 0,
      sy = 0,
      sw = img.width,
      sh = img.height;

    if (imgRatio > destRatio) {
      sw = img.height * destRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / destRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  private drawStarEmblem(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    color = '#f5c542',
  ) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    // Outer thin halo ring
    ctx.lineWidth = Math.max(1.5, radius * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // 4-point star
    ctx.beginPath();
    const rOuter = radius * 1.05;
    const rInner = radius * 0.22;
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawBarcode(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    code: string,
  ) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#111114';
    // Draw pseudo barcode lines
    let curX = x + 6;
    const barWMax = w - 12;
    let seed = 42;
    const nextRand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    while (curX < x + barWMax - 8) {
      const barWidth = 1 + Math.floor(nextRand() * 3);
      const gap = 1 + Math.floor(nextRand() * 4);
      ctx.fillRect(curX, y + 4, barWidth, h - 16);
      curX += barWidth + gap;
    }

    ctx.font = '500 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, x + w / 2, y + h - 4);
    ctx.restore();
  }

  async render(preset: GamePreset, custom: CustomizationState) {
    const layout = jacketLayout();
    const px = this.quality.artPx;

    const jacketW = this.outerCanvas.width;
    const jacketH = this.outerCanvas.height;

    const backW = Math.round(layout.coverW * px);
    const spineW = Math.round(layout.spineW * px);
    const spineX = backW;
    const frontX = spineX + spineW;
    const frontW = jacketW - frontX;

    // Load images
    const frontImg = custom.frontImageObj || (await this.loadImage(preset.frontImage));
    const backImg = custom.backImageObj || (await this.loadImage(preset.backImage));

    /* ------------------------------------------------------------- */
    /* 1. OUTER JACKET (Back cover | Spine | Front cover)             */
    /* ------------------------------------------------------------- */
    const ctx = this.ctxOuter;
    ctx.clearRect(0, 0, jacketW, jacketH);

    // --- Back Cover ---
    if (backImg) {
      this.drawCoverImage(ctx, backImg, 0, 0, backW, jacketH);
    } else {
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(0, 0, backW, jacketH);
    }

    // Back cover subtle darkening overlay for editorial typography readability
    const backGrad = ctx.createLinearGradient(0, 0, 0, jacketH);
    backGrad.addColorStop(0, 'rgba(10, 14, 24, 0.75)');
    backGrad.addColorStop(0.35, 'rgba(10, 14, 24, 0.45)');
    backGrad.addColorStop(0.7, 'rgba(10, 14, 24, 0.7)');
    backGrad.addColorStop(1, 'rgba(10, 14, 24, 0.95)');
    ctx.fillStyle = backGrad;
    ctx.fillRect(0, 0, backW, jacketH);

    // Back title & synopsis
    const margin = Math.round(backW * 0.08);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';

    // Back category tag
    ctx.font = `600 ${Math.round(backW * 0.026)}px Inter, sans-serif`;
    ctx.fillStyle = preset.accentColor;
    ctx.fillText('LUMEN WORKS PRESENTS', margin, margin + 14);

    // Back headline
    ctx.font = `700 ${Math.round(backW * 0.052)}px ${preset.fontTitle}, serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(custom.title, margin, margin + 44);

    // Synopsis wrap
    ctx.font = `400 ${Math.round(backW * 0.032)}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    const words = preset.synopsis.split(' ');
    let line = '';
    let lineY = margin + 82;
    const maxLineW = backW - margin * 2;
    for (const w of words) {
      const testLine = line + w + ' ';
      if (ctx.measureText(testLine).width > maxLineW && line !== '') {
        ctx.fillText(line, margin, lineY);
        line = w + ' ';
        lineY += 22;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line, margin, lineY);

    // Feature tags
    let featY = lineY + 36;
    for (const f of preset.features) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      const pillW = ctx.measureText(f).width + 24;
      ctx.fillRect(margin, featY - 14, pillW, 22);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(margin, featY - 14, pillW, 22);

      ctx.fillStyle = '#ffffff';
      ctx.font = `500 ${Math.round(backW * 0.026)}px Inter, sans-serif`;
      ctx.fillText(f, margin + 12, featY + 2);
      featY += 28;
    }

    // Barcode & specs at bottom
    this.drawBarcode(ctx, margin, jacketH - margin - 46, 120, 46, '4 902370 536034');
    ctx.restore();

    // --- Spine ---
    ctx.save();
    ctx.fillStyle = custom.spineColor || preset.spineColor;
    ctx.fillRect(spineX, 0, spineW, jacketH);

    // Top logo / star mark on spine
    this.drawStarEmblem(ctx, spineX + spineW / 2, spineW * 0.8, spineW * 0.32, '#ffffff');

    // Vertical text on spine
    ctx.save();
    ctx.translate(spineX + spineW / 2, jacketH * 0.52);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = preset.spineTextColor;
    ctx.font = `700 ${Math.round(spineW * 0.44)}px ${preset.fontTitle}, sans-serif`;
    ctx.letterSpacing = '1px';
    ctx.fillText(custom.spineText, 0, 0);
    ctx.restore();

    // Bottom publisher mark on spine
    this.drawStarEmblem(ctx, spineX + spineW / 2, jacketH - spineW * 0.8, spineW * 0.28, '#ffffff');
    ctx.restore();

    // --- Front Cover ---
    if (frontImg) {
      this.drawCoverImage(ctx, frontImg, frontX, 0, frontW, jacketH);
    }

    // Top-left brand notch banner (matching the signature game package style)
    const notchW = frontW * 0.2;
    const notchH = notchW * 0.68;
    ctx.fillStyle = custom.spineColor || preset.spineColor;
    ctx.fillRect(frontX, 0, notchW, notchH);
    // Bevel/radius bottom right of notch
    ctx.beginPath();
    ctx.moveTo(frontX + notchW, 0);
    ctx.lineTo(frontX + notchW, notchH - 8);
    ctx.quadraticCurveTo(frontX + notchW, notchH, frontX + notchW - 8, notchH);
    ctx.lineTo(frontX, notchH);
    ctx.closePath();
    ctx.fill();

    // Top star inside notch
    this.drawStarEmblem(ctx, frontX + notchW / 2, notchH / 2, notchH * 0.3, '#ffffff');

    // Title overlay (can be toggled)
    if (custom.showTitleOverlay) {
      const centerX = frontX + frontW / 2;
      const titleY = jacketH * 0.22;

      ctx.save();
      ctx.textAlign = 'center';

      // Compass rose / star emblem above title
      this.drawStarEmblem(ctx, centerX, titleY - 54, 28, preset.accentColor);

      // Title drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;

      ctx.font = `900 ${Math.round(frontW * 0.125)}px ${preset.fontTitle}, serif`;
      ctx.fillStyle = '#ffffff';
      ctx.letterSpacing = '3px';
      ctx.fillText(custom.title, centerX, titleY);

      // Subtitle
      if (custom.subtitle) {
        ctx.shadowBlur = 10;
        ctx.font = `italic 600 ${Math.round(frontW * 0.046)}px ${preset.fontSub}, serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.letterSpacing = '1px';
        ctx.fillText(`— ${custom.subtitle} —`, centerX, titleY + 34);
      }
      ctx.restore();
    }

    this.outerTexture.needsUpdate = true;

    /* ------------------------------------------------------------- */
    /* 2. INNER JACKET (Airy illustration visible through plastic)   */
    /* ------------------------------------------------------------- */
    const ctxIn = this.ctxInner;
    ctxIn.clearRect(0, 0, jacketW, jacketH);

    // Draw panoramic back artwork desaturated & luminous
    if (backImg || frontImg) {
      const spreadImg = backImg || frontImg;
      this.drawCoverImage(ctxIn, spreadImg, 0, 0, jacketW, jacketH);
    }

    // High key translucent frost wash (like double-sided printed paper in clear case)
    const frost = ctxIn.createLinearGradient(0, 0, jacketW, jacketH);
    frost.addColorStop(0, 'rgba(240, 246, 255, 0.82)');
    frost.addColorStop(0.5, 'rgba(245, 250, 255, 0.78)');
    frost.addColorStop(1, 'rgba(240, 246, 255, 0.84)');
    ctxIn.fillStyle = frost;
    ctxIn.fillRect(0, 0, jacketW, jacketH);

    // Subtle celestial orbital paths / map lines
    ctxIn.save();
    ctxIn.strokeStyle = 'rgba(80, 130, 180, 0.28)';
    ctxIn.lineWidth = 2;
    ctxIn.setLineDash([8, 8]);
    ctxIn.beginPath();
    ctxIn.arc(jacketW * 0.6, jacketH * 0.35, jacketH * 0.5, 0, Math.PI * 2);
    ctxIn.stroke();
    ctxIn.beginPath();
    ctxIn.arc(jacketW * 0.35, jacketH * 0.6, jacketH * 0.7, 0, Math.PI * 2);
    ctxIn.stroke();

    // Subtle compass rose watermark
    this.drawStarEmblem(ctxIn, jacketW * 0.5, jacketH * 0.45, 42, 'rgba(80, 130, 180, 0.35)');
    ctxIn.restore();

    this.innerTexture.needsUpdate = true;

    /* ------------------------------------------------------------- */
    /* 3. CARTRIDGE LABEL (Recessed front sticker)                   */
    /* ------------------------------------------------------------- */
    const ctxL = this.ctxLabel;
    const lw = this.labelCanvas.width;
    const lh = this.labelCanvas.height;
    ctxL.clearRect(0, 0, lw, lh);

    // Front image as base
    const labelImg = custom.labelImageObj || frontImg;
    if (labelImg) {
      this.drawCoverImage(ctxL, labelImg, 0, 0, lw, lh);
    } else {
      ctxL.fillStyle = '#1e2430';
      ctxL.fillRect(0, 0, lw, lh);
    }

    // Top red banner
    const bannerH = lh * 0.22;
    ctxL.fillStyle = custom.spineColor || preset.spineColor;
    ctxL.fillRect(0, 0, lw, bannerH);

    // Star in banner
    this.drawStarEmblem(ctxL, lw / 2, bannerH / 2, bannerH * 0.32, '#ffffff');

    // Title in center of label
    ctxL.save();
    ctxL.textAlign = 'center';
    ctxL.fillStyle = '#ffffff';
    ctxL.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctxL.shadowBlur = 8;
    ctxL.shadowOffsetY = 2;
    ctxL.font = `800 ${Math.round(lw * 0.16)}px ${preset.fontTitle}, sans-serif`;
    ctxL.fillText(custom.title, lw / 2, lh * 0.52);

    if (custom.subtitle) {
      ctxL.font = `600 ${Math.round(lw * 0.07)}px ${preset.fontSub}, sans-serif`;
      ctxL.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctxL.fillText(custom.subtitle, lw / 2, lh * 0.62);
    }

    // Bottom dark area with cartridge catalog code
    const botH = lh * 0.14;
    ctxL.shadowColor = 'transparent';
    ctxL.fillStyle = 'rgba(15, 17, 22, 0.88)';
    ctxL.fillRect(0, lh - botH, lw, botH);

    ctxL.font = `600 ${Math.round(lw * 0.055)}px monospace`;
    ctxL.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctxL.fillText(preset.cartridgeCode, lw / 2, lh - botH * 0.35);
    ctxL.restore();

    this.labelTexture.needsUpdate = true;
  }

  private renderBackMolding() {
    const ctx = this.ctxBackDetail;
    const w = this.backDetailCanvas.width;
    const h = this.backDetailCanvas.height;

    ctx.fillStyle = '#1b1b1e';
    ctx.fillRect(0, 0, w, h);

    // Subtle molded text & symbols
    ctx.fillStyle = '#2d2d34';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HAC-008', w / 2, h * 0.35);

    ctx.font = '500 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('MODEL NO. HAC-008   MADE IN JAPAN', w / 2, h * 0.55);

    // CE & trash icons
    ctx.font = '700 28px sans-serif';
    ctx.fillText('CE', w * 0.28, h * 0.78);
    ctx.fillText('UKCA', w * 0.72, h * 0.78);

    this.backDetailTexture.needsUpdate = true;
  }
}
