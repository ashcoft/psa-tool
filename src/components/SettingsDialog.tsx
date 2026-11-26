'use client';

import { useState } from 'react';
import { PowerSystem } from '@/types';
import { AppSettings } from '@/lib/settings';
import Dialog from './Dialog';

interface SettingsDialogProps {
  settings: AppSettings;
  system: PowerSystem;
  onSave: (settings: AppSettings) => void;
  onMetaChange: (changes: Partial<Pick<PowerSystem, 'baseMVA' | 'baseFreq'>>) => void;
  onClose: () => void;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#dde4ec] bg-white">
      <div className="border-b border-[#e6ecf3] bg-[#f8fafc] px-2 py-1">
        <div className="text-[11px] font-semibold text-slate-700">{title}</div>
        {description && <div className="text-[9.5px] text-slate-400">{description}</div>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-2">{children}</div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-2 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-[11px] text-slate-600">{label}</span>
      <div className="w-[132px]">{children}</div>
    </label>
  );
}

export default function SettingsDialog({ settings, system, onSave, onMetaChange, onClose }: SettingsDialogProps) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [baseMVA, setBaseMVA] = useState(system.baseMVA);
  const [baseFreq, setBaseFreq] = useState(system.baseFreq);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(draft);
    if (baseMVA !== system.baseMVA || baseFreq !== system.baseFreq) {
      onMetaChange({ baseMVA, baseFreq });
    }
    onClose();
  };

  return (
    <Dialog
      title="Study & Application Options"
      subtitle="Settings apply to new studies and are saved in this browser"
      icon="settings"
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="rounded border border-slate-300 bg-white px-3 py-1 text-[11.5px] hover:bg-slate-50" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded bg-[#1f4d85] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#183c68]" onClick={handleSave}>
            Save Settings
          </button>
        </>
      }
    >
      <div className="space-y-2 p-2">
        <Section title="General" description="System base values used by all calculations">
          <Field label="Base power (MVA)">
            <input
              type="number"
              className="field-input text-right"
              value={baseMVA}
              min={1}
              step={1}
              onChange={event => setBaseMVA(Number(event.target.value) || 100)}
            />
          </Field>
          <Field label="Base frequency (Hz)">
            <input
              type="number"
              className="field-input text-right"
              value={baseFreq}
              min={1}
              step={1}
              onChange={event => setBaseFreq(Number(event.target.value) || 50)}
            />
          </Field>
        </Section>

        <Section title="Load Flow" description="Solver selection, convergence and iteration limits">
          <Field label="Method">
            <select
              className="field-input"
              value={draft.method}
              onChange={event => update('method', event.target.value as AppSettings['method'])}
            >
              <option>Newton-Raphson</option>
              <option>Fast-Decoupled</option>
              <option>DC</option>
              <option>Gauss-Seidel</option>
            </select>
          </Field>
          <Field label="Tolerance (pu)">
            <input
              type="number"
              className="field-input text-right"
              value={draft.tolerance}
              step={0.000001}
              min={1e-9}
              onChange={event => update('tolerance', Number(event.target.value) || 1e-6)}
            />
          </Field>
          <Field label="Max iterations">
            <input
              type="number"
              className="field-input text-right"
              value={draft.maxIterations}
              min={1}
              step={1}
              onChange={event => update('maxIterations', Number(event.target.value) || 50)}
            />
          </Field>
          <Field label="Optimal PF engine">
            <select
              className="field-input"
              value={draft.opfUseAC ? 'ac' : 'dc'}
              onChange={event => update('opfUseAC', event.target.value === 'ac')}
            >
              <option value="dc">DC OPF (fast)</option>
              <option value="ac">AC OPF (iterative)</option>
            </select>
          </Field>
        </Section>

        <Section title="Continuation Power Flow" description="Voltage stability loading range">
          <Field label="Max loading (pu)">
            <input
              type="number"
              className="field-input text-right"
              value={draft.cpfLambdaMax}
              step={0.1}
              min={0.1}
              onChange={event => update('cpfLambdaMax', Number(event.target.value) || 2)}
            />
          </Field>
          <Field label="Step size (pu)">
            <input
              type="number"
              className="field-input text-right"
              value={draft.cpfStepSize}
              step={0.01}
              min={0.001}
              onChange={event => update('cpfStepSize', Number(event.target.value) || 0.1)}
            />
          </Field>
        </Section>

        <Section title="Short Circuit" description="Fault types included in the study">
          <label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#1f4d85]"
              checked={draft.faultIncludeLineToGround}
              onChange={event => update('faultIncludeLineToGround', event.target.checked)}
            />
            Include single line-to-ground faults
          </label>
          <label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#1f4d85]"
              checked={draft.faultIncludeLineToLine}
              onChange={event => update('faultIncludeLineToLine', event.target.checked)}
            />
            Include line-to-line faults
          </label>
        </Section>

        <Section title="Time-Domain Simulation" description="Integration window and disturbance">
          <Field label="End time (s)">
            <input
              type="number"
              className="field-input text-right"
              value={draft.simEnd}
              step={0.5}
              min={0.1}
              onChange={event => update('simEnd', Number(event.target.value) || 5)}
            />
          </Field>
          <Field label="Time step (s)">
            <input
              type="number"
              className="field-input text-right"
              value={draft.simStep}
              step={0.001}
              min={0.0001}
              onChange={event => update('simStep', Number(event.target.value) || 0.01)}
            />
          </Field>
          <Field label="Integrator">
            <select
              className="field-input"
              value={draft.simMethod}
              onChange={event => update('simMethod', event.target.value as AppSettings['simMethod'])}
            >
              <option value="euler">Euler</option>
              <option value="rk4">Runge-Kutta 4</option>
              <option value="trapezoidal">Trapezoidal</option>
            </select>
          </Field>
          <Field label="Fault time (s)">
            <input
              type="number"
              className="field-input text-right"
              value={draft.simFaultTime}
              step={0.1}
              min={0}
              onChange={event => update('simFaultTime', Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Fault duration (s)">
            <input
              type="number"
              className="field-input text-right"
              value={draft.simFaultDuration}
              step={0.01}
              min={0}
              onChange={event => update('simFaultDuration', Number(event.target.value) || 0.1)}
            />
          </Field>
        </Section>

        <Section title="Diagram Display" description="Overlays and editing aids">
          {(
            [
              ['showSidebar', 'Show left pane'],
              ['showProperties', 'Show right pane'],
              ['showToolbar', 'Show toolbar'],
              ['showGrid', 'Show grid'],
              ['snapToGrid', 'Snap to grid'],
              ['showBusNames', 'Show labels'],
              ['showVoltageOverlay', 'Voltage overlay'],
              ['showFlowOverlay', 'Branch loading overlay'],
            ] as [keyof AppSettings, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1f4d85]"
                checked={Boolean(draft[key])}
                onChange={event => update(key, event.target.checked as AppSettings[typeof key])}
              />
              {label}
            </label>
          ))}
        </Section>
      </div>
    </Dialog>
  );
}
