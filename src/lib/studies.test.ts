import { describe, it, expect } from 'vitest';
import { runStudy } from './studies';
import { defaultSettings } from './settings';
import { buildDemoSystem } from './samples';

const settings = { ...defaultSettings };

describe('study runner', () => {
  it('runs a converging load flow with engineering units', () => {
    const run = runStudy('powerflow', buildDemoSystem(), settings);
    expect(run.kind).toBe('powerflow');
    expect(run.status).toBe('success');
    if (run.kind !== 'powerflow') return;

    expect(run.data.converged).toBe(true);
    expect(run.data.iterations).toBeGreaterThan(0);
    expect(run.data.losses.real).toBeGreaterThan(0);
    expect(run.data.busResults.find(bus => bus.bus === '1')?.pg).toBeGreaterThan(60);
    expect(run.data.busResults.find(bus => bus.bus === '4')?.v).toBeCloseTo(0.9866, 3);
  });

  it('finds a voltage collapse point with continuation power flow', () => {
    const run = runStudy('cpf', buildDemoSystem(), settings);
    expect(run.status).toBe('success');
    if (run.kind !== 'cpf') return;

    expect(run.data.results.length).toBeGreaterThan(3);
    const last = run.data.results[run.data.results.length - 1];
    expect(last.lambda).toBeGreaterThan(1);
    expect(last.lambda).toBeLessThan(settings.cpfLambdaMax);
    expect(run.summary).toMatch(/collapse/i);
  });

  it('produces an economic dispatch that meets the load', () => {
    const run = runStudy('opf', buildDemoSystem(), settings);
    expect(run.status).toBe('success');
    if (run.kind !== 'opf') return;

    const dispatched = run.data.generatorResults.reduce((sum, gen) => sum + gen.pg, 0);
    const load = 120;
    expect(dispatched).toBeGreaterThanOrEqual(load);
    expect(run.data.totalCost).toBeGreaterThan(0);
    expect(run.data.losses).toBeGreaterThan(0);
  });

  it('computes short-circuit currents in kA and breaker ratings in A', () => {
    const run = runStudy('fault', buildDemoSystem(), settings);
    expect(run.status).toBe('success');
    if (run.kind !== 'fault') return;

    expect(run.data.threePhaseFaults).toHaveLength(4);
    expect(run.data.lineToGroundFaults).toHaveLength(4);
    run.data.threePhaseFaults.forEach(fault => {
      expect(fault.currents[0].magnitude).toBeGreaterThan(0.1);
      expect(fault.currents[0].magnitude).toBeLessThan(100);
      expect(fault.faultMVA).toBeGreaterThan(0);
    });
    run.data.protectiveDeviceRequirements.forEach(item => {
      expect(item.recommendedBreakerRating).toBeGreaterThan(item.minBreakerRating);
      expect(item.relaySettings.pickup).toBeGreaterThan(0);
    });
  });

  it('computes deterministic small-signal modes', () => {
    const first = runStudy('stability', buildDemoSystem(), settings);
    const second = runStudy('stability', buildDemoSystem(), settings);
    expect(first.status).toBe('success');
    if (first.kind !== 'stability' || second.kind !== 'stability') return;

    expect(first.data.eigenvalues).toHaveLength(4);
    expect(first.data.unstableModes).toHaveLength(0);
    expect(first.data.eigenvalues.map(mode => mode.eigenvalue.real)).toEqual(
      second.data.eigenvalues.map(mode => mode.eigenvalue.real)
    );
    expect(first.data.leastDampedMode?.dampingRatio).toBeGreaterThan(0);
  });

  it('simulates a time-domain fault response', () => {
    const run = runStudy('timeseries', buildDemoSystem(), settings);
    expect(run.status).toBe('success');
    if (run.kind !== 'timeseries') return;

    expect(run.data.time.length).toBeGreaterThan(50);
    expect(Object.keys(run.data.generatorSpeeds)).toHaveLength(2);
    const speeds = Object.values(run.data.generatorSpeeds)[0];
    expect(Math.min(...speeds)).toBeLessThan(50);
    expect(Math.max(...speeds)).toBeGreaterThan(45);
    const voltages = run.data.busVoltages['3'];
    expect(Math.min(...voltages)).toBeLessThan(0.5);
  });
});
