/**
 * Tabular views and CSV/report exports for study results.
 */

import { PowerSystem } from '@/types';
import { StudyRun } from './studies';
import { ReportSection, generateReport } from './reports';

export interface TableData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

const n = (value: number | undefined | null, digits = 3): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';

export function powerFlowTables(run: StudyRun & { kind: 'powerflow' }, system: PowerSystem): TableData[] {
  const result = run.data;
  const busName = new Map(system.buses.map(bus => [bus.id, bus.name]));

  const buses: TableData = {
    title: 'Bus Results',
    headers: ['Bus', 'Name', 'Type', 'V (pu)', 'Angle (deg)', 'P gen (MW)', 'Q gen (Mvar)', 'P load (MW)', 'Q load (Mvar)'],
    rows: result.busResults.map(bus => {
      const source = system.buses.find(item => item.id === bus.bus);
      return [
        bus.bus,
        busName.get(bus.bus) ?? '',
        source?.type ?? '',
        n(bus.v, 4),
        n(bus.angle, 2),
        n(bus.pg, 2),
        n(bus.qg, 2),
        n(bus.pl, 2),
        n(bus.ql, 2),
      ];
    }),
  };

  const branches: TableData = {
    title: 'Branch Flows',
    headers: ['Branch', 'From', 'To', 'P from (MW)', 'Q from (Mvar)', 'P to (MW)', 'Q to (Mvar)', 'P loss (MW)', 'Q loss (Mvar)', 'Loading (%)'],
    rows: result.lineResults.map(line => [
      line.line,
      line.fromBus,
      line.toBus,
      n(line.pFrom, 2),
      n(line.qFrom, 2),
      n(line.pTo, 2),
      n(line.qTo, 2),
      n(line.ploss, 3),
      n(line.qloss, 3),
      n(line.loading, 1),
    ]),
  };

  const generators: TableData = {
    title: 'Generator Results',
    headers: ['Generator', 'Bus', 'P (MW)', 'Q (Mvar)', 'V (pu)', 'Status'],
    rows: result.generatorResults.map(gen => [
      gen.generator,
      gen.bus,
      n(gen.pg, 2),
      n(gen.qg, 2),
      n(gen.v, 4),
      gen.status,
    ]),
  };

  return [buses, branches, generators];
}

export function cpfTables(run: StudyRun & { kind: 'cpf' }, system: PowerSystem): TableData[] {
  const data = run.data;
  const last = data.results[data.results.length - 1];
  const weakest = last
    ? Object.entries(last.busVoltages).sort((a, b) => a[1] - b[1])[0]
    : undefined;

  const curve: TableData = {
    title: 'PV Curve Data',
    headers: ['Step', 'Loading factor', 'Weakest bus V (pu)'],
    rows: data.results.map((point, index) => {
      const voltage = weakest ? point.busVoltages[weakest[0]] : undefined;
      return [index, n(point.lambda, 4), n(voltage, 4)];
    }),
  };

  const margin: TableData = {
    title: 'Voltage Stability Margin',
    headers: ['Quantity', 'Value'],
    rows: [
      ['Maximum loading factor', n(last?.lambda, 4)],
      ['Loading margin (%)', last ? n(last.lambda * 100, 1) : '-'],
      ['Critical bus', weakest ? `${weakest[0]} (${system.buses.find(bus => bus.id === weakest[0])?.name ?? ''})` : '-'],
      ['Critical voltage (pu)', weakest ? n(weakest[1], 4) : '-'],
      ['Continuation steps', data.results.length],
      ['Converged', data.converged ? 'Yes' : 'No'],
    ],
  };

  return [margin, curve];
}

export function opfTables(run: StudyRun & { kind: 'opf' }): TableData[] {
  const data = run.data;
  const dispatch: TableData = {
    title: 'Optimal Dispatch',
    headers: ['Generator', 'Bus', 'P (MW)', 'Q (Mvar)', 'V (pu)', 'Status'],
    rows: data.generatorResults.map(gen => [
      gen.generator,
      gen.bus,
      n(gen.pg, 2),
      n(gen.qg, 2),
      n(gen.v, 4),
      gen.status ?? 'in service',
    ]),
  };

  const cost: TableData = {
    title: 'Cost Summary',
    headers: ['Quantity', 'Value'],
    rows: [
      ['Total cost ($/h)', n(data.totalCost, 2)],
      ['System losses (MW)', n(data.losses, 3)],
      ['Iterations', data.iterations ?? '-'],
      ['Status', data.success ? 'Optimal' : data.message ?? 'Infeasible'],
    ],
  };

  return [cost, dispatch];
}

