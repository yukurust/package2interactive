import { afterEach, expect, it, vi } from 'vitest';
import { ArtworkManager } from '../src/art/canvasArt';
import { PRESETS } from '../src/art/presets';

function artwork() {
  const contexts: any[] = [];
  vi.stubGlobal('document', {
    fonts: { load: vi.fn().mockResolvedValue([]) },
    createElement() {
      const ctx = new Proxy({
        drawImage: vi.fn(),
        fillText: vi.fn(),
        measureText: () => ({ width: 100 }),
        createLinearGradient: () => ({ addColorStop() {} }),
      }, { get: (target, key) => target[key as keyof typeof target] ?? (() => {}) });
      contexts.push(ctx);
      return { width: 0, height: 0, getContext: () => ctx };
    },
  });
  const manager = new ArtworkManager({ artPx: 20, anisotropy: 1 } as any);
  return { manager, contexts };
}
const custom = () => ({ title: 'TEST', subtitle: '', spineText: 'TEST', spineColor: '#ff0000', showTitleOverlay: true });
const img = (name: string) => ({ width: 100, height: 160, name } as unknown as HTMLImageElement);
afterEach(() => vi.unstubAllGlobals());

it('keeps the last requested preset when earlier image loads finish later', async () => {
  const { manager, contexts } = artwork();
  const pending = new Map<string, (image: HTMLImageElement) => void>();
  vi.spyOn(manager, 'loadImage').mockImplementation(url => new Promise(resolve => pending.set(url, resolve)));
  const older = manager.render(PRESETS[0], custom());
  const latest = manager.render(PRESETS[1], { ...custom(), frontImageObj: img('latest-front'), backImageObj: img('latest-back') });
  await latest;
  const count = contexts[0].drawImage.mock.calls.length;
  pending.get(PRESETS[0].frontImage)!(img('old-front'));
  pending.get(PRESETS[0].backImage)!(img('old-back'));
  await older;
  expect(contexts[0].drawImage.mock.calls).toHaveLength(count);
  expect(contexts[0].drawImage.mock.calls.at(-1)[0].name).toBe('latest-front');
});

it('reuses texture identities and prints uploaded label artwork without a preset overlay', async () => {
  const { manager, contexts } = artwork();
  const textures = [manager.outerTexture, manager.innerTexture, manager.labelTexture];
  const label = img('custom-label');
  await manager.render(PRESETS[0], { ...custom(), frontImageObj: img('front'), backImageObj: img('back'), labelImageObj: label });
  expect([manager.outerTexture, manager.innerTexture, manager.labelTexture]).toEqual(textures);
  expect(contexts[2].drawImage.mock.calls[0][0]).toBe(label);
  expect(contexts[2].fillText).not.toHaveBeenCalled();
  expect(manager.labelTexture.version).toBeGreaterThan(1);
});
