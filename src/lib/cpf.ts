/**
 * Continuation power flow (voltage stability) using parameter continuation.
 *
 * The load and the non-slack generation are scaled by (1 + lambda) and the
 * resulting system is solved with the Newton-Raphson engine. The step is
 * reduced when a solution is lost, which places the nose point between the
 * last converged point and the failing one.
 */

import { PowerSystem } from '@/types';
import { solveNewtonRaphson } from './powerflow-methods';

export interface CPFConfig {
  lambdaStart: number;
  lambdaMax: number;
  stepSize: number;
  stepMin: number;
  stepMax: number;
  tolerance: number;
  maxIterations: number;
  adaptiveStep: boolean;
  targetLambda?: number;
}

export const defaultCPFConfig: CPFConfig = {
  lambdaStart: 0,
  lambdaMax: 5,
  stepSize: 0.1,
  stepMin: 0.005,
  stepMax: 0.4,
  tolerance: 1e-6,
  maxIterations: 50,
  adaptiveStep: true,
};

export interface CPFResult {
  converged: boolean;
  lambda: number;
  busVoltages: { [busId: string]: number };
  busAngles: { [busId: string]: number };
  lineFlows: { [lineId: string]: number };
  powerMismatch: number;
  iterations: number;
}

export interface CPFHistory {
  results: CPFResult[];
  nosePoint?: CPFResult;
  maximumLoadingPoint?: { lambda: number; voltages: { [busId: string]: number } };
  bifurcationType?: 'saddle-node' | 'limit-induced';
  pvCurve: { lambda: number; v: number }[][];
  vCurve: { lambda: number; v: number }[];
  converged: boolean;
}

export interface VoltageCollapseResult {
  lambdaMax: number;
  criticalBus?: string;
  pvCurve: { lambda: number; v: number }[][];
  vCurve: { lambda: number; v: number }[];
  recommendations: string[];
}

/** Scals loads and non-slack generation by (1 + lambda). */
export function scaleSystem(system: PowerSystem, lambda: number): PowerSystem {
  const scaled: PowerSystem = JSON.parse(JSON.stringify(system));
  const factor = 1 + lambda;

  scaled.loads = system.loads.map(load => {
    if (load.active === false) return { ...load };
    return { ...load, pl: load.pl * factor, ql: load.ql * factor };
  });

  scaled.generators = system.generators.map(gen => {
    if (gen.active === false) return { ...gen };
    const bus = system.buses.find(item => item.id === gen.bus);
    if (!bus || bus.type === 'slack') return { ...gen };
    return { ...gen, pg: Math.min(gen.pg * factor, gen.pmax) };
  });

  return scaled;
}

function record(powerFlow: ReturnType<typeof solveNewtonRaphson>, lambda: number): CPFResult {
  const busVoltages: { [busId: string]: number } = {};
  const busAngles: { [busId: string]: number } = {};
  powerFlow.busResults.forEach(bus => {
    busVoltages[bus.bus] = bus.v;
    busAngles[bus.bus] = bus.angle;
  });
  const lineFlows: { [lineId: string]: number } = {};
  powerFlow.lineResults.forEach(line => {
    lineFlows[line.line] = line.pFrom;
  });

  return {
    converged: powerFlow.converged,
    lambda,
    busVoltages,
    busAngles,
    lineFlows,
    powerMismatch: powerFlow.maxMismatch,
    iterations: powerFlow.iterations,
  };
}

