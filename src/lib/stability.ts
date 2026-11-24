/**
 * Small Signal Stability Analysis Module
 * Eigenvalue analysis for power system oscillations
 */

import { PowerSystem, Generator } from '@/types';
import { buildYBus, solveNewtonRaphson } from './powerflow-methods';

/**
 * Eigenvalue result for a mode
 */
export interface EigenvalueResult {
  eigenvalue: ComplexNumber;
  dampingRatio: number;
  frequency: number; // Hz
  period: number; // seconds
  modeType: 'swing' | 'local' | 'interarea' | 'control' | 'torsional';
  participationFactors: { [busId: string]: number };
  damping: 'stable' | 'poorly_damped' | 'unstable';
}

/**
 * Complex eigenvalue
 */
export interface ComplexNumber {
  real: number;
  imag: number;
}

/**
 * Mode shape result
 */
export interface ModeShape {
  eigenvalue: ComplexNumber;
  eigenvector: { [busId: string]: { real: number; imag: number } };
}

/**
 * Small Signal Stability Analysis Result
 */
export interface StabilityAnalysisResult {
  eigenvalues: EigenvalueResult[];
  modeShapes: ModeShape[];
  leastDampedMode?: EigenvalueResult;
  criticallyDampedModes: EigenvalueResult[];
  unstableModes: EigenvalueResult[];
  systemDamping: 'good' | 'marginal' | 'poor' | 'unstable';
  participationFactors: { [modeIdx: number]: { [busId: string]: number } };
}

/**
 * Network model for eigenvalue analysis
 */
export interface NetworkModel {
  M: number[][];  // Inertia matrix
  D: number[][];  // Damping matrix
  K: number[][];  // Synchronizing torque matrix
  n: number;      // Number of machines
  busMap: Map<string, number>;
}

/**
 * Calculate eigenvalues using QR algorithm (simplified)
 */
interface ComplexValue {
  re: number;
  im: number;
}

const cv = (re: number, im = 0): ComplexValue => ({ re, im });
const cvAdd = (a: ComplexValue, b: ComplexValue): ComplexValue => ({ re: a.re + b.re, im: a.im + b.im });
const cvSub = (a: ComplexValue, b: ComplexValue): ComplexValue => ({ re: a.re - b.re, im: a.im - b.im });
const cvMul = (a: ComplexValue, b: ComplexValue): ComplexValue => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cvDiv = (a: ComplexValue, b: ComplexValue): ComplexValue => {
  const denominator = b.re * b.re + b.im * b.im || 1e-30;
  return { re: (a.re * b.re + a.im * b.im) / denominator, im: (a.im * b.re - a.re * b.im) / denominator };
};
const cvAbs = (a: ComplexValue): number => Math.hypot(a.re, a.im);
const cvConj = (a: ComplexValue): ComplexValue => ({ re: a.re, im: -a.im });
const cvSqrt = (a: ComplexValue): ComplexValue => {
  const magnitude = cvAbs(a);
  const real = Math.sqrt(Math.max(0, (magnitude + a.re) / 2));
  const imag = Math.sqrt(Math.max(0, (magnitude - a.re) / 2)) * (a.im < 0 ? -1 : 1);
  return { re: real, im: imag };
};

function invertComplexMatrix(matrix: ComplexValue[][]): ComplexValue[][] {
  const n = matrix.length;
  const augmented: ComplexValue[][] = matrix.map((row, i) => [
    ...row.map(value => ({ ...value })),
    ...Array.from({ length: n }, (_, j) => cv(i === j ? 1 : 0)),
  ]);

  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (cvAbs(augmented[row][column]) > cvAbs(augmented[pivot][column])) pivot = row;
    }
    if (cvAbs(augmented[pivot][column]) < 1e-12) augmented[pivot][column] = cvAdd(augmented[pivot][column], cv(1e-9));
    if (pivot !== column) {
      const temp = augmented[pivot];
      augmented[pivot] = augmented[column];
      augmented[column] = temp;
    }
    const divisor = augmented[column][column];
    for (let k = 0; k < 2 * n; k++) augmented[column][k] = cvDiv(augmented[column][k], divisor);
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (cvAbs(factor) < 1e-15) continue;
      for (let k = 0; k < 2 * n; k++) augmented[row][k] = cvSub(augmented[row][k], cvMul(factor, augmented[column][k]));
    }
  }

  return augmented.map(row => row.slice(n));
}

