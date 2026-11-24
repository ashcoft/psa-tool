'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bus,
  Generator,
  Load,
  Line,
  PowerFlowResult,
  PowerSystem,
  Shunt,
  Transformer,
} from '@/types';
import { Selection } from '@/lib/useProject';
import { systemStats, ValidationIssue } from '@/lib/project';
import Icon from './Icon';

type AnyElement = Bus | Line | Transformer | Generator | Load | Shunt;

interface PropertiesPanelProps {
  system: PowerSystem;
  selection: Selection;
  results: PowerFlowResult | null;
  issues: ValidationIssue[];
  onChange: (kind: Selection['type'], element: AnyElement) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMetaChange: (changes: Partial<Pick<PowerSystem, 'baseMVA' | 'baseFreq' | 'name'>>) => void;
  onSelect: (selection: Selection) => void;
}

function findElement(system: PowerSystem, selection: Selection): AnyElement | null {
  if (!selection.type || !selection.id) return null;
  switch (selection.type) {
    case 'bus':
      return system.buses.find(item => item.id === selection.id) ?? null;
    case 'line':
      return system.lines.find(item => item.id === selection.id) ?? null;
    case 'transformer':
      return system.transformers.find(item => item.id === selection.id) ?? null;
    case 'generator':
      return system.generators.find(item => item.id === selection.id) ?? null;
    case 'load':
      return system.loads.find(item => item.id === selection.id) ?? null;
    case 'shunt':
      return (system.shunts ?? []).find(item => item.id === selection.id) ?? null;
    default:
      return null;
  }
}

const kindTitle: Record<string, string> = {
  bus: 'Bus',
  line: 'Line',
  transformer: 'Transformer',
  generator: 'Generator',
  load: 'Load',
  shunt: 'Shunt',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#dde4ec] bg-white">
      <div className="border-b border-[#e6ecf3] bg-[#f8fafc] px-2 py-1 text-[10.5px] font-semibold text-slate-600">{title}</div>
      <div className="space-y-1 p-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[11px] text-slate-600">{label}</span>
      <div className="w-[138px]">{children}</div>
    </label>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      className="field-input"
      value={value}
      onChange={event => onChange(event.target.value)}
      aria-label="Text value"
    />
  );
}

