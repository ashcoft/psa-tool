/**
 * Short-circuit analysis using the bus impedance matrix.
 *
 * Positive-sequence Thevenin impedances come from the inverse of the network
 * admittance matrix. Fault currents are reported both in per-unit and in kA,
 * using the base voltage of each bus. Zero-sequence data is not part of the
 * power system model, so an assumed Z0 = 0.5 Z1 is used for unbalanced faults.
 */

import { PowerSystem } from '@/types';
import { buildYBus } from './powerflow-methods';

export type FaultType = 'three-phase' | 'line-to-ground' | 'line-to-line' | 'double-line-to-ground';

interface Complex {
  re: number;
  im: number;
}

const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im || 1e-12;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);
const cScale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });
const cAddReal = (a: Complex, value: number): Complex => ({ re: a.re + value, im: a.im });

export interface FaultResult {
  faultType: FaultType;
  faultBus: string;
  prefault: { voltage: number; angle: number };
  postfault: { voltage: number; angle: number };
  /** Fault current in per-unit on the system MVA base. */
  faultCurrent: number;
  /** Fault current in kA using the bus base voltage. */
  faultCurrentKA: number;
  symmetricalComponents?: {
    Ia: number;
    Ib: number;
    Ic: number;
    I1: number;
    I2: number;
    I0: number;
    V1: number;
    V2: number;
    V0: number;
  };
  faultMVA: number;
  /** CT rating in amperes. */
  ctRating?: number;
}

export interface FaultAnalysisResult {
  bus: string;
  faultType: FaultType;
  /** Phase current magnitude in kA. */
  currents: { magnitude: number; angle: number }[];
  voltages: { magnitude: number; angle: number }[];
  faultMVA: number;
  /** CT rating in amperes. */
  ctRating: number;
}

export interface FaultStudyResult {
  threePhaseFaults: FaultAnalysisResult[];
  lineToGroundFaults: FaultAnalysisResult[];
  lineToLineFaults: FaultAnalysisResult[];
  doubleLineToGroundFaults: FaultAnalysisResult[];
  protectiveDeviceRequirements: {
    bus: string;
    minBreakerRating: number;
    recommendedBreakerRating: number;
    relaySettings: { pickup: number; timeDelay: number };
  }[];
}

/** Complex matrix inverse using Gauss-Jordan elimination with partial pivoting. */
function invertComplexMatrix(matrix: Complex[][]): Complex[][] {
  const n = matrix.length;
  const augmented: Complex[][] = matrix.map((row, i) => [
    ...row.map(value => ({ ...value })),
    ...Array.from({ length: n }, (_, j) => ({ re: i === j ? 1 : 0, im: 0 })),
  ]);

  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (cAbs(augmented[row][column]) > cAbs(augmented[pivot][column])) pivot = row;
    }
    if (cAbs(augmented[pivot][column]) < 1e-10) {
      augmented[pivot][column] = cAddReal(augmented[pivot][column], 1e-8);
    }
    if (pivot !== column) {
      const temp = augmented[pivot];
      augmented[pivot] = augmented[column];
      augmented[column] = temp;
    }
    const divisor = augmented[column][column];
    for (let k = 0; k < 2 * n; k++) {
      augmented[column][k] = cDiv(augmented[column][k], divisor);
    }
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (cAbs(factor) < 1e-15) continue;
      for (let k = 0; k < 2 * n; k++) {
        augmented[row][k] = {
          re: augmented[row][k].re - factor.re * augmented[column][k].re + factor.im * augmented[column][k].im,
          im: augmented[row][k].im - factor.re * augmented[column][k].im - factor.im * augmented[column][k].re,
        };
      }
    }
  }

  return augmented.map(row => row.slice(n));
}

const zbusCache = new WeakMap<PowerSystem, Complex[][]>();

