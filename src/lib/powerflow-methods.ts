/**
 * AC/DC power flow solvers operating in per-unit on the system base.
 *
 * All bus injections are converted from MW/Mvar to per-unit, the network is
 * solved, and results are returned in engineering units (MW, Mvar, kV, deg).
 */

import { Bus, BusResult, GeneratorResult, Line, LineResult, PowerFlowResult, PowerSystem, Transformer, TransformerResult } from '@/types';

export interface YBusMatrix {
  g: number[][];
  b: number[][];
  n: number;
}

interface Complex {
  re: number;
  im: number;
}

const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a: Complex, b: Complex): Complex => {
  const denominator = b.re * b.re + b.im * b.im || 1e-12;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
};
const cConj = (a: Complex): Complex => ({ re: a.re, im: -a.im });
const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);
const cPolar = (magnitude: number, angle: number): Complex => ({
  re: magnitude * Math.cos(angle),
  im: magnitude * Math.sin(angle),
});

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Solves A x = b with partial pivoting. Returns null for singular systems. */
export function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, index) => [...row, b[index]]);

  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(M[row][column]) > Math.abs(M[pivot][column])) pivot = row;
    }
    if (Math.abs(M[pivot][column]) < 1e-12) return null;
    if (pivot !== column) {
      const temp = M[pivot];
      M[pivot] = M[column];
      M[column] = temp;
    }
    for (let row = column + 1; row < n; row++) {
      const factor = M[row][column] / M[column][column];
      if (factor === 0) continue;
      for (let k = column; k <= n; k++) {
        M[row][k] -= factor * M[column][k];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let column = row + 1; column < n; column++) {
      sum -= M[row][column] * x[column];
    }
    x[row] = sum / M[row][row];
  }
  return x;
}

export function buildYBus(system: PowerSystem): YBusMatrix {
  const n = system.buses.length;
  const g: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const b: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  const index = new Map<string, number>();
  system.buses.forEach((bus, i) => index.set(bus.id, i));

  const addSeriesBranch = (i: number, j: number, y: Complex) => {
    g[i][i] += y.re;
    b[i][i] += y.im;
    g[j][j] += y.re;
    b[j][j] += y.im;
    g[i][j] -= y.re;
    b[i][j] -= y.im;
    g[j][i] -= y.re;
    b[j][i] -= y.im;
  };

  system.lines.forEach(line => {
    if (line.active === false) return;
    const i = index.get(line.fromBus);
    const j = index.get(line.toBus);
    if (i === undefined || j === undefined) return;
    const z2 = line.resistance ** 2 + line.reactance ** 2;
    if (z2 < 1e-12) return;
    const y: Complex = { re: line.resistance / z2, im: -line.reactance / z2 };
    addSeriesBranch(i, j, y);
    const charging = (line.susceptance || 0) / 2;
    b[i][i] += charging;
    b[j][j] += charging;
  });

  system.transformers.forEach(txf => {
    if (txf.active === false) return;
    const i = index.get(txf.fromBus);
    const j = index.get(txf.toBus);
    if (i === undefined || j === undefined) return;
    const z2 = txf.resistance ** 2 + txf.reactance ** 2;
    if (z2 < 1e-12) return;
    const y: Complex = { re: txf.resistance / z2, im: -txf.reactance / z2 };
    const tap = txf.tap > 0 ? txf.tap : 1;
    const shift = ((txf.shift || 0) * Math.PI) / 180;
    const ratio: Complex = cPolar(tap, shift);
    const a2 = tap * tap;

    const yii = cDiv(y, { re: a2, im: 0 });
    g[i][i] += yii.re;
    b[i][i] += yii.im;
    g[j][j] += y.re;
    b[j][j] += y.im;

    const yij = cDiv({ re: -y.re, im: -y.im }, cConj(ratio));
    g[i][j] += yij.re;
    b[i][j] += yij.im;

    const yji = cDiv({ re: -y.re, im: -y.im }, ratio);
    g[j][i] += yji.re;
    b[j][i] += yji.im;
  });

  (system.shunts ?? []).forEach(shunt => {
    if (shunt.active === false) return;
    const i = index.get(shunt.bus);
    if (i === undefined) return;
    g[i][i] += shunt.g;
    b[i][i] += shunt.b;
  });

  return { g, b, n };
}

