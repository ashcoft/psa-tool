/**
 * Time-domain simulation of the classical multimachine model.
 *
 * The network is reduced to the generator internal buses (Kron reduction) and
 * the swing equations are integrated with Euler, RK4 or trapezoidal steps. A
 * balanced fault is represented by a large shunt admittance at the faulted bus
 * while the fault is active.
 */

import { PowerSystem } from '@/types';
import { buildYBus, solveNewtonRaphson } from './powerflow-methods';

export type IntegrationMethod = 'euler' | 'rk4' | 'rk45' | 'trapezoidal';

export interface SimulationConfig {
  tStart: number;
  tEnd: number;
  dt: number;
  method: IntegrationMethod;
  outputInterval: number;
  faultTime?: number;
  faultDuration?: number;
  faultBus?: string;
  loadChangeTime?: number;
  loadChangeFactor?: number;
}

export interface TimeSeriesResult {
  time: number[];
  busVoltages: { [busId: string]: number[] };
  busAngles: { [busId: string]: number[] };
  generatorAngles: { [genId: string]: number[] };
  generatorSpeeds: { [genId: string]: number[] };
  lineFlows: { [lineId: string]: { p: number[]; q: number[] } };
  busFrequencies: { [busId: string]: number[] };
}

export interface DynamicBusState {
  v: number;
  angle: number;
  omega: number;
  delta: number;
  eq: number;
  ed: number;
}

export interface DynamicSystemState {
  buses: DynamicBusState[];
  time: number;
}

export const defaultSimulationConfig: SimulationConfig = {
  tStart: 0,
  tEnd: 5,
  dt: 0.01,
  method: 'rk4',
  outputInterval: 0.05,
};

export interface GeneratorModel {
  id: string;
  bus: string;
  H: number;
  D: number;
  Pm: number;
  Pe: number;
  omega: number;
  delta: number;
  Pmax?: number;
}

interface Complex {
  re: number;
  im: number;
}

const cv = (re: number, im = 0): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a: Complex, b: Complex): Complex => {
  const denominator = b.re * b.re + b.im * b.im || 1e-12;
  return { re: (a.re * b.re + a.im * b.im) / denominator, im: (a.im * b.re - a.re * b.im) / denominator };
};
const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);

function invertComplex(matrix: Complex[][]): Complex[][] {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [
    ...row.map(value => ({ ...value })),
    ...Array.from({ length: n }, (_, j) => cv(i === j ? 1 : 0)),
  ]);

  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (cAbs(augmented[row][column]) > cAbs(augmented[pivot][column])) pivot = row;
    }
    if (cAbs(augmented[pivot][column]) < 1e-12) augmented[pivot][column] = cAdd(augmented[pivot][column], cv(1e-9));
    if (pivot !== column) {
      const temp = augmented[pivot];
      augmented[pivot] = augmented[column];
      augmented[column] = temp;
    }
    const divisor = augmented[column][column];
    for (let k = 0; k < 2 * n; k++) augmented[column][k] = cDiv(augmented[column][k], divisor);
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (cAbs(factor) < 1e-15) continue;
      for (let k = 0; k < 2 * n; k++) augmented[row][k] = cSub(augmented[row][k], cMul(factor, augmented[column][k]));
    }
  }

  return augmented.map(row => row.slice(n));
}

function buildReducedY(system: PowerSystem, generatorBusIndices: number[], faultBusIndex?: number): Complex[][] {
  const ybus = buildYBus(system);
  const Y: Complex[][] = ybus.g.map((row, i) => row.map((value, j) => cv(value, ybus.b[i][j])));

  if (faultBusIndex !== undefined && faultBusIndex >= 0) {
    Y[faultBusIndex][faultBusIndex] = cAdd(Y[faultBusIndex][faultBusIndex], cv(1000, 0));
  }

  const generatorSet = new Set(generatorBusIndices);
  const loadIndices = system.buses.map((_, i) => i).filter(i => !generatorSet.has(i));

  if (loadIndices.length === 0) {
    return generatorBusIndices.map(i => generatorBusIndices.map(j => ({ ...Y[i][j] })));
  }

  const Yll = loadIndices.map(i => loadIndices.map(j => ({ ...Y[i][j] })));
  const invYll = invertComplex(Yll);

  return generatorBusIndices.map(i =>
    generatorBusIndices.map(j => {
      let value = { ...Y[i][j] };
      for (let a = 0; a < loadIndices.length; a++) {
        for (let b = 0; b < loadIndices.length; b++) {
          value = cSub(value, cMul(cMul(Y[i][loadIndices[a]], invYll[a][b]), Y[loadIndices[b]][j]));
        }
      }
      return value;
    })
  );
}

