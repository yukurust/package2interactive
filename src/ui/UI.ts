import { PRESETS, type GamePreset } from '../art/presets';
import { CASE_TINTS, type PlasticSet } from '../model/materials';
import type { ArtworkManager, CustomizationState } from '../art/canvasArt';
import type { InteractionManager, ViewState } from '../interaction/InteractionManager';

export class UIManager {
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
      b1.addEventListener('click', () => {
        this.selectTint(tint.id);
        this.colorPop.hidden = true;
      });
      this.colorPop.appendChild(b1);

      // Panel swatches
      const b2 = document.createElement('button');
      b2.type = 'button';
      b2.className = 'swatch';
      b2.style.backgroundColor = tint.swatch;
      b2.title = tint.name;
      b2.addEventListener('click', () => {
        this.selectTint(tint.id);
      });
      this.panelSwatches.appendChild(b2);
    });

    this.updateColorDot();
  }

  private updateColorDot() {
    this.colorDot.style.backgroundColor = this.plastic.current.swatch;
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

    this.btnEdit.addEventListener('click', () => {
      this.panel.hidden = !this.panel.hidden;
      this.btnEdit.setAttribute('aria-expanded', String(!this.panel.hidden));
    });

    this.panelClose.addEventListener('click', () => {
      this.panel.hidden = true;
      this.btnEdit.setAttribute('aria-expanded', 'false');
    });

    // Form live updates
    const onInput = () => {
      this.customState.title = this.inTitle.value.trim() || 'UNTITLED';
      this.customState.subtitle = this.inSubtitle.value.trim();
      this.customState.spineText = this.inSpine.value.trim() || this.customState.title;
      this.customState.showTitleOverlay = this.inShowTitle.checked;
      this.art.render(this.activePreset, this.customState);
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

      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            if (slot === 'front') this.customState.frontImageObj = img;
            else if (slot === 'back') this.customState.backImageObj = img;
            else if (slot === 'label') this.customState.labelImageObj = img;

            thumb.style.backgroundImage = `url(${img.src})`;
            this.art.render(this.activePreset, this.customState);
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
    });

    this.btnRestore.addEventListener('click', () => {
      this.customState.frontImageObj = undefined;
      this.customState.backImageObj = undefined;
      this.customState.labelImageObj = undefined;

      document.querySelectorAll<HTMLElement>('.upload .thumb').forEach((el) => {
        el.style.backgroundImage = '';
      });

      this.syncFormWithPreset(this.activePreset);
      this.art.render(this.activePreset, this.customState);
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

    // Update active thumb in rail
    const buttons = this.rail.querySelectorAll('.thumb-btn');
    buttons.forEach((b, idx) => {
      if (PRESETS[idx].id === preset.id) {
        b.setAttribute('data-active', 'true');
      } else {
        b.removeAttribute('data-active');
      }
    });

    this.syncFormWithPreset(preset);
    await this.art.render(preset, this.customState);
  }

  updateStateUI(state: ViewState) {
    if (state === 'closed') {
      this.btnOpen.setAttribute('aria-pressed', 'false');
      this.btnOpen.title = 'Open the case (O)';
      this.hint.textContent = 'Drag to turn · Tap the case to open';
    } else if (state === 'open') {
      this.btnOpen.setAttribute('aria-pressed', 'true');
      this.btnOpen.title = 'Close the case (O)';
      this.hint.textContent = 'Tap the cartridge to inspect · Drag to turn';
    } else if (state === 'inspecting') {
      this.btnOpen.setAttribute('aria-pressed', 'true');
      this.hint.textContent = 'Drag to flip cartridge · Tap to return';
    }
  }

  hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hide');
      setTimeout(() => loader.remove(), 600);
    }
  }
}
