'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

interface OutputWindowProps {
  messages: string[];
  onClear: () => void;
}

type Filter = 'all' | 'errors' | 'studies';

export default function OutputWindow({ messages, onClear }: OutputWindowProps) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const endRef = useRef<HTMLDivElement>(null);

  const filtered = messages.filter(message => {
    const lower = message.toLowerCase();
    if (filter === 'errors') return lower.includes('error') || lower.includes('failed') || lower.includes('not converge');
    if (filter === 'studies') return lower.includes('study') || lower.includes('converged') || lower.includes('complete');
    return true;
  });

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, expanded]);

  return (
    <div className="flex shrink-0 flex-col border-t border-[#c9d2dd] bg-[#fbfcfe]" data-testid="output-window">
      <div className="flex items-center gap-2 border-b border-[#d5dde7] bg-[#eef2f7] px-2 py-0.5">
        <button className="flex items-center gap-1 text-[11px] font-semibold text-slate-700" onClick={() => setExpanded(value => !value)}>
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={11} />
          Output
        </button>
        {expanded && (
          <div className="flex items-center gap-0.5">
            {(
              [
                ['all', 'All'],
                ['studies', 'Studies'],
                ['errors', 'Errors'],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  filter === id ? 'bg-[#1f4d85] text-white' : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <span className="text-[9.5px] text-slate-400">{filtered.length} messages</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200" onClick={onClear}>
          Clear
        </button>
      </div>
      {expanded && (
        <div className="h-[112px] overflow-y-auto px-2 py-1 font-mono text-[10.5px] leading-[1.45]">
          {filtered.length === 0 ? (
            <div className="text-slate-400">No messages. Run a study or edit the one-line diagram.</div>
          ) : (
            filtered.map((message, index) => {
              const lower = message.toLowerCase();
              const tone =
                lower.includes('error') || lower.includes('failed') || lower.includes('not converge')
                  ? 'text-rose-600'
                  : lower.includes('converged') || lower.includes('complete') || lower.includes('loaded')
                    ? 'text-emerald-700'
                    : 'text-slate-600';
              return (
                <div key={index} className={tone}>
                  {message}
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