export function createGeneratorModels(system: PowerSystem): GeneratorModel[] {
  return system.generators
    .filter(gen => gen.active !== false)
    .map(gen => ({
      id: gen.id,
      bus: gen.bus,
      H: Math.max(2.5, Math.min(8, 2 + gen.pmax / 100)),
      D: 2,
      Pm: gen.pg / (system.baseMVA > 0 ? system.baseMVA : 100),
      Pe: 0,
      omega: 1,
      delta: 0,
      Pmax: gen.pmax,
    }));
}

function electricalPower(index: number, delta: number[], reduced: Complex[][], emf: number[]): number {
  let power = 0;
  for (let j = 0; j < delta.length; j++) {
    const gij = reduced[index][j].re;
    const bij = reduced[index][j].im;
    if (index === j) {
      power += emf[index] * emf[index] * gij;
    } else {
      const angle = delta[index] - delta[j];
      power += emf[index] * emf[j] * (gij * Math.cos(angle) + bij * Math.sin(angle));
    }
  }
  return power;
}

function derivatives(
  delta: number[],
  omega: number[],
  models: GeneratorModel[],
  reduced: Complex[][],
  emf: number[],
  nominalOmega: number
): { dDelta: number[]; dOmega: number[] } {
  const dDelta = omega.map(value => value - nominalOmega);
  const dOmega = models.map((model, index) => {
    const pe = electricalPower(index, delta, reduced, emf);
    return (model.Pm - pe - model.D * (omega[index] - nominalOmega)) / (2 * model.H);
  });
  return { dDelta, dOmega };
}

function step(
  delta: number[],
  omega: number[],
  dt: number,
  method: IntegrationMethod,
  models: GeneratorModel[],
  reduced: Complex[][],
  emf: number[],
  nominalOmega: number
): { delta: number[]; omega: number[] } {
  if (method === 'euler') {
    const { dDelta, dOmega } = derivatives(delta, omega, models, reduced, emf, nominalOmega);
    return {
      delta: delta.map((value, i) => value + dt * dDelta[i]),
      omega: omega.map((value, i) => value + dt * dOmega[i]),
    };
  }

  if (method === 'trapezoidal') {
    const k1 = derivatives(delta, omega, models, reduced, emf, nominalOmega);
    const predictedDelta = delta.map((value, i) => value + dt * k1.dDelta[i]);
    const predictedOmega = omega.map((value, i) => value + dt * k1.dOmega[i]);
    const k2 = derivatives(predictedDelta, predictedOmega, models, reduced, emf, nominalOmega);
    return {
      delta: delta.map((value, i) => value + (dt / 2) * (k1.dDelta[i] + k2.dDelta[i])),
      omega: omega.map((value, i) => value + (dt / 2) * (k1.dOmega[i] + k2.dOmega[i])),
    };
  }

  // Classic RK4
  const k1 = derivatives(delta, omega, models, reduced, emf, nominalOmega);
  const d2 = delta.map((value, i) => value + (dt / 2) * k1.dDelta[i]);
  const o2 = omega.map((value, i) => value + (dt / 2) * k1.dOmega[i]);
  const k2 = derivatives(d2, o2, models, reduced, emf, nominalOmega);
  const d3 = delta.map((value, i) => value + (dt / 2) * k2.dDelta[i]);
  const o3 = omega.map((value, i) => value + (dt / 2) * k2.dOmega[i]);
  const k3 = derivatives(d3, o3, models, reduced, emf, nominalOmega);
  const d4 = delta.map((value, i) => value + dt * k3.dDelta[i]);
  const o4 = omega.map((value, i) => value + dt * k3.dOmega[i]);
  const k4 = derivatives(d4, o4, models, reduced, emf, nominalOmega);

  return {
    delta: delta.map((value, i) => value + (dt / 6) * (k1.dDelta[i] + 2 * k2.dDelta[i] + 2 * k3.dDelta[i] + k4.dDelta[i])),
    omega: omega.map((value, i) => value + (dt / 6) * (k1.dOmega[i] + 2 * k2.dOmega[i] + 2 * k3.dOmega[i] + k4.dOmega[i])),
  };
}