interface NetworkData {
  baseMVA: number;
  index: Map<string, number>;
  ybus: YBusMatrix;
  connected: boolean[];
  slackIdx: number;
  busTypes: Bus['type'][];
  Psp: number[];
  Qsp: number[];
  Vm: number[];
  theta: number[];
  qGen: number[];
  pGen: number[];
  pLoad: number[];
  qLoad: number[];
  busVset: number[];
  generatorsAtBus: Map<number, string[]>;
  limitedBuses: Set<number>;
}

function prepareNetwork(system: PowerSystem): NetworkData {
  const baseMVA = system.baseMVA > 0 ? system.baseMVA : 100;
  const ybus = buildYBus(system);
  const n = system.buses.length;
  const index = new Map<string, number>();
  system.buses.forEach((bus, i) => index.set(bus.id, i));

  const connected = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      sum += Math.abs(ybus.g[i][j]) + Math.abs(ybus.b[i][j]);
    }
    connected[i] = sum > 1e-12;
  }

  let slackIdx = system.buses.findIndex(bus => bus.type === 'slack');
  if (slackIdx < 0) slackIdx = 0;

  const pGen = new Array(n).fill(0);
  const qGen = new Array(n).fill(0);
  const pLoad = new Array(n).fill(0);
  const qLoad = new Array(n).fill(0);
  const generatorsAtBus = new Map<number, string[]>();

  system.generators.forEach(gen => {
    if (gen.active === false) return;
    const i = index.get(gen.bus);
    if (i === undefined) return;
    pGen[i] += gen.pg / baseMVA;
    qGen[i] += gen.qg / baseMVA;
    const list = generatorsAtBus.get(i) ?? [];
    list.push(gen.id);
    generatorsAtBus.set(i, list);
  });

  system.loads.forEach(load => {
    if (load.active === false) return;
    const i = index.get(load.bus);
    if (i === undefined) return;
    pLoad[i] += load.pl / baseMVA;
    qLoad[i] += load.ql / baseMVA;
  });

  const busTypes = system.buses.map(bus => bus.type);
  const Psp = new Array(n).fill(0);
  const Qsp = new Array(n).fill(0);
  const Vm = new Array(n).fill(1);
  const theta = new Array(n).fill(0);
  const busVset = new Array(n).fill(1);

  system.buses.forEach((bus, i) => {
    Psp[i] = pGen[i] - pLoad[i];
    Qsp[i] = qGen[i] - qLoad[i];
    const generator = system.generators.find(gen => gen.bus === bus.id && gen.active !== false);
    busVset[i] = generator?.v ?? (bus.voltage || 1);
    Vm[i] = bus.type === 'slack' ? busVset[i] : bus.type === 'pv' ? busVset[i] : (bus.voltage || 1);
    theta[i] = bus.angle || 0;
    if (!connected[i]) {
      Vm[i] = 1;
      theta[i] = 0;
    }
  });

  Vm[slackIdx] = busVset[slackIdx] || 1;
  theta[slackIdx] = system.buses[slackIdx]?.angle || 0;

  return {
    baseMVA,
    index,
    ybus,
    connected,
    slackIdx,
    busTypes,
    Psp,
    Qsp,
    Vm,
    theta,
    qGen,
    pGen,
    pLoad,
    qLoad,
    busVset,
    generatorsAtBus,
    limitedBuses: new Set(),
  };
}

