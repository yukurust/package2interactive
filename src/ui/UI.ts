import { PRESETS, type GamePreset } from '../art/presets';
import { CASE_TINTS, type PlasticSet } from '../model/materials';
import type { ArtworkManager, CustomizationState } from '../art/canvasArt';
import type { InteractionManager, ViewState } from '../interaction/InteractionManager';

export class UIManager {
  private renderRequest = 0;
  private uploadGeneration = 0;
  private uploadRequests = new Map<string, number>();
  private readonly status = document.getElementById('status')!;
  private activePreset: GamePreset = PRESETS[0];
  private customState: CustomizationState = {
    title: PRESETS[0].title,
    subtitle: PRESETS[0].subtitle,
    spineText: PRESETS[0].spineText,
    showTitleOverlay: true,
    spineColor: PRESETS[0].spineColor,
  };

  private readonly btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
  private readonly btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
  private readonly btnColor = document.getElementById('btn-color') as HTMLButtonElement;
  private readonly colorDot = document.getElementById('color-dot') as HTMLElement;
  private readonly colorPop = document.getElementById('color-pop') as HTMLElement;
  private readonly btnEdit = document.getElementById('btn-edit') as HTMLButtonElement;
  private readonly rail = document.getElementById('rail') as HTMLElement;
  private readonly hint = document.getElementById('hint') as HTMLElement;
  private readonly panel = document.getElementById('panel') as HTMLElement;
  private readonly panelClose = document.getElementById('panel-close') as HTMLButtonElement;

  private readonly inTitle = document.getElementById('in-title') as HTMLInputElement;
  private readonly inSubtitle = document.getElementById('in-subtitle') as HTMLInputElement;
  private readonly inSpine = document.getElementById('in-spine') as HTMLInputElement;
  private readonly inShowTitle = document.getElementById('in-showtitle') as HTMLInputElement;
  private readonly btnRestore = document.getElementById('btn-restore') as HTMLButtonElement;
  private readonly panelSwatches = document.getElementById('panel-swatches') as HTMLElement;

  constructor(
    private readonly art: ArtworkManager,
    private readonly plastic: PlasticSet,
    private readonly interaction: InteractionManager,
  ) {
    this.buildPresetsRail();
    this.buildColorPopovers();
    this.bindEvents();
    this.syncFormWithPreset(this.activePreset);
  }

  private buildPresetsRail() {
    this.rail.innerHTML = '';
    PRESETS.forEach((preset, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb-btn';
      if (idx === 0) btn.dataset.active = 'true';
      btn.setAttribute('aria-label', preset.name);
      btn.setAttribute('aria-pressed', String(idx === 0));
      btn.style.setProperty('--tilt', `${(idx % 2 === 0 ? -1 : 1) * (3 + idx * 1.5)}deg`);

      btn.innerHTML = `
        <img src="${preset.frontImage}" alt="" draggable="false" />
        <span class="bar"></span>
      `;

      btn.addEventListener('click', () => {
        this.selectPreset(preset);
      });

      this.rail.appendChild(btn);
    });
  }

  private buildColorPopovers() {
    this.colorPop.innerHTML = '';
    this.panelSwatches.innerHTML = '';

    CASE_TINTS.forEach((tint) => {
      // Popover swatches
      const b1 = document.createElement('button');
      b1.type = 'button';
      b1.className = 'swatch';
      b1.style.backgroundColor = tint.swatch;
      b1.title = tint.name;
      b1.dataset.tint = tint.id;
      b1.setAttribute('aria-label', tint.name);
      b1.addEventListener('click', () => {
        this.selectTint(tint.id);
        this.colorPop.hidden = true;
        this.btnColor.setAttribute('aria-expanded', 'false');
      });
      this.colorPop.appendChild(b1);

      // Panel swatches
      const b2 = document.createElement('button');
      b2.type = 'button';
      b2.className = 'swatch';
      b2.style.backgroundColor = tint.swatch;
      b2.title = tint.name;
      b2.dataset.tint = tint.id;
      b2.setAttribute('aria-label', tint.name);
      b2.addEventListener('click', () => {
        this.selectTint(tint.id);
      });
      this.panelSwatches.appendChild(b2);
    });

    this.updateColorDot();
  }

