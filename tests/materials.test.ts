import { expect, it } from 'vitest';
import { CASE_TINTS, PlasticSet } from '../src/model/materials';

it('tints the structure without coloring the jacket windows or their Fresnel reflection', () => {
  const plastic = new PlasticSet({ dispersion: 0 } as any);
  const snapshot = (m: typeof plastic.panel) => [m.color.getHex(), m.attenuationColor.getHex(), m.attenuationDistance];
  const before = [snapshot(plastic.panel), snapshot(plastic.sleeve)];
  const windowShader = { uniforms: {}, fragmentShader: '' } as any;
  const rimShader = { uniforms: {}, fragmentShader: '' } as any;
  plastic.panel.onBeforeCompile(windowShader, null as any);
  plastic.rim.onBeforeCompile(rimShader, null as any);
  const neutralEdge = windowShader.uniforms.uEdgeColor.value.getHex();
  for (const tint of CASE_TINTS) {
    plastic.setTint(tint.id, false);
    expect([snapshot(plastic.panel), snapshot(plastic.sleeve)]).toEqual(before);
    expect(windowShader.uniforms.uEdgeColor.value.getHex()).toBe(neutralEdge);
    expect(plastic.rim.attenuationDistance).toBe(tint.distance);
  }
  expect(windowShader.uniforms.uEdgeColor).not.toBe(rimShader.uniforms.uEdgeColor);
});