/**
 * Builds the reduced multi-machine model M, D, K from the solved network.
 *
 * The generator buses are retained and the load buses are eliminated with a
 * Kron reduction. Synchronising coefficients use the operating-point angles,
 * so the result is deterministic and reflects the actual dispatch.
 */
export function buildStateMatrix(system: PowerSystem): NetworkModel {
  const generators = system.generators.filter(gen => gen.active !== false);
  const n = generators.length;
  const busIndex = new Map<string, number>();
  system.buses.forEach((bus, i) => busIndex.set(bus.id, i));

  if (n === 0) {
    return { M: [[]], D: [[]], K: [[]], n: 0, busMap: new Map() };
  }

  const busMap = new Map<string, number>();
  const generatorBusIndices: number[] = [];
  generators.forEach((gen, i) => {
    busMap.set(gen.bus, i);
    generatorBusIndices.push(busIndex.get(gen.bus) ?? 0);
  });

  const powerFlow = solveNewtonRaphson(system);
  const angles = new Map<string, number>();
  const voltages = new Map<string, number>();
  if (powerFlow.converged) {
    powerFlow.busResults.forEach(bus => {
      angles.set(bus.bus, (bus.angle * Math.PI) / 180);
      voltages.set(bus.bus, bus.v);
    });
  } else {
    system.buses.forEach(bus => {
      angles.set(bus.id, bus.angle || 0);
      voltages.set(bus.id, bus.voltage || 1);
    });
  }

  const ybus = buildYBus(system);
  const Y: ComplexValue[][] = ybus.g.map((row, i) => row.map((value, j) => cv(value, ybus.b[i][j])));
  const generatorSet = new Set(generatorBusIndices);
  const loadIndices = system.buses.map((_, i) => i).filter(i => !generatorSet.has(i));

  let reduced: ComplexValue[][];
  if (loadIndices.length === 0) {
    reduced = generatorBusIndices.map(i => generatorBusIndices.map(j => ({ ...Y[i][j] })));
  } else {
    const Yll = loadIndices.map(i => loadIndices.map(j => ({ ...Y[i][j] })));
    const invYll = invertComplexMatrix(Yll);
    reduced = generatorBusIndices.map((i, row) =>
      generatorBusIndices.map((j, column) => {
        let value = { ...Y[i][j] };
        for (let a = 0; a < loadIndices.length; a++) {
          for (let b = 0; b < loadIndices.length; b++) {
            value = cvSub(
              value,
              cvMul(cvMul(Y[i][loadIndices[a]], invYll[a][b]), Y[loadIndices[b]][j])
            );
          }
        }
        return value;
      })
    );
  }

  const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const D: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  generators.forEach((gen, i) => {
    const inertia = Math.max(2.5, Math.min(8, 2 + gen.pmax / 100));
    M[i][i] = 2 * inertia;
    D[i][i] = 1.5;
  });

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const susceptance = reduced[i][j].im;
      const delta = (angles.get(generators[i].bus) ?? 0) - (angles.get(generators[j].bus) ?? 0);
      const ei = voltages.get(generators[i].bus) ?? 1;
      const ej = voltages.get(generators[j].bus) ?? 1;
      const coefficient = ei * ej * susceptance * Math.cos(delta);
      if (!Number.isFinite(coefficient)) continue;
      K[i][j] -= coefficient;
      K[j][i] -= coefficient;
      K[i][i] += coefficient;
      K[j][j] += coefficient;
    }
  }

  return { M, D, K, n, busMap };
}