function calculateInjections(network: NetworkData): { P: number[]; Q: number[] } {
  const { ybus, Vm, theta } = network;
  const n = ybus.n;
  const P = new Array(n).fill(0);
  const Q = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const gij = ybus.g[i][j];
      const bij = ybus.b[i][j];
      if (gij === 0 && bij === 0) continue;
      const angle = theta[i] - theta[j];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      P[i] += Vm[i] * Vm[j] * (gij * cos + bij * sin);
      Q[i] += Vm[i] * Vm[j] * (gij * sin - bij * cos);
    }
  }

  return { P, Q };
}

function buildBranchResults(
  system: PowerSystem,
  network: NetworkData
): { lineResults: LineResult[]; transformerResults: TransformerResult[]; losses: { real: number; imag: number } } {
  const { baseMVA, index, Vm, theta } = network;
  const V = system.buses.map((_, i) => cPolar(Vm[i], theta[i]));

  const computeFlow = (
    fromIdx: number,
    toIdx: number,
    branch: { resistance: number; reactance: number; susceptance?: number; tap?: number; shift?: number; rating?: number },
    isTransformer: boolean
  ): { pFrom: number; qFrom: number; pTo: number; qTo: number; lossP: number; lossQ: number; loading: number } => {
    const z2 = branch.resistance ** 2 + branch.reactance ** 2;
    if (z2 < 1e-12) {
      return { pFrom: 0, qFrom: 0, pTo: 0, qTo: 0, lossP: 0, lossQ: 0, loading: 0 };
    }
    const y: Complex = { re: branch.resistance / z2, im: -branch.reactance / z2 };
    const charging = (branch.susceptance || 0) / 2;
    let ii: Complex;
    let ij: Complex;
    if (!isTransformer) {
      const vi = V[fromIdx];
      const vj = V[toIdx];
      ii = cAdd(cMul(cSub(vi, vj), y), cMul(vi, { re: 0, im: charging }));
      ij = cAdd(cMul(cSub(vj, vi), y), cMul(vj, { re: 0, im: charging }));
    } else {
      const tap = (branch.tap ?? 1) > 0 ? branch.tap ?? 1 : 1;
      const shift = ((branch.shift ?? 0) * Math.PI) / 180;
      const ratio = cPolar(tap, shift);
      const vi = V[fromIdx];
      const vj = V[toIdx];
      ii = cSub(cDiv(vi, { re: tap * tap, im: 0 }), cDiv(vj, cConj(ratio)));
      ii = cMul(ii, y);
      ij = cSub(cMul(vj, y), cDiv(cMul(vi, y), ratio));
    }
    const si = cMul(V[fromIdx], cConj(ii));
    const sj = cMul(V[toIdx], cConj(ij));
    const rating = branch.rating && branch.rating > 0 ? branch.rating : 100;
    return {
      pFrom: si.re * baseMVA,
      qFrom: si.im * baseMVA,
      pTo: sj.re * baseMVA,
      qTo: sj.im * baseMVA,
      lossP: (si.re + sj.re) * baseMVA,
      lossQ: (si.im + sj.im) * baseMVA,
      loading: (cAbs(si) * baseMVA * 100) / rating,
    };
  };

  const lineResults: LineResult[] = [];
  const transformerResults: TransformerResult[] = [];
  let lossP = 0;
  let lossQ = 0;

  system.lines.forEach(line => {
    if (line.active === false) return;
    const i = index.get(line.fromBus);
    const j = index.get(line.toBus);
    if (i === undefined || j === undefined) return;
    const flow = computeFlow(i, j, line, false);
    lossP += flow.lossP;
    lossQ += flow.lossQ;
    lineResults.push({
      line: line.id,
      fromBus: line.fromBus,
      toBus: line.toBus,
      pFrom: flow.pFrom,
      qFrom: flow.qFrom,
      pTo: flow.pTo,
      qTo: flow.qTo,
      ploss: flow.lossP,
      qloss: flow.lossQ,
      loading: Math.max(0, flow.loading),
    });
  });

  system.transformers.forEach(txf => {
    if (txf.active === false) return;
    const i = index.get(txf.fromBus);
    const j = index.get(txf.toBus);
    if (i === undefined || j === undefined) return;
    const flow = computeFlow(i, j, txf, true);
    lossP += flow.lossP;
    lossQ += flow.lossQ;
    transformerResults.push({
      transformer: txf.id,
      fromBus: txf.fromBus,
      toBus: txf.toBus,
      pFrom: flow.pFrom,
      qFrom: flow.qFrom,
      pTo: flow.pTo,
      qTo: flow.qTo,
      loading: Math.max(0, flow.loading),
      tap: txf.tap,
    });
    lineResults.push({
      line: txf.id,
      fromBus: txf.fromBus,
      toBus: txf.toBus,
      pFrom: flow.pFrom,
      qFrom: flow.qFrom,
      pTo: flow.pTo,
      qTo: flow.qTo,
      ploss: flow.lossP,
      qloss: flow.lossQ,
      loading: Math.max(0, flow.loading),
    });
  });

  return { lineResults, transformerResults, losses: { real: lossP, imag: lossQ } };
}

