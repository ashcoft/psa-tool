'use client';

import { useMemo, useState } from 'react';
import { ComponentCategory, PowerSystem } from '@/types';
import { Selection } from '@/lib/useProject';
import { systemStats } from '@/lib/project';
import {
  COMPONENT_CATEGORIES,
  getComponentDefinition,
  getComponentsByCategory,
} from '@/lib/component-catalog';
import { componentCategoryShort } from '@/lib/component-utils';
import Icon, { IconName } from './Icon';
import SymbolPreview from './SymbolPreview';

interface SidebarProps {
  system: PowerSystem;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAction: (action: string) => void;
  visible?: boolean;
  mobileVisible?: boolean;
  onToggle?: () => void;
}

function sidebarClass(visible: boolean, mobileVisible: boolean): string {
  return [
    'w-[236px] shrink-0 flex-col border-r border-[#c9d2dd] bg-[#f7f9fc]',
    mobileVisible
      ? 'max-md:flex max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl'
      : 'max-md:hidden',
    visible ? 'md:flex' : 'md:hidden',
  ].join(' ');
}

const groupColors = new Map<string, string>([
  ['Buses', '#b91c1c'],
  ['Sources', '#15803d'],
  ['Branches', '#1d4ed8'],
  ['Loads & Motors', '#0369a1'],
  ['Protection & Switching', '#be123c'],
  ['Conversion', '#7c3aed'],
  ['Meters', '#0f766e'],
  ['Relays', '#c2410c'],
  ['Generator Controls', '#6d28d9'],
  ['System Controls', '#6d28d9'],
  ['Grounding', '#4d7c0f'],
  ['Composite', '#475569'],
  ['Connectors', '#475569'],
]);

function paletteColor(category: ComponentCategory, group: string): string {
  const groupColor = groupColors.get(group);
  if (groupColor) return groupColor;
  switch (category) {
    case 'DC':
      return '#b45309';
    case 'Instrument':
      return '#0f766e';
    case 'Control':
      return '#6d28d9';
    case 'Other':
      return '#475569';
    default:
      return '#1d4ed8';
  }
}

const kindLabels: Record<string, string> = {
  bus: 'Buses',
  line: 'Lines',
  transformer: 'Transformers',
  generator: 'Generators',
  load: 'Loads',
  shunt: 'Shunts',
  component: 'Components',
};

const treeIcon: Record<string, IconName> = {
  bus: 'bus',
  line: 'line',
  transformer: 'transformer',
  generator: 'generator',
  load: 'load',
  shunt: 'shunt',
};

