import { expect, it } from 'vitest';
import { CASE_TINTS, PlasticSet } from '../src/model/materials';

it('layers a diluted tint over the interior while keeping the exterior film neutral', () => {
  const plastic = new PlasticSet({ dispersion: 0 } as any);
  const snapshot = (m: typeof plastic.panel) => [m.color.getHex(), m.attenuationColor.getHex(), m.attenuationDistance];
  const before = snapshot(plastic.sleeve);
  const windowShader = { uniforms: {}, fragmentShader: '' } as any;
  const rimShader = { uniforms: {}, fragmentShader: '' } as any;
  plastic.panel.onBeforeCompile(windowShader, null as any);
  plastic.rim.onBeforeCompile(rimShader, null as any);
  const neutralEdge = windowShader.uniforms.uEdgeColor.value.getHex();
  for (const tint of CASE_TINTS) {
    plastic.setTint(tint.id, false);
    expect(snapshot(plastic.sleeve)).toEqual(before);
    // Interior absorption is much weaker than the fully tinted molded edges.
    for (const channel of ['r', 'g', 'b'] as const) {
      expect(plastic.panel.attenuationColor[channel]).toBeCloseTo(
        1 + (plastic.rim.attenuationColor[channel] - 1) * 0.42,
      );
      expect(plastic.panel.attenuationColor[channel]).toBeGreaterThanOrEqual(0.58);
    }
    if (tint.id !== 'crystal') {
      expect(snapshot(plastic.panel)).not.toEqual(before);
      expect(plastic.panel.attenuationDistance).toBeGreaterThan(plastic.rim.attenuationDistance);
    }
    expect(windowShader.uniforms.uEdgeColor.value.getHex()).toBe(neutralEdge);
    expect(plastic.rim.attenuationDistance).toBe(tint.distance);
  }
  expect(windowShader.uniforms.uEdgeColor).not.toBe(rimShader.uniforms.uEdgeColor);
});
