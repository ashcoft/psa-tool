'use client';

import Icon, { IconName } from './Icon';

export interface RibbonButton {
  id: string;
  label: string;
  icon: IconName;
  action: string;
  size?: 'large' | 'small';
  shortcut?: string;
  toggleKey?: string;
  requires?: 'selection' | 'undo' | 'redo' | 'paste';
}

export interface RibbonGroup {
  id: string;
  label: string;
  buttons: RibbonButton[];
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: RibbonGroup[];
}

export const ribbonTabs: RibbonTab[] = [
  {
    id: 'home',
    label: 'Home',
    groups: [
      {
        id: 'file',
        label: 'Project',
        buttons: [
          { id: 'new', label: 'New', icon: 'new', action: 'new', size: 'large', shortcut: 'Ctrl+N' },
          { id: 'open', label: 'Open', icon: 'open', action: 'open', size: 'large', shortcut: 'Ctrl+O' },
          { id: 'save', label: 'Save', icon: 'save', action: 'save', size: 'large', shortcut: 'Ctrl+S' },
          { id: 'save-as', label: 'Save As', icon: 'saveAs', action: 'save-as', size: 'small' },
          { id: 'close-project', label: 'Close', icon: 'close', action: 'close-project', size: 'small' },
          { id: 'export', label: 'Export', icon: 'export', action: 'export', size: 'small' },
        ],
      },
      {
        id: 'edit',
        label: 'Edit',
        buttons: [
          { id: 'undo', label: 'Undo', icon: 'undo', action: 'undo', size: 'large', shortcut: 'Ctrl+Z', requires: 'undo' },
          { id: 'redo', label: 'Redo', icon: 'redo', action: 'redo', size: 'large', shortcut: 'Ctrl+Y', requires: 'redo' },
          { id: 'cut', label: 'Cut', icon: 'cut', action: 'cut', size: 'small', shortcut: 'Ctrl+X', requires: 'selection' },
          { id: 'copy', label: 'Copy', icon: 'copy', action: 'copy', size: 'small', shortcut: 'Ctrl+C', requires: 'selection' },
          { id: 'paste', label: 'Paste', icon: 'paste', action: 'paste', size: 'small', shortcut: 'Ctrl+V', requires: 'paste' },
          { id: 'duplicate', label: 'Duplicate', icon: 'duplicate', action: 'duplicate', size: 'small', requires: 'selection' },
          { id: 'delete', label: 'Delete', icon: 'delete', action: 'delete', size: 'small', shortcut: 'Del', requires: 'selection' },
          { id: 'select-all', label: 'Select All', icon: 'select', action: 'select-all', size: 'small', shortcut: 'Ctrl+A' },
        ],
      },
      {
        id: 'view',
        label: 'View',
        buttons: [
          { id: 'select', label: 'Select', icon: 'select', action: 'tool-select', size: 'small', toggleKey: 'tool-select' },
          { id: 'pan', label: 'Pan', icon: 'pan', action: 'tool-pan', size: 'small', toggleKey: 'tool-pan' },
          { id: 'zoom-in', label: 'Zoom In', icon: 'zoomIn', action: 'zoom-in', size: 'small', shortcut: 'Ctrl++' },
          { id: 'zoom-out', label: 'Zoom Out', icon: 'zoomOut', action: 'zoom-out', size: 'small', shortcut: 'Ctrl+-' },
          { id: 'fit', label: 'Fit', icon: 'fit', action: 'fit', size: 'small', shortcut: 'Ctrl+0' },
          { id: 'grid', label: 'Grid', icon: 'grid', action: 'toggle-grid', size: 'small', toggleKey: 'grid' },
          { id: 'sidebar', label: 'Left Pane', icon: 'panelLeft', action: 'toggle-sidebar', size: 'small', toggleKey: 'sidebar' },
          { id: 'properties', label: 'Right Pane', icon: 'panelRight', action: 'toggle-properties', size: 'small', toggleKey: 'properties' },
          { id: 'toolbar', label: 'Toolbar', icon: 'panelBottom', action: 'toggle-toolbar', size: 'small', toggleKey: 'toolbar' },
          { id: 'menubar', label: 'Menu Bar', icon: 'menu', action: 'toggle-menubar', size: 'small', toggleKey: 'menubar' },
          { id: 'arrange', label: 'Arrange', icon: 'area', action: 'arrange', size: 'small' },
        ],
      },
      {
        id: 'study',
        label: 'Study',
        buttons: [
          { id: 'run-lf', label: 'Load Flow', icon: 'powerflow', action: 'run-powerflow', size: 'large', shortcut: 'F5' },
          { id: 'run-sc', label: 'Short Circuit', icon: 'fault', action: 'run-fault', size: 'large', shortcut: 'F7' },
          { id: 'run-ts', label: 'Time Domain', icon: 'time', action: 'run-timeseries', size: 'large', shortcut: 'F9' },
          { id: 'results', label: 'Results', icon: 'results', action: 'open-results', size: 'large', shortcut: 'F10' },
        ],
      },
      {
        id: 'project',
        label: 'Utilities',
        buttons: [
          { id: 'samples', label: 'Samples', icon: 'folder', action: 'samples', size: 'small' },
          { id: 'validate', label: 'Check Model', icon: 'check', action: 'validate', size: 'small' },
          { id: 'options', label: 'Options', icon: 'settings', action: 'settings', size: 'small' },
        ],
      },
    ],
  },
  {
    id: 'components',
    label: 'Components',
    groups: [
      {
        id: 'buses',
        label: 'Buses',
        buttons: [
          { id: 'bus-slack', label: 'Slack Bus', icon: 'busSlack', action: 'add-slack', size: 'large' },
          { id: 'bus-pv', label: 'PV Bus', icon: 'busPV', action: 'add-pv', size: 'large' },
          { id: 'bus-pq', label: 'PQ Bus', icon: 'busPQ', action: 'add-pq', size: 'large' },
        ],
      },
      {
        id: 'branches',
        label: 'Branches',
        buttons: [
          { id: 'line', label: 'Line', icon: 'line', action: 'tool-line', size: 'large', toggleKey: 'tool-line' },
          { id: 'transformer', label: 'Transformer', icon: 'transformer', action: 'tool-transformer', size: 'large', toggleKey: 'tool-transformer' },
        ],
      },
      {
        id: 'devices',
        label: 'Devices',
        buttons: [
          { id: 'generator', label: 'Generator', icon: 'generator', action: 'add-generator', size: 'large' },
          { id: 'load', label: 'Load', icon: 'load', action: 'add-load', size: 'large' },
          { id: 'shunt', label: 'Shunt', icon: 'shunt', action: 'add-shunt', size: 'large' },
        ],
      },
      {
        id: 'layout',
        label: 'Layout',
        buttons: [
          { id: 'arrange-c', label: 'Auto Arrange', icon: 'area', action: 'arrange', size: 'small' },
          { id: 'fit-c', label: 'Fit View', icon: 'fit', action: 'fit', size: 'small' },
          { id: 'grid-c', label: 'Grid', icon: 'grid', action: 'toggle-grid', size: 'small', toggleKey: 'grid' },
          { id: 'names-c', label: 'Labels', icon: 'eye', action: 'toggle-names', size: 'small', toggleKey: 'names' },
        ],
      },
      {
        id: 'edit-components',
        label: 'Edit',
        buttons: [
          { id: 'props', label: 'Properties', icon: 'settings', action: 'focus-properties', size: 'small', requires: 'selection' },
          { id: 'duplicate-c', label: 'Duplicate', icon: 'duplicate', action: 'duplicate', size: 'small', requires: 'selection' },
          { id: 'delete-c', label: 'Delete', icon: 'delete', action: 'delete', size: 'small', requires: 'selection' },
        ],
      },
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    groups: [
      {
        id: 'studies',
        label: 'Studies',
        buttons: [
          { id: 'lf', label: 'Load Flow', icon: 'powerflow', action: 'run-powerflow', size: 'large', shortcut: 'F5' },
          { id: 'cpf', label: 'Continuation PF', icon: 'cpf', action: 'run-cpf', size: 'large', shortcut: 'F6' },
          { id: 'opf', label: 'Optimal PF', icon: 'opf', action: 'run-opf', size: 'large', shortcut: 'F8' },
          { id: 'sc', label: 'Short Circuit', icon: 'fault', action: 'run-fault', size: 'large', shortcut: 'F7' },
          { id: 'stability', label: 'Stability', icon: 'stability', action: 'run-stability', size: 'large' },
          { id: 'ts', label: 'Time Domain', icon: 'time', action: 'run-timeseries', size: 'large', shortcut: 'F9' },
        ],
      },
      {
        id: 'options',
        label: 'Study Options',
        buttons: [
          { id: 'method', label: 'Solution Options', icon: 'settings', action: 'settings', size: 'small' },
          { id: 'validate-a', label: 'Check Model', icon: 'check', action: 'validate', size: 'small' },
          { id: 'clear', label: 'Clear Results', icon: 'refresh', action: 'clear-results', size: 'small' },
        ],
      },
      {
        id: 'view-results',
        label: 'Results',
        buttons: [
          { id: 'results-a', label: 'Results', icon: 'results', action: 'open-results', size: 'large', shortcut: 'F10' },
          { id: 'csv', label: 'Export CSV', icon: 'csv', action: 'export-csv', size: 'large' },
          { id: 'report', label: 'Report', icon: 'report', action: 'report', size: 'large' },
        ],
      },
    ],
  },
  {
    id: 'results',
    label: 'Results',
    groups: [
      {
        id: 'results-open',
        label: 'Results',
        buttons: [
          { id: 'open', label: 'Open Results', icon: 'results', action: 'open-results', size: 'large' },
          { id: 'csv-r', label: 'Export CSV', icon: 'csv', action: 'export-csv', size: 'large' },
          { id: 'report-r', label: 'Report', icon: 'report', action: 'report', size: 'large' },
        ],
      },
      {
        id: 'display',
        label: 'Display',
        buttons: [
          { id: 'voltages', label: 'Voltages', icon: 'powerflow', action: 'toggle-voltage', size: 'small', toggleKey: 'voltage' },
          { id: 'flows', label: 'Flows', icon: 'chart', action: 'toggle-flow', size: 'small', toggleKey: 'flow' },
          { id: 'names', label: 'Labels', icon: 'eye', action: 'toggle-names', size: 'small', toggleKey: 'names' },
          { id: 'grid-r', label: 'Grid', icon: 'grid', action: 'toggle-grid', size: 'small', toggleKey: 'grid' },
        ],
      },
      {
        id: 'history',
        label: 'Study History',
        buttons: [
          { id: 'history-open', label: 'History', icon: 'time', action: 'open-history', size: 'large' },
          { id: 'clear-r', label: 'Clear', icon: 'delete', action: 'clear-results', size: 'large' },
        ],
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    groups: [
      {
        id: 'project-tools',
        label: 'Project',
        buttons: [
          { id: 'samples-t', label: 'Samples', icon: 'folder', action: 'samples', size: 'large' },
          { id: 'validate-t', label: 'Check Model', icon: 'check', action: 'validate', size: 'large' },
          { id: 'options-t', label: 'Options', icon: 'settings', action: 'settings', size: 'large' },
        ],
      },
      {
        id: 'specialty',
        label: 'Specialty Studies',
        buttons: [
          { id: 'arc-flash', label: 'Arc Flash', icon: 'fault', action: 'specialty-arcflash', size: 'large' },
          { id: 'motor-start', label: 'Motor Start', icon: 'motor', action: 'specialty-motor', size: 'large' },
          { id: 'harmonics', label: 'Harmonics', icon: 'facts', action: 'specialty-harmonics', size: 'large' },
          { id: 'protection', label: 'Protection', icon: 'relay', action: 'specialty-protection', size: 'large' },
          { id: 'ground-grid', label: 'Ground Grid', icon: 'area', action: 'specialty-groundgrid', size: 'large' },
        ],
      },
      {
        id: 'data',
        label: 'Data',
        buttons: [
          { id: 'open-t', label: 'Import', icon: 'open', action: 'open', size: 'small' },
          { id: 'export-t', label: 'Export Project', icon: 'export', action: 'export', size: 'small' },
          { id: 'csv-t', label: 'Export CSV', icon: 'csv', action: 'export-csv', size: 'small' },
          { id: 'print-t', label: 'Print', icon: 'print', action: 'print', size: 'small' },
        ],
      },
      {
        id: 'help-tools',
        label: 'Help',
        buttons: [
          { id: 'shortcuts', label: 'Shortcuts', icon: 'help', action: 'shortcuts', size: 'small' },
          { id: 'about-t', label: 'About', icon: 'about', action: 'about', size: 'small' },
        ],
      },
    ],
  },
];

interface RibbonProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onAction: (action: string) => void;
  toggles?: Record<string, boolean>;
  hasSelection?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  canPaste?: boolean;
}

export default function Ribbon({
  activeTab,
  onTabChange,
  onAction,
  toggles = {},
  hasSelection = false,
  canUndo = false,
  canRedo = false,
  canPaste = false,
}: RibbonProps) {
  const currentTab = ribbonTabs.find(tab => tab.id === activeTab) ?? ribbonTabs[0];

  const isDisabled = (button: RibbonButton): boolean => {
    switch (button.requires) {
      case 'selection':
        return !hasSelection;
      case 'undo':
        return !canUndo;
      case 'redo':
        return !canRedo;
      case 'paste':
        return !canPaste;
      default:
        return false;
    }
  };

  return (
    <div className="flex flex-col border-b border-[#c9d2dd] bg-[#f3f5f8]" data-testid="ribbon">
      <div className="flex items-end gap-0.5 bg-[#e8edf4] px-2 pt-1" role="tablist" aria-label="Ribbon tabs">
        {ribbonTabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`ribbon-tab ${activeTab === tab.id ? 'ribbon-tab-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-[86px] items-stretch overflow-x-auto bg-white px-1 py-1" role="tabpanel">
        {currentTab.groups.map(group => (
          <div key={group.id} className="ribbon-group">
            <div className="flex flex-wrap items-start gap-0.5">
              {group.buttons.map(button => {
                const pressed = button.toggleKey ? Boolean(toggles[button.toggleKey]) : false;
                return (
                  <button
                    key={button.id}
                    type="button"
                    className={`ribbon-button ${button.size === 'small' ? 'ribbon-button-sm' : ''} ${
                      pressed ? 'border-[#7fa9d8] bg-[#dbe7f6]' : ''
                    }`}
                    onClick={() => onAction(button.action)}
                    disabled={isDisabled(button)}
                    title={`${button.label}${button.shortcut ? ` (${button.shortcut})` : ''}`}
                    data-action={button.action}
                    aria-pressed={button.toggleKey ? pressed : undefined}
                  >
                    <Icon name={button.icon} size={button.size === 'small' ? 15 : 22} />
                    <span>{button.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="ribbon-group-label">{group.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
