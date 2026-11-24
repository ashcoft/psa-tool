import { describe, it, expect } from 'vitest';
import { SAMPLE_SYSTEMS, buildSample, getSample } from './samples';
import { validateSystem } from './project';
import { solveNewtonRaphson } from './powerflow-methods';

describe('sample systems', () => {
  it('provides the documented sample catalogue', () => {
    expect(SAMPLE_SYSTEMS.map(sample => sample.id)).toEqual(['demo', 'ieee9', 'ieee14', 'feeder']);
    expect(getSample('ieee9')?.name).toMatch(/IEEE 9/);
    expect(getSample('missing')).toBeUndefined();
  });

  it.each(SAMPLE_SYSTEMS.map(sample => [sample.id, sample] as const))(
    'builds a valid, solvable %s system',
    (_id, sample) => {
      const system = buildSample(sample.id);
      expect(system.buses.length).toBeGreaterThan(0);
      expect(system.buses.some(bus => bus.type === 'slack')).toBe(true);
      const errors = validateSystem(system).filter(issue => issue.severity === 'error');
      expect(errors).toEqual([]);

      const result = solveNewtonRaphson(system);
      expect(result.converged).toBe(true);
      expect(result.busResults).toHaveLength(system.buses.length);
      expect(result.losses.real).toBeGreaterThanOrEqual(0);
      result.busResults.forEach(bus => {
        expect(bus.v).toBeGreaterThan(0.8);
        expect(bus.v).toBeLessThan(1.2);
      });
    }
  );
});
