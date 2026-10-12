import * as THREE from 'three';
import './style.css';
import { SceneManager } from './scene/SceneManager';
import { PlasticSet, makePaper, makeCartridgeMaterials } from './model/materials';
import { ArtworkManager } from './art/canvasArt';
import { GameCase } from './model/GameCase';
import { Cartridge } from './model/Cartridge';
import { InteractionManager } from './interaction/InteractionManager';
import { UIManager } from './ui/UI';
import { PRESETS } from './art/presets';

async function bootstrap() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  if (!canvas) return;

  try {
    // 1. Scene & Renderer
    const sm = new SceneManager(canvas);

    // 2. Plastic & Artwork Managers
    const plastic = new PlasticSet(sm.quality);
    const art = new ArtworkManager(sm.quality);

    // Initial render of first preset
    const initialPreset = PRESETS[0];
    await art.render(initialPreset, {
      title: initialPreset.title,
      subtitle: initialPreset.subtitle,
      spineText: initialPreset.spineText,
      showTitleOverlay: true,
      spineColor: initialPreset.spineColor,
    });

    // 3. Materials
    const paperOuter = makePaper(art.outerTexture, false);
    const paperInner = makePaper(art.innerTexture, true);
    const cartMats = makeCartridgeMaterials(art.labelTexture, art.backDetailTexture);

    // 4. 3D Models (Zero external model files, 100% Three.js procedural geometries)
    const gameCase = new GameCase({
      plastic,
      paperOuter,
      paperInner,
    });
    sm.scene.add(gameCase.root);

    const cartridge = new Cartridge(cartMats);

    // 5. Interaction & Orbit Controller
    const interaction = new InteractionManager(sm, gameCase, cartridge);

    // 6. UI Manager
    const ui = new UIManager(art, plastic, interaction);

    // 7. Render Loop
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const delta = Math.min(0.1, clock.getDelta());

      interaction.update(delta);
      sm.render();
    }

    animate();

    // Resize handler
    window.addEventListener('resize', () => {
      sm.resize();
    });

    // Complete loading
    ui.hideLoader();
  } catch (err) {
    console.error('Failed to initialize 3D scene:', err);
    const failEl = document.getElementById('fail');
    if (failEl) failEl.hidden = false;
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hide');
  }
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