function buildBusResults(system: PowerSystem, network: NetworkData): BusResult[] {
  const { baseMVA, index, Vm, theta, pGen, qGen, pLoad, qLoad, Psp, Qsp, slackIdx, busTypes } = network;
  const { P, Q } = calculateInjections(network);

  return system.buses.map((bus, i) => {
    let pg = pGen[i] * baseMVA;
    let qg = qGen[i] * baseMVA;

    if (i === slackIdx) {
      pg = (P[i] + pLoad[i]) * baseMVA;
      qg = (Q[i] + qLoad[i]) * baseMVA;
    } else if (busTypes[i] === 'pv') {
      qg = (Q[i] + qLoad[i]) * baseMVA;
    }

    if (network.limitedBuses.has(i)) {
      const generator = system.generators.find(gen => gen.bus === bus.id);
      if (generator) qg = generator.qmax;
    }

    return {
      bus: bus.id,
      v: Vm[i],
      angle: (theta[i] * 180) / Math.PI,
      pg,
      qg,
      pl: pLoad[i] * baseMVA,
      ql: qLoad[i] * baseMVA,
      qshunt: 0,
    };
  });
}

function buildGeneratorResults(system: PowerSystem, network: NetworkData, busResults: BusResult[]): GeneratorResult[] {
  return system.generators.map(gen => {
    const busResult = busResults.find(item => item.bus === gen.bus);
    const busIndex = network.index.get(gen.bus) ?? 0;
    const atLimit = network.limitedBuses.has(busIndex);
    return {
      generator: gen.id,
      bus: gen.bus,
      pg: gen.pg,
      qg: atLimit ? gen.qmax : busResult?.qg ?? gen.qg,
      v: busResult?.v ?? gen.v,
      status: gen.active === false ? 'off' : atLimit ? 'at limit' : 'on',
    };
  });
}

function emptyResult(method: PowerFlowResult['method'], startTime: number): PowerFlowResult {
  return {
    converged: false,
    iterations: 0,
    maxMismatch: Number.NaN,
    losses: { real: 0, imag: 0 },
    busResults: [],
    lineResults: [],
    transformerResults: [],
    generatorResults: [],
    elapsedTime: now() - startTime,
    method,
  };
}

/**
 * Newton-Raphson AC power flow with full Jacobian and PV reactive-limit checks.
 */
