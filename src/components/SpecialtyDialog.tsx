'use client';

import { useMemo, useState } from 'react';
import { PowerSystem } from '@/types';
import { FaultStudyResult, calculateThreePhaseFault } from '@/lib/fault';
import { ArcFlashResult, calculateArcFlash } from '@/lib/arcflash';
import { MotorStartResult, analyzeMotorStarting } from '@/lib/motor-starting';
import { HarmonicResult, analyzeHarmonics } from '@/lib/harmonics';
import {
  RelayCurve,
  RelayCurveResult,
  RelaySetting,
  buildRelayCurves,
  coordinationMargin,
  relayCurves,
} from '@/lib/protection';
import { GroundGridResult, designGroundGrid } from '@/lib/groundgrid';
import { downloadFile, safeFileName } from '@/lib/project';
import Dialog from './Dialog';
import Icon, { IconName } from './Icon';
import Chart, { BarChart } from './Chart';

export type SpecialtyTab = 'arcflash' | 'motor' | 'harmonics' | 'protection' | 'groundgrid';

interface SpecialtyDialogProps {
  system: PowerSystem;
  faultStudy?: FaultStudyResult | null;
  initialTab?: SpecialtyTab;
  onClose: () => void;
}

const tabs: { id: SpecialtyTab; label: string; icon: IconName }[] = [
  { id: 'arcflash', label: 'Arc Flash', icon: 'fault' },
  { id: 'motor', label: 'Motor Starting', icon: 'motor' },
  { id: 'harmonics', label: 'Harmonics', icon: 'facts' },
  { id: 'protection', label: 'Protection', icon: 'relay' },
  { id: 'groundgrid', label: 'Ground Grid', icon: 'area' },
];

function busVoltageKV(system: PowerSystem, busId: string): number {
  const bus = system.buses.find(item => item.id === busId);
  return bus?.vbase && bus.vbase > 0 ? bus.vbase : 1;
}

function defaultFaultCurrent(system: PowerSystem, faultStudy: FaultStudyResult | null | undefined, busId: string): number {
  const fromStudy = faultStudy?.threePhaseFaults.find(item => item.bus === busId);
  if (fromStudy) return fromStudy.currents[0]?.magnitude ?? 0;
  try {
    return calculateThreePhaseFault(system, busId).faultCurrentKA;
  } catch {
    return 0;
  }
}

function exportCSV(name: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');
  downloadFile(safeFileName(name, 'csv'), content, 'text/csv');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#dde4ec] bg-white">
      <div className="border-b border-[#e6ecf3] bg-[#f8fafc] px-2 py-1 text-[10.5px] font-semibold text-slate-600">{title}</div>
      <div className="space-y-1.5 p-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-600">{label}</span>
      <div className="w-[150px]">{children}</div>
    </label>
  );
}

