'use client';

import { PowerSystem } from '@/types';
import { StudyRun } from '@/lib/studies';
import { studyReport } from '@/lib/results-export';
import { exportReportAsCSV, exportReportAsHTML, exportReportAsJSON } from '@/lib/reports';
import { downloadFile, safeFileName } from '@/lib/project';
import Dialog from './Dialog';
import Icon from './Icon';

interface ReportDialogProps {
  run: StudyRun;
  system: PowerSystem;
  onClose: () => void;
}

export default function ReportDialog({ run, system, onClose }: ReportDialogProps) {
  const sections = studyReport(run, system);
  const baseName = safeFileName(`${system.name ?? 'power-system'}-${run.kind}-report`, 'html');

  const download = (format: 'html' | 'csv' | 'json') => {
    const title = `${system.name ?? 'Power System'} - ${run.title}`;
    if (format === 'html') {
      downloadFile(baseName, exportReportAsHTML(sections, title), 'text/html');
    } else if (format === 'csv') {
      downloadFile(safeFileName(baseName, 'csv'), exportReportAsCSV(sections), 'text/csv');
    } else {
      downloadFile(safeFileName(baseName, 'json'), exportReportAsJSON(sections), 'application/json');
    }
  };

  return (
    <Dialog
      title="Study Report"
      subtitle={`${run.title} · ${system.name ?? 'Power System'}`}
      icon="report"
      onClose={onClose}
      width={860}
      height={Math.min(720, typeof window !== 'undefined' ? window.innerHeight - 60 : 720)}
      footer={
        <>
          <button
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] hover:bg-slate-50"
            onClick={() => download('html')}
          >
            <Icon name="export" size={12} /> HTML
          </button>
          <button
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] hover:bg-slate-50"
            onClick={() => download('csv')}
          >
            <Icon name="csv" size={12} /> CSV
          </button>
          <button
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] hover:bg-slate-50"
            onClick={() => download('json')}
          >
            <Icon name="table" size={12} /> JSON
          </button>
          <div className="flex-1" />
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
      <div className="space-y-2 p-3">
        <div className="rounded border border-[#dde4ec] bg-white p-2">
          <div className="text-[15px] font-semibold text-slate-800">{system.name ?? 'Power System'}</div>
          <div className="text-[11px] text-slate-500">
            {run.title} · Generated {new Date().toLocaleString()} · Status: {run.status}
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-slate-600">{run.summary}</div>
        </div>

        {sections.map((section, index) => (
          <div key={`${section.title}-${index}`} className="rounded border border-[#dde4ec] bg-white">
            <div className="border-b border-[#e6ecf3] bg-[#f8fafc] px-2 py-1 text-[11px] font-semibold text-slate-700">
              {section.title}
            </div>
            <div className="p-2">
              {section.type === 'table' && Array.isArray(section.content) ? (
                <table className="data-table">
                  <tbody>
                    {(section.content as string[][]).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className={cellIndex === 0 ? 'font-medium' : ''}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="whitespace-pre-wrap text-[11px] text-slate-600">
                  {Array.isArray(section.content) ? section.content.join('\n') : section.content}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
