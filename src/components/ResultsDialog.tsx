'use client';

import { useMemo, useState } from 'react';
import { PowerSystem } from '@/types';
import { StudyRun } from '@/lib/studies';
import { TableData, studyTables } from '@/lib/results-export';
import Dialog from './Dialog';
import Icon, { IconName } from './Icon';
import Chart, { BarChart } from './Chart';

interface ResultsDialogProps {
  runs: StudyRun[];
  activeRunId: string | null;
  system: PowerSystem;
  onSelectRun: (id: string) => void;
  onClose: () => void;
  onExportCSV: (run: StudyRun) => void;
  onReport: (run: StudyRun) => void;
  onClearResults: () => void;
}

const palette = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207', '#7c3aed', '#0f766e', '#be185d', '#475569'];

const kindIcon: Record<StudyRun['kind'], IconName> = {
  powerflow: 'powerflow',
  cpf: 'cpf',
  opf: 'opf',
  fault: 'fault',
  stability: 'stability',
  timeseries: 'time',
};

function downsample<T>(items: T[], max = 400): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter((_, index) => index % step === 0);
}

function DataTable({ table }: { table: TableData }) {
  return (
    <div className="max-h-[52vh] overflow-auto rounded border border-[#dde4ec]">
      <table className="data-table">
        <thead>
          <tr>
            {table.headers.map(header => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={typeof cell === 'number' || /^-?\d/.test(String(cell)) ? 'text-right' : ''}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {table.rows.length === 0 && (
            <tr>
              <td colSpan={table.headers.length} className="py-6 text-center text-slate-400">
                No rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'bad'
        ? 'text-rose-700'
        : tone === 'warn'
          ? 'text-amber-700'
          : 'text-slate-800';
  return (
    <div className="min-w-[110px] rounded border border-[#dde4ec] bg-white px-2 py-1.5">
      <div className="text-[9.5px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-[13px] font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default function ResultsDialog({
  runs,
  activeRunId,
  system,
  onSelectRun,
  onClose,
  onExportCSV,
  onReport,
  onClearResults,
}: ResultsDialogProps) {
  const run = runs.find(item => item.id === activeRunId) ?? runs[runs.length - 1];
  const tables = useMemo(() => (run ? studyTables(run, system) : []), [run, system]);
  const [tab, setTab] = useState('Summary');

  const tabs = useMemo(() => {
    if (!run) return ['Summary'];
    const base = ['Summary'];
    if (run.kind === 'powerflow') {
      return [...base, ...tables.map(table => table.title), 'Voltage Profile', 'Violations'];
    }
    if (run.kind === 'cpf') return [...base, 'PV Curve', ...tables.map(table => table.title)];
    if (run.kind === 'opf') return [...base, ...tables.map(table => table.title), 'Dispatch Chart'];
    if (run.kind === 'fault') return [...base, ...tables.map(table => table.title), 'Fault Current Chart'];
    if (run.kind === 'stability') return [...base, ...tables.map(table => table.title), 'Eigenvalue Plot'];
    return [...base, ...tables.map(table => table.title), 'Time-Domain Plots'];
  }, [run, tables]);

  const activeTab = tabs.includes(tab) ? tab : 'Summary';

  if (!run) {
    return (
      <Dialog title="Study Results" icon="results" onClose={onClose} width={720}>
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
          <Icon name="results" size={36} className="text-slate-300" />
          <div className="text-[13px]">No study results available</div>
          <div className="text-[11px] text-slate-400">Run a load flow, short circuit or stability study to see results here.</div>
        </div>
      </Dialog>
    );
  }

  const busVoltages = run.kind === 'powerflow'
    ? run.data.busResults.map(item => ({
        id: item.bus,
        name: system.buses.find(bus => bus.id === item.bus)?.name ?? item.bus,
        v: item.v,
        vmin: system.buses.find(bus => bus.id === item.bus)?.vmin ?? 0.9,
        vmax: system.buses.find(bus => bus.id === item.bus)?.vmax ?? 1.1,
      }))
    : [];

  const violations: { severity: 'error' | 'warning'; message: string }[] = [];
  if (run.kind === 'powerflow') {
    busVoltages.forEach(bus => {
      if (bus.v < bus.vmin) {
        violations.push({ severity: 'warning', message: `Bus ${bus.name} undervoltage: ${bus.v.toFixed(4)} pu < ${bus.vmin} pu` });
      } else if (bus.v > bus.vmax) {
        violations.push({ severity: 'warning', message: `Bus ${bus.name} overvoltage: ${bus.v.toFixed(4)} pu > ${bus.vmax} pu` });
      }
    });
    run.data.lineResults.forEach(line => {
      if (line.loading > 100) {
        violations.push({ severity: 'error', message: `Branch ${line.line} overloaded: ${line.loading.toFixed(1)} %` });
      } else if (line.loading > 80) {
        violations.push({ severity: 'warning', message: `Branch ${line.line} loading high: ${line.loading.toFixed(1)} %` });
      }
    });
  }

  const renderChart = () => {
    switch (run.kind) {
      case 'powerflow':
        return (
          <BarChart
            labels={busVoltages.map(bus => bus.id)}
            values={busVoltages.map(bus => bus.v)}
            yLabel="Voltage (pu)"
            xLabel="Bus"
            color={value => (value < 0.9 ? '#dc2626' : value > 1.1 ? '#dc2626' : value < 0.95 || value > 1.05 ? '#d97706' : '#15803d')}
            yMin={0.85}
            yMax={1.15}
            referenceY={[
              { value: 1.0, label: '1.0 pu', color: '#94a3b8' },
              { value: 0.9, label: '0.9 pu', color: '#ef4444' },
              { value: 1.1, label: '1.1 pu', color: '#ef4444' },
            ]}
            height={340}
          />
        );
      case 'cpf': {
        const results = run.data.results;
        if (results.length === 0) return null;
        const busIds = Object.keys(results[0].busVoltages);
        const weakest = busIds.reduce((worst, id) => {
          const last = results[results.length - 1];
          return (last.busVoltages[id] ?? 1) < (last.busVoltages[worst] ?? 1) ? id : worst;
        }, busIds[0]);
        return (
          <Chart
            series={[
              {
                name: `Bus ${weakest}`,
                color: '#1d4ed8',
                points: results.map(point => ({ x: point.lambda, y: point.busVoltages[weakest] ?? 0 })),
              },
            ]}
            xLabel="Loading factor (p.u.)"
            yLabel="Voltage (pu)"
            height={360}
          />
        );
      }
      case 'opf':
        return (
          <BarChart
            labels={run.data.generatorResults.map(gen => gen.generator)}
            values={run.data.generatorResults.map(gen => gen.pg)}
            yLabel="Dispatch (MW)"
            xLabel="Generator"
            height={340}
          />
        );
      case 'fault':
        return (
          <BarChart
            labels={run.data.threePhaseFaults.map(fault => fault.bus)}
            values={run.data.threePhaseFaults.map(fault => fault.currents[0]?.magnitude ?? 0)}
            yLabel="Fault current (kA)"
            xLabel="Bus"
            height={340}
          />
        );
      case 'stability':
        return (
          <Chart
            mode="scatter"
            series={[
              {
                name: 'Eigenvalues',
                color: '#7c3aed',
                points: run.data.eigenvalues.map(mode => ({ x: mode.eigenvalue.real, y: mode.eigenvalue.imag })),
              },
            ]}
            xLabel="Real part (1/s)"
            yLabel="Imaginary part (rad/s)"
            referenceY={[{ value: 0, label: '0', color: '#94a3b8' }]}
            height={360}
          />
        );
      case 'timeseries': {
        const time = run.data.time;
        const generatorIds = Object.keys(run.data.generatorAngles);
        const series =
          generatorIds.length > 0
            ? generatorIds.slice(0, 6).map((id, index) => ({
                name: `Gen ${id} angle`,
                color: palette[index % palette.length],
                points: downsample(time.map((t, i) => ({ x: t, y: run.data.generatorAngles[id][i] ?? 0 }))),
              }))
            : Object.keys(run.data.busVoltages).slice(0, 4).map((id, index) => ({
                name: `Bus ${id} voltage`,
                color: palette[index % palette.length],
                points: downsample(time.map((t, i) => ({ x: t, y: run.data.busVoltages[id][i] ?? 0 }))),
              }));
        return (
          <Chart
            series={series}
            xLabel="Time (s)"
            yLabel={generatorIds.length > 0 ? 'Rotor angle (deg)' : 'Voltage (pu)'}
            height={360}
          />
        );
      }
      default:
        return null;
    }
  };

  const tableFor = (title: string) => tables.find(table => table.title === title);

  return (
    <Dialog
      title="Study Results"
      subtitle={`${runs.length} study case${runs.length === 1 ? '' : 's'} in this session`}
      icon="results"
      onClose={onClose}
      width={1060}
      height={Math.min(760, typeof window !== 'undefined' ? window.innerHeight - 60 : 760)}
      footer={
        <>
          <button
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] hover:bg-slate-50"
            onClick={onClearResults}
          >
            <Icon name="delete" size={12} /> Clear All
          </button>
          <div className="flex-1" />
          <button
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] hover:bg-slate-50"
            onClick={() => onExportCSV(run)}
          >
            <Icon name="csv" size={12} /> Export CSV
          </button>
          <button
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] hover:bg-slate-50"
            onClick={() => onReport(run)}
          >
            <Icon name="report" size={12} /> Report
          </button>
          <button
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] hover:bg-slate-50"
            onClick={() => window.print()}
          >
            <Icon name="print" size={12} /> Print
          </button>
          <button className="rounded bg-[#1f4d85] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#183c68]" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="flex h-full">
        <div className="w-[220px] shrink-0 overflow-y-auto border-r border-[#d5dde7] bg-[#eef2f7] p-1">
          <div className="px-2 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-500">Study Cases</div>
          {runs
            .slice()
            .reverse()
            .map(item => (
              <button
                key={item.id}
                className={`mb-0.5 flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left ${
                  item.id === run.id ? 'bg-white shadow-sm ring-1 ring-[#7fa9d8]' : 'hover:bg-slate-200/60'
                }`}
                onClick={() => onSelectRun(item.id)}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                    item.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  <Icon name={item.status === 'success' ? 'check' : 'warning'} size={9} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
                    <Icon name={kindIcon[item.kind]} size={10} className="text-slate-500" />
                    {item.title}
                  </span>
                  <span className="block truncate text-[9.5px] text-slate-500">{item.summary}</span>
                  <span className="block text-[9px] text-slate-400">
                    {new Date(item.startedAt).toLocaleTimeString()} · {item.elapsedMs.toFixed(0)} ms
                  </span>
                </span>
              </button>
            ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-[#d5dde7] bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-800">{run.title}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${
                  run.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {run.status === 'success' ? 'COMPLETED' : 'FAILED'}
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(run.startedAt).toLocaleString()} · {run.elapsedMs.toFixed(0)} ms
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatCard label="Status" value={run.summary} tone={run.status === 'success' ? 'good' : 'bad'} />
              {run.kind === 'powerflow' && (
                <>
                  <StatCard label="Iterations" value={String(run.data.iterations)} />
                  <StatCard label="Losses" value={`${run.data.losses.real.toFixed(2)} MW`} />
                  <StatCard label="Max loading" value={`${Math.max(0, ...run.data.lineResults.map(line => line.loading)).toFixed(0)} %`} />
                  <StatCard label="Violations" value={String(violations.length)} tone={violations.length ? 'warn' : 'good'} />
                </>
              )}
              {run.kind === 'cpf' && (
                <>
                  <StatCard label="Steps" value={String(run.data.results.length)} />
                  <StatCard
                    label="Max loading"
                    value={`${(run.data.results[run.data.results.length - 1]?.lambda ?? 0).toFixed(3)} pu`}
                  />
                </>
              )}
              {run.kind === 'opf' && (
                <>
                  <StatCard label="Cost" value={`${run.data.totalCost.toFixed(2)} $/h`} />
                  <StatCard label="Losses" value={`${(run.data.losses ?? 0).toFixed(2)} MW`} />
                </>
              )}
              {run.kind === 'fault' && (
                <StatCard
                  label="Max fault"
                  value={`${Math.max(0, ...run.data.threePhaseFaults.map(item => item.currents[0]?.magnitude ?? 0)).toFixed(2)} kA`}
                  tone="bad"
                />
              )}
              {run.kind === 'stability' && (
                <>
                  <StatCard label="Modes" value={String(run.data.eigenvalues.length)} />
                  <StatCard label="Damping" value={run.data.systemDamping} tone={run.data.systemDamping === 'good' ? 'good' : 'warn'} />
                </>
              )}
              {run.kind === 'timeseries' && (
                <>
                  <StatCard label="Samples" value={String(run.data.time.length)} />
                  <StatCard label="End time" value={`${(run.data.time[run.data.time.length - 1] ?? 0).toFixed(2)} s`} />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-0.5 border-b border-[#d5dde7] bg-[#f1f4f8] px-2 py-1">
            {tabs.map(item => (
              <button
                key={item}
                className={`rounded px-2 py-1 text-[11px] ${
                  activeTab === item ? 'bg-white font-medium text-[#1f4d85] shadow-sm' : 'text-slate-600 hover:bg-slate-200/70'
                }`}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto bg-[#f7f9fc] p-2">
            {activeTab === 'Summary' && (
              <div className="space-y-2">
                <div className="rounded border border-[#dde4ec] bg-white p-2">
                  <div className="mb-1 text-[10.5px] font-semibold text-slate-600">Study Log</div>
                  <ul className="space-y-0.5 font-mono text-[10.5px] text-slate-600">
                    {run.messages.map((message, index) => (
                      <li key={index}>· {message}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  {tables.slice(0, 2).map(table => (
                    <div key={table.title} className="min-w-0">
                      <div className="mb-1 text-[10.5px] font-semibold text-slate-600">{table.title}</div>
                      <DataTable table={{ ...table, rows: table.rows.slice(0, 8) }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'Voltage Profile' && renderChart()}
            {activeTab === 'PV Curve' && renderChart()}
            {activeTab === 'Dispatch Chart' && renderChart()}
            {activeTab === 'Fault Current Chart' && renderChart()}
            {activeTab === 'Eigenvalue Plot' && renderChart()}
            {activeTab === 'Time-Domain Plots' && renderChart()}

            {activeTab === 'Violations' && (
              <div className="rounded border border-[#dde4ec] bg-white p-2">
                {violations.length === 0 ? (
                  <div className="flex items-center gap-1 py-3 text-[12px] text-emerald-700">
                    <Icon name="check" size={14} /> No voltage or loading violations detected
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {violations.map((violation, index) => (
                      <li
                        key={index}
                        className={`flex items-start gap-1.5 rounded px-2 py-1 text-[11.5px] ${
                          violation.severity === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        <Icon name="warning" size={12} className="mt-0.5 shrink-0" />
                        {violation.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab !== 'Summary' &&
              activeTab !== 'Voltage Profile' &&
              activeTab !== 'PV Curve' &&
              activeTab !== 'Dispatch Chart' &&
              activeTab !== 'Fault Current Chart' &&
              activeTab !== 'Eigenvalue Plot' &&
              activeTab !== 'Time-Domain Plots' &&
              activeTab !== 'Violations' &&
              (() => {
                const table = tableFor(activeTab);
                return table ? <DataTable table={table} /> : null;
              })()}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