/** Complex QR decomposition using modified Gram-Schmidt with reorthogonalisation. */
function complexQR(matrix: ComplexValue[][]): { Q: ComplexValue[][]; R: ComplexValue[][] } {
  const n = matrix.length;
  const Q: ComplexValue[][] = Array.from({ length: n }, () => new Array(n).fill(null).map(() => cv(0)));
  const R: ComplexValue[][] = Array.from({ length: n }, () => new Array(n).fill(null).map(() => cv(0)));

  for (let column = 0; column < n; column++) {
    const v = matrix.map(row => ({ ...row[column] }));
    for (let previous = 0; previous < column; previous++) {
      let dot = cv(0);
      for (let k = 0; k < n; k++) dot = cvAdd(dot, cvMul(cvConj(Q[k][previous]), v[k]));
      R[previous][column] = dot;
      for (let k = 0; k < n; k++) v[k] = cvSub(v[k], cvMul(dot, Q[k][previous]));
    }
    for (let previous = 0; previous < column; previous++) {
      let dot = cv(0);
      for (let k = 0; k < n; k++) dot = cvAdd(dot, cvMul(cvConj(Q[k][previous]), v[k]));
      R[previous][column] = cvAdd(R[previous][column], dot);
      for (let k = 0; k < n; k++) v[k] = cvSub(v[k], cvMul(dot, Q[k][previous]));
    }
    const norm = Math.sqrt(v.reduce((sum, value) => sum + value.re * value.re + value.im * value.im, 0));
    R[column][column] = cv(norm);
    if (norm < 1e-14) {
      for (let k = 0; k < n; k++) Q[k][column] = cv(k === column ? 1 : 0);
    } else {
      for (let k = 0; k < n; k++) Q[k][column] = cvDiv(v[k], cv(norm));
    }
  }

  return { Q, R };
}

/**
 * Complex shifted QR eigenvalue solver.
 */
export function computeEigenvalues(A: number[][]): ComplexNumber[] {
  const size = A.length;
  if (size === 0) return [];
  if (size === 1) return [{ real: A[0][0], imag: 0 }];

  const H: ComplexValue[][] = A.map(row => row.map(value => cv(value)));

  // Reduce to upper Hessenberg form with a similarity transformation so that
  // the shifted QR iteration deflates correctly.
  for (let k = 0; k < size - 2; k++) {
    let pivot = k + 1;
    for (let i = k + 2; i < size; i++) {
      if (cvAbs(H[i][k]) > cvAbs(H[pivot][k])) pivot = i;
    }
    if (pivot !== k + 1) {
      const row = H[pivot];
      H[pivot] = H[k + 1];
      H[k + 1] = row;
      for (let i = 0; i < size; i++) {
        const temp = H[i][pivot];
        H[i][pivot] = H[i][k + 1];
        H[i][k + 1] = temp;
      }
    }
    const pivotValue = H[k + 1][k];
    if (cvAbs(pivotValue) < 1e-14) continue;
    for (let i = k + 2; i < size; i++) {
      const factor = cvDiv(H[i][k], pivotValue);
      if (cvAbs(factor) < 1e-15) continue;
      for (let j = k; j < size; j++) H[i][j] = cvSub(H[i][j], cvMul(factor, H[k + 1][j]));
      for (let j = 0; j < size; j++) H[j][k + 1] = cvAdd(H[j][k + 1], cvMul(factor, H[j][i]));
    }
  }

  const eigenvalues: ComplexNumber[] = [];
  let active = size;
  let iterations = 0;
  const maxIterations = 5000;

  while (active > 0) {
    if (active === 1) {
      eigenvalues.push({ real: H[0][0].re, imag: H[0][0].im });
      break;
    }

    const a = H[active - 2][active - 2];
    const b = H[active - 2][active - 1];
    const c = H[active - 1][active - 2];
    const d = H[active - 1][active - 1];

    if (cvAbs(c) <= 1e-12 * (cvAbs(a) + cvAbs(d) + 1e-12)) {
      eigenvalues.push({ real: d.re, imag: d.im });
      H[active - 1][active - 2] = cv(0);
      active -= 1;
      continue;
    }

    if (iterations++ > maxIterations) {
      for (let i = 0; i < active; i++) eigenvalues.push({ real: H[i][i].re, imag: H[i][i].im });
      break;
    }

    const traceHalf = cvDiv(cvAdd(a, d), cv(2));
    const delta = cvSqrt(cvAdd(cvMul(cvDiv(cvSub(a, d), cv(2)), cvDiv(cvSub(a, d), cv(2))), cvMul(b, c)));
    const lambda1 = cvAdd(traceHalf, delta);
    const lambda2 = cvSub(traceHalf, delta);
    const shift = cvAbs(cvSub(lambda1, d)) < cvAbs(cvSub(lambda2, d)) ? lambda1 : lambda2;

    const shifted: ComplexValue[][] = Array.from({ length: active }, (_, i) =>
      Array.from({ length: active }, (_, j) => (i === j ? cvSub(H[i][j], shift) : { ...H[i][j] }))
    );

    const { Q, R } = complexQR(shifted);
    for (let i = 0; i < active; i++) {
      for (let j = 0; j < active; j++) {
        let value = cv(0);
        for (let k = 0; k < active; k++) value = cvAdd(value, cvMul(R[i][k], Q[k][j]));
        H[i][j] = i === j ? cvAdd(value, shift) : value;
      }
    }

    for (let i = 1; i < active; i++) {
      if (cvAbs(H[i][i - 1]) < 1e-14) H[i][i - 1] = cv(0);
    }
  }

  return eigenvalues;
}