export default function Sidebar({
  system,
  selection,
  onSelect,
  onAction,
  visible = true,
  mobileVisible = false,
  onToggle,
}: SidebarProps) {
  const [tab, setTab] = useState<'palette' | 'project'>('palette');
  const [category, setCategory] = useState<ComponentCategory>('AC');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const stats = useMemo(() => systemStats(system), [system]);

  const categoryDefinitions = useMemo(() => getComponentsByCategory(category), [category]);
  const filtered = categoryDefinitions.filter(definition =>
    `${definition.label} ${definition.group} ${definition.id}`.toLowerCase().includes(search.toLowerCase())
  );
  const groups = useMemo(() => Array.from(new Set(filtered.map(definition => definition.group))), [filtered]);

  const components = system.components ?? [];
  const sections: { kind: keyof typeof kindLabels; items: { id: string; label: string; sub?: string }[] }[] = [
    { kind: 'bus', items: system.buses.map(bus => ({ id: bus.id, label: bus.name, sub: bus.subtype ?? bus.type })) },
    { kind: 'line', items: system.lines.map(line => ({ id: line.id, label: line.name ?? line.id, sub: `${line.fromBus}-${line.toBus}` })) },
    { kind: 'transformer', items: system.transformers.map(txf => ({ id: txf.id, label: txf.name ?? txf.id, sub: `${txf.fromBus}-${txf.toBus}` })) },
    { kind: 'generator', items: system.generators.map(gen => ({ id: gen.id, label: gen.name ?? gen.id, sub: `${gen.pg.toFixed(1)} MW` })) },
    { kind: 'load', items: system.loads.map(load => ({ id: load.id, label: load.name ?? load.id, sub: `${load.pl.toFixed(1)} MW` })) },
    { kind: 'shunt', items: (system.shunts ?? []).map(shunt => ({ id: shunt.id, label: shunt.name ?? shunt.id, sub: `${shunt.b.toFixed(3)} pu` })) },
    { kind: 'component', items: components.map(component => ({ id: component.id, label: component.name, sub: component.category })) },
  ];

  const toggleSection = (kind: string) => {
    setCollapsed(prev => ({ ...prev, [kind]: !prev[kind] }));
  };

  return (
    <aside className={sidebarClass(visible, mobileVisible)} data-testid="sidebar">
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
        {onToggle && (
          <button
            className="ml-auto rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            title="Hide left pane (Ctrl+B)"
            aria-label="Hide left pane"
            onClick={onToggle}
          >
            <Icon name="panelLeft" size={13} />
          </button>
        )}
      </div>

      {tab === 'palette' && (
        <>
          <div className="border-b border-[#e2e8f0] px-1.5 pt-1.5">
            <div className="flex flex-wrap gap-0.5">
              {COMPONENT_CATEGORIES.map(item => (
                <button
                  key={item.id}
                  onClick={() => setCategory(item.id)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    category === item.id ? 'bg-[#1f4d85] text-white' : 'bg-slate-200/70 text-slate-600 hover:bg-slate-300'
                  }`}
                  title={item.label}
                >
                  {item.short}
                </button>
              ))}
            </div>
            <div className="relative mt-1.5 pb-1.5">
              <span className="pointer-events-none absolute left-1.5 top-1.5 text-slate-400">
                <Icon name="search" size={12} />
              </span>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={`Search ${COMPONENT_CATEGORIES.find(item => item.id === category)?.short ?? ''} components`}
                className="w-full rounded border border-slate-300 bg-white py-1 pl-6 pr-2 text-[11px]"
                aria-label="Search components"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5">
            {groups.map(group => {
              const items = filtered.filter(definition => definition.group === group);
              return (
                <div key={group} className="mb-2">
                  <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{group}</div>
                  <div className="palette-grid grid grid-cols-4 gap-1">
                    {items.map(definition => (
                      <button
                        key={definition.id}
                        draggable
                        onDragStart={event => {
                          event.dataTransfer.setData('application/x-psat-component', `component:${definition.id}`);
                          event.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => onAction(`component:${definition.id}`)}
                        className="palette-tile flex h-9 items-center justify-center rounded border border-transparent bg-white shadow-sm hover:border-[#7fa9d8] hover:bg-[#eaf2fb]"
                        title={`${definition.label} — ${definition.description ?? 'drag onto the diagram'}`}
                        aria-label={definition.label}
                        data-component-id={definition.id}
                      >
                        <SymbolPreview
                          symbol={definition.symbol}
                          fallbackLabel={componentCategoryShort(definition.category)}
                          color={paletteColor(definition.category, definition.group)}
                          size={22}
                        />
                        <span className="palette-label text-center text-[9px] leading-tight">{definition.label}</span>
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
                      const definition = section.kind === 'component' ? getComponentDefinition(components.find(c => c.id === item.id)?.type ?? '') : undefined;
                      return (
                        <button
                          key={item.id}
                          className={`tree-item ${selected ? 'tree-item-selected' : ''}`}
                          onClick={() => onSelect({ type: section.kind as Selection['type'], id: item.id })}
                          title={`${item.label} (${item.id})`}
                        >
                          <Icon
                            name={definition?.icon ?? treeIcon[section.kind] ?? 'facts'}
                            size={11}
                            className="shrink-0 text-slate-500"
                          />
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
          <span>{stats.components} components</span>
        </div>
      </div>
    </aside>
  );
}
