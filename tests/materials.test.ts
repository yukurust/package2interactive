import { expect, it } from 'vitest';
import * as THREE from 'three';
import { CASE_TINTS, PlasticSet } from '../src/model/materials';

it('tints every clear material and the inner jacket, leaving the sticker neutral', () => {
  const plastic = new PlasticSet({ dispersion: 0 } as any);
  const inner = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const sticker = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  plastic.attachInnerPaper(inner);

  plastic.setTint('crimson', false);
  const rimHex = plastic.rim.attenuationColor.getHex();
  for (const part of [plastic.panel, plastic.sleeve, plastic.detail]) {
    expect(part.attenuationColor.getHex()).toBe(rimHex);
    expect(part.color.getHex()).toBe(plastic.rim.color.getHex());
    expect(part.attenuationDistance).toBe(plastic.rim.attenuationDistance);
  }
  expect(plastic.rim.attenuationDistance).toBe(CASE_TINTS.find((t) => t.id === 'crimson')!.distance);
  expect(inner.color.getHex()).not.toBe(0xffffff);
  expect(sticker.color.getHex()).toBe(0xffffff);

  plastic.setTint('crystal', false);
  expect(inner.color.getHex()).toBe(0xffffff);
});