export function buildZBus(system: PowerSystem): Complex[][] {
  const cached = zbusCache.get(system);
  if (cached) return cached;
  const ybus = buildYBus(system);
  const Y: Complex[][] = ybus.g.map((row, i) => row.map((value, j) => ({ re: value, im: ybus.b[i][j] })));
  const index = new Map<string, number>();
  system.buses.forEach((bus, i) => index.set(bus.id, i));

  // Generator subtransient reactance provides the ground reference that a pure
  // series network lacks, and limits the fault current to a physical value.
  const subtransientX = 0.05;
  let sourceCount = 0;
  system.generators.forEach(gen => {
    if (gen.active === false) return;
    const i = index.get(gen.bus);
    if (i === undefined) return;
    Y[i][i].im -= 1 / subtransientX;
    sourceCount += 1;
  });
  if (sourceCount === 0) {
    const slackIdx = Math.max(0, system.buses.findIndex(bus => bus.type === 'slack'));
    Y[slackIdx][slackIdx].im -= 1 / subtransientX;
  }
  for (let i = 0; i < Y.length; i++) {
    Y[i][i].re += 1e-6;
  }
  const zbus = invertComplexMatrix(Y);
  zbusCache.set(system, zbus);
  return zbus;
}

function baseCurrentKA(system: PowerSystem, busIndex: number): number {
  const bus = system.buses[busIndex];
  const baseMVA = system.baseMVA > 0 ? system.baseMVA : 100;
  const kv = bus?.vbase && bus.vbase > 0 ? bus.vbase : 1;
  return baseMVA / (Math.sqrt(3) * kv);
}

function resolve(system: PowerSystem, faultBusId: string) {
  const index = new Map<string, number>();
  system.buses.forEach((bus, i) => index.set(bus.id, i));
  const faultIdx = index.get(faultBusId);
  if (faultIdx === undefined) throw new Error(`Bus ${faultBusId} not found`);
  const zbus = buildZBus(system);
  const z1 = zbus[faultIdx][faultIdx];
  const bus = system.buses[faultIdx];
  const prefaultVoltage = bus.voltage || 1;
  const ibase = baseCurrentKA(system, faultIdx);
  const baseMVA = system.baseMVA > 0 ? system.baseMVA : 100;
  return { faultIdx, bus, z1, prefaultVoltage, ibase, baseMVA };
}

function finalize(
  type: FaultType,
  busId: string,
  prefaultVoltage: number,
  faultCurrentPu: number,
  ibase: number,
  baseMVA: number,
  postfaultVoltage: number,
  components: FaultResult['symmetricalComponents']
): FaultResult {
  const faultCurrentKA = Math.abs(faultCurrentPu) * ibase;
  return {
    faultType: type,
    faultBus: busId,
    prefault: { voltage: prefaultVoltage, angle: 0 },
    postfault: { voltage: postfaultVoltage, angle: 0 },
    faultCurrent: Math.abs(faultCurrentPu),
    faultCurrentKA,
    symmetricalComponents: components,
    faultMVA: Math.abs(faultCurrentPu) * baseMVA,
    ctRating: faultCurrentKA * 1000 * 1.25,
  };
}

export function calculateThreePhaseFault(system: PowerSystem, faultBusId: string): FaultResult {
  const { z1, prefaultVoltage, ibase, baseMVA, bus } = resolve(system, faultBusId);
  const ifValue = cDiv({ re: prefaultVoltage, im: 0 }, cAbs(z1) < 1e-9 ? { re: 1e-9, im: 0 } : z1);
  const magnitude = cAbs(ifValue);
  return finalize(
    'three-phase',
    bus.id,
    prefaultVoltage,
    magnitude,
    ibase,
    baseMVA,
    0,
    {
      Ia: magnitude,
      Ib: magnitude,
      Ic: magnitude,
      I1: magnitude,
      I2: 0,
      I0: 0,
      V1: 0,
      V2: 0,
      V0: 0,
    }
  );
}

