import { describe, it, expect } from 'vitest';
import { buildLargeGrid, GRID_VOLTAGE_LEVELS } from './large-samples';
import { COMPONENT_CATALOG } from './component-catalog';
import { validateSystem } from './project';
import { solveNewtonRaphson } from './powerflow-methods';
import type { PowerSystem } from '@/types';

function elementCount(system: PowerSystem): number {
  return (
    system.buses.length +
    system.lines.length +
    system.transformers.length +
    system.generators.length +
    system.loads.length +
    (system.shunts?.length ?? 0) +
    (system.components?.length ?? 0)
  );
}

function allIds(system: PowerSystem): string[] {
  return [
    ...system.buses.map(item => item.id),
    ...system.lines.map(item => item.id),
    ...system.transformers.map(item => item.id),
    ...system.generators.map(item => item.id),
    ...system.loads.map(item => item.id),
    ...(system.shunts ?? []).map(item => item.id),
    ...(system.components ?? []).map(item => item.id),
  ];
}

describe('large grid samples', () => {
  it('builds exactly the requested number of elements', () => {
    expect(elementCount(buildLargeGrid({ elements: 1000 }))).toBe(1000);
    expect(elementCount(buildLargeGrid({ elements: 2000 }))).toBe(2000);
    expect(elementCount(buildLargeGrid({ elements: 450 }))).toBe(450);
  });

  it('spans 220 V to 500 kV with a single slack', () => {
    const system = buildLargeGrid({ elements: 1000 });
    const levels = [...new Set(system.buses.map(bus => bus.vbase))].sort(
      (a, b) => (a ?? 0) - (b ?? 0)
    );

    expect(levels).toEqual(GRID_VOLTAGE_LEVELS.map(level => level.kv).sort((a, b) => a - b));
    expect(levels[0]).toBe(0.22);
    expect(levels[levels.length - 1]).toBe(500);
    expect(system.buses.filter(bus => bus.type === 'slack')).toHaveLength(1);
    expect(system.buses.find(bus => bus.type === 'slack')?.vbase).toBe(500);
  });

  it('uses every component in the catalog', () => {
    const system = buildLargeGrid({ elements: 1000 });
    const components = system.components ?? [];
    const genericIds = new Set(components.map(component => component.type));

    const missing = COMPONENT_CATALOG.filter(definition => {
      switch (definition.model) {
        case 'generic':
          return !genericIds.has(definition.id);
        case 'bus':
          return !system.buses.some(
            bus => bus.symbol === definition.symbol && bus.subtype === definition.busKind
          );
        case 'line':
          return !system.lines.some(line => line.symbol === definition.symbol);
        case 'transformer':
          return !system.transformers.some(txf => txf.symbol === definition.symbol);
        case 'generator':
          return !system.generators.some(gen => gen.symbol === definition.symbol);
        case 'load':
          return !system.loads.some(load => load.symbol === definition.symbol);
        case 'shunt':
          return !(system.shunts ?? []).some(shunt => shunt.symbol === definition.symbol);
        default:
          return true;
      }
    }).map(definition => definition.id);

    expect(missing).toEqual([]);
    expect(genericIds.size).toBe(
      COMPONENT_CATALOG.filter(definition => definition.model === 'generic').length
    );
  });

  it('has unique ids and no validation findings', () => {
    const system = buildLargeGrid({ elements: 1000 });
    const ids = allIds(system);

    expect(new Set(ids).size).toBe(ids.length);
    expect(validateSystem(system)).toEqual([]);
  });

  it('is deterministic', () => {
    const first = buildLargeGrid({ elements: 1000 });
    const second = buildLargeGrid({ elements: 1000 });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('rejects targets that cannot hold the catalog', () => {
    expect(() => buildLargeGrid({ elements: 100 })).toThrow(/at least 400/);
    expect(() => buildLargeGrid({ elements: 1000, buses: 1000 })).toThrow(/raise the element target/);
  });

  it('accepts an explicit bus count when the element budget allows', () => {
    const system = buildLargeGrid({ elements: 1800, buses: 400 });

    expect(system.buses).toHaveLength(400);
    expect(elementCount(system)).toBe(1800);
    expect(validateSystem(system)).toEqual([]);
  });

  it(
    'solves both samples within voltage limits',
    () => {
      for (const elements of [1000, 2000]) {
        const system = buildLargeGrid({ elements });
        const result = solveNewtonRaphson(system);

        expect(result.converged).toBe(true);
        expect(result.busResults).toHaveLength(system.buses.length);
        expect(result.losses.real).toBeGreaterThan(0);
        result.busResults.forEach(bus => {
          expect(bus.v).toBeGreaterThan(0.9);
          expect(bus.v).toBeLessThan(1.1);
        });
      }
    },
    30000
  );
});
