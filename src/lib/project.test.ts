import { describe, it, expect } from 'vitest';
import {
  deserializeProject,
  emptySystem,
  findFreePosition,
  nextId,
  normalizeSystem,
  safeFileName,
  serializeProject,
  systemStats,
  validateSystem,
} from './project';
import { buildDemoSystem } from './samples';

describe('project model', () => {
  it('creates an empty project with the expected defaults', () => {
    const system = emptySystem('Test');
    expect(system.name).toBe('Test');
    expect(system.baseMVA).toBe(100);
    expect(system.buses).toHaveLength(0);
    expect(system.areas).toHaveLength(1);
  });

  it('round-trips through serialization', () => {
    const system = buildDemoSystem();
    const text = serializeProject(system, 'Demo');
    const restored = deserializeProject(text);
    expect(restored.name).toBe('Demo');
    expect(restored.system.buses).toHaveLength(4);
    expect(restored.system.lines).toHaveLength(3);
    expect(restored.system.generators[0].pg).toBe(80);
  });

  it('accepts a raw system object without the project wrapper', () => {
    const system = buildDemoSystem();
    const restored = deserializeProject(JSON.stringify(system));
    expect(restored.system.buses).toHaveLength(4);
  });

  it('rejects malformed files', () => {
    expect(() => deserializeProject('{ not json')).toThrow(/valid JSON/);
    expect(() => deserializeProject('{"buses": 4}')).toThrow(/bus list/);
  });

  it('normalizes missing optional fields and drops dangling branches', () => {
    const system = normalizeSystem({
      name: 'Loose',
      buses: [{ id: 'a', name: 'A', type: 'slack' }, { id: 'b', name: 'B' }],
      lines: [
        { id: 'l1', fromBus: 'a', toBus: 'b' },
        { id: 'bad', fromBus: 'a', toBus: 'missing' },
      ],
      baseMVA: 50,
    });
    expect(system.lines).toHaveLength(1);
    expect(system.lines[0].resistance).toBeGreaterThan(0);
    expect(system.baseMVA).toBe(50);
    expect(system.buses[1].type).toBe('pq');
  });

  it('reports missing slack bus and dangling branches', () => {
    const system = buildDemoSystem();
    system.buses = system.buses.map(bus => ({ ...bus, type: 'pq' as const }));
    const issues = validateSystem(system);
    expect(issues.some(issue => issue.severity === 'error' && /slack/i.test(issue.message))).toBe(true);

    system.lines[0].toBus = 'missing';
    const issues2 = validateSystem(system);
    expect(issues2.some(issue => issue.message.includes('does not exist'))).toBe(true);
  });

  it('normalizes and round-trips specialty components', () => {
    const system = normalizeSystem({
      buses: [{ id: 'b1', name: 'Bus 1', type: 'slack' }],
      components: [
        {
          id: 'cmp_1',
          type: 'dc-bus',
          category: 'DC',
          name: 'DC Bus A',
          x: 2,
          y: 3,
          properties: { voltageV: 480, ratingKW: 100 },
          active: true,
        },
        {
          id: 'cmp_2',
          type: 'overcurrent-relay',
          category: 'Instrument',
          name: 'Relay 1',
          bus: 'missing',
          x: 1,
          y: 1,
          properties: {},
          active: true,
        },
      ],
    });

    expect(system.components).toHaveLength(2);
    expect(system.components?.[0].category).toBe('DC');
    expect(system.components?.[0].properties.voltageV).toBe(480);
    expect(system.components?.[1].bus).toBeUndefined();

    const restored = deserializeProject(serializeProject(system, 'Components'));
    expect(restored.system.components).toHaveLength(2);
    expect(restored.system.components?.[0].name).toBe('DC Bus A');

    const stats = systemStats(system);
    expect(stats.components).toBe(2);
    expect(stats.dcComponents).toBe(1);
    expect(stats.instruments).toBe(1);
  });

  it('computes system statistics', () => {
    const stats = systemStats(buildDemoSystem());
    expect(stats.buses).toBe(4);
    expect(stats.lines).toBe(3);
    expect(stats.generators).toBe(2);
    expect(stats.loads).toBe(2);
    expect(stats.totalLoadMW).toBeCloseTo(120, 6);
    expect(stats.totalGenerationMW).toBeCloseTo(140, 6);
  });

  it('generates unique ids', () => {
    expect(nextId([{ id: 'bus_1' }, { id: 'bus_2' }], 'bus_')).toBe('bus_3');
    expect(nextId([{ id: 'bus_3' }], 'bus_')).toBe('bus_2');
  });

  it('finds a free position to the right of the diagram', () => {
    const system = buildDemoSystem();
    const position = findFreePosition(system);
    expect(position.x).toBeGreaterThan(Math.max(...system.buses.map(bus => bus.x)));
  });

  it('builds safe file names', () => {
    expect(safeFileName('My Project / 2026', 'json')).toBe('My_Project_2026.json');
    expect(safeFileName('   ', 'csv')).toBe('project.csv');
  });
});