  private updateColorDot() {
    this.colorDot.style.backgroundColor = this.plastic.current.swatch;
    document.querySelectorAll<HTMLElement>('[data-tint]').forEach(el => {
      el.setAttribute('aria-pressed', String(el.dataset.tint === this.plastic.current.id));
    });
  }

  private selectTint(id: string) {
    this.plastic.setTint(id, true);
    this.updateColorDot();
  }

  private bindEvents() {
    this.btnOpen.addEventListener('click', () => {
      this.interaction.toggleOpen();
    });

    this.btnReset.addEventListener('click', () => {
      this.interaction.resetView();
    });

    this.btnColor.addEventListener('click', (e) => {
      e.stopPropagation();
      this.colorPop.hidden = !this.colorPop.hidden;
      this.btnColor.setAttribute('aria-expanded', String(!this.colorPop.hidden));
    });

    document.addEventListener('click', (e) => {
      if (!this.colorPop.contains(e.target as Node) && e.target !== this.btnColor) {
        this.colorPop.hidden = true;
        this.btnColor.setAttribute('aria-expanded', 'false');
      }
    });

    this.btnEdit.addEventListener('click', () => this.setPanel(Boolean(this.panel.hidden)));

    this.panelClose.addEventListener('click', () => {
      this.setPanel(false);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.panel.hidden) this.setPanel(false);
        this.colorPop.hidden = true;
        this.btnColor.setAttribute('aria-expanded', 'false');
      }
      if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'e'
        && !(e.target as HTMLElement)?.closest('input, textarea, [contenteditable="true"]')) {
        this.setPanel(Boolean(this.panel.hidden));
      }
    });
    document.getElementById('btn-inspect')!.addEventListener('click', () => this.interaction.toggleInspectCartridge());
    document.getElementById('btn-flip')!.addEventListener('click', () => this.interaction.flipCartridge());

    // Form live updates
    const onInput = () => {
      this.customState.title = this.inTitle.value.trim() || 'UNTITLED';
      this.customState.subtitle = this.inSubtitle.value.trim();
      this.customState.spineText = this.inSpine.value.trim() || this.customState.title;
      this.customState.showTitleOverlay = this.inShowTitle.checked;
      void this.renderArtwork();
    };

    this.inTitle.addEventListener('input', onInput);
    this.inSubtitle.addEventListener('input', onInput);
    this.inSpine.addEventListener('input', onInput);
    this.inShowTitle.addEventListener('change', onInput);

    // Image Uploads
    const uploads = document.querySelectorAll<HTMLLabelElement>('.upload');
    uploads.forEach((label) => {
      const slot = label.dataset.slot as 'front' | 'back' | 'label';
      const fileInput = label.querySelector('input')!;
      const thumb = label.querySelector('.thumb') as HTMLElement;

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const request = (this.uploadRequests.get(slot) ?? 0) + 1;
        this.uploadRequests.set(slot, request);
        const generation = this.uploadGeneration;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
          this.status.textContent = 'Choose a PNG, JPEG or WebP image under 20 MB.';
          fileInput.value = '';
          return;
        }
        const url = URL.createObjectURL(file);
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          if (generation !== this.uploadGeneration || request !== this.uploadRequests.get(slot)) return;
          if (img.width * img.height > 40_000_000) throw new Error('Image too large');
          // Downsample user images before retaining them in the live editor.
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 2048 / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          const textureImage = new Image();
          textureImage.src = canvas.toDataURL('image/png');
          await textureImage.decode();
          if (generation !== this.uploadGeneration || request !== this.uploadRequests.get(slot)) return;
          if (slot === 'front') this.customState.frontImageObj = textureImage;
          else if (slot === 'back') this.customState.backImageObj = textureImage;
          else this.customState.labelImageObj = textureImage;
          thumb.style.backgroundImage = `url(${textureImage.src})`;
          thumb.classList.add('has-image');
          await this.renderArtwork();
        } catch {
          if (generation === this.uploadGeneration && request === this.uploadRequests.get(slot)) {
            this.status.textContent = 'This image could not be read. Try another image (up to 40 megapixels).';
          }
        } finally {
          URL.revokeObjectURL(url);
          fileInput.value = '';
        }
      });
    });

    this.btnRestore.addEventListener('click', () => {
      this.clearUploads();
      this.syncFormWithPreset(this.activePreset);
      void this.renderArtwork();
    });

    // Interaction state listener
    this.interaction.onStateChange = (state: ViewState) => {
      this.updateStateUI(state);
    };
  }

  private syncFormWithPreset(preset: GamePreset) {
    this.customState.title = preset.title;
    this.customState.subtitle = preset.subtitle;
    this.customState.spineText = preset.spineText;
    this.customState.spineColor = preset.spineColor;
    this.customState.showTitleOverlay = true;

    this.inTitle.value = preset.title;
    this.inSubtitle.value = preset.subtitle;
    this.inSpine.value = preset.spineText;
    this.inShowTitle.checked = true;
  }

  async selectPreset(preset: GamePreset) {
    this.activePreset = preset;
    this.clearUploads();

    // Update active thumb in rail
    const buttons = this.rail.querySelectorAll('.thumb-btn');
    buttons.forEach((b, idx) => {
      b.setAttribute('aria-pressed', String(PRESETS[idx].id === preset.id));
      if (PRESETS[idx].id === preset.id) {
        b.setAttribute('data-active', 'true');
      } else {
        b.removeAttribute('data-active');
      }
    });

    this.syncFormWithPreset(preset);
    await this.renderArtwork();
  }

  private setPanel(open: boolean) {
    this.panel.hidden = !open;
    document.getElementById('app')!.toggleAttribute('data-customizing', open);
    this.btnEdit.setAttribute('aria-expanded', String(open));
    if (open) {
      this.colorPop.hidden = true;
      this.btnColor.setAttribute('aria-expanded', 'false');
      // Opening the editor on touch must not immediately cover the preview
      // with the software keyboard.
      (window.matchMedia('(pointer: coarse)').matches ? this.panelClose : this.inTitle).focus({ preventScroll: true });
    } else this.btnEdit.focus({ preventScroll: true });
  }

  private clearUploads() {
    this.uploadGeneration++;
    this.customState.frontImageObj = this.customState.backImageObj = this.customState.labelImageObj = undefined;
    document.querySelectorAll<HTMLElement>('.upload .thumb').forEach(el => {
      el.style.backgroundImage = '';
      el.classList.remove('has-image');
    });
    document.querySelectorAll<HTMLInputElement>('.upload input').forEach(el => { el.value = ''; });
    this.status.textContent = '';
  }

  private async renderArtwork() {
    const request = ++this.renderRequest;
    this.status.textContent = '';
    try {
      await this.art.render(this.activePreset, this.customState);
      if (request !== this.renderRequest) return;
      document.title = `${this.customState.title} — Interactive Game Package`;
      document.getElementById('edition-title')!.textContent = this.customState.title;
    } catch {
      if (request !== this.renderRequest) return;
      this.status.textContent = 'Artwork could not be loaded. Choose a preset to try again.';
    }
  }

  updateStateUI(state: ViewState) {
    this.btnOpen.setAttribute('aria-pressed', String(state !== 'closed'));
    const label = state === 'closed' ? 'Open the case' : 'Close the case';
    this.btnOpen.setAttribute('aria-label', label);
    this.btnOpen.title = `${label} (O)`;
    this.hint.textContent = state === 'closed' ? 'Drag to turn · Tap the case to open'
      : state === 'open' ? 'Drag to turn · Tap the cartridge to inspect'
      : 'Drag to turn · Flip to see the contacts';
    document.getElementById('btn-flip')!.hidden = state !== 'inspecting';
    this.btnReset.setAttribute('aria-label', state === 'inspecting' ? 'Reset cartridge view' : 'Reset view');
    this.btnReset.title = state === 'inspecting' ? 'Reset cartridge view (R)' : 'Reset view (R)';
    document.getElementById('inspector')!.hidden = state === 'closed';
    const inspect = document.getElementById('btn-inspect') as HTMLButtonElement;
    inspect.textContent = state === 'inspecting' ? 'Return cartridge ↩' : 'Inspect cartridge ↗';
    inspect.disabled = state !== 'inspecting' && !this.interaction.canInspect;
  }

  hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hide');
      setTimeout(() => loader.remove(), 600);
    }
  }
}
