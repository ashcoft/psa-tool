'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

interface MenuItem {
  label: string;
  action?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

interface TitleBarProps {
  projectName: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  showMenubar: boolean;
  onToggleMenubar: () => void;
  onAction: (action: string) => void;
  onRename: (name: string) => void;
}

const menus: { id: string; label: string; items: MenuItem[] }[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'New Project', action: 'new', shortcut: 'Ctrl+N' },
      { label: 'Open Project...', action: 'open', shortcut: 'Ctrl+O' },
      { label: 'Save Project', action: 'save', shortcut: 'Ctrl+S' },
      { label: 'Save As...', action: 'save-as' },
      { label: 'Close Project', action: 'close-project' },
      { separator: true, label: '' },
      { label: 'Sample Systems...', action: 'samples' },
      { separator: true, label: '' },
      { label: 'Export Project (.psa)', action: 'export' },
      { label: 'Export Results (CSV)', action: 'export-csv' },
      { label: 'Generate Report', action: 'report' },
      { separator: true, label: '' },
      { label: 'Print', action: 'print' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Undo', action: 'undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', action: 'redo', shortcut: 'Ctrl+Y' },
      { separator: true, label: '' },
      { label: 'Cut', action: 'cut', shortcut: 'Ctrl+X' },
      { label: 'Copy', action: 'copy', shortcut: 'Ctrl+C' },
      { label: 'Paste', action: 'paste', shortcut: 'Ctrl+V' },
      { label: 'Duplicate', action: 'duplicate', shortcut: 'Ctrl+D' },
      { label: 'Delete', action: 'delete', shortcut: 'Del' },
      { separator: true, label: '' },
      { label: 'Auto Arrange', action: 'arrange' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { label: 'Select Tool', action: 'tool-select' },
      { label: 'Pan Tool', action: 'tool-pan' },
      { separator: true, label: '' },
      { label: 'Zoom In', action: 'zoom-in', shortcut: 'Ctrl++' },
      { label: 'Zoom Out', action: 'zoom-out', shortcut: 'Ctrl+-' },
      { label: 'Fit to Window', action: 'fit', shortcut: 'Ctrl+0' },
      { separator: true, label: '' },
      { label: 'Toggle Grid', action: 'toggle-grid' },
      { label: 'Toggle Voltage Overlay', action: 'toggle-voltage' },
      { label: 'Toggle Flow Overlay', action: 'toggle-flow' },
      { label: 'Toggle Labels', action: 'toggle-names' },
      { label: 'Toggle Menu Bar', action: 'toggle-menubar', shortcut: 'Ctrl+Shift+M' },
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    items: [
      { label: 'Load Flow', action: 'run-powerflow', shortcut: 'F5' },
      { label: 'Continuation Power Flow', action: 'run-cpf', shortcut: 'F6' },
      { label: 'Optimal Power Flow', action: 'run-opf', shortcut: 'F8' },
      { label: 'Short Circuit', action: 'run-fault', shortcut: 'F7' },
      { label: 'Small-Signal Stability', action: 'run-stability' },
      { label: 'Time-Domain Simulation', action: 'run-timeseries', shortcut: 'F9' },
      { separator: true, label: '' },
      { separator: true, label: '' },
      { label: 'Arc Flash Screening...', action: 'specialty-arcflash' },
      { label: 'Motor Starting...', action: 'specialty-motor' },
      { label: 'Harmonic Analysis...', action: 'specialty-harmonics' },
      { label: 'Protection Coordination...', action: 'specialty-protection' },
      { label: 'Ground Grid Design...', action: 'specialty-groundgrid' },
      { separator: true, label: '' },
      { label: 'Study Options...', action: 'settings' },
      { label: 'Check Model', action: 'validate' },
      { label: 'Open Results', action: 'open-results', shortcut: 'F10' },
      { label: 'Clear Results', action: 'clear-results' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'Keyboard Shortcuts', action: 'shortcuts' },
      { label: 'Sample Systems', action: 'samples' },
      { separator: true, label: '' },
      { label: 'About PSA', action: 'about' },
    ],
  },
];

export default function TitleBar({
  projectName,
  dirty,
  canUndo,
  canRedo,
  showMenubar,
  onToggleMenubar,
  onAction,
  onRename,
}: Readonly<TitleBarProps>) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const commitRename = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== projectName) onRename(next);
    else setDraft(projectName);
  };

  return (
    <div ref={containerRef} className="flex items-center gap-2 bg-gradient-to-b from-[#1f4d85] to-[#183c68] px-2 py-1 text-white shadow-sm" data-testid="titlebar">
      <div className="flex items-center gap-2 pr-3">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-white/15">
          <Icon name="lightning" size={15} className="text-amber-300" />
        </span>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-wide">Power System Analysis Tool</div>
          <div className="text-[9px] text-blue-100/80">Power system analysis workbench</div>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          className="rounded p-1 hover:bg-white/15 disabled:opacity-40"
          title="Save (Ctrl+S)"
          onClick={() => onAction('save')}
        >
          <Icon name="save" size={15} />
        </button>
        <button
          className="rounded p-1 hover:bg-white/15 disabled:opacity-40"
          title="Undo (Ctrl+Z)"
          onClick={() => onAction('undo')}
          disabled={!canUndo}
        >
          <Icon name="undo" size={15} />
        </button>
        <button
          className="rounded p-1 hover:bg-white/15 disabled:opacity-40"
          title="Redo (Ctrl+Y)"
          onClick={() => onAction('redo')}
          disabled={!canRedo}
        >
          <Icon name="redo" size={15} />
        </button>
        <button
          className="rounded p-1 hover:bg-white/15"
          title="Run Load Flow (F5)"
          onClick={() => onAction('run-powerflow')}
        >
          <Icon name="play" size={15} className="text-emerald-300" />
        </button>
      </div>

      <button
        className={`rounded p-1 hover:bg-white/15 ${showMenubar ? 'bg-white/15' : ''}`}
        title={showMenubar ? 'Hide menu bar (Ctrl+Shift+M)' : 'Show menu bar (Ctrl+Shift+M)'}
        aria-label={showMenubar ? 'Hide menu bar' : 'Show menu bar'}
        aria-pressed={showMenubar}
        onClick={() => {
          setOpenMenu(null);
          onToggleMenubar();
        }}
      >
        <Icon name="menu" size={15} />
      </button>

      {showMenubar && (
        <>
          <div className="mx-2 h-5 w-px bg-white/25" />

          <div className="flex items-center" data-testid="menubar">
            {menus.map(menu => (
              <div key={menu.id} className="relative">
                <button
                  className={`rounded px-2 py-0.5 text-[12px] hover:bg-white/15 ${openMenu === menu.id ? 'bg-white/20' : ''}`}
                  onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                >
                  {menu.label}
                </button>
                {openMenu === menu.id && (
                  <div className="psat-fade-in absolute left-0 top-full z-[70] mt-1 min-w-[230px] rounded border border-[#c9d2dd] bg-white py-1 text-slate-800 shadow-xl">
                    {menu.items.map((item, index) =>
                      item.separator ? (
                        <div key={`sep-${index}`} className="my-1 h-px bg-slate-200" />
                      ) : (
                        <button
                          key={item.label}
                          className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[12px] hover:bg-[#e2ebf7]"
                          onClick={() => {
                            setOpenMenu(null);
                            if (item.action) onAction(item.action);
                          }}
                        >
                          <span>{item.label}</span>
                          {item.shortcut && <span className="text-[10px] text-slate-400">{item.shortcut}</span>}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mx-2 h-5 w-px bg-white/25" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={event => {
              if (event.key === 'Enter') commitRename();
              if (event.key === 'Escape') {
                setDraft(projectName);
                setEditing(false);
              }
            }}
            className="w-72 rounded border border-blue-300 px-2 py-0.5 text-[12px] text-slate-900"
            aria-label="Project name"
          />
        ) : (
          <button
            className="max-w-[420px] truncate rounded px-1 text-[12px] text-blue-50 hover:bg-white/10"
            title="Click to rename the project"
            onClick={() => {
              setDraft(projectName);
              setEditing(true);
            }}
          >
            {projectName}
          </button>
        )}
        {dirty && <span className="rounded bg-amber-400/90 px-1.5 py-0.5 text-[9px] font-semibold text-amber-950">MODIFIED</span>}
      </div>

      <div className="hidden items-center gap-3 text-[10px] text-blue-100/80 md:flex">
        <span>PSA {process.env.NEXT_PUBLIC_APP_VERSION ?? '1.3.0'}</span>
      </div>
    </div>
  );
}
