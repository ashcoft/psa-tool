import { describe, it, expect } from 'vitest';
import { buildDemoSystem } from './samples';
import { emptySystem } from './project';
import { findNearestBusIdWithin } from './component-utils';

describe('component placement helpers', () => {
  const system = buildDemoSystem();

  it('attaches to a bus inside the radius', () => {
    expect(findNearestBusIdWithin(system, { x: 2.1, y: -0.9 }, 0.5)).toBe('2');
  });

  it('leaves the component free when every bus is too far away', () => {
    expect(findNearestBusIdWithin(system, { x: 1, y: 5 }, 0.5)).toBeUndefined();
  });

  it('handles an empty system', () => {
    expect(findNearestBusIdWithin(emptySystem(), { x: 0, y: 0 }, 2)).toBeUndefined();
  });
});
