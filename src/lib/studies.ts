/**
 * Study runner facade. Executes the numerical engines and wraps the results
 * with metadata used by the UI, reports and exports.
 */

import { PowerFlowMethod, PowerFlowResult, PowerSystem } from '@/types';
import { solveDC, solveFastDecoupled, solveGaussSeidel, solveNewtonRaphson } from './powerflow-methods';
import { CPFHistory, runCPF } from './cpf';
import { OPFResult, solveACOPF, solveDCOPF, GeneratorCostParams } from './opf';
import { FaultStudyResult, performFaultStudy } from './fault';
import { StabilityAnalysisResult, analyzeSmallSignalStability } from './stability';
import { SimulationConfig, TimeSeriesResult, checkStability, runTimeDomainSimulation } from './timeseries';
import { AppSettings } from './settings';
import { systemStats } from './project';

export type StudyKind = 'powerflow' | 'cpf' | 'opf' | 'fault' | 'stability' | 'timeseries';

interface StudyBase {
  id: string;
  kind: StudyKind;
  title: string;
  startedAt: string;
  elapsedMs: number;
  status: 'success' | 'failed';
  summary: string;
  messages: string[];
}

export type StudyRun =
  | (StudyBase & { kind: 'powerflow'; data: PowerFlowResult })
  | (StudyBase & { kind: 'cpf'; data: CPFHistory })
  | (StudyBase & { kind: 'opf'; data: OPFResult })
  | (StudyBase & { kind: 'fault'; data: FaultStudyResult })
  | (StudyBase & { kind: 'stability'; data: StabilityAnalysisResult })
  | (StudyBase & { kind: 'timeseries'; data: TimeSeriesResult });

let runCounter = 0;

function makeId(kind: StudyKind): string {
  runCounter += 1;
  return `${kind}-${Date.now()}-${runCounter}`;
}

function elapsedSince(start: number): number {
  if (typeof performance !== 'undefined') return performance.now() - start;
  return Date.now() - start;
}

