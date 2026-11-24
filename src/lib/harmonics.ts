/**
 * Harmonic voltage-distortion screening.
 *
 * For each harmonic order a frequency-dependent network is assembled
 * (X ∝ h, R ∝ √h, shunt capacitors B ∝ h) and solved with a current injection
 * at the selected nonlinear-load bus.
 */

import { PowerSystem } from '@/types';

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

export interface HarmonicSource {
  order: number;
  percent: number;
}

export interface HarmonicInput {
  sourceBus: string;
  spectrum: HarmonicSource[];
  fundamentalCurrentPU?: number;
}

export interface HarmonicBusResult {
  bus: string;
  thd: number;
  harmonics: { order: number; magnitude: number }[];
}

export interface HarmonicResult {
  buses: HarmonicBusResult[];
  worstBus?: string;
  worstTHD: number;
  limit: number;
  compliant: boolean;
  notes: string[];
}

const IEEE_519_LIMIT = 5;

function buildHarmonicYbus(system: PowerSystem, order: number): Complex[][] {
  const n = system.buses.length;
  const Y: Complex[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => cv(0)));
  const index = new Map<string, number>();
  system.buses.forEach((bus, i) => index.set(bus.id, i));
  const h = Math.max(1, order);
  const skin = Math.sqrt(h);

  const addBranch = (i: number, j: number, y: Complex) => {
    Y[i][i] = cAdd(Y[i][i], y);
    Y[j][j] = cAdd(Y[j][j], y);
    Y[i][j] = cSub(Y[i][j], y);
    Y[j][i] = cSub(Y[j][i], y);
  };

  system.lines.forEach(line => {
    if (line.active === false) return;
    const i = index.get(line.fromBus);
    const j = index.get(line.toBus);
    if (i === undefined || j === undefined) return;
    const r = line.resistance * skin;
    const x = line.reactance * h;
    const z2 = r * r + x * x;
    if (z2 < 1e-14) return;
    addBranch(i, j, { re: r / z2, im: -x / z2 });
    const charging = ((line.susceptance || 0) * h) / 2;
    Y[i][i] = cAdd(Y[i][i], cv(0, charging));
    Y[j][j] = cAdd(Y[j][j], cv(0, charging));
  });

  system.transformers.forEach(txf => {
    if (txf.active === false) return;
    const i = index.get(txf.fromBus);
    const j = index.get(txf.toBus);
    if (i === undefined || j === undefined) return;
    const r = txf.resistance * skin;
    const x = txf.reactance * h;
    const z2 = r * r + x * x;
    if (z2 < 1e-14) return;
    const y: Complex = { re: r / z2, im: -x / z2 };
    const tap = txf.tap > 0 ? txf.tap : 1;
    Y[i][i] = cAdd(Y[i][i], cDiv(y, cv(tap * tap)));
    Y[j][j] = cAdd(Y[j][j], y);
    Y[i][j] = cSub(Y[i][j], cDiv(y, cv(tap)));
    Y[j][i] = cSub(Y[j][i], cDiv(y, cv(tap)));
  });

  (system.shunts ?? []).forEach(shunt => {
    if (shunt.active === false) return;
    const i = index.get(shunt.bus);
    if (i === undefined) return;
    Y[i][i] = cAdd(Y[i][i], cv(shunt.g * skin, shunt.b * h));
  });

  const subtransientX = 0.05;
  let sources = 0;
  system.generators.forEach(gen => {
    if (gen.active === false) return;
    const i = index.get(gen.bus);
    if (i === undefined) return;
    Y[i][i] = cAdd(Y[i][i], cv(0, -1 / (subtransientX * h)));
    sources += 1;
  });
  if (sources === 0) {
    const slackIdx = Math.max(0, system.buses.findIndex(bus => bus.type === 'slack'));
    Y[slackIdx][slackIdx] = cAdd(Y[slackIdx][slackIdx], cv(0, -1 / (subtransientX * h)));
  }
  for (let i = 0; i < n; i++) Y[i][i] = cAdd(Y[i][i], cv(1e-6));

  return Y;
}

export function analyzeHarmonics(system: PowerSystem, input: HarmonicInput): HarmonicResult {
  const sourceIndex = system.buses.findIndex(bus => bus.id === input.sourceBus);
  if (sourceIndex < 0) throw new Error(`Bus ${input.sourceBus} not found`);

  const spectrum = input.spectrum
    .filter(item => item.order > 1 && Number.isFinite(item.percent))
    .map(item => ({ order: Math.round(item.order), percent: item.percent }));
  const fundamental = Math.max(0.01, input.fundamentalCurrentPU ?? 1);

  const busMagnitudes = new Map<string, number[]>();
  system.buses.forEach(bus => busMagnitudes.set(bus.id, []));

  spectrum.forEach(item => {
    const Y = buildHarmonicYbus(system, item.order);
    const Z = invertComplex(Y);
    const current = cv((item.percent / 100) * fundamental, 0);
    system.buses.forEach((bus, i) => {
      const voltage = cMul(Z[i][sourceIndex], current);
      busMagnitudes.get(bus.id)?.push(cAbs(voltage));
    });
  });

  const buses: HarmonicBusResult[] = system.buses.map(bus => {
    const magnitudes = busMagnitudes.get(bus.id) ?? [];
    const thd = Math.sqrt(magnitudes.reduce((sum, value) => sum + value * value, 0)) * 100;
    return {
      bus: bus.id,
      thd,
      harmonics: spectrum.map((item, index) => ({ order: item.order, magnitude: (magnitudes[index] ?? 0) * 100 })),
    };
  });

  const worst = buses.reduce(
    (current, bus) => (bus.thd > current.thd ? bus : current),
    buses[0] ?? { bus: '', thd: 0, harmonics: [] }
  );

  const notes: string[] = [
    'Harmonic impedances: X ∝ h, R ∝ √h, capacitor banks B ∝ h.',
    'IEEE 519 recommends voltage THD below 5 % on buses below 69 kV.',
    'A single current source is used; extend the spectrum for multiple nonlinear loads.',
  ];

  return {
    buses,
    worstBus: worst.bus || undefined,
    worstTHD: worst.thd,
    limit: IEEE_519_LIMIT,
    compliant: worst.thd <= IEEE_519_LIMIT,
    notes,
  };
}
