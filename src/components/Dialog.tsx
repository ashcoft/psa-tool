'use client';

import Icon from './Icon';

interface DialogProps {
  title: string;
  subtitle?: string;
  icon?: 'settings' | 'results' | 'report' | 'folder' | 'about' | 'help' | 'warning' | 'check';
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  height?: number;
}

export default function Dialog({
  title,
  subtitle,
  icon = 'settings',
  onClose,
  children,
  footer,
  width = 720,
  height,
}: DialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="psat-fade-in flex max-h-[92vh] flex-col overflow-hidden rounded border border-[#b8c4d3] bg-[#f7f9fc] shadow-2xl"
        style={{ width, height }}
      >
        <div className="flex items-center justify-between bg-gradient-to-b from-[#1f4d85] to-[#183c68] px-3 py-2 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-white/15">
              <Icon name={icon} size={14} />
            </span>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">{title}</div>
              {subtitle && <div className="text-[10px] text-blue-100/80">{subtitle}</div>}
            </div>
          </div>
          <button className="rounded p-1 hover:bg-white/15" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[#d5dde7] bg-[#eef2f7] px-3 py-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