export function faultTables(run: StudyRun & { kind: 'fault' }, system: PowerSystem): TableData[] {
  const data = run.data;
  const rows: (string | number)[][] = [];
  const addFaults = (faults: typeof data.threePhaseFaults, label: string) => {
    faults.forEach(fault => {
      rows.push([
        fault.bus,
        system.buses.find(bus => bus.id === fault.bus)?.name ?? '',
        label,
        n(fault.currents[0]?.magnitude, 3),
        n(fault.currents[0]?.angle, 2),
        n(fault.faultMVA, 2),
        n(fault.ctRating, 2),
      ]);
    });
  };

  addFaults(data.threePhaseFaults, 'Three-phase');
  addFaults(data.lineToGroundFaults, 'Line-to-ground');
  addFaults(data.lineToLineFaults, 'Line-to-line');
  addFaults(data.doubleLineToGroundFaults, 'Double line-to-ground');

  const currents: TableData = {
    title: 'Fault Currents',
    headers: ['Bus', 'Name', 'Fault type', 'I (kA)', 'Angle (deg)', 'Fault MVA', 'CT rating (A)'],
    rows,
  };

  const devices: TableData = {
    title: 'Protective Device Requirements',
    headers: ['Bus', 'Min breaker (A)', 'Recommended breaker (A)', 'Relay pickup (A)', 'Time delay (s)'],
    rows: data.protectiveDeviceRequirements.map(item => [
      item.bus,
      n(item.minBreakerRating, 1),
      n(item.recommendedBreakerRating, 1),
      n(item.relaySettings.pickup, 1),
      n(item.relaySettings.timeDelay, 3),
    ]),
  };

  return [currents, devices];
}

export function stabilityTables(run: StudyRun & { kind: 'stability' }): TableData[] {
  const data = run.data;
  const modes: TableData = {
    title: 'Eigenvalues',
    headers: ['Mode', 'Real', 'Imaginary', 'Frequency (Hz)', 'Damping (%)', 'Period (s)', 'Type', 'Status'],
    rows: data.eigenvalues.map((mode, index) => [
      index + 1,
      n(mode.eigenvalue.real, 4),
      n(mode.eigenvalue.imag, 4),
      n(mode.frequency, 3),
      n(mode.dampingRatio * 100, 2),
      Number.isFinite(mode.period) ? n(mode.period, 3) : '-',
      mode.modeType,
      mode.damping,
    ]),
  };

  const summary: TableData = {
    title: 'Stability Summary',
    headers: ['Quantity', 'Value'],
    rows: [
      ['Modes', data.eigenvalues.length],
      ['Unstable modes', data.unstableModes.length],
      ['Poorly damped modes', data.criticallyDampedModes.length],
      ['System damping', data.systemDamping],
      ['Least damped frequency (Hz)', data.leastDampedMode ? n(data.leastDampedMode.frequency, 3) : '-'],
      ['Least damped ratio (%)', data.leastDampedMode ? n(data.leastDampedMode.dampingRatio * 100, 2) : '-'],
    ],
  };

  return [summary, modes];
}

export function timeseriesTables(run: StudyRun & { kind: 'timeseries' }): TableData[] {
  const data = run.data;
  const genIds = Object.keys(data.generatorAngles);
  const busIds = Object.keys(data.busVoltages);
  const step = Math.max(1, Math.floor(data.time.length / 100));
  const indices = data.time.map((_, index) => index).filter(index => index % step === 0);

  const angles: TableData = {
    title: 'Generator Angles',
    headers: ['Time (s)', ...genIds],
    rows: indices.map(index => [n(data.time[index], 3), ...genIds.map(id => n(data.generatorAngles[id]?.[index], 3))]),
  };

  const voltages: TableData = {
    title: 'Bus Voltages',
    headers: ['Time (s)', ...busIds],
    rows: indices.map(index => [n(data.time[index], 3), ...busIds.map(id => n(data.busVoltages[id]?.[index], 4))]),
  };

  return [angles, voltages];
}

export function studyTables(run: StudyRun, system: PowerSystem): TableData[] {
  switch (run.kind) {
    case 'powerflow':
      return powerFlowTables(run, system);
    case 'cpf':
      return cpfTables(run, system);
    case 'opf':
      return opfTables(run);
    case 'fault':
      return faultTables(run, system);
    case 'stability':
      return stabilityTables(run);
    case 'timeseries':
      return timeseriesTables(run);
    default:
      return [];
  }
}

const escapeCSV = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function tableToCSV(table: TableData): string {
  return [table.headers, ...table.rows].map(row => row.map(escapeCSV).join(',')).join('\n');
}

export function studyToCSV(run: StudyRun, system: PowerSystem): string {
  const tables = studyTables(run, system);
  const header = [
    `# ${run.title}`,
    `# System: ${system.name ?? 'Power System'}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Status: ${run.status} - ${run.summary}`,
    '',
  ].join('\n');

  return `${header}\n${tables.map(table => `# ${table.title}\n${tableToCSV(table)}`).join('\n\n')}\n`;
}

export function studyReport(run: StudyRun, system: PowerSystem): ReportSection[] {
  const reportData = {
    title: `${run.title} Report`,
    date: new Date(run.startedAt),
    system,
    powerFlow: run.kind === 'powerflow' ? run.data : undefined,
    opf: run.kind === 'opf' ? run.data : undefined,
    faultStudy: run.kind === 'fault' ? run.data : undefined,
    stability: run.kind === 'stability' ? run.data : undefined,
    timeSeries: run.kind === 'timeseries' ? run.data : undefined,
    notes: run.messages.join('\n'),
  };

  const sections = generateReport(reportData);

  if (run.kind === 'cpf') {
    sections.push(...studyTables(run, system).map(table => ({
      title: table.title,
      content: [table.headers, ...table.rows.map(row => row.map(String))],
      type: 'table' as const,
    })));
  }

  if (run.kind === 'timeseries') {
    sections.push(...studyTables(run, system).map(table => ({
      title: table.title,
      content: [table.headers, ...table.rows.map(row => row.map(String))],
      type: 'table' as const,
    })));
  }

  return sections;
}