function NumberInput({
  value,
  onChange,
  step = 0.01,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      className="field-input text-right"
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={event => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
      aria-label="Numeric value"
    />
  );
}

function SelectInput<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <select className="field-input" value={value} onChange={event => onChange(event.target.value as T)}>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CheckInput({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={value}
      onChange={event => onChange(event.target.checked)}
      className="h-4 w-4 accent-[#1f4d85]"
    />
  );
}

export default function PropertiesPanel({
  system,
  selection,
  results,
  issues,
  onChange,
  onDelete,
  onDuplicate,
  onMetaChange,
  onSelect,
}: PropertiesPanelProps) {
  const element = findElement(system, selection);
  const [draft, setDraft] = useState<AnyElement | null>(element);
  const lastSent = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<AnyElement | null>(element);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const update = (next: AnyElement) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSent.current = JSON.stringify(next);
      onChange(selection.type, next);
    }, 300);
  };

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (draftRef.current) {
        lastSent.current = JSON.stringify(draftRef.current);
        onChange(selection.type, draftRef.current);
      }
    }
  };

  const busResults = results?.busResults.find(item => item.bus === selection.id);
  const lineResults = results?.lineResults.find(item => item.line === selection.id);
  const stats = systemStats(system);

  if (!draft) {
    return (
      <aside className="hidden w-[286px] shrink-0 flex-col border-l border-[#c9d2dd] bg-[#f7f9fc] lg:flex" data-testid="properties-panel">
        <div className="panel-header">
          <span>Properties</span>
          <span className="text-[10px] font-normal text-slate-400">No selection</span>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          <Section title="Project">
            <Row label="Name">
              <TextInput value={system.name ?? ''} onChange={value => onMetaChange({ name: value })} />
            </Row>
            <Row label="Base MVA">
              <NumberInput value={system.baseMVA} step={1} min={1} onChange={value => onMetaChange({ baseMVA: value })} />
            </Row>
            <Row label="Frequency (Hz)">
              <NumberInput value={system.baseFreq} step={1} min={1} onChange={value => onMetaChange({ baseFreq: value })} />
            </Row>
          </Section>

          <Section title="System Summary">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600">
              <span>Buses</span><span className="text-right font-medium">{stats.buses}</span>
              <span>Branches</span><span className="text-right font-medium">{stats.lines + stats.transformers}</span>
              <span>Generators</span><span className="text-right font-medium">{stats.generators}</span>
              <span>Loads</span><span className="text-right font-medium">{stats.loads}</span>
              <span>Total load</span><span className="text-right font-medium">{stats.totalLoadMW.toFixed(1)} MW</span>
              <span>Total gen.</span><span className="text-right font-medium">{stats.totalGenerationMW.toFixed(1)} MW</span>
            </div>
          </Section>

          <Section title={`Model Check (${issues.length})`}>
            {issues.length === 0 ? (
              <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                <Icon name="check" size={12} /> No problems detected
              </div>
            ) : (
              <ul className="space-y-1">
                {issues.map((issue, index) => (
                  <li key={`${issue.message}-${index}`}>
                    <button
                      className={`flex w-full items-start gap-1 rounded px-1 py-0.5 text-left text-[10.5px] hover:bg-slate-100 ${
                        issue.severity === 'error' ? 'text-rose-700' : 'text-amber-700'
                      }`}
                      onClick={() => {
                        if (!issue.elementId) return;
                        const type = system.buses.some(bus => bus.id === issue.elementId)
                          ? 'bus'
                          : system.lines.some(line => line.id === issue.elementId)
                            ? 'line'
                            : system.transformers.some(txf => txf.id === issue.elementId)
                              ? 'transformer'
                              : system.generators.some(gen => gen.id === issue.elementId)
                                ? 'generator'
                                : system.loads.some(load => load.id === issue.elementId)
                                  ? 'load'
                                  : 'shunt';
                        onSelect({ type, id: issue.elementId });
                      }}
                    >
                      <Icon name={issue.severity === 'error' ? 'warning' : 'about'} size={11} className="mt-0.5 shrink-0" />
                      <span>{issue.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="px-1 text-[10px] leading-relaxed text-slate-400">
            Select a bus, branch or device in the diagram or project tree to edit its parameters.
          </div>
        </div>
      </aside>
    );
  }

  const busOptions = system.buses.map(bus => ({ value: bus.id, label: `${bus.name} (${bus.id})` }));

  return (
    <aside
      className="hidden w-[286px] shrink-0 flex-col border-l border-[#c9d2dd] bg-[#f7f9fc] lg:flex"
      data-testid="properties-panel"
      onBlur={flush}
    >
      <div className="panel-header">
        <span className="flex items-center gap-1">
          <Icon name={selection.type === 'bus' ? 'bus' : selection.type === 'line' ? 'line' : selection.type === 'transformer' ? 'transformer' : selection.type === 'generator' ? 'generator' : selection.type === 'load' ? 'load' : 'shunt'} size={12} />
          {kindTitle[selection.type ?? ''] ?? 'Element'} Properties
        </span>
        <span className="rounded bg-slate-200 px-1 text-[9.5px] font-normal text-slate-600">{draft.id}</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        <div className="flex gap-1">
          <button
            className="flex flex-1 items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
            onClick={onDuplicate}
          >
            <Icon name="duplicate" size={12} /> Duplicate
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-1 rounded border border-rose-300 bg-white px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50"
            onClick={onDelete}
          >
            <Icon name="delete" size={12} /> Delete
          </button>
        </div>

        {selection.type === 'bus' && (() => {
          const bus = draft as Bus;
          return (
            <>
              <Section title="Identification">
                <Row label="Name"><TextInput value={bus.name} onChange={value => update({ ...bus, name: value })} /></Row>
                <Row label="Type">
                  <SelectInput
                    value={bus.type}
                    options={[
                      { value: 'slack', label: 'Slack / Swing' },
                      { value: 'pv', label: 'PV (voltage)' },
                      { value: 'pq', label: 'PQ (load)' },
                      { value: 'isolated', label: 'Isolated' },
                    ]}
                    onChange={value => update({ ...bus, type: value })}
                  />
                </Row>
                <Row label="Base kV"><NumberInput value={bus.vbase ?? 0} step={0.1} onChange={value => update({ ...bus, vbase: value })} /></Row>
                <Row label="In service"><CheckInput value={bus.active} onChange={value => update({ ...bus, active: value })} /></Row>
              </Section>
              <Section title="Voltage">
                <Row label="Voltage (pu)"><NumberInput value={bus.voltage} step={0.001} onChange={value => update({ ...bus, voltage: value })} /></Row>
                <Row label="Angle (deg)"><NumberInput value={(bus.angle * 180) / Math.PI} step={0.1} onChange={value => update({ ...bus, angle: (value * Math.PI) / 180 })} /></Row>
                <Row label="Vmin (pu)"><NumberInput value={bus.vmin} step={0.005} onChange={value => update({ ...bus, vmin: value })} /></Row>
                <Row label="Vmax (pu)"><NumberInput value={bus.vmax} step={0.005} onChange={value => update({ ...bus, vmax: value })} /></Row>
              </Section>
              <Section title="Location">
                <Row label="X"><NumberInput value={bus.x} step={0.4} onChange={value => update({ ...bus, x: value })} /></Row>
                <Row label="Y"><NumberInput value={bus.y} step={0.4} onChange={value => update({ ...bus, y: value })} /></Row>
                <Row label="Area"><NumberInput value={bus.area} step={1} onChange={value => update({ ...bus, area: value })} /></Row>
                <Row label="Zone"><NumberInput value={bus.region} step={1} onChange={value => update({ ...bus, region: value })} /></Row>
              </Section>
              {busResults && (
                <Section title="Load Flow Results">
                  <ResultRow label="Voltage" value={`${busResults.v.toFixed(4)} pu`} highlight={busResults.v < bus.vmin || busResults.v > bus.vmax} />
                  <ResultRow label="Angle" value={`${busResults.angle.toFixed(2)} deg`} />
                  <ResultRow label="P gen" value={`${busResults.pg.toFixed(2)} MW`} />
                  <ResultRow label="Q gen" value={`${busResults.qg.toFixed(2)} Mvar`} />
                  <ResultRow label="P load" value={`${busResults.pl.toFixed(2)} MW`} />
                  <ResultRow label="Q load" value={`${busResults.ql.toFixed(2)} Mvar`} />
                </Section>
              )}
            </>
          );
        })()}

        {selection.type === 'line' && (() => {
          const line = draft as Line;
          return (
            <>
              <Section title="Identification">
                <Row label="Name"><TextInput value={line.name ?? ''} onChange={value => update({ ...line, name: value })} /></Row>
                <Row label="From bus">
                  <SelectInput value={line.fromBus} options={busOptions} onChange={value => update({ ...line, fromBus: value })} />
                </Row>
                <Row label="To bus">
                  <SelectInput value={line.toBus} options={busOptions} onChange={value => update({ ...line, toBus: value })} />
                </Row>
                <Row label="In service"><CheckInput value={line.active} onChange={value => update({ ...line, active: value })} /></Row>
              </Section>
              <Section title="Impedance (pu)">
                <Row label="R"><NumberInput value={line.resistance} step={0.001} onChange={value => update({ ...line, resistance: value })} /></Row>
                <Row label="X"><NumberInput value={line.reactance} step={0.001} onChange={value => update({ ...line, reactance: value })} /></Row>
                <Row label="B"><NumberInput value={line.susceptance} step={0.001} onChange={value => update({ ...line, susceptance: value })} /></Row>
              </Section>
              <Section title="Rating">
                <Row label="Rating (MVA)"><NumberInput value={line.rating} step={1} onChange={value => update({ ...line, rating: value })} /></Row>
                <Row label="Length (km)"><NumberInput value={line.length ?? 0} step={0.1} onChange={value => update({ ...line, length: value })} /></Row>
              </Section>
              {lineResults && (
                <Section title="Load Flow Results">
                  <ResultRow label="P from" value={`${lineResults.pFrom.toFixed(2)} MW`} />
                  <ResultRow label="Q from" value={`${lineResults.qFrom.toFixed(2)} Mvar`} />
                  <ResultRow label="P to" value={`${lineResults.pTo.toFixed(2)} MW`} />
                  <ResultRow label="Q to" value={`${lineResults.qTo.toFixed(2)} Mvar`} />
                  <ResultRow label="Losses" value={`${lineResults.ploss.toFixed(3)} MW`} />
                  <ResultRow label="Loading" value={`${lineResults.loading.toFixed(1)} %`} highlight={lineResults.loading > 80} />
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-200">
                    <div
                      className={`h-full ${lineResults.loading > 100 ? 'bg-rose-500' : lineResults.loading > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, lineResults.loading)}%` }}
                    />
                  </div>
                </Section>
              )}
            </>
          );
        })()}

        {selection.type === 'transformer' && (() => {
          const txf = draft as Transformer;
          return (
            <>
              <Section title="Identification">
                <Row label="Name"><TextInput value={txf.name ?? ''} onChange={value => update({ ...txf, name: value })} /></Row>
                <Row label="From bus">
                  <SelectInput value={txf.fromBus} options={busOptions} onChange={value => update({ ...txf, fromBus: value })} />
                </Row>
                <Row label="To bus">
                  <SelectInput value={txf.toBus} options={busOptions} onChange={value => update({ ...txf, toBus: value })} />
                </Row>
                <Row label="In service"><CheckInput value={txf.active} onChange={value => update({ ...txf, active: value })} /></Row>
              </Section>
              <Section title="Impedance (pu)">
                <Row label="R"><NumberInput value={txf.resistance} step={0.0001} onChange={value => update({ ...txf, resistance: value })} /></Row>
                <Row label="X"><NumberInput value={txf.reactance} step={0.001} onChange={value => update({ ...txf, reactance: value })} /></Row>
              </Section>
              <Section title="Tap & Rating">
                <Row label="Tap (pu)"><NumberInput value={txf.tap} step={0.01} onChange={value => update({ ...txf, tap: value })} /></Row>
                <Row label="Shift (deg)"><NumberInput value={txf.shift} step={0.5} onChange={value => update({ ...txf, shift: value })} /></Row>
                <Row label="Rating (MVA)"><NumberInput value={txf.rating} step={1} onChange={value => update({ ...txf, rating: value })} /></Row>
                <Row label="V high (kV)"><NumberInput value={txf.vhigh ?? 0} step={0.1} onChange={value => update({ ...txf, vhigh: value })} /></Row>
                <Row label="V low (kV)"><NumberInput value={txf.vlow ?? 0} step={0.1} onChange={value => update({ ...txf, vlow: value })} /></Row>
              </Section>
            </>
          );
        })()}

        {selection.type === 'generator' && (() => {
          const gen = draft as Generator;
          return (
            <>
              <Section title="Identification">
                <Row label="Name"><TextInput value={gen.name ?? ''} onChange={value => update({ ...gen, name: value })} /></Row>
                <Row label="Bus">
                  <SelectInput value={gen.bus} options={busOptions} onChange={value => update({ ...gen, bus: value })} />
                </Row>
                <Row label="In service"><CheckInput value={gen.active} onChange={value => update({ ...gen, active: value })} /></Row>
              </Section>
              <Section title="Operating Point">
                <Row label="P (MW)"><NumberInput value={gen.pg} step={1} onChange={value => update({ ...gen, pg: value })} /></Row>
                <Row label="Q (Mvar)"><NumberInput value={gen.qg} step={1} onChange={value => update({ ...gen, qg: value })} /></Row>
                <Row label="V setpoint (pu)"><NumberInput value={gen.v} step={0.001} onChange={value => update({ ...gen, v: value })} /></Row>
              </Section>
              <Section title="Limits">
                <Row label="Pmax (MW)"><NumberInput value={gen.pmax} step={1} onChange={value => update({ ...gen, pmax: value })} /></Row>
                <Row label="Pmin (MW)"><NumberInput value={gen.pmin} step={1} onChange={value => update({ ...gen, pmin: value })} /></Row>
                <Row label="Qmax (Mvar)"><NumberInput value={gen.qmax} step={1} onChange={value => update({ ...gen, qmax: value })} /></Row>
                <Row label="Qmin (Mvar)"><NumberInput value={gen.qmin} step={1} onChange={value => update({ ...gen, qmin: value })} /></Row>
              </Section>
              <Section title="Cost (OPF)">
                <Row label="c2 ($/MW2h)"><NumberInput value={gen.cost?.c2 ?? 0.01} step={0.001} onChange={value => update({ ...gen, cost: { model: 'polynomial', c2: value, c1: gen.cost?.c1 ?? 20, c0: gen.cost?.c0 ?? 0 } })} /></Row>
                <Row label="c1 ($/MWh)"><NumberInput value={gen.cost?.c1 ?? 20} step={0.5} onChange={value => update({ ...gen, cost: { model: 'polynomial', c2: gen.cost?.c2 ?? 0.01, c1: value, c0: gen.cost?.c0 ?? 0 } })} /></Row>
                <Row label="c0 ($/h)"><NumberInput value={gen.cost?.c0 ?? 0} step={1} onChange={value => update({ ...gen, cost: { model: 'polynomial', c2: gen.cost?.c2 ?? 0.01, c1: gen.cost?.c1 ?? 20, c0: value } })} /></Row>
              </Section>
            </>
          );
        })()}

        {selection.type === 'load' && (() => {
          const load = draft as Load;
          return (
            <>
              <Section title="Identification">
                <Row label="Name"><TextInput value={load.name ?? ''} onChange={value => update({ ...load, name: value })} /></Row>
                <Row label="Bus">
                  <SelectInput value={load.bus} options={busOptions} onChange={value => update({ ...load, bus: value })} />
                </Row>
                <Row label="In service"><CheckInput value={load.active} onChange={value => update({ ...load, active: value })} /></Row>
              </Section>
              <Section title="Demand">
                <Row label="P (MW)"><NumberInput value={load.pl} step={1} onChange={value => update({ ...load, pl: value })} /></Row>
                <Row label="Q (Mvar)"><NumberInput value={load.ql} step={1} onChange={value => update({ ...load, ql: value })} /></Row>
                <Row label="Model">
                  <SelectInput
                    value={load.demandModel ?? 'constant-power'}
                    options={[
                      { value: 'constant-power', label: 'Constant power' },
                      { value: 'constant-impedance', label: 'Constant Z' },
                      { value: 'constant-current', label: 'Constant I' },
                      { value: 'mixed', label: 'ZIP' },
                    ]}
                    onChange={value => update({ ...load, demandModel: value })}
                  />
                </Row>
              </Section>
            </>
          );
        })()}

        {selection.type === 'shunt' && (() => {
          const shunt = draft as Shunt;
          return (
            <>
              <Section title="Identification">
                <Row label="Name"><TextInput value={shunt.name ?? ''} onChange={value => update({ ...shunt, name: value })} /></Row>
                <Row label="Bus">
                  <SelectInput value={shunt.bus} options={busOptions} onChange={value => update({ ...shunt, bus: value })} />
                </Row>
                <Row label="In service"><CheckInput value={shunt.active} onChange={value => update({ ...shunt, active: value })} /></Row>
              </Section>
              <Section title="Admittance (pu)">
                <Row label="G"><NumberInput value={shunt.g} step={0.001} onChange={value => update({ ...shunt, g: value })} /></Row>
                <Row label="B"><NumberInput value={shunt.b} step={0.001} onChange={value => update({ ...shunt, b: value })} /></Row>
              </Section>
            </>
          );
        })()}
      </div>
    </aside>
  );
}

function ResultRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono ${highlight ? 'font-semibold text-rose-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}
