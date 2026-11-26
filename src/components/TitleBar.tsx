'use client';

import { useState } from 'react';
import Icon from './Icon';

interface TitleBarProps {
  projectName: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAction: (action: string) => void;
  onRename: (name: string) => void;
}

export default function TitleBar({
  projectName,
  dirty,
  canUndo,
  canRedo,
  onAction,
  onRename,
}: Readonly<TitleBarProps>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commitRename = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== projectName) onRename(next);
    else setDraft(projectName);
  };

  return (
    <div className="flex items-center gap-2 bg-gradient-to-b from-[#1f4d85] to-[#183c68] px-2 py-1 text-white shadow-sm" data-testid="titlebar">
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