export function solveNewtonRaphson(
  system: PowerSystem,
  tolerance = 1e-6,
  maxIterations = 50
): PowerFlowResult {
  const startTime = now();
  if (system.buses.length === 0) return emptyResult('Newton-Raphson', startTime);

  const network = prepareNetwork(system);
  const { ybus, Vm, theta, slackIdx, busTypes, Psp, Qsp, connected } = network;
  const n = ybus.n;

  const unknownAngle: number[] = [];
  const unknownVoltage: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!connected[i]) continue;
    if (i !== slackIdx) unknownAngle.push(i);
    if (busTypes[i] === 'pq' || busTypes[i] === 'isolated') unknownVoltage.push(i);
  }

  let converged = false;
  let iterations = 0;
  let maxMismatch = Infinity;

  for (let outer = 0; outer < 4; outer++) {
    converged = false;
    maxMismatch = Infinity;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      iterations += 1;
      const { P, Q } = calculateInjections(network);

      const mismatch: number[] = [];
      unknownAngle.forEach(i => mismatch.push(Psp[i] - P[i]));
      unknownVoltage.forEach(i => mismatch.push(Qsp[i] - Q[i]));

      maxMismatch = mismatch.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      if (maxMismatch < tolerance) {
        converged = true;
        break;
      }

      const size = unknownAngle.length + unknownVoltage.length;
      const J: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

      const rowForAngle = new Map<number, number>();
      const rowForVoltage = new Map<number, number>();
      unknownAngle.forEach((busIndex, k) => rowForAngle.set(busIndex, k));
      unknownVoltage.forEach((busIndex, k) => rowForVoltage.set(busIndex, unknownAngle.length + k));

      unknownAngle.forEach((i, row) => {
        unknownAngle.forEach((j, column) => {
          if (i === j) {
            J[row][column] = -Q[i] - ybus.b[i][i] * Vm[i] * Vm[i];
          } else {
            const angle = theta[i] - theta[j];
            J[row][column] = Vm[i] * Vm[j] * (ybus.g[i][j] * Math.sin(angle) - ybus.b[i][j] * Math.cos(angle));
          }
        });
        unknownVoltage.forEach((j, columnIndex) => {
          const column = unknownAngle.length + columnIndex;
          if (i === j) {
            J[row][column] = P[i] / Vm[i] + ybus.g[i][i] * Vm[i];
          } else {
            const angle = theta[i] - theta[j];
            J[row][column] = Vm[i] * (ybus.g[i][j] * Math.cos(angle) + ybus.b[i][j] * Math.sin(angle));
          }
        });
      });

      unknownVoltage.forEach((i, voltageIndex) => {
        const row = unknownAngle.length + voltageIndex;
        unknownAngle.forEach((j, column) => {
          if (i === j) {
            J[row][column] = P[i] - ybus.g[i][i] * Vm[i] * Vm[i];
          } else {
            const angle = theta[i] - theta[j];
            J[row][column] = -Vm[i] * Vm[j] * (ybus.g[i][j] * Math.cos(angle) + ybus.b[i][j] * Math.sin(angle));
          }
        });
        unknownVoltage.forEach((j, columnIndex) => {
          const column = unknownAngle.length + columnIndex;
          if (i === j) {
            J[row][column] = Q[i] / Vm[i] - ybus.b[i][i] * Vm[i];
          } else {
            const angle = theta[i] - theta[j];
            J[row][column] = Vm[i] * (ybus.g[i][j] * Math.sin(angle) - ybus.b[i][j] * Math.cos(angle));
          }
        });
      });

      const delta = solveLinearSystem(J, mismatch);
      if (!delta) break;

      unknownAngle.forEach((i, k) => {
        theta[i] += delta[k];
      });
      unknownVoltage.forEach((i, k) => {
        Vm[i] = Math.max(0.2, Math.min(2.5, Vm[i] + delta[unknownAngle.length + k]));
      });
    }

    if (!converged) break;

    // Reactive limit enforcement for PV buses.
    let violation = false;
    const { Q } = calculateInjections(network);
    for (let i = 0; i < n; i++) {
      if (busTypes[i] !== 'pv' || i === slackIdx) continue;
      const generator = system.generators.find(gen => gen.bus === system.buses[i].id && gen.active !== false);
      if (!generator) continue;
      const qg = (Q[i] + network.qLoad[i]) * network.baseMVA;
      if (qg > generator.qmax + 1e-6) {
        network.Qsp[i] = generator.qmax / network.baseMVA - network.qLoad[i];
        network.busTypes[i] = 'pq';
        network.limitedBuses.add(i);
        if (!unknownVoltage.includes(i)) unknownVoltage.push(i);
        violation = true;
      } else if (qg < generator.qmin - 1e-6) {
        network.Qsp[i] = generator.qmin / network.baseMVA - network.qLoad[i];
        network.busTypes[i] = 'pq';
        network.limitedBuses.add(i);
        if (!unknownVoltage.includes(i)) unknownVoltage.push(i);
        violation = true;
      }
    }
    if (!violation) break;
  }

  const busResults = buildBusResults(system, network);
  const { lineResults, transformerResults, losses } = buildBranchResults(system, network);
  const generatorResults = buildGeneratorResults(system, network, busResults);

  return {
    converged,
    iterations,
    maxMismatch,
    losses,
    busResults,
    lineResults,
    transformerResults,
    generatorResults,
    elapsedTime: now() - startTime,
    method: 'Newton-Raphson',
  };
}