export function calculateLineToGroundFault(system: PowerSystem, faultBusId: string, Rf = 0): FaultResult {
  const { z1, prefaultVoltage, ibase, baseMVA, bus } = resolve(system, faultBusId);
  const z2 = z1;
  const z0 = cScale(z1, 0.5);
  const total = cAddReal(cAdd(cAdd(z1, z2), z0), 3 * Rf);
  const i1 = cDiv({ re: prefaultVoltage, im: 0 }, total);
  const ia = cScale(i1, 3);
  return finalize(
    'line-to-ground',
    bus.id,
    prefaultVoltage,
    cAbs(ia),
    ibase,
    baseMVA,
    0,
    {
      Ia: cAbs(ia),
      Ib: 0,
      Ic: 0,
      I1: cAbs(i1),
      I2: cAbs(i1),
      I0: cAbs(i1),
      V1: 0,
      V2: 0,
      V0: 0,
    }
  );
}

export function calculateLineToLineFault(system: PowerSystem, faultBusId: string, Rf = 0): FaultResult {
  const { z1, prefaultVoltage, ibase, baseMVA, bus } = resolve(system, faultBusId);
  const z2 = z1;
  const total = cAddReal(cAdd(z1, z2), Rf);
  const i1 = cDiv({ re: prefaultVoltage, im: 0 }, total);
  const ib = cScale(i1, Math.sqrt(3));
  return finalize(
    'line-to-line',
    bus.id,
    prefaultVoltage,
    cAbs(ib),
    ibase,
    baseMVA,
    prefaultVoltage / 2,
    {
      Ia: 0,
      Ib: cAbs(ib),
      Ic: cAbs(ib),
      I1: cAbs(i1),
      I2: cAbs(i1),
      I0: 0,
      V1: prefaultVoltage / 2,
      V2: prefaultVoltage / 2,
      V0: 0,
    }
  );
}

export function calculateDoubleLineToGroundFault(system: PowerSystem, faultBusId: string, Rf = 0): FaultResult {
  const { z1, prefaultVoltage, ibase, baseMVA, bus } = resolve(system, faultBusId);
  const z2 = z1;
  const z0 = cScale(z1, 0.5);
  const parallel = cDiv(cMul(z2, z0), cAdd(z2, z0));
  const total = cAddReal(cAdd(z1, parallel), 3 * Rf);
  const i1 = cDiv({ re: prefaultVoltage, im: 0 }, total);
  const denominator = cAdd(z2, z0);
  const i2 = cScale(cDiv(cMul(i1, z0), denominator), -1);
  const i0 = cScale(cDiv(cMul(i1, z2), denominator), -1);
  // Phase currents: Ib = a^2 I1 + a I2 + I0, Ic = a I1 + a^2 I2 + I0
  const a: Complex = { re: -0.5, im: Math.sqrt(3) / 2 };
  const a2: Complex = { re: -0.5, im: -Math.sqrt(3) / 2 };
  const ib = cAdd(cAdd(cMul(a2, i1), cMul(a, i2)), i0);
  const ic = cAdd(cAdd(cMul(a, i1), cMul(a2, i2)), i0);
  const magnitude = Math.max(cAbs(ib), cAbs(ic));
  return finalize(
    'double-line-to-ground',
    bus.id,
    prefaultVoltage,
    magnitude,
    ibase,
    baseMVA,
    0,
    {
      Ia: 0,
      Ib: cAbs(ib),
      Ic: cAbs(ic),
      I1: cAbs(i1),
      I2: cAbs(i2),
      I0: cAbs(i0),
      V1: 0,
      V2: 0,
      V0: 0,
    }
  );
}

