'use client';

import { useMemo } from 'react';
import { SAMPLE_SYSTEMS } from '@/lib/samples';
import { systemStats } from '@/lib/project';
import Dialog from './Dialog';
import Icon from './Icon';

interface SampleDialogProps {
  onLoad: (id: string) => void;
  onClose: () => void;
}

export default function SampleDialog({ onLoad, onClose }: SampleDialogProps) {
  const samples = useMemo(
    () =>
      SAMPLE_SYSTEMS.map(sample => {
        const system = sample.build();
        return { ...sample, stats: systemStats(system) };
      }),
    []
  );

  return (
    <Dialog
      title="Sample Systems"
      subtitle="Load a ready-to-run example or start from your own project"
      icon="folder"
      onClose={onClose}
      width={640}
      footer={
        <button className="rounded bg-[#1f4d85] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#183c68]" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-1.5 p-2">
        {samples.map(sample => (
          <div key={sample.id} className="flex items-center gap-3 rounded border border-[#dde4ec] bg-white p-2 hover:border-[#7fa9d8]">
            <span className="flex h-9 w-9 items-center justify-center rounded bg-[#eaf2fb] text-[#1f4d85]">
              <Icon name="project" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-slate-800">{sample.name}</div>
              <div className="text-[10.5px] text-slate-500">{sample.description}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[9.5px] text-slate-400">
                <span>{sample.stats.buses} buses</span>
                <span>{sample.stats.lines + sample.stats.transformers} branches</span>
                <span>{sample.stats.generators} generators</span>
                <span>{sample.stats.totalLoadMW.toFixed(0)} MW load</span>
              </div>
            </div>
            <button
              className="flex items-center gap-1 rounded bg-[#1f4d85] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#183c68]"
              onClick={() => {
                onLoad(sample.id);
                onClose();
              }}
            >
              <Icon name="open" size={12} /> Load
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
