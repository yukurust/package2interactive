import * as THREE from 'three';
import './style.css';
import { SceneManager } from './scene/SceneManager';
import { PlasticSet, makePaper, makeCartridgeMaterials, fresnelUniforms } from './model/materials';
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
    await document.fonts.ready;
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
    plastic.attachInnerPaper(paperInner);
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
    const timer = new THREE.Timer();
    timer.connect(document);

    function animate() {
      requestAnimationFrame(animate);
      timer.update();
      const delta = Math.min(0.05, timer.getDelta());

      interaction.update(delta);
      // Keep input/tweens responsive, but stop expensive transmission draws
      // once the product settles. Texture edits and tint tweens also wake it.
      const p = cartridge.root.position;
      const q = cartridge.root.quaternion;
      const tint = plastic.rim;
      sm.render([
        gameCase.open, gameCase.root.rotation.x, gameCase.root.rotation.y,
        p.x, p.y, p.z, q.x, q.y, q.z, q.w,
        cartridge.spinner.rotation.x, cartridge.spinner.rotation.y,
        sm.camera.position.z,
        tint.color.r, tint.color.g, tint.color.b,
        tint.attenuationColor.r, tint.attenuationColor.g, tint.attenuationColor.b,
        tint.attenuationDistance,
        fresnelUniforms.uEdgeColor.value.r, fresnelUniforms.uEdgeColor.value.g, fresnelUniforms.uEdgeColor.value.b,
        art.outerTexture.version, art.innerTexture.version, art.labelTexture.version,
      ]);
    }

    interaction.update(10);
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
