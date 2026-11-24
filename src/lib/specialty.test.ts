import { describe, it, expect } from 'vitest';
import { calculateArcFlash } from './arcflash';
import { analyzeMotorStarting } from './motor-starting';
import { analyzeHarmonics } from './harmonics';
import { buildRelayCurve, coordinationMargin, relayTripTime } from './protection';
import { designGroundGrid } from './groundgrid';
import { buildDemoSystem } from './samples';

const system = buildDemoSystem();

describe('arc flash screening', () => {
  it('computes incident energy and a boundary', () => {
    const result = calculateArcFlash({ faultCurrentKA: 8, voltageKV: 0.48, clearingTime: 0.15, workingDistanceMM: 455 });
    expect(result.incidentEnergy).toBeGreaterThan(0);
    expect(result.arcFlashBoundaryMM).toBeGreaterThan(455);
    expect(result.ppeCategory).toBeGreaterThanOrEqual(0);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('increases with current and clearing time', () => {
    const low = calculateArcFlash({ faultCurrentKA: 4, voltageKV: 0.48, clearingTime: 0.1, workingDistanceMM: 455 });
    const high = calculateArcFlash({ faultCurrentKA: 20, voltageKV: 0.48, clearingTime: 0.5, workingDistanceMM: 455 });
    expect(high.incidentEnergy).toBeGreaterThan(low.incidentEnergy);
    expect(high.ppeCategory).toBeGreaterThanOrEqual(low.ppeCategory);
  });

  it('handles a zero-current case', () => {
    const result = calculateArcFlash({ faultCurrentKA: 0, voltageKV: 0.48, clearingTime: 0.1, workingDistanceMM: 455 });
    expect(result.incidentEnergy).toBe(0);
    expect(result.ppeCategory).toBe(0);
  });
});

describe('motor starting', () => {
  it('estimates starting current and terminal voltage', () => {
    const result = analyzeMotorStarting(system, {
      busId: '3',
      ratedMW: 10,
      lockedRotorCurrent: 6,
      efficiency: 0.95,
      startingPowerFactor: 0.2,
    });
    expect(result.startingCurrentKA).toBeGreaterThan(result.ratedCurrentKA);
    expect(result.voltageDipPercent).toBeGreaterThan(0);
    expect(result.voltageDipPercent).toBeLessThan(100);
    expect(result.terminalVoltagePercent).toBeCloseTo(100 - result.voltageDipPercent, 6);
    expect(typeof result.acceptable).toBe('boolean');
  });

  it('rejects an unknown bus', () => {
    expect(() => analyzeMotorStarting(system, {
      busId: 'missing', ratedMW: 1, lockedRotorCurrent: 6, efficiency: 0.9, startingPowerFactor: 0.2,
    })).toThrow(/not found/);
  });
});

describe('harmonics', () => {
  it('computes voltage THD at every bus', () => {
    const result = analyzeHarmonics(system, {
      sourceBus: '3',
      spectrum: [
        { order: 5, percent: 20 },
        { order: 7, percent: 10 },
        { order: 11, percent: 6 },
        { order: 13, percent: 4 },
      ],
    });
    expect(result.buses).toHaveLength(4);
    expect(result.worstTHD).toBeGreaterThan(0);
    expect(result.worstBus).toBeTruthy();
    expect(result.buses.every(bus => bus.harmonics.length === 4)).toBe(true);
  });

  it('is compliant when there is no harmonic injection', () => {
    const result = analyzeHarmonics(system, { sourceBus: '3', spectrum: [{ order: 5, percent: 0 }] });
    expect(result.worstTHD).toBe(0);
    expect(result.compliant).toBe(true);
  });
});

describe('protection coordination', () => {
  it('produces inverse-time curves', () => {
    const curve = buildRelayCurve({ id: 'R1', bus: '3', curve: 'IEC-SI', pickupA: 100, timeDial: 0.1 });
    expect(curve.points.length).toBeGreaterThan(10);
    expect(curve.curveLabel).toMatch(/Standard Inverse/);
    expect(curve.tripTimes).toHaveLength(6);
  });

  it('has faster trips at higher currents', () => {
    const t2 = relayTripTime('IEC-VI', 100, 0.2, 200);
    const t10 = relayTripTime('IEC-VI', 100, 0.2, 1000);
    expect(t2).toBeGreaterThan(t10);
    expect(relayTripTime('IEC-VI', 100, 0.2, 50)).toBe(Infinity);
  });

  it('computes a coordination margin', () => {
    const upstream = { id: 'R1', bus: '1', curve: 'IEC-SI' as const, pickupA: 100, timeDial: 0.3 };
    const downstream = { id: 'R2', bus: '2', curve: 'IEC-SI' as const, pickupA: 100, timeDial: 0.1 };
    expect(coordinationMargin(upstream, downstream, 500)).toBeGreaterThan(0);
  });
});

describe('ground grid design', () => {
  it('computes IEEE 80 screening values', () => {
    const result = designGroundGrid({
      faultCurrentKA: 10,
      clearingTime: 0.5,
      soilResistivity: 100,
      areaM2: 2500,
      conductorLengthM: 2500,
      depthM: 0.5,
      surfaceResistivity: 3000,
      surfaceThicknessM: 0.1,
      bodyWeightKg: 70,
    });
    expect(result.conductorSizeMM2).toBeGreaterThan(0);
    expect(result.gridResistance).toBeGreaterThan(0);
    expect(result.gprV).toBeGreaterThan(0);
    expect(result.tolerableTouchV).toBeGreaterThan(0);
    expect(typeof result.touchPass).toBe('boolean');
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