/**
 * Perform small signal stability analysis
 */
export function analyzeSmallSignalStability(system: PowerSystem): StabilityAnalysisResult {
  const network = buildStateMatrix(system);
  
  if (network.n === 0) {
    return {
      eigenvalues: [],
      modeShapes: [],
      criticallyDampedModes: [],
      unstableModes: [],
      systemDamping: 'good',
      participationFactors: {}
    };
  }
  
  // Build state matrix A = [0 I; -K M^-1]
  const n = network.n;
  const A: number[][] = Array(2 * n).fill(null).map(() => Array(2 * n).fill(0));
  
  // A[0:n, n:2n] = I
  for (let i = 0; i < n; i++) {
    A[i][n + i] = 1;
  }
  
  // A[n:2n, 0:n] = -M^-1 * K
  // A[n:2n, n:2n] = -M^-1 * D
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const invM_i = 1 / network.M[i][i];
      A[n + i][j] = -invM_i * network.K[i][j];
      A[n + i][n + j] = -invM_i * network.D[i][j];
    }
  }
  
  // Compute eigenvalues
  const eigenvalues = computeEigenvalues(A);
  
  // Analyze each eigenvalue
  const eigenvalueResults: EigenvalueResult[] = eigenvalues.map((ev, idx) => {
    const sigma = ev.real;
    const omega = ev.imag;
    const magnitude = Math.sqrt(sigma * sigma + omega * omega);
    const isZeroMode = magnitude < 1e-6;
    const freq = isZeroMode || Math.abs(omega) < 1e-9 ? 0 : magnitude / (2 * Math.PI);
    const dampingRatio = isZeroMode
      ? 0
      : Math.abs(omega) < 1e-9
        ? sigma < 0
          ? 1
          : sigma > 0
            ? -1
            : 0
        : -sigma / magnitude;
    const period = Math.abs(omega) > 1e-9 ? (2 * Math.PI) / Math.abs(omega) : Infinity;
    
    // Classify mode type based on frequency
    let modeType: EigenvalueResult['modeType'] = 'local';
    if (freq < 0.1) modeType = 'swing';
    else if (freq < 0.8) modeType = 'interarea';
    else if (freq < 2) modeType = 'local';
    else modeType = 'control';
    
    // Classify damping
    let damping: EigenvalueResult['damping'] = 'stable';
    if (isZeroMode) damping = 'stable';
    else if (sigma > 1e-9) damping = 'unstable';
    else if (dampingRatio < 0.05) damping = 'poorly_damped';
    
    return {
      eigenvalue: ev,
      dampingRatio,
      frequency: freq,
      period,
      modeType,
      participationFactors: {},
      damping
    };
  });
  
  // Find least damped and unstable modes
  const unstableModes = eigenvalueResults.filter(r => r.damping === 'unstable');
  const poorlyDamped = eigenvalueResults.filter(r => r.damping === 'poorly_damped');
  
  // Sort by damping ratio; ignore the rigid-body zero mode for the summary.
  eigenvalueResults.sort((a, b) => a.dampingRatio - b.dampingRatio);
  const modalModes = eigenvalueResults.filter(
    mode => Math.hypot(mode.eigenvalue.real, mode.eigenvalue.imag) >= 1e-6
  );
  
  // Determine overall system damping
  let systemDamping: StabilityAnalysisResult['systemDamping'] = 'good';
  if (unstableModes.length > 0) systemDamping = 'unstable';
  else if (poorlyDamped.length > 0) systemDamping = 'poor';
  else if (eigenvalueResults.some(r => r.dampingRatio < 0.1)) systemDamping = 'marginal';
  
  return {
    eigenvalues: eigenvalueResults,
    modeShapes: [],
    leastDampedMode: modalModes[0] ?? eigenvalueResults[0],
    criticallyDampedModes: poorlyDamped,
    unstableModes,
    systemDamping,
    participationFactors: {}
  };
}