/**
 * Fast-decoupled power flow (XB variant, R neglected in the Jacobian).
 */
export function solveFastDecoupled(
  system: PowerSystem,
  tolerance = 1e-6,
  maxIterations = 50
): PowerFlowResult {
  const startTime = now();
  if (system.buses.length === 0) return emptyResult('Fast-Decoupled', startTime);

  const network = prepareNetwork(system);
  const { ybus, Vm, theta, slackIdx, busTypes, Psp, Qsp, connected } = network;
  const n = ybus.n;

  const angleBuses: number[] = [];
  const voltageBuses: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!connected[i]) continue;
    if (i !== slackIdx) angleBuses.push(i);
    if (busTypes[i] === 'pq' || busTypes[i] === 'isolated') voltageBuses.push(i);
  }

  const buildMatrix = (buses: number[]): number[][] =>
    buses.map(i => buses.map(j => -ybus.b[i][j]));

  const Bp = buildMatrix(angleBuses);
  const Bpp = buildMatrix(voltageBuses);

  let converged = false;
  let iterations = 0;
  let maxMismatch = Infinity;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    iterations += 1;
    const { P, Q } = calculateInjections(network);

    const dP = angleBuses.map(i => (Psp[i] - P[i]) / Math.max(0.2, Vm[i]));
    const dQ = voltageBuses.map(i => (Qsp[i] - Q[i]) / Math.max(0.2, Vm[i]));
    maxMismatch = Math.max(
      0,
      ...angleBuses.map(i => Math.abs(Psp[i] - P[i])),
      ...voltageBuses.map(i => Math.abs(Qsp[i] - Q[i]))
    );
    if (maxMismatch < tolerance) {
      converged = true;
      break;
    }

    const dTheta = solveLinearSystem(Bp, dP);
    if (!dTheta) break;
    angleBuses.forEach((i, k) => {
      theta[i] += dTheta[k];
    });

    if (voltageBuses.length > 0) {
      const dV = solveLinearSystem(Bpp, dQ);
      if (!dV) break;
      voltageBuses.forEach((i, k) => {
        Vm[i] = Math.max(0.2, Math.min(2.5, Vm[i] + dV[k]));
      });
    }
  }

  const busResults = buildBusResults(system, network);
  const { lineResults, transformerResults, losses } = buildBranchResults(system, network);
  const generatorResults = buildGeneratorResults(system, network, busResults);

  return {
    converged,
    iterations,
    maxMismatch,
    losses,
    busResults,
    lineResults,
    transformerResults,
    generatorResults,
    elapsedTime: now() - startTime,
    method: 'Fast-Decoupled',
  };
}

/**
 * Gauss-Seidel power flow.
 */