/** Runs the continuation study. */
export function runCPF(system: PowerSystem, config: Partial<CPFConfig> = {}): CPFHistory {
  const cfg = { ...defaultCPFConfig, ...config };
  const lambdaMax = Math.max(cfg.lambdaMax, cfg.stepSize);
  const results: CPFResult[] = [];

  const initial = solveNewtonRaphson(system, cfg.tolerance, cfg.maxIterations);
  if (!initial.converged) {
    return { results: [], converged: false, pvCurve: [], vCurve: [] };
  }
  results.push(record(initial, 0));

  let lambda = 0;
  let step = Math.max(cfg.stepSize, cfg.stepMin);
  let lastGood = initial;

  while (lambda < lambdaMax - 1e-9) {
    const nextLambda = Math.min(lambdaMax, lambda + step);
    if (nextLambda <= lambda + 1e-9) break;

    const scaled = scaleSystem(system, nextLambda);
    const solution = solveNewtonRaphson(scaled, cfg.tolerance, cfg.maxIterations);

    if (solution.converged && Number.isFinite(solution.maxMismatch)) {
      results.push(record(solution, nextLambda));
      lambda = nextLambda;
      lastGood = solution;
      if (cfg.adaptiveStep && step < cfg.stepMax) {
        step = Math.min(cfg.stepMax, step * 1.25);
      }
    } else {
      step /= 2;
      if (step < cfg.stepMin) break;
    }
  }

  const nose = results.length > 1 ? results[results.length - 1] : undefined;

  const busIds = Object.keys(results[0].busVoltages);
  const pvCurve = busIds.map(busId =>
    results.map(point => ({ lambda: point.lambda, v: point.busVoltages[busId] ?? 1 }))
  );

  const criticalBus = nose
    ? Object.entries(nose.busVoltages).reduce(
        (worst, entry) => (entry[1] < worst[1] ? entry : worst),
        Object.entries(nose.busVoltages)[0]
      )[0]
    : busIds[0];

  const vCurve = results.map(point => ({ lambda: point.lambda, v: point.busVoltages[criticalBus] ?? 1 }));

  return {
    results,
    nosePoint: nose,
    maximumLoadingPoint: nose ? { lambda: nose.lambda, voltages: nose.busVoltages } : undefined,
    bifurcationType: nose ? 'saddle-node' : undefined,
    pvCurve,
    vCurve,
    converged: results.length > 1,
  };
}

/** Analyses voltage collapse using the CPF nose point. */
export function analyzeVoltageCollapse(system: PowerSystem): VoltageCollapseResult {
  const result = runCPF(system);
  const nose = result.nosePoint;
  const recommendations: string[] = [];

  let criticalBus: string | undefined;
  if (nose) {
    const entries = Object.entries(nose.busVoltages);
    criticalBus = entries.reduce((worst, entry) => (entry[1] < worst[1] ? entry : worst), entries[0])[0];
  }

  if (nose) {
    if (nose.lambda < 0.5) {
      recommendations.push('Low loading margin: the system is vulnerable to voltage collapse.');
      recommendations.push('Add shunt compensation or reinforce the transmission corridor.');
    } else if (nose.lambda < 1) {
      recommendations.push('Moderate loading margin. Monitor the critical bus under contingencies.');
    } else {
      recommendations.push('Adequate loading margin for the studied scaling direction.');
    }
    if (criticalBus) recommendations.push(`Critical bus: ${criticalBus}. Priorities voltage support there.`);
  } else {
    recommendations.push('The base case did not converge, so no margin could be computed.');
  }

  return {
    lambdaMax: nose?.lambda ?? 0,
    criticalBus,
    pvCurve: result.pvCurve,
    vCurve: result.vCurve,
    recommendations,
  };
}

/** Computes a simple L-index from the base power flow solution. */
export function calculateLIndex(system: PowerSystem): { L: number[]; Lmax: number; stable: boolean } {
  const powerFlow = solveNewtonRaphson(system);
  if (!powerFlow.converged) return { L: [], Lmax: 0, stable: false };

  const L = powerFlow.busResults
    .filter(bus => system.buses.find(item => item.id === bus.bus)?.type !== 'slack')
    .map(bus => Math.abs(1 - bus.v));

  const Lmax = L.length > 0 ? Math.max(...L) : 0;
  return { L, Lmax, stable: Lmax < 0.2 };
}

/** P-V curve data for a single bus. */
export function generatePVData(system: PowerSystem, busId: string): { p: number[]; v: number[] } {
  const result = runCPF(system);
  return {
    p: result.results.map(point => point.lambda * 100),
    v: result.results.map(point => point.busVoltages[busId] ?? 1),
  };
}