export function solvePowerFlowWith(
  system: PowerSystem,
  method: PowerFlowMethod,
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

export function runPowerFlowStudy(system: PowerSystem, settings: AppSettings): StudyRun {
  const started = performance.now();
  const messages: string[] = [];
  let data: PowerFlowResult;

  try {
    data = solvePowerFlowWith(system, settings.method, settings.tolerance, settings.maxIterations);
  } catch (error) {
    data = {
      converged: false,
      iterations: 0,
      maxMismatch: Number.NaN,
      losses: { real: 0, imag: 0 },
      busResults: [],
      lineResults: [],
      generatorResults: [],
      elapsedTime: 0,
      method: settings.method,
    };
    messages.push(`Power flow failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (data.converged) {
    messages.push(`Method: ${data.method}`);
    messages.push(`Iterations: ${data.iterations}`);
    messages.push(`Max mismatch: ${data.maxMismatch.toExponential(3)} p.u.`);
    messages.push(`Real losses: ${data.losses.real.toFixed(4)} MW`);
    messages.push(`Reactive losses: ${data.losses.imag.toFixed(4)} Mvar`);
  } else {
    messages.push('Power flow did not converge. Check islanding, limits and generation/load balance.');
  }

  return {
    id: makeId('powerflow'),
    kind: 'powerflow',
    title: 'Load Flow',
    startedAt: new Date().toISOString(),
    elapsedMs: elapsedSince(started),
    status: data.converged ? 'success' : 'failed',
    summary: data.converged
      ? `Converged in ${data.iterations} iterations, losses ${data.losses.real.toFixed(2)} MW`
      : 'Did not converge',
    messages,
    data,
  };
}

export function runCPFStudy(system: PowerSystem, settings: AppSettings): StudyRun {
  const started = performance.now();
  const messages: string[] = [];
  const data = runCPF(system, {
    lambdaMax: settings.cpfLambdaMax,
    stepSize: settings.cpfStepSize,
    adaptiveStep: true,
  });

  const last = data.results[data.results.length - 1];
  const noseFound = Boolean(last && last.lambda < settings.cpfLambdaMax - 1e-6);
  if (data.converged && last) {
    messages.push(`Continuation steps: ${data.results.length}`);
    if (noseFound) {
      messages.push(`Voltage collapse at loading factor ${last.lambda.toFixed(3)}`);
      messages.push(`Loading margin: ${(last.lambda * 100).toFixed(1)} %`);
    } else {
      messages.push(`No voltage collapse up to loading factor ${settings.cpfLambdaMax.toFixed(2)}`);
      messages.push('Increase the maximum loading factor in the study options to search further.');
    }
  } else {
    messages.push('Continuation power flow could not trace the PV curve.');
  }

  return {
    id: makeId('cpf'),
    kind: 'cpf',
    title: 'Continuation Power Flow',
    startedAt: new Date().toISOString(),
    elapsedMs: elapsedSince(started),
    status: data.converged ? 'success' : 'failed',
    summary: data.converged && last
      ? noseFound
        ? `Voltage collapse at ${last.lambda.toFixed(3)} p.u. (${data.results.length} steps)`
        : `No collapse up to ${settings.cpfLambdaMax.toFixed(2)} p.u. (${data.results.length} steps)`
      : 'PV curve not traced',
    messages,
    data,
  };
}

function generatorCosts(system: PowerSystem): GeneratorCostParams[] | undefined {
  const withCosts = system.generators.filter(gen => gen.cost);
  if (withCosts.length === 0) return undefined;
  return system.generators.map(gen => {
    if (gen.cost?.model === 'polynomial') {
      return {
        id: gen.id,
        bus: gen.bus,
        model: 'polynomial' as const,
        a: gen.cost.c0 ?? 0,
        b: gen.cost.c1 ?? 20,
        c: gen.cost.c2 ?? 0.01,
      };
    }
    return { id: gen.id, bus: gen.bus, model: 'polynomial' as const, a: 0, b: 20, c: 0.01 };
  });
}

export function runOPFStudy(system: PowerSystem, settings: AppSettings): StudyRun {
  const started = performance.now();
  const messages: string[] = [];
  const costs = generatorCosts(system);
  const data = settings.opfUseAC
    ? solveACOPF(system, costs, settings.tolerance, settings.maxIterations)
    : solveDCOPF(system, costs);

  if (data.success) {
    messages.push(`Total generation cost: ${data.totalCost.toFixed(2)} $/h`);
    data.generatorResults.forEach(gen => {
      messages.push(`${gen.generator} @ ${gen.bus}: ${gen.pg.toFixed(2)} MW`);
    });
  } else {
    messages.push(`Optimal power flow failed: ${data.message ?? 'infeasible case'}`);
  }

  return {
    id: makeId('opf'),
    kind: 'opf',
    title: settings.opfUseAC ? 'AC Optimal Power Flow' : 'DC Optimal Power Flow',
    startedAt: new Date().toISOString(),
    elapsedMs: elapsedSince(started),
    status: data.success ? 'success' : 'failed',
    summary: data.success
      ? `Cost ${data.totalCost.toFixed(2)} $/h, losses ${(data.losses ?? 0).toFixed(2)} MW`
      : data.message ?? 'Infeasible',
    messages,
    data,
  };
}

export function runFaultStudy(system: PowerSystem, settings: AppSettings): StudyRun {
  const started = performance.now();
  const messages: string[] = [];
  const data = performFaultStudy(system, {
    includeThreePhase: true,
    includeLineToGround: settings.faultIncludeLineToGround,
    includeLineToLine: settings.faultIncludeLineToLine,
    includeDoubleLineToGround: false,
  });

  const threePhase = data.threePhaseFaults;
  const maxFault = threePhase.reduce(
    (max, item) => (item.currents[0]?.magnitude > max.currents[0]?.magnitude ? item : max),
    threePhase[0]
  );

  messages.push(`Buses studied: ${threePhase.length}`);
  if (maxFault) {
    messages.push(
      `Highest three-phase fault current: ${maxFault.currents[0].magnitude.toFixed(2)} kA at ${maxFault.bus}`
    );
  }
  if (data.lineToGroundFaults.length) {
    messages.push(`Line-to-ground faults: ${data.lineToGroundFaults.length}`);
  }
  if (data.lineToLineFaults.length) {
    messages.push(`Line-to-line faults: ${data.lineToLineFaults.length}`);
  }

  return {
    id: makeId('fault'),
    kind: 'fault',
    title: 'Short Circuit Study',
    startedAt: new Date().toISOString(),
    elapsedMs: elapsedSince(started),
    status: threePhase.length > 0 ? 'success' : 'failed',
    summary: maxFault
      ? `Max fault current ${maxFault.currents[0].magnitude.toFixed(2)} kA at bus ${maxFault.bus}`
      : 'No fault results',
    messages,
    data,
  };
}

export function runStabilityStudy(system: PowerSystem): StudyRun {
  const started = performance.now();
  const messages: string[] = [];
  const data = analyzeSmallSignalStability(system);

  if (data.eigenvalues.length === 0) {
    messages.push('No generator dynamics available. Add generators to run modal analysis.');
  } else {
    messages.push(`Modes identified: ${data.eigenvalues.length}`);
    messages.push(`System damping: ${data.systemDamping}`);
    if (data.leastDampedMode) {
      messages.push(
        `Least damped mode: ${data.leastDampedMode.frequency.toFixed(3)} Hz, damping ${(
          data.leastDampedMode.dampingRatio * 100
        ).toFixed(1)} %`
      );
    }
  }
  data.unstableModes.forEach(mode => {
    messages.push(`Unstable mode at ${mode.frequency.toFixed(3)} Hz`);
  });

  return {
    id: makeId('stability'),
    kind: 'stability',
    title: 'Small-Signal Stability',
    startedAt: new Date().toISOString(),
    elapsedMs: elapsedSince(started),
    status: data.eigenvalues.length > 0 ? 'success' : 'failed',
    summary: data.eigenvalues.length
      ? `${data.eigenvalues.length} modes, damping ${data.systemDamping}`
      : 'No dynamic data',
    messages,
    data,
  };
}

export function runTimeSeriesStudy(system: PowerSystem, settings: AppSettings): StudyRun {
  const started = performance.now();
  const messages: string[] = [];
  const config: Partial<SimulationConfig> = {
    tStart: 0,
    tEnd: settings.simEnd,
    dt: settings.simStep,
    method: settings.simMethod,
    outputInterval: Math.max(settings.simStep, settings.simEnd / 200),
    faultTime: settings.simFaultTime,
    faultDuration: settings.simFaultDuration,
    faultBus: system.loads.length
      ? system.loads.reduce((largest, load) => (load.pl > largest.pl ? load : largest), system.loads[0]).bus
      : undefined,
  };

  let data: TimeSeriesResult;
  try {
    data = runTimeDomainSimulation(system, config);
  } catch (error) {
    messages.push(`Simulation failed: ${error instanceof Error ? error.message : String(error)}`);
    data = {
      time: [],
      busVoltages: {},
      busAngles: {},
      generatorAngles: {},
      generatorSpeeds: {},
      lineFlows: {},
      busFrequencies: {},
    };
  }

  const stability = checkStability(data);
  if (data.time.length > 0) {
    messages.push(`Samples: ${data.time.length}`);
    messages.push(`Simulation window: 0 - ${data.time[data.time.length - 1].toFixed(2)} s`);
    messages.push(`Fault applied at ${settings.simFaultTime.toFixed(2)} s for ${settings.simFaultDuration.toFixed(3)} s`);
    messages.push(`Transient stability: ${stability.stable ? 'stable' : 'unstable'}`);
    if (stability.criticalTime !== undefined) {
      messages.push(`First excursion beyond 2 % speed deviation at ${stability.criticalTime.toFixed(3)} s`);
    }
  }

  return {
    id: makeId('timeseries'),
    kind: 'timeseries',
    title: 'Time-Domain Simulation',
    startedAt: new Date().toISOString(),
    elapsedMs: elapsedSince(started),
    status: data.time.length > 0 ? 'success' : 'failed',
    summary: data.time.length
      ? `${data.time.length} samples over ${data.time[data.time.length - 1].toFixed(2)} s · ${stability.stable ? 'stable' : 'unstable'}`
      : 'Simulation produced no samples',
    messages,
    data,
  };
}

export function runStudy(kind: StudyKind, system: PowerSystem, settings: AppSettings): StudyRun {
  switch (kind) {
    case 'cpf':
      return runCPFStudy(system, settings);
    case 'opf':
      return runOPFStudy(system, settings);
    case 'fault':
      return runFaultStudy(system, settings);
    case 'stability':
      return runStabilityStudy(system);
    case 'timeseries':
      return runTimeSeriesStudy(system, settings);
    case 'powerflow':
    default:
      return runPowerFlowStudy(system, settings);
  }
}

export function describeSystem(system: PowerSystem): string[] {
  const stats = systemStats(system);
  return [
    `${stats.buses} buses, ${stats.lines} lines, ${stats.transformers} transformers`,
    `${stats.generators} generators (${stats.totalGenerationCapacityMW.toFixed(0)} MW capacity)`,
    `${stats.loads} loads (${stats.totalLoadMW.toFixed(1)} MW, ${stats.totalLoadMvar.toFixed(1)} Mvar)`,
    `Base ${system.baseMVA} MVA, ${system.baseFreq} Hz`,
  ];
}