export function solveGaussSeidel(
  system: PowerSystem,
  tolerance = 1e-6,
  maxIterations = 500
): PowerFlowResult {
  const effectiveTolerance = Math.max(tolerance, 1e-5);
  const startTime = now();
  if (system.buses.length === 0) return emptyResult('Gauss-Seidel', startTime);

  const network = prepareNetwork(system);
  const { ybus, Vm, theta, slackIdx, busTypes, Psp, Qsp, connected, busVset } = network;
  const n = ybus.n;

  const V: Complex[] = system.buses.map((_, i) => cPolar(Vm[i], theta[i]));
  let converged = false;
  let iterations = 0;
  let maxMismatch = Infinity;

  const iterationLimit = Math.max(maxIterations, 500);
  for (let iteration = 0; iteration < iterationLimit; iteration++) {
    iterations += 1;
    let maxChange = 0;

    for (let i = 0; i < n; i++) {
      if (i === slackIdx || !connected[i]) continue;
      const isPq = busTypes[i] === 'pq' || busTypes[i] === 'isolated';

      const yii: Complex = { re: ybus.g[i][i], im: ybus.b[i][i] };
      if (cAbs(yii) < 1e-12) continue;

      let current: Complex = { re: 0, im: 0 };
      let qInjection = Qsp[i];

      if (!isPq) {
        // PV bus: compute reactive injection from the present voltage.
        let q = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const angle = theta[i] - theta[j];
          q += Vm[i] * Vm[j] * (ybus.g[i][j] * Math.sin(angle) - ybus.b[i][j] * Math.cos(angle));
        }
        q -= Vm[i] * Vm[i] * ybus.b[i][i];
        qInjection = q;
      }

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const yij: Complex = { re: ybus.g[i][j], im: ybus.b[i][j] };
        current = cAdd(current, cMul(yij, V[j]));
      }

      const scheduled: Complex = { re: Psp[i], im: -qInjection };
      const next = cDiv(cSub(cDiv(scheduled, cConj(V[i])), current), yii);

      if (!isPq) {
        const magnitude = cAbs(next) || 1e-6;
        const target = busVset[i];
        V[i] = { re: (next.re / magnitude) * target, im: (next.im / magnitude) * target };
      } else {
        const change = Math.hypot(next.re - V[i].re, next.im - V[i].im);
        maxChange = Math.max(maxChange, change);
        V[i] = next;
      }
      Vm[i] = cAbs(V[i]);
      theta[i] = Math.atan2(V[i].im, V[i].re);
    }

    // Recompute the mismatch using power injections.
    const { P, Q } = calculateInjections(network);
    maxMismatch = 0;
    for (let i = 0; i < n; i++) {
      if (i === slackIdx || !connected[i]) continue;
      maxMismatch = Math.max(maxMismatch, Math.abs(Psp[i] - P[i]));
      if (busTypes[i] === 'pq' || busTypes[i] === 'isolated') {
        maxMismatch = Math.max(maxMismatch, Math.abs(Qsp[i] - Q[i]));
      }
    }
    if (maxMismatch < effectiveTolerance) {
      converged = true;
      break;
    }
  }

  const busResults = buildBusResults(system, network);
  const { lineResults, transformerResults, losses } = buildBranchResults(system, network);
  const generatorResults = buildGeneratorResults(system, network, busResults);

  return {
    converged,
    iterations,
    maxMismatch,
    losses,
    busResults,
    lineResults,
    transformerResults,
    generatorResults,
    elapsedTime: now() - startTime,
    method: 'Gauss-Seidel',
  };
}

/**
 * DC power flow (linear, P only, flat voltage profile).
 */