function NumberField({ value, onChange, step = 1, min }: { value: number; onChange: (value: number) => void; step?: number; min?: number }) {
  return (
    <input
      type="number"
      className="field-input text-right"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      onChange={event => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
    />
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'bad' }) {
  return (
    <div className="min-w-[120px] rounded border border-[#dde4ec] bg-white px-2 py-1.5">
      <div className="text-[9.5px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-[13px] font-semibold ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-[300px] overflow-auto rounded border border-[#dde4ec]">
      <table className="data-table">
        <thead>
          <tr>{headers.map(header => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={typeof cell === 'number' || /^-?\d/.test(String(cell)) ? 'text-right' : ''}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={headers.length} className="py-6 text-center text-slate-400">No results yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="flex items-center gap-1.5 rounded bg-[#1f4d85] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#183c68]"
      onClick={onClick}
    >
      <Icon name="play" size={12} /> {label}
    </button>
  );
}

function BusSelect({ system, value, onChange }: { system: PowerSystem; value: string; onChange: (value: string) => void }) {
  return (
    <select className="field-input" value={value} onChange={event => onChange(event.target.value)}>
      {system.buses.map(bus => (
        <option key={bus.id} value={bus.id}>
          {bus.name} ({bus.id})
        </option>
      ))}
    </select>
  );
}

function ArcFlashPanel({ system, faultStudy }: { system: PowerSystem; faultStudy?: FaultStudyResult | null }) {
  const firstBus = system.buses[0]?.id ?? '';
  const [busId, setBusId] = useState(firstBus);
  const [currentKA, setCurrentKA] = useState(() => defaultFaultCurrent(system, faultStudy, firstBus));
  const [voltageKV, setVoltageKV] = useState(() => busVoltageKV(system, firstBus));
  const [clearingTime, setClearingTime] = useState(0.15);
  const [distanceMM, setDistanceMM] = useState(455);
  const [result, setResult] = useState<ArcFlashResult | null>(null);

  const run = () => setResult(calculateArcFlash({ faultCurrentKA: currentKA, voltageKV, clearingTime, workingDistanceMM: distanceMM }));

  return (
    <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        <Section title="Study Inputs">
          <Field label="Bus"><BusSelect system={system} value={busId} onChange={id => { setBusId(id); setCurrentKA(defaultFaultCurrent(system, faultStudy, id)); setVoltageKV(busVoltageKV(system, id)); }} /></Field>
          <Field label="Bolted fault (kA)"><NumberField value={currentKA} step={0.1} min={0} onChange={setCurrentKA} /></Field>
          <Field label="Voltage (kV)"><NumberField value={voltageKV} step={0.01} min={0.1} onChange={setVoltageKV} /></Field>
          <Field label="Clearing time (s)"><NumberField value={clearingTime} step={0.01} min={0.01} onChange={setClearingTime} /></Field>
          <Field label="Working distance (mm)"><NumberField value={distanceMM} step={5} min={100} onChange={setDistanceMM} /></Field>
        </Section>
        <div className="flex items-center justify-between">
          <ActionButton label="Calculate" onClick={run} />
          {result && (
            <button
              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
              onClick={() => exportCSV('arc-flash', ['Quantity', 'Value'], [
                ['Incident energy (cal/cm2)', result.incidentEnergy.toFixed(2)],
                ['Arc flash boundary (mm)', result.arcFlashBoundaryMM.toFixed(0)],
                ['PPE category', result.ppeCategory],
                ['PPE label', result.ppeLabel],
              ])}
            >
              <Icon name="csv" size={11} /> CSV
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {!result ? (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded border border-dashed border-slate-300 text-[11px] text-slate-400">
            Enter the fault and working-distance data, then calculate.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Stat label="Incident energy" value={`${result.incidentEnergy.toFixed(2)} cal/cm²`} tone={result.incidentEnergy <= 8 ? 'good' : 'bad'} />
              <Stat label="Arc flash boundary" value={`${(result.arcFlashBoundaryMM / 1000).toFixed(2)} m`} />
              <Stat label="Arc power" value={`${result.arcPowerMW.toFixed(1)} MVA`} />
              <Stat label="PPE" value={`Cat ${result.ppeCategory}`} tone={result.ppeCategory <= 2 ? 'good' : 'bad'} />
            </div>
            <Section title="Assessment">
              <div className="text-[11.5px] text-slate-700">{result.ppeLabel}</div>
              <ul className="space-y-1 text-[10.5px] text-slate-500">
                {result.notes.map(note => <li key={note}>· {note}</li>)}
              </ul>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function MotorPanel({ system }: { system: PowerSystem }) {
  const firstBus = system.buses[0]?.id ?? '';
  const [busId, setBusId] = useState(firstBus);
  const [ratedMW, setRatedMW] = useState(10);
  const [lrc, setLrc] = useState(6);
  const [efficiency, setEfficiency] = useState(0.95);
  const [startingPF, setStartingPF] = useState(0.2);
  const [result, setResult] = useState<MotorStartResult | null>(null);

  const run = () =>
    setResult(analyzeMotorStarting(system, {
      busId,
      ratedMW,
      lockedRotorCurrent: lrc,
      efficiency,
      startingPowerFactor: startingPF,
    }));

  return (
    <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        <Section title="Motor Data">
          <Field label="Bus"><BusSelect system={system} value={busId} onChange={setBusId} /></Field>
          <Field label="Rated power (MW)"><NumberField value={ratedMW} step={0.5} min={0.1} onChange={setRatedMW} /></Field>
          <Field label="Locked-rotor (× FLA)"><NumberField value={lrc} step={0.5} min={1} onChange={setLrc} /></Field>
          <Field label="Efficiency"><NumberField value={efficiency} step={0.01} min={0.5} onChange={setEfficiency} /></Field>
          <Field label="Starting PF"><NumberField value={startingPF} step={0.01} min={0.05} onChange={setStartingPF} /></Field>
        </Section>
        <ActionButton label="Start Motor" onClick={run} />
      </div>

      <div className="space-y-2">
        {!result ? (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded border border-dashed border-slate-300 text-[11px] text-slate-400">
            The starting current and voltage dip are computed from the bus impedance matrix.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Stat label="Starting current" value={`${result.startingCurrentKA.toFixed(2)} kA`} />
              <Stat label="Starting MVA" value={`${result.startingMVA.toFixed(1)} MVA`} />
              <Stat label="Voltage dip" value={`${result.voltageDipPercent.toFixed(1)} %`} tone={result.acceptable ? 'good' : 'bad'} />
              <Stat label="Terminal voltage" value={`${result.terminalVoltagePercent.toFixed(1)} %`} tone={result.acceptable ? 'good' : 'bad'} />
              <Stat label="Zth" value={`${result.theveninZ.toFixed(4)} pu`} />
            </div>
            <Section title="Assessment">
              <ul className="space-y-1 text-[10.5px] text-slate-500">
                {result.notes.map(note => <li key={note}>· {note}</li>)}
              </ul>
            </Section>
            <Table
              headers={['Quantity', 'Value']}
              rows={[
                ['Base voltage (kV)', result.baseKV.toFixed(2)],
                ['Rated current (kA)', result.ratedCurrentKA.toFixed(3)],
                ['Starting current (kA)', result.startingCurrentKA.toFixed(3)],
                ['Thevenin impedance (pu)', result.theveninZ.toFixed(4)],
                ['Voltage dip (%)', result.voltageDipPercent.toFixed(2)],
                ['Terminal voltage (%)', result.terminalVoltagePercent.toFixed(2)],
                ['Acceptable (≥ 80 %)', result.acceptable ? 'Yes' : 'No'],
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

function HarmonicsPanel({ system }: { system: PowerSystem }) {
  const firstBus = system.buses[0]?.id ?? '';
  const [busId, setBusId] = useState(firstBus);
  const [percent5, setPercent5] = useState(20);
  const [percent7, setPercent7] = useState(10);
  const [percent11, setPercent11] = useState(6);
  const [percent13, setPercent13] = useState(4);
  const [result, setResult] = useState<HarmonicResult | null>(null);

  const run = () =>
    setResult(analyzeHarmonics(system, {
      sourceBus: busId,
      spectrum: [
        { order: 5, percent: percent5 },
        { order: 7, percent: percent7 },
        { order: 11, percent: percent11 },
        { order: 13, percent: percent13 },
      ],
    }));

  return (
    <div className="space-y-2">
      <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          <Section title="Harmonic Source">
            <Field label="Source bus"><BusSelect system={system} value={busId} onChange={setBusId} /></Field>
            <Field label="5th (%)"><NumberField value={percent5} step={1} min={0} onChange={setPercent5} /></Field>
            <Field label="7th (%)"><NumberField value={percent7} step={1} min={0} onChange={setPercent7} /></Field>
            <Field label="11th (%)"><NumberField value={percent11} step={1} min={0} onChange={setPercent11} /></Field>
            <Field label="13th (%)"><NumberField value={percent13} step={1} min={0} onChange={setPercent13} /></Field>
          </Section>
          <ActionButton label="Analyse" onClick={run} />
        </div>

        <div className="space-y-2">
          {!result ? (
            <div className="flex h-full min-h-[260px] items-center justify-center rounded border border-dashed border-slate-300 text-[11px] text-slate-400">
              A 6-pulse spectrum is injected at the selected bus and the harmonic network is solved.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Stat label="Worst bus" value={result.worstBus ?? '-'} />
                <Stat label="Worst THD" value={`${result.worstTHD.toFixed(2)} %`} tone={result.compliant ? 'good' : 'bad'} />
                <Stat label="IEEE 519 limit" value={`${result.limit.toFixed(0)} %`} />
                <Stat label="Compliant" value={result.compliant ? 'Yes' : 'No'} tone={result.compliant ? 'good' : 'bad'} />
              </div>
              <BarChart
                labels={result.buses.map(bus => bus.bus)}
                values={result.buses.map(bus => bus.thd)}
                yLabel="Voltage THD (%)"
                xLabel="Bus"
                referenceY={[{ value: result.limit, label: '5 % limit', color: '#ef4444' }]}
                height={260}
                color={value => (value > result.limit ? '#dc2626' : '#15803d')}
              />
              <Table
                headers={['Bus', 'THD (%)', '5th (%)', '7th (%)', '11th (%)', '13th (%)']}
                rows={result.buses.map(bus => [
                  bus.bus,
                  bus.thd.toFixed(2),
                  (bus.harmonics.find(item => item.order === 5)?.magnitude ?? 0).toFixed(2),
                  (bus.harmonics.find(item => item.order === 7)?.magnitude ?? 0).toFixed(2),
                  (bus.harmonics.find(item => item.order === 11)?.magnitude ?? 0).toFixed(2),
                  (bus.harmonics.find(item => item.order === 13)?.magnitude ?? 0).toFixed(2),
                ])}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProtectionPanel({ system }: { system: PowerSystem }) {
  const defaults: RelaySetting[] = system.buses.slice(0, 3).map((bus, index) => ({
    id: `R${index + 1}`,
    bus: bus.id,
    curve: 'IEC-SI',
    pickupA: 200 - index * 50,
    timeDial: Number((0.3 - index * 0.1).toFixed(2)),
  }));
  const [settings, setSettings] = useState<RelaySetting[]>(defaults.length ? defaults : [{ id: 'R1', bus: system.buses[0]?.id ?? '', curve: 'IEC-SI', pickupA: 100, timeDial: 0.1 }]);
  const [results, setResults] = useState<RelayCurveResult[] | null>(null);

  const update = (index: number, changes: Partial<RelaySetting>) => {
    setSettings(prev => prev.map((setting, i) => (i === index ? { ...setting, ...changes } : setting)));
  };

  const run = () => setResults(buildRelayCurves(settings));

  const chartSeries = useMemo(
    () =>
      (results ?? []).map((result, index) => ({
        name: `${result.id} (${result.bus})`,
        color: ['#1d4ed8', '#b91c1c', '#15803d'][index % 3],
        points: result.points.map(point => ({ x: point.current, y: point.time })),
      })),
    [results]
  );

  const margin = results && results.length >= 2 ? coordinationMargin(settings[0], settings[1], settings[0].pickupA * 5) : null;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 lg:grid-cols-[340px_1fr]">
        <div className="space-y-2">
          <Section title="Relay Settings">
            {settings.map((setting, index) => (
              <div key={setting.id} className="rounded border border-slate-200 p-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold text-slate-600">{setting.id}</span>
                  <BusSelect system={system} value={setting.bus} onChange={bus => update(index, { bus })} />
                </div>
                <Field label="Curve">
                  <select className="field-input" value={setting.curve} onChange={event => update(index, { curve: event.target.value as RelayCurve })}>
                    {(Object.keys(relayCurves) as RelayCurve[]).map(curve => (
                      <option key={curve} value={curve}>{relayCurves[curve].label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Pickup (A)"><NumberField value={setting.pickupA} step={10} min={1} onChange={pickupA => update(index, { pickupA })} /></Field>
                <Field label="Time dial"><NumberField value={setting.timeDial} step={0.01} min={0.01} onChange={timeDial => update(index, { timeDial })} /></Field>
              </div>
            ))}
          </Section>
          <div className="flex items-center gap-2">
            <ActionButton label="Build TCC" onClick={run} />
            {results && (
              <button
                className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                onClick={() =>
                  exportCSV('relay-coordination', ['Relay', 'Bus', 'Curve', 'Pickup (A)', 'Time dial', 't@2x (s)', 't@5x (s)', 't@10x (s)'], results.map(result => [
                    result.id,
                    result.bus,
                    result.curve,
                    result.pickupA,
                    result.timeDial,
                    result.tripTimes.find(item => item.multiple === 2)?.time.toFixed(3) ?? '-',
                    result.tripTimes.find(item => item.multiple === 5)?.time.toFixed(3) ?? '-',
                    result.tripTimes.find(item => item.multiple === 10)?.time.toFixed(3) ?? '-',
                  ]))
                }
              >
                <Icon name="csv" size={11} /> CSV
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {!results ? (
            <div className="flex h-full min-h-[260px] items-center justify-center rounded border border-dashed border-slate-300 text-[11px] text-slate-400">
              Build the time-current curves for the configured relays.
            </div>
          ) : (
            <>
              <Chart
                series={chartSeries}
                xLabel="Current (A)"
                yLabel="Trip time (s)"
                xLog
                yLog
                height={300}
              />
              {margin !== null && (
                <div className={`rounded border px-2 py-1 text-[11px] ${margin >= 0.3 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  Coordination margin R1-R2 at 5× pickup: {margin.toFixed(3)} s {margin >= 0.3 ? '(OK)' : '(check CTI)'}
                </div>
              )}
              <Table
                headers={['Relay', 'Bus', 'Curve', 'Pickup (A)', 'Dial', 't@2x', 't@5x', 't@10x']}
                rows={results.map(result => [
                  result.id,
                  result.bus,
                  result.curve,
                  result.pickupA,
                  result.timeDial.toFixed(2),
                  (result.tripTimes.find(item => item.multiple === 2)?.time ?? Infinity).toFixed(3),
                  (result.tripTimes.find(item => item.multiple === 5)?.time ?? Infinity).toFixed(3),
                  (result.tripTimes.find(item => item.multiple === 10)?.time ?? Infinity).toFixed(3),
                ])}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GroundGridPanel({ system }: { system: PowerSystem }) {
  const [faultCurrent, setFaultCurrent] = useState(() => defaultFaultCurrent(system, null, system.buses[0]?.id ?? ''));
  const [clearingTime, setClearingTime] = useState(0.5);
  const [soilResistivity, setSoilResistivity] = useState(100);
  const [area, setArea] = useState(2500);
  const [conductorLength, setConductorLength] = useState(2500);
  const [depth, setDepth] = useState(0.5);
  const [surfaceResistivity, setSurfaceResistivity] = useState(3000);
  const [surfaceThickness, setSurfaceThickness] = useState(0.1);
  const [bodyWeight, setBodyWeight] = useState<50 | 70>(70);
  const [result, setResult] = useState<GroundGridResult | null>(null);

  const run = () =>
    setResult(designGroundGrid({
      faultCurrentKA: faultCurrent,
      clearingTime,
      soilResistivity,
      areaM2: area,
      conductorLengthM: conductorLength,
      depthM: depth,
      surfaceResistivity,
      surfaceThicknessM: surfaceThickness,
      bodyWeightKg: bodyWeight,
    }));

  return (
    <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        <Section title="Grid Data">
          <Field label="Fault current (kA)"><NumberField value={faultCurrent} step={0.1} min={0} onChange={setFaultCurrent} /></Field>
          <Field label="Clearing time (s)"><NumberField value={clearingTime} step={0.05} min={0.05} onChange={setClearingTime} /></Field>
          <Field label="Soil resistivity (Ω·m)"><NumberField value={soilResistivity} step={10} min={1} onChange={setSoilResistivity} /></Field>
          <Field label="Grid area (m²)"><NumberField value={area} step={100} min={10} onChange={setArea} /></Field>
          <Field label="Conductor length (m)"><NumberField value={conductorLength} step={100} min={10} onChange={setConductorLength} /></Field>
          <Field label="Depth (m)"><NumberField value={depth} step={0.05} min={0.1} onChange={setDepth} /></Field>
          <Field label="Surface resistivity (Ω·m)"><NumberField value={surfaceResistivity} step={100} min={1} onChange={setSurfaceResistivity} /></Field>
          <Field label="Surface thickness (m)"><NumberField value={surfaceThickness} step={0.01} min={0.01} onChange={setSurfaceThickness} /></Field>
          <Field label="Body weight (kg)">
            <select className="field-input" value={bodyWeight} onChange={event => setBodyWeight(Number(event.target.value) as 50 | 70)}>
              <option value={50}>50 kg</option>
              <option value={70}>70 kg</option>
            </select>
          </Field>
        </Section>
        <ActionButton label="Design Grid" onClick={run} />
      </div>

      <div className="space-y-2">
        {!result ? (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded border border-dashed border-slate-300 text-[11px] text-slate-400">
            Enter the soil, grid and fault data, then calculate the IEEE 80 screening values.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Stat label="Conductor" value={`${result.conductorSizeMM2.toFixed(0)} mm²`} />
              <Stat label="Grid resistance" value={`${result.gridResistance.toFixed(2)} Ω`} />
              <Stat label="GPR" value={`${(result.gprV / 1000).toFixed(1)} kV`} />
              <Stat label="Mesh voltage" value={`${result.meshVoltageV.toFixed(0)} V`} tone={result.touchPass ? 'good' : 'bad'} />
              <Stat label="Step voltage" value={`${result.stepVoltageV.toFixed(0)} V`} tone={result.stepPass ? 'good' : 'bad'} />
            </div>
            <Table
              headers={['Quantity', 'Calculated', 'Tolerable', 'Status']}
              rows={[
                ['Touch / mesh voltage', `${result.meshVoltageV.toFixed(0)} V`, `${result.tolerableTouchV.toFixed(0)} V`, result.touchPass ? 'Pass' : 'Fail'],
                ['Step voltage', `${result.stepVoltageV.toFixed(0)} V`, `${result.tolerableStepV.toFixed(0)} V`, result.stepPass ? 'Pass' : 'Fail'],
                ['Ground potential rise', `${result.gprV.toFixed(0)} V`, '-', '-'],
                ['Surface derating factor', result.surfaceDerating.toFixed(3), '-', '-'],
              ]}
            />
            <Section title="Notes">
              <ul className="space-y-1 text-[10.5px] text-slate-500">
                {result.notes.map(note => <li key={note}>· {note}</li>)}
              </ul>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

export default function SpecialtyDialog({ system, faultStudy, initialTab = 'arcflash', onClose }: SpecialtyDialogProps) {
  const [tab, setTab] = useState<SpecialtyTab>(initialTab);

  return (
    <Dialog
      title="Specialty Studies"
      subtitle="Arc flash, motor starting, harmonics, protection coordination and ground grid design"
      icon="fault"
      onClose={onClose}
      width={1080}
      height={Math.min(780, typeof window !== 'undefined' ? window.innerHeight - 40 : 780)}
      footer={
        <button className="rounded bg-[#1f4d85] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#183c68]" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap gap-0.5 border-b border-[#d5dde7] bg-[#f1f4f8] px-2 py-1">
          {tabs.map(item => (
            <button
              key={item.id}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${
                tab === item.id ? 'bg-white font-medium text-[#1f4d85] shadow-sm' : 'text-slate-600 hover:bg-slate-200/70'
              }`}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={12} /> {item.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto bg-[#f7f9fc] p-2">
          {tab === 'arcflash' && <ArcFlashPanel system={system} faultStudy={faultStudy} />}
          {tab === 'motor' && <MotorPanel system={system} />}
          {tab === 'harmonics' && <HarmonicsPanel system={system} />}
          {tab === 'protection' && <ProtectionPanel system={system} />}
          {tab === 'groundgrid' && <GroundGridPanel system={system} />}
        </div>
      </div>
    </Dialog>
  );
}
