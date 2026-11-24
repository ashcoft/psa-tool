'use client';

import Dialog from './Dialog';
import Icon from './Icon';

const shortcuts: { keys: string; action: string }[] = [
  { keys: 'Ctrl + N', action: 'New project' },
  { keys: 'Ctrl + O', action: 'Open project' },
  { keys: 'Ctrl + S', action: 'Save project' },
  { keys: 'Ctrl + Z', action: 'Undo' },
  { keys: 'Ctrl + Y', action: 'Redo' },
  { keys: 'Ctrl + C / Ctrl + V', action: 'Copy / paste element' },
  { keys: 'Ctrl + D', action: 'Duplicate element' },
  { keys: 'Delete', action: 'Delete selected element' },
  { keys: 'F5', action: 'Run load flow' },
  { keys: 'F6', action: 'Run continuation power flow' },
  { keys: 'F7', action: 'Run short circuit study' },
  { keys: 'F8', action: 'Run optimal power flow' },
  { keys: 'F9', action: 'Run time-domain simulation' },
  { keys: 'F10', action: 'Open results' },
  { keys: 'Ctrl + 0', action: 'Fit diagram to window' },
  { keys: 'Ctrl + + / Ctrl + -', action: 'Zoom in / out' },
  { keys: 'Esc', action: 'Cancel current tool or dialog' },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard Shortcuts" icon="help" onClose={onClose} width={560}>
      <div className="p-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Shortcut</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map(item => (
              <tr key={item.keys}>
                <td className="whitespace-nowrap font-mono text-[10.5px]">{item.keys}</td>
                <td>{item.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const features = [
    'Newton-Raphson, fast-decoupled, DC and Gauss-Seidel load flow',
    'Continuation power flow and voltage stability margins',
    'DC/AC optimal power flow with generator cost curves',
    'Balanced and unbalanced short-circuit analysis',
    'Small-signal eigenvalue and modal analysis',
    'Time-domain simulation with disturbance events',
    'One-line diagram editor with IEEE/IEC symbols',
    'CSV, HTML and JSON report exports',
  ];

  return (
    <Dialog title="About PSAT Web" icon="about" onClose={onClose} width={560}>
      <div className="p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded bg-[#1f4d85] text-white">
            <Icon name="lightning" size={26} />
          </span>
          <div>
            <div className="text-[16px] font-semibold text-slate-800">PSAT Web</div>
            <div className="text-[11px] text-slate-500">Power System Analysis Toolbox · Web Edition 1.1</div>
          </div>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-slate-600">
          PSAT Web is a browser-based power system analysis workbench derived from the open-source PSAT
          (Power System Analysis Toolbox). It combines an ETAP-style one-line diagram editor with load flow,
          voltage stability, optimal power flow, short circuit, stability and time-domain studies.
        </p>

        <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-600">
          {features.map(feature => (
            <div key={feature} className="flex items-start gap-1.5">
              <Icon name="check" size={12} className="mt-0.5 shrink-0 text-emerald-600" />
              {feature}
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
          Licensed under GPL-3.0. Numerical engines ported from PSAT MATLAB routines.
        </div>
      </div>
    </Dialog>
  );
}

export function ValidationDialog({
  issues,
  onClose,
  onSelect,
}: {
  issues: { severity: 'error' | 'warning'; message: string; elementId?: string }[];
  onClose: () => void;
  onSelect: (elementId: string) => void;
}) {
  const errors = issues.filter(issue => issue.severity === 'error');
  return (
    <Dialog
      title="Model Check"
      subtitle={issues.length === 0 ? 'No problems detected' : `${errors.length} error(s), ${issues.length - errors.length} warning(s)`}
      icon="check"
      onClose={onClose}
      width={600}
      footer={
        <button className="rounded bg-[#1f4d85] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#183c68]" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="p-2">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-10 text-emerald-700">
            <Icon name="check" size={30} />
            <div className="text-[12.5px] font-medium">The model is ready for simulation</div>
            <div className="text-[10.5px] text-slate-500">All buses are connected and a slack bus is defined.</div>
          </div>
        ) : (
          <ul className="space-y-1">
            {issues.map((issue, index) => (
              <li key={index}>
                <button
                  className={`flex w-full items-start gap-2 rounded border px-2 py-1 text-left text-[11.5px] ${
                    issue.severity === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                  onClick={() => {
                    if (issue.elementId) onSelect(issue.elementId);
                  }}
                >
                  <Icon name={issue.severity === 'error' ? 'warning' : 'about'} size={13} className="mt-0.5 shrink-0" />
                  <span>{issue.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