export function solveDC(system: PowerSystem): PowerFlowResult {
  const startTime = now();
  if (system.buses.length === 0) return emptyResult('DC', startTime);

  const network = prepareNetwork(system);
  const { ybus, Vm, theta, slackIdx, connected, Psp } = network;
  const n = ybus.n;

  const unknown: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i !== slackIdx && connected[i]) unknown.push(i);
  }

  // B matrix from branch reactances (1/x), shunts and resistance neglected.
  const B: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const index = network.index;
  system.lines.forEach(line => {
    if (line.active === false) return;
    const i = index.get(line.fromBus);
    const j = index.get(line.toBus);
    if (i === undefined || j === undefined || line.reactance === 0) return;
    const b = 1 / line.reactance;
    B[i][i] += b;
    B[j][j] += b;
    B[i][j] -= b;
    B[j][i] -= b;
  });
  system.transformers.forEach(txf => {
    if (txf.active === false) return;
    const i = index.get(txf.fromBus);
    const j = index.get(txf.toBus);
    if (i === undefined || j === undefined || txf.reactance === 0) return;
    const b = 1 / txf.reactance;
    B[i][i] += b;
    B[j][j] += b;
    B[i][j] -= b;
    B[j][i] -= b;
  });

  const reduced = unknown.map(i => unknown.map(j => B[i][j]));
  const rhs = unknown.map(i => Psp[i]);
  const solution = solveLinearSystem(reduced, rhs);
  let converged = false;
  if (solution) {
    converged = true;
    unknown.forEach((i, k) => {
      theta[i] = solution[k];
    });
  }

  const lineResults: LineResult[] = [];
  let lossP = 0;
  const pushFlow = (id: string, from: string, to: string, x: number, rating: number) => {
    const i = index.get(from);
    const j = index.get(to);
    if (i === undefined || j === undefined || x === 0) return;
    const p = ((theta[i] - theta[j]) / x) * network.baseMVA;
    lineResults.push({
      line: id,
      fromBus: from,
      toBus: to,
      pFrom: p,
      qFrom: 0,
      pTo: -p,
      qTo: 0,
      ploss: 0,
      qloss: 0,
      loading: rating > 0 ? (Math.abs(p) / rating) * 100 : 0,
    });
    lossP += 0;
  };

  system.lines.forEach(line => pushFlow(line.id, line.fromBus, line.toBus, line.reactance, line.rating));
  system.transformers.forEach(txf => pushFlow(txf.id, txf.fromBus, txf.toBus, txf.reactance, txf.rating));

  const busResults: BusResult[] = system.buses.map((bus, i) => ({
    bus: bus.id,
    v: Vm[i],
    angle: (theta[i] * 180) / Math.PI,
    pg: network.pGen[i] * network.baseMVA,
    qg: 0,
    pl: network.pLoad[i] * network.baseMVA,
    ql: network.qLoad[i] * network.baseMVA,
    qshunt: 0,
  }));

  const generatorResults: GeneratorResult[] = system.generators.map(gen => ({
    generator: gen.id,
    bus: gen.bus,
    pg: gen.pg,
    qg: 0,
    v: Vm[index.get(gen.bus) ?? 0] ?? gen.v,
    status: gen.active === false ? 'off' : 'on',
  }));

  return {
    converged,
    iterations: 1,
    maxMismatch: 0,
    losses: { real: lossP, imag: 0 },
    busResults,
    lineResults,
    transformerResults: [],
    generatorResults,
    elapsedTime: now() - startTime,
    method: 'DC',
  };
}

export function solvePowerFlow(
  system: PowerSystem,
  method: 'Newton-Raphson' | 'Fast-Decoupled' | 'DC' | 'Gauss-Seidel' = 'Newton-Raphson',
  tolerance = 1e-6,
  maxIterations = 50
): PowerFlowResult {
  switch (method) {
    case 'DC':
      return solveDC(system);
    case 'Fast-Decoupled':
      return solveFastDecoupled(system, tolerance, maxIterations);
    case 'Gauss-Seidel':
      return solveGaussSeidel(system, tolerance, maxIterations);
    case 'Newton-Raphson':
    default:
      return solveNewtonRaphson(system, tolerance, maxIterations);
  }
}