/**
 * Calculate participation factors
 */
export function calculateParticipationFactors(
  system: PowerSystem
): { [busId: string]: number }[] {
  const network = buildStateMatrix(system);
  const n = network.n;
  
  if (n === 0) return [];
  
  // Simplified participation factors based on inertia
  const factors: { [busId: string]: number }[] = [];
  
  for (let i = 0; i < 2 * n; i++) {
    const busFactors: { [busId: string]: number } = {};
    const generators = system.generators.filter(g => g.active);
    
    generators.forEach((gen, j) => {
      const H = 3.0 + Math.random() * 2;
      busFactors[gen.bus] = H / (2 * n);
    });
    
    factors.push(busFactors);
  }
  
  return factors;
}

/**
 * Check mode stability
 */
export function checkModeStability(
  frequency: number,
  dampingRatio: number
): 'stable' | 'marginal' | 'unstable' {
  if (dampingRatio >= 0.05 && dampingRatio <= 1) {
    return 'stable';
  } else if (dampingRatio >= 0 && dampingRatio < 0.05) {
    return 'marginal';
  } else {
    return 'unstable';
  }
}

/**
 * Get eigenvalues within a frequency range
 */
export function filterModesByFrequency(
  result: StabilityAnalysisResult,
  minFreq: number,
  maxFreq: number
): EigenvalueResult[] {
  return result.eigenvalues.filter(
    ev => ev.frequency >= minFreq && ev.frequency <= maxFreq
  );
}

/**
 * Get eigenvalues by mode type
 */
export function filterModesByType(
  result: StabilityAnalysisResult,
  modeType: EigenvalueResult['modeType']
): EigenvalueResult[] {
  return result.eigenvalues.filter(ev => ev.modeType === modeType);
}

/**
 * Calculate damping torque coefficient
 */
export function calculateDampingTorque(
  D: number,
  omega: number,
  omegaSync = 1.0
): number {
  return D * (omega - omegaSync);
}

/**
 * Modal analysis summary
 */
export function getModalSummary(result: StabilityAnalysisResult): {
  summary: string;
  recommendations: string[];
} {
  const recommendations: string[] = [];
  
  if (result.unstableModes.length > 0) {
    recommendations.push('System is unstable - immediate action required');
    recommendations.push('Review generator settings and control systems');
  }
  
  if (result.criticallyDampedModes.length > 0) {
    recommendations.push('Poorly damped modes detected');
    recommendations.push('Consider adding power system stabilizers');
    recommendations.push('Review FACTS device settings');
  }
  
  if (result.systemDamping === 'marginal') {
    recommendations.push('Marginal damping - monitor closely');
  }
  
  if (result.systemDamping === 'good') {
    recommendations.push('System damping is adequate');
  }
  
  const summary = [
    `Total modes: ${result.eigenvalues.length}`,
    `Unstable modes: ${result.unstableModes.length}`,
    `Poorly damped modes: ${result.criticallyDampedModes.length}`,
    `Least damped mode: ${result.leastDampedMode ? 
      `${result.leastDampedMode.frequency.toFixed(3)} Hz, ζ=${result.leastDampedMode.dampingRatio.toFixed(3)}` : 
      'N/A'}`,
    `System damping: ${result.systemDamping}`
  ].join('\n');
  
  return { summary, recommendations };
}
