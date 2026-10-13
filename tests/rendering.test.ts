import { expect, it } from 'vitest';
import { RenderGate } from '../src/scene/RenderGate';

it('suspends settled frames and resumes for edits, accumulated motion and resize', () => {
  const gate = new RenderGate();
  expect(gate.changed([0, 1])).toBe(true);
  expect(gate.changed([0, 1])).toBe(false);
  expect(gate.changed([0.000006, 1])).toBe(false);
  expect(gate.changed([0.000012, 1])).toBe(true);
  expect(gate.changed([0.000012, 2])).toBe(true);
  expect(gate.changed([0.000012, 2])).toBe(false);
  gate.invalidate();
  expect(gate.changed([0.000012, 2])).toBe(true);
});