export function runTimeDomainSimulation(system: PowerSystem, config: Partial<SimulationConfig> = {}): TimeSeriesResult {
  const cfg = { ...defaultSimulationConfig, ...config };
  const baseFreq = system.baseFreq > 0 ? system.baseFreq : 60;
  const dt = Math.max(cfg.dt, 1e-4);
  const outputInterval = Math.max(cfg.outputInterval, dt);

  const powerFlow = solveNewtonRaphson(system);
  const busVoltage = new Map<string, number>();
  const busAngle = new Map<string, number>();
  if (powerFlow.converged) {
    powerFlow.busResults.forEach(bus => {
      busVoltage.set(bus.bus, bus.v);
      busAngle.set(bus.bus, (bus.angle * Math.PI) / 180);
    });
  } else {
    system.buses.forEach(bus => {
      busVoltage.set(bus.id, bus.voltage || 1);
      busAngle.set(bus.id, bus.angle || 0);
    });
  }

  const busIndex = new Map<string, number>();
  system.buses.forEach((bus, i) => busIndex.set(bus.id, i));

  const models = createGeneratorModels(system);
  const generatorBusIndices = models.map(model => busIndex.get(model.bus) ?? 0);

  const faultBusId =
    cfg.faultBus && busIndex.has(cfg.faultBus)
      ? cfg.faultBus
      : system.loads.length > 0
        ? system.loads.reduce((largest, load) => (load.pl > largest.pl ? load : largest), system.loads[0]).bus
        : system.buses.find(bus => bus.type !== 'slack')?.id ?? system.buses[0]?.id;
  const faultBusIndex = faultBusId !== undefined ? busIndex.get(faultBusId) : undefined;

  const nominalOmega = 1;
  const time: number[] = [];
  const busVoltages: { [busId: string]: number[] } = {};
  const busAngles: { [busId: string]: number[] } = {};
  const busFrequencies: { [busId: string]: number[] } = {};
  const generatorAngles: { [genId: string]: number[] } = {};
  const generatorSpeeds: { [genId: string]: number[] } = {};
  const lineFlows: { [lineId: string]: { p: number[]; q: number[] } } = {};

  system.buses.forEach(bus => {
    busVoltages[bus.id] = [];
    busAngles[bus.id] = [];
    busFrequencies[bus.id] = [];
  });
  models.forEach(model => {
    generatorAngles[model.id] = [];
    generatorSpeeds[model.id] = [];
  });
  system.lines.forEach(line => {
    lineFlows[line.id] = { p: [], q: [] };
  });

  if (models.length === 0) {
    // No dynamics: return the static voltage profile.
    for (let t = cfg.tStart; t <= cfg.tEnd + 1e-9; t += outputInterval) {
      time.push(t);
      system.buses.forEach(bus => {
        busVoltages[bus.id].push(busVoltage.get(bus.id) ?? 1);
        busAngles[bus.id].push(((busAngle.get(bus.id) ?? 0) * 180) / Math.PI);
        busFrequencies[bus.id].push(baseFreq);
      });
      system.lines.forEach(line => {
        lineFlows[line.id].p.push(0);
        lineFlows[line.id].q.push(0);
      });
    }
    return { time, busVoltages, busAngles, generatorAngles, generatorSpeeds, lineFlows, busFrequencies };
  }

  const normalY = buildReducedY(system, generatorBusIndices);
  const faultY =
    faultBusIndex !== undefined ? buildReducedY(system, generatorBusIndices, faultBusIndex) : normalY;

  const delta = models.map(model => busAngle.get(model.bus) ?? 0);
  const omega = models.map(() => nominalOmega);
  const emf = models.map(model => busVoltage.get(model.bus) ?? 1);
  const initialDelta = [...delta];

  models.forEach((model, index) => {
    model.Pe = electricalPower(index, delta, normalY, emf);
    model.Pm = model.Pe;
  });

  const faultTime = cfg.faultTime;
  const faultEnd = faultTime !== undefined ? faultTime + (cfg.faultDuration ?? 0.1) : undefined;
  const faultVoltage = 0.05;
  const targetVoltage = (busId: string) => busVoltage.get(busId) ?? 1;

  let nextOutput = cfg.tStart;

  for (let t = cfg.tStart; t <= cfg.tEnd + 1e-9; t += dt) {
    const inFault = faultTime !== undefined && t >= faultTime && (faultEnd === undefined || t < faultEnd);
    const reduced = inFault ? faultY : normalY;

    const next = step(delta, omega, dt, cfg.method, models, reduced, emf, nominalOmega);
    for (let i = 0; i < delta.length; i++) {
      delta[i] = next.delta[i];
      omega[i] = Math.max(0.8, Math.min(1.2, next.omega[i]));
    }

    if (cfg.loadChangeTime !== undefined && t >= cfg.loadChangeTime) {
      const factor = cfg.loadChangeFactor ?? 1.1;
      models.forEach(model => {
        model.Pm = model.Pm * factor;
      });
      cfg.loadChangeTime = undefined;
    }

    if (t + 1e-9 >= nextOutput) {
      time.push(t);
      const angleDeviation =
        delta.reduce((sum, value, index) => sum + (value - initialDelta[index]), 0) / Math.max(1, delta.length);

      system.buses.forEach(bus => {
        let voltage = targetVoltage(bus.id);
        if (bus.id === faultBusId) {
          if (inFault) {
            voltage = faultVoltage;
          } else if (faultEnd !== undefined && t >= faultEnd) {
            const recovery = 1 - Math.exp(-Math.max(0, t - faultEnd) / 0.15);
            voltage = faultVoltage + (targetVoltage(bus.id) - faultVoltage) * recovery;
          }
        }
        busVoltages[bus.id].push(voltage);
        busAngles[bus.id].push((((busAngle.get(bus.id) ?? 0) + angleDeviation) * 180) / Math.PI);

        const generator = models.find(model => model.bus === bus.id);
        const omegaDeviation = generator
          ? omega[models.indexOf(generator)] - nominalOmega
          : omega.reduce((sum, value) => sum + (value - nominalOmega), 0) / Math.max(1, omega.length);
        busFrequencies[bus.id].push(baseFreq * (1 + omegaDeviation));
      });

      models.forEach((model, index) => {
        generatorAngles[model.id].push(((delta[index] - initialDelta[index]) * 180) / Math.PI);
        generatorSpeeds[model.id].push(baseFreq * omega[index]);
      });

      system.lines.forEach(line => {
        const from = busIndex.get(line.fromBus);
        const to = busIndex.get(line.toBus);
        if (from === undefined || to === undefined) {
          lineFlows[line.id].p.push(0);
          lineFlows[line.id].q.push(0);
          return;
        }
        const vi = busVoltages[line.fromBus][busVoltages[line.fromBus].length - 1];
        const vj = busVoltages[line.toBus][busVoltages[line.toBus].length - 1];
        const angleFrom = (busAngles[line.fromBus][busAngles[line.fromBus].length - 1] * Math.PI) / 180;
        const angleTo = (busAngles[line.toBus][busAngles[line.toBus].length - 1] * Math.PI) / 180;
        const x = Math.max(1e-4, line.reactance);
        const power = ((vi * vj) / x) * Math.sin(angleFrom - angleTo) * (system.baseMVA || 100);
        lineFlows[line.id].p.push(power);
        lineFlows[line.id].q.push(0);
      });

      nextOutput += outputInterval;
    }
  }


  return { time, busVoltages, busAngles, generatorAngles, generatorSpeeds, lineFlows, busFrequencies };
}

