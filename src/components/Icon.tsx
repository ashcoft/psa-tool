'use client';

import React from 'react';

export type IconName =
  | 'new' | 'open' | 'save' | 'saveAs' | 'export' | 'print'
  | 'undo' | 'redo' | 'copy' | 'paste' | 'cut' | 'delete' | 'duplicate'
  | 'zoomIn' | 'zoomOut' | 'fit' | 'grid' | 'pan' | 'select' | 'connect'
  | 'bus' | 'busSlack' | 'busPV' | 'busPQ' | 'line' | 'transformer' | 'generator'
  | 'load' | 'shunt' | 'motor' | 'breaker' | 'relay' | 'fuse' | 'meter' | 'battery' | 'wind' | 'solar' | 'facts'
  | 'powerflow' | 'cpf' | 'opf' | 'fault' | 'stability' | 'time' | 'results'
  | 'report' | 'settings' | 'help' | 'about' | 'search' | 'chevronDown' | 'chevronRight'
  | 'play' | 'check' | 'warning' | 'close' | 'plus' | 'refresh' | 'chart' | 'table' | 'csv'
  | 'lightning' | 'area' | 'folder' | 'project' | 'eye' | 'menu'
  | 'panelLeft' | 'panelRight' | 'panelBottom';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const paths: Record<IconName, React.ReactNode> = {
  new: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M12 12v6M9 15h6" /></>,
  open: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></>,
  save: <><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3" /><path d="M8 14h8v7H8z" /></>,
  saveAs: <><path d="M5 3h9l3 3v9" /><path d="M8 3v6h7V3" /><path d="M4 14h9v7H4z" /><path d="M16 15v6M13 18h6" /></>,
  export: <><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M4 15v5h16v-5" /></>,
  print: <><path d="M7 8V3h10v5" /><path d="M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2z" /><path d="M7 16h10" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h9a7 7 0 0 1 0 14H8" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9h-9a7 7 0 0 0 0 14h5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></>,
  paste: <><path d="M9 4h6v3H9z" /><path d="M8 5H6a1 1 0 0 0-1 1v14h14V6a1 1 0 0 0-1-1h-2" /></>,
  cut: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 8l12 10M8 16L20 6" /></>,
  delete: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></>,
  duplicate: <><rect x="3" y="3" width="12" height="12" rx="1" /><path d="M9 21h11a1 1 0 0 0 1-1V9" /></>,
  zoomIn: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" /></>,
  zoomOut: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21M7.5 10.5h6" /></>,
  fit: <><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5" /></>,
  grid: <><path d="M3 3h18v18H3z" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>,
  pan: <><path d="M12 3v18M3 12h18" /><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  select: <><path d="M5 3l14 9-6 1.5L10 20z" /></>,
  connect: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 7l10 10" /></>,
  bus: <><path d="M3 12h18" /><path d="M6 12v5M12 12v5M18 12v5" /></>,
  busSlack: <><path d="M3 12h18" /><path d="M4 12l5-4M4 12l5 4" /><circle cx="17" cy="12" r="2" /></>,
  busPV: <><path d="M3 12h18" /><circle cx="12" cy="12" r="3" /></>,
  busPQ: <><path d="M3 12h18" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>,
  line: <><path d="M3 18L21 6" /><circle cx="3" cy="18" r="1.6" /><circle cx="21" cy="6" r="1.6" /></>,
  transformer: <><path d="M3 12h5M16 12h5" /><circle cx="10" cy="12" r="3" /><circle cx="14" cy="12" r="3" /></>,
  generator: <><circle cx="12" cy="12" r="8" /><path d="M9 16V8l3 5 3-5v8" /></>,
  load: <><path d="M12 3v12" /><path d="M7 15l5 6 5-6" /></>,
  shunt: <><path d="M12 3v7M12 14v7" /><path d="M6 10h12M6 14h12" /></>,
  motor: <><circle cx="12" cy="12" r="8" /><path d="M9 15V9h4a2 2 0 0 1 0 4H9" /></>,
  breaker: <><path d="M3 12h6M15 12h6" /><rect x="9" y="7" width="6" height="10" rx="1" /><path d="M11 10l2 2" /></>,
  fuse: <><path d="M3 12h5M16 12h5" /><rect x="8" y="8" width="8" height="8" rx="1" /><path d="M8 12h8" /></>,
  meter: <><circle cx="12" cy="12" r="8" /><path d="M8 15l3-5 2 3 3-5" /></>,
  relay: <><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M8 18v2M16 18v2" /><path d="M8 10h8M8 13h5" /></>,
  battery: <><rect x="3" y="7" width="16" height="10" rx="1" /><path d="M21 10v4" /><path d="M6 10v4M9 10v4" /></>,
  wind: <><circle cx="12" cy="12" r="2" /><path d="M12 10V3M13.7 13l6 3.5M10.3 13l-6 3.5" /></>,
  solar: <><path d="M4 15h16l-2-9H6z" /><path d="M12 15v6M8 18h8" /><path d="M12 3V1" /></>,
  facts: <><path d="M4 12h4M16 12h4" /><rect x="8" y="7" width="8" height="10" rx="1" /><path d="M11 10l2 4M13 10l-2 4" /></>,
  powerflow: <><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></>,
  cpf: <><path d="M3 20V4M3 20h18" /><path d="M4 18c4 0 6-2 7-6s2-8 6-8" /><circle cx="17" cy="4" r="1.5" /></>,
  opf: <><path d="M3 20V4M3 20h18" /><path d="M6 16l4-5 3 3 6-8" /><path d="M16 6h3v3" /></>,
  fault: <><path d="M12 2L3 13h6l-1 9 10-13h-6z" /><path d="M4 21l16-18" /></>,
  stability: <><path d="M3 20V4M3 20h18" /><path d="M4 16c3 0 3-10 6-10s3 10 6 10 3-6 5-6" /></>,
  time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  results: <><path d="M4 3h16v18H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  report: <><path d="M6 2h9l4 4v16H6z" /><path d="M15 2v4h4" /><path d="M9 11h7M9 15h7M9 7h3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h5l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7v.5" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></>,
  about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="0.7" fill="currentColor" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
  chevronDown: <><path d="M6 9l6 6 6-6" /></>,
  chevronRight: <><path d="M9 6l6 6-6 6" /></>,
  play: <><path d="M6 4l14 8-14 8z" /></>,
  check: <><path d="M4 12l5 5L20 6" /></>,
  warning: <><path d="M12 3l9 17H3z" /><path d="M12 9v5" /><circle cx="12" cy="17" r="0.7" fill="currentColor" /></>,
  close: <><path d="M5 5l14 14M19 5L5 19" /></>,
  plus: <><path d="M12 4v16M4 12h16" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2 6" /><path d="M20 4v7h-7" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="5" width="3" height="12" /></>,
  table: <><rect x="3" y="4" width="18" height="16" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>,
  csv: <><path d="M6 2h9l4 4v16H6z" /><path d="M15 2v4h4" /><path d="M9 12h1.5M9 16h1.5M13 12h2M13 16h2" /></>,
  lightning: <><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></>,
  area: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></>,
  folder: <><path d="M3 6h6l2 2h10v11H3z" /></>,
  project: <><path d="M4 4h7l2 3h7v13H4z" /><path d="M8 12h8M8 16h5" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  panelLeft: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M9 4v16" /></>,
  panelRight: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M15 4v16" /></>,
  panelBottom: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 15h18" /></>,
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
