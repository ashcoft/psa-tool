'use client';

import { useMemo, useState } from 'react';
import { PowerSystem } from '@/types';
import { Selection } from '@/lib/useProject';
import { systemStats } from '@/lib/project';
import Icon, { IconName } from './Icon';

interface PaletteItem {
  id: string;
  label: string;
  icon: IconName;
  action: string;
  dragKind: string;
  category: 'buses' | 'branches' | 'devices';
  keywords: string;
}

const paletteItems: PaletteItem[] = [
  { id: 'slack', label: 'Slack Bus', icon: 'busSlack', action: 'add-slack', dragKind: 'bus-slack', category: 'buses', keywords: 'swing reference generator' },
  { id: 'pv', label: 'PV Bus', icon: 'busPV', action: 'add-pv', dragKind: 'bus-pv', category: 'buses', keywords: 'voltage controlled generator bus' },
  { id: 'pq', label: 'PQ Bus', icon: 'busPQ', action: 'add-pq', dragKind: 'bus-pq', category: 'buses', keywords: 'load bus' },
  { id: 'line', label: 'Line', icon: 'line', action: 'tool-line', dragKind: 'line', category: 'branches', keywords: 'branch cable overhead' },
  { id: 'transformer', label: 'Transformer', icon: 'transformer', action: 'tool-transformer', dragKind: 'transformer', category: 'branches', keywords: 'two winding tap' },
  { id: 'generator', label: 'Generator', icon: 'generator', action: 'add-generator', dragKind: 'generator', category: 'devices', keywords: 'unit machine source' },
  { id: 'load', label: 'Load', icon: 'load', action: 'add-load', dragKind: 'load', category: 'devices', keywords: 'demand consumer' },
  { id: 'shunt', label: 'Shunt', icon: 'shunt', action: 'add-shunt', dragKind: 'shunt', category: 'devices', keywords: 'capacitor reactor compensation' },
  { id: 'motor', label: 'Motor', icon: 'motor', action: 'add-load', dragKind: 'load', category: 'devices', keywords: 'induction motor load' },
  { id: 'breaker', label: 'Breaker', icon: 'breaker', action: 'add-note', dragKind: 'breaker', category: 'devices', keywords: 'protection switch' },
  { id: 'relay', label: 'Relay', icon: 'relay', action: 'add-note', dragKind: 'relay', category: 'devices', keywords: 'protection coordination' },
  { id: 'wind', label: 'Wind Turbine', icon: 'wind', action: 'add-generator', dragKind: 'generator', category: 'devices', keywords: 'renewable der' },
  { id: 'solar', label: 'PV Array', icon: 'solar', action: 'add-generator', dragKind: 'generator', category: 'devices', keywords: 'solar renewable der' },
  { id: 'battery', label: 'Battery', icon: 'battery', action: 'add-generator', dragKind: 'generator', category: 'devices', keywords: 'storage bess' },
];

interface SidebarProps {
  system: PowerSystem;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAction: (action: string) => void;
  forceVisible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const kindLabels: Record<string, string> = {
  bus: 'Buses',
  line: 'Lines',
  transformer: 'Transformers',
  generator: 'Generators',
  load: 'Loads',
  shunt: 'Shunts',
};

export default function Sidebar({ system, selection, onSelect, onAction, forceVisible = false }: SidebarProps) {
  const [tab, setTab] = useState<'palette' | 'project'>('palette');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const stats = useMemo(() => systemStats(system), [system]);

  const filtered = paletteItems.filter(item =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(search.toLowerCase())
  );

  const categories: { id: PaletteItem['category']; label: string; icon: IconName }[] = [
    { id: 'buses', label: 'Buses', icon: 'bus' },
    { id: 'branches', label: 'Branches', icon: 'line' },
    { id: 'devices', label: 'Devices', icon: 'generator' },
  ];

  const sections: { kind: keyof typeof kindLabels; items: { id: string; label: string; sub?: string }[] }[] = [
    {
      kind: 'bus',
      items: system.buses.map(bus => ({ id: bus.id, label: bus.name, sub: bus.type })),
    },
    {
      kind: 'line',
      items: system.lines.map(line => ({ id: line.id, label: line.name ?? line.id, sub: `${line.fromBus}-${line.toBus}` })),
    },
    {
      kind: 'transformer',
      items: system.transformers.map(txf => ({ id: txf.id, label: txf.name ?? txf.id, sub: `${txf.fromBus}-${txf.toBus}` })),
    },
    {
      kind: 'generator',
      items: system.generators.map(gen => ({ id: gen.id, label: gen.name ?? gen.id, sub: `${gen.pg.toFixed(1)} MW` })),
    },
    {
      kind: 'load',
      items: system.loads.map(load => ({ id: load.id, label: load.name ?? load.id, sub: `${load.pl.toFixed(1)} MW` })),
    },
    {
      kind: 'shunt',
      items: (system.shunts ?? []).map(shunt => ({ id: shunt.id, label: shunt.name ?? shunt.id, sub: `${shunt.b.toFixed(3)} pu` })),
    },
  ];

  const toggleSection = (kind: string) => {
    setCollapsed(prev => ({ ...prev, [kind]: !prev[kind] }));
  };

  return (
    <aside className={`${forceVisible ? 'flex' : 'hidden'} w-[236px] shrink-0 flex-col border-r border-[#c9d2dd] bg-[#f7f9fc] md:flex`} data-testid="sidebar">
      <div className="flex items-center gap-1 border-b border-[#d5dde7] bg-[#eef2f7] px-1 py-1">
        <button
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
            tab === 'palette' ? 'bg-white text-[#1f4d85] shadow-sm' : 'text-slate-600 hover:bg-slate-200'
          }`}
          onClick={() => setTab('palette')}
        >
          <Icon name="grid" size={12} /> Components
        </button>
        <button
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
            tab === 'project' ? 'bg-white text-[#1f4d85] shadow-sm' : 'text-slate-600 hover:bg-slate-200'
          }`}
          onClick={() => setTab('project')}
        >
          <Icon name="project" size={12} /> Project
        </button>
      </div>