export function runContingencyStudy(
  system: PowerSystem,
  contingencies: {
    name: string;
    faultBus?: string;
    faultTime?: number;
    faultDuration?: number;
    loadChange?: { time: number; factor: number };
  }[]
): { name: string; result: TimeSeriesResult }[] {
  return contingencies.map(contingency => ({
    name: contingency.name,
    result: runTimeDomainSimulation(system, {
      tStart: 0,
      tEnd: 5,
      dt: 0.01,
      method: 'rk4',
      outputInterval: 0.05,
      faultBus: contingency.faultBus,
      faultTime: contingency.faultTime,
      faultDuration: contingency.faultDuration,
      loadChangeTime: contingency.loadChange?.time,
      loadChangeFactor: contingency.loadChange?.factor,
    }),
  }));
}

export function checkStability(result: TimeSeriesResult): {
  stable: boolean;
  minOmega: number;
  maxOmega: number;
  criticalTime?: number;
} {
  const allSpeeds = Object.values(result.generatorSpeeds).flat();
  if (allSpeeds.length === 0) {
    return { stable: true, minOmega: 60, maxOmega: 60 };
  }

  const nominal = allSpeeds[0] || 60;
  const minOmega = Math.min(...allSpeeds);
  const maxOmega = Math.max(...allSpeeds);
  const sampleCount = result.time.length;
  const midpoint = Math.max(1, Math.floor(sampleCount / 2));

  const maxDeviation = (series: number[], from: number, to: number): number => {
    const slice = series.slice(from, Math.max(from + 1, to));
    return slice.reduce((max, value) => Math.max(max, Math.abs(value - nominal)), 0);
  };

  let earlyAmplitude = 0;
  let lateAmplitude = 0;
  Object.values(result.generatorSpeeds).forEach(series => {
    earlyAmplitude = Math.max(earlyAmplitude, maxDeviation(series, 0, midpoint));
    lateAmplitude = Math.max(lateAmplitude, maxDeviation(series, midpoint, sampleCount));
  });

  const maxAngle = Math.max(
    0,
    ...Object.values(result.generatorAngles).flat().map(value => Math.abs(value))
  );

  let criticalTime: number | undefined;
  for (let i = 0; i < sampleCount; i++) {
    const speeds = Object.values(result.generatorSpeeds).map(series => series[i]);
    if (speeds.some(speed => Math.abs(speed - nominal) > nominal * 0.02)) {
      criticalTime = result.time[i];
      break;
    }
  }

  const bounded = maxAngle < 180;
  const decaying = lateAmplitude <= earlyAmplitude * 1.05 + nominal * 0.0005;

  return {
    stable: bounded && decaying,
    minOmega,
    maxOmega,
    criticalTime,
  };
}

export function calculateCriticalClearingTime(
  system: PowerSystem,
  faultBus?: string
): { cct: number; faultTime: number; cctRange: [number, number] } {
  const faultTime = 0.1;
  let low = 0.02;
  let high = 1.0;
  let cct = low;

  for (let iteration = 0; iteration < 12; iteration++) {
    const mid = (low + high) / 2;
    const result = runTimeDomainSimulation(system, {
      tStart: 0,
      tEnd: 5,
      dt: 0.01,
      method: 'rk4',
      outputInterval: 0.05,
      faultBus,
      faultTime,
      faultDuration: mid,
    });
    if (checkStability(result).stable) {
      low = mid;
      cct = mid;
    } else {
      high = mid;
    }
  }

  return { cct, faultTime, cctRange: [low, high] };
}
