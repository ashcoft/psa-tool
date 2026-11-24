'use client';

import { PowerFlowMethod } from '@/types';
import Icon from './Icon';

interface ToolbarProps {
  method: PowerFlowMethod;
  onMethodChange: (method: PowerFlowMethod) => void;
  onRunPowerFlow: () => void;
  onRunFault: () => void;
  onRunTimeSeries: () => void;
  onOpenResults: () => void;
  onOpenSettings: () => void;
  isProcessing: boolean;
  hasResults: boolean;
  resultSummary?: string;
  issueCount: number;
}

const methods: PowerFlowMethod[] = ['Newton-Raphson', 'Fast-Decoupled', 'DC', 'Gauss-Seidel'];

export default function Toolbar({
  method,
  onMethodChange,
  onRunPowerFlow,
  onRunFault,
  onRunTimeSeries,
  onOpenResults,
  onOpenSettings,
  isProcessing,
  hasResults,
  resultSummary,
  issueCount,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#c9d2dd] bg-[#eef2f7] px-2 py-1" data-testid="toolbar">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-600">Load Flow</span>
        <select
          value={method}
          onChange={event => onMethodChange(event.target.value as PowerFlowMethod)}
          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800"
          aria-label="Power flow method"
        >
          {methods.map(item => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          className="rounded p-1 text-slate-600 hover:bg-slate-200"
          title="Study options"
          onClick={onOpenSettings}
        >
          <Icon name="settings" size={14} />
        </button>
      </div>

      <div className="h-5 w-px bg-slate-300" />

      <button
        onClick={onRunPowerFlow}
        disabled={isProcessing}
        className="flex items-center gap-1.5 rounded bg-[#1f4d85] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#183c68] disabled:opacity-50"
      >
        <Icon name={isProcessing ? 'refresh' : 'play'} size={13} className={isProcessing ? 'animate-spin' : ''} />
        Run Load Flow
      </button>
      <button
        onClick={onRunFault}
        disabled={isProcessing}
        className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <Icon name="fault" size={13} className="text-rose-600" />
        Short Circuit
      </button>
      <button
        onClick={onRunTimeSeries}
        disabled={isProcessing}
        className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <Icon name="time" size={13} className="text-indigo-600" />
        Time Domain
      </button>
      <button
        onClick={onOpenResults}
        disabled={!hasResults}
        className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        <Icon name="results" size={13} className="text-teal-700" />
        Results
      </button>

      <div className="flex-1" />

      {resultSummary && (
        <span className="max-w-[320px] truncate rounded bg-emerald-50 px-2 py-0.5 text-[10.5px] text-emerald-800" title={resultSummary}>
          {resultSummary}
        </span>
      )}
      <span
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] ${
          issueCount > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
        }`}
        title={issueCount > 0 ? 'Model check found issues' : 'Model check passed'}
      >
        <Icon name={issueCount > 0 ? 'warning' : 'check'} size={12} />
        {issueCount > 0 ? `${issueCount} model issue${issueCount === 1 ? '' : 's'}` : 'Model OK'}
      </span>
    </div>
  );
}