      {tab === 'palette' && (
        <>
          <div className="border-b border-[#e2e8f0] p-1.5">
            <div className="relative">
              <span className="pointer-events-none absolute left-1.5 top-1.5 text-slate-400">
                <Icon name="search" size={12} />
              </span>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search components"
                className="w-full rounded border border-slate-300 bg-white py-1 pl-6 pr-2 text-[11px]"
                aria-label="Search components"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5">
            {categories.map(category => {
              const items = filtered.filter(item => item.category === category.id);
              if (items.length === 0) return null;
              return (
                <div key={category.id} className="mb-2">
                  <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <Icon name={category.icon} size={11} />
                    {category.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {items.map(item => (
                      <button
                        key={item.id}
                        draggable
                        onDragStart={event => {
                          event.dataTransfer.setData('application/x-psat-component', item.dragKind);
                          event.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => onAction(item.action)}
                        className="group flex flex-col items-center gap-1 rounded border border-transparent bg-white px-1 py-2 text-slate-700 shadow-sm hover:border-[#7fa9d8] hover:bg-[#eaf2fb]"
                        title={`Add ${item.label} (drag onto the diagram to place)`}
                      >
                        <Icon name={item.icon} size={22} className="text-[#1f4d85] group-hover:text-[#0f3a67]" />
                        <span className="text-[10px] leading-tight">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-6 text-center text-[11px] text-slate-400">No matching components</div>
            )}
          </div>
        </>
      )}

      {tab === 'project' && (
        <div className="flex-1 overflow-y-auto py-1">
          {sections.map(section => {
            const isCollapsed = collapsed[section.kind];
            return (
              <div key={section.kind} className="mb-1">
                <button
                  className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-200/60"
                  onClick={() => toggleSection(section.kind)}
                >
                  <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={10} />
                  {kindLabels[section.kind]}
                  <span className="ml-auto rounded bg-slate-200 px-1 text-[9px] font-medium text-slate-600">
                    {section.items.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div>
                    {section.items.length === 0 && (
                      <div className="px-5 py-1 text-[10.5px] italic text-slate-400">None</div>
                    )}
                    {section.items.map(item => {
                      const selected = selection.type === section.kind && selection.id === item.id;
                      return (
                        <button
                          key={item.id}
                          className={`tree-item ${selected ? 'tree-item-selected' : ''}`}
                          onClick={() => onSelect({ type: section.kind as Selection['type'], id: item.id })}
                          title={`${item.label} (${item.id})`}
                        >
                          <Icon name={section.kind === 'bus' ? 'bus' : section.kind === 'line' ? 'line' : section.kind === 'transformer' ? 'transformer' : section.kind === 'generator' ? 'generator' : section.kind === 'load' ? 'load' : 'shunt'} size={11} className="shrink-0 text-slate-500" />
                          <span className="truncate">{item.label}</span>
                          {item.sub && <span className="ml-auto shrink-0 text-[9px] text-slate-400">{item.sub}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-[#d5dde7] bg-[#eef2f7] px-2 py-1.5 text-[10px] text-slate-600">
        <div className="flex justify-between">
          <span>{stats.buses} buses</span>
          <span>{stats.lines + stats.transformers} branches</span>
        </div>
        <div className="flex justify-between">
          <span>{stats.totalLoadMW.toFixed(1)} MW load</span>
          <span>{stats.generators} gens</span>
        </div>
      </div>
    </aside>
  );
}