export function performFaultStudy(
  system: PowerSystem,
  options: {
    includeThreePhase?: boolean;
    includeLineToGround?: boolean;
    includeLineToLine?: boolean;
    includeDoubleLineToGround?: boolean;
    faultResistance?: number;
  } = {}
): FaultStudyResult {
  const {
    includeThreePhase = true,
    includeLineToGround = true,
    includeLineToLine = false,
    includeDoubleLineToGround = false,
    faultResistance = 0,
  } = options;

  const toAnalysis = (result: FaultResult): FaultAnalysisResult => ({
    bus: result.faultBus,
    faultType: result.faultType,
    currents: [{ magnitude: result.faultCurrentKA, angle: 0 }],
    voltages: [{ magnitude: result.postfault.voltage, angle: 0 }],
    faultMVA: result.faultMVA,
    ctRating: result.ctRating ?? 0,
  });

  const threePhaseFaults: FaultAnalysisResult[] = [];
  const lineToGroundFaults: FaultAnalysisResult[] = [];
  const lineToLineFaults: FaultAnalysisResult[] = [];
  const doubleLineToGroundFaults: FaultAnalysisResult[] = [];

  system.buses.forEach(bus => {
    if (bus.active === false) return;
    if (includeThreePhase) {
      try {
        threePhaseFaults.push(toAnalysis(calculateThreePhaseFault(system, bus.id)));
      } catch {
        /* isolated bus */
      }
    }
    if (includeLineToGround) {
      try {
        lineToGroundFaults.push(toAnalysis(calculateLineToGroundFault(system, bus.id, faultResistance)));
      } catch {
        /* isolated bus */
      }
    }
    if (includeLineToLine) {
      try {
        lineToLineFaults.push(toAnalysis(calculateLineToLineFault(system, bus.id, faultResistance)));
      } catch {
        /* isolated bus */
      }
    }
    if (includeDoubleLineToGround) {
      try {
        doubleLineToGroundFaults.push(toAnalysis(calculateDoubleLineToGroundFault(system, bus.id, faultResistance)));
      } catch {
        /* isolated bus */
      }
    }
  });

  const protectiveDeviceRequirements = system.buses
    .filter(bus => bus.active !== false)
    .map(bus => {
      const threePhase = threePhaseFaults.find(item => item.bus === bus.id);
      const lineGround = lineToGroundFaults.find(item => item.bus === bus.id);
      const maxKA = Math.max(threePhase?.currents[0]?.magnitude ?? 0, lineGround?.currents[0]?.magnitude ?? 0);
      const amperes = maxKA * 1000;
      return {
        bus: bus.id,
        minBreakerRating: amperes * 1.25,
        recommendedBreakerRating: amperes * 1.6,
        relaySettings: {
          pickup: Math.max(50, amperes * 0.5),
          timeDelay: 0.3,
        },
      };
    });

  return {
    threePhaseFaults,
    lineToGroundFaults,
    lineToLineFaults,
    doubleLineToGroundFaults,
    protectiveDeviceRequirements,
  };
}

export function calculateAllBusFaultCurrents(
  system: PowerSystem,
  faultType: FaultType,
  faultResistance = 0
): { busId: string; current: number; mva: number }[] {
  const results: { busId: string; current: number; mva: number }[] = [];

  system.buses.forEach(bus => {
    if (bus.active === false) return;
    try {
      let result: FaultResult;
      switch (faultType) {
        case 'line-to-ground':
          result = calculateLineToGroundFault(system, bus.id, faultResistance);
          break;
        case 'line-to-line':
          result = calculateLineToLineFault(system, bus.id, faultResistance);
          break;
        case 'double-line-to-ground':
          result = calculateDoubleLineToGroundFault(system, bus.id, faultResistance);
          break;
        case 'three-phase':
        default:
          result = calculateThreePhaseFault(system, bus.id);
          break;
      }
      results.push({ busId: bus.id, current: result.faultCurrentKA, mva: result.faultMVA });
    } catch {
      /* isolated bus */
    }
  });

  return results.sort((a, b) => b.current - a.current);
}

export function calculateRelayCoordination(): {
  upstream: { pickup: number; time: number };
  downstream: { pickup: number; time: number };
  coordinationTime: number;
} {
  return {
    upstream: { pickup: 100, time: 0.5 },
    downstream: { pickup: 80, time: 0.2 },
    coordinationTime: 0.3,
  };
}
