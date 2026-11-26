'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import TitleBar from '@/components/TitleBar';
import Ribbon from '@/components/Ribbon';
import Toolbar from '@/components/Toolbar';
import Sidebar from '@/components/Sidebar';
import PropertiesPanel from '@/components/PropertiesPanel';
import OutputWindow from '@/components/OutputWindow';
import SettingsDialog from '@/components/SettingsDialog';
import SpecialtyDialog, { SpecialtyTab } from '@/components/SpecialtyDialog';
import SampleDialog from '@/components/SampleDialog';
import ResultsDialog from '@/components/ResultsDialog';
import ReportDialog from '@/components/ReportDialog';
import { AboutDialog, ShortcutsDialog, ValidationDialog } from '@/components/InfoDialogs';
import Canvas, { CanvasHandle, CanvasTool } from '@/components/Canvas';
import Icon from '@/components/Icon';
import { Bus, PowerSystem } from '@/types';
import { useProject, Selection, ElementKind, selectionKey } from '@/lib/useProject';
import { AppSettings, defaultSettings, loadSettings, saveSettings } from '@/lib/settings';
import { buildDemoSystem, buildSample } from '@/lib/samples';
import { ComponentDefinition, buildGenericComponent, getComponentDefinition } from '@/lib/component-catalog';
import { findNearestBusIdWithin } from '@/lib/component-utils';
import {
  deserializeProject,
  downloadFile,
  emptySystem,
  findFreePosition,
  safeFileName,
  serializeProject,
  systemStats,
} from '@/lib/project';
import { runStudy as executeStudy, StudyKind, StudyRun } from '@/lib/studies';
import { studyToCSV } from '@/lib/results-export';
import '@/app/globals.css';

function useViewportWidth(): number {
  return useSyncExternalStore(
    onChange => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => window.innerWidth,
    () => 1280
  );
}

type DialogKind = 'settings' | 'samples' | 'results' | 'about' | 'shortcuts' | 'validation' | null;

interface Toast {
  type: 'success' | 'error' | 'info';
  text: string;
}

interface SelectionState {
  items: Selection[];
  primary: Selection;
}

const studyLabels: Record<StudyKind, string> = {
  powerflow: 'Load Flow',
  cpf: 'Continuation Power Flow',
  opf: 'Optimal Power Flow',
  fault: 'Short Circuit',
  stability: 'Small-Signal Stability',
  timeseries: 'Time-Domain Simulation',
};

/** Grid distance within which a dropped device attaches to an existing bus. */
const ATTACH_RADIUS = 1.5;

export default function Home() {
  const project = useProject(buildDemoSystem());
  const [selectionState, setSelectionState] = useState<SelectionState>({
    items: [],
    primary: { type: null, id: null },
  });
  const selection = selectionState.primary;
  const selections = selectionState.items;
  const [tool, setTool] = useState<CanvasTool>('select');
  const [pendingBranch, setPendingBranch] = useState<ComponentDefinition | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [activeTab, setActiveTab] = useState('home');
  const [runs, setRuns] = useState<StudyRun[]>([]);
  const [runSystems, setRunSystems] = useState<Record<string, PowerSystem>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [specialtyTab, setSpecialtyTab] = useState<SpecialtyTab | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [mobileProperties, setMobileProperties] = useState(false);
  const viewportWidth = useViewportWidth();
  const narrowSidebar = viewportWidth < 768;
  const narrowProperties = viewportWidth < 1024;
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([
    'Power System Analysis Tool (PSA) ready. Demo 4-bus system loaded.',
    'Use the Components tab or drag components onto the diagram to build a network.',
    'Drag placed buses and components to reposition them; hold Alt for free placement.',
  ]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selection: Selection } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<CanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectGeneration = useRef(0);

  const setSelection = useCallback((next: Selection) => {
    setSelectionState({
      items: next.type && next.id ? [next] : [],
      primary: next,
    });
  }, []);

  const selectMany = useCallback((items: Selection[], additive = false) => {
    setSelectionState(prev => {
      const map = new Map((additive ? prev.items : []).map(item => [selectionKey(item), item]));
      items.forEach(item => {
        if (item.type && item.id) map.set(selectionKey(item), item);
      });
      const next = [...map.values()];
      return { items: next, primary: next.at(-1) ?? { type: null, id: null } };
    });
  }, []);

  const toggleSelection = useCallback((hit: Selection) => {
    if (!hit.type || !hit.id) return;
    setSelectionState(prev => {
      const key = selectionKey(hit);
      const exists = prev.items.some(item => selectionKey(item) === key);
      const items = exists
        ? prev.items.filter(item => selectionKey(item) !== key)
        : [...prev.items, hit];
      return {
        items,
        primary: exists ? items.at(-1) ?? { type: null, id: null } : hit,
      };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionState({ items: [], primary: { type: null, id: null } });
  }, []);

  const setPrimary = useCallback((hit: Selection) => {
    if (!hit.type || !hit.id) return;
    setSelectionState(prev => {
      const key = selectionKey(hit);
      if (prev.items.some(item => selectionKey(item) === key)) {
        return { ...prev, primary: hit };
      }
      return { items: [hit], primary: hit };
    });
  }, []);

  const log = useCallback((text: string) => {
    setMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`].slice(-400));
  }, []);

  useEffect(() => {
    // Settings live in localStorage, which is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (settingsLoaded) saveSettings(settings);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!project.dirty) return;
    const remind = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', remind);
    return () => {
      window.removeEventListener('beforeunload', remind);
    };
  }, [project.dirty]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  const stats = useMemo(() => systemStats(project.system), [project.system]);
  const activeRun = runs.find(run => run.id === activeRunId) ?? runs[runs.length - 1] ?? null;
  // Overlays are only valid for the model the study ran on. useProject clones the
  // system on every edit, so reference equality marks a stale result.
  const activeRunIsCurrent = activeRun !== null && runSystems[activeRun.id] === project.system;
  const powerFlowOverlay =
    activeRunIsCurrent && activeRun.kind === 'powerflow' ? activeRun.data : null;
  const faultOverlay = activeRunIsCurrent && activeRun.kind === 'fault' ? activeRun.data : null;
  const reportRun = runs.find(run => run.id === reportRunId) ?? null;
  const latestFaultRun = [...runs].reverse().find(run => run.kind === 'fault');
  const latestFaultStudy = latestFaultRun?.kind === 'fault' ? latestFaultRun.data : null;
  const errorCount = project.issues.filter(issue => issue.severity === 'error').length;

  const allSelections = useMemo<Selection[]>(() => {
    const system = project.system;
    return [
      ...system.buses.map(item => ({ type: 'bus' as const, id: item.id })),
      ...system.lines.map(item => ({ type: 'line' as const, id: item.id })),
      ...system.transformers.map(item => ({ type: 'transformer' as const, id: item.id })),
      ...system.generators.map(item => ({ type: 'generator' as const, id: item.id })),
      ...system.loads.map(item => ({ type: 'load' as const, id: item.id })),
      ...(system.shunts ?? []).map(item => ({ type: 'shunt' as const, id: item.id })),
      ...(system.components ?? []).map(item => ({ type: 'component' as const, id: item.id })),
    ];
  }, [project.system]);

  const selectAll = useCallback(() => {
    if (allSelections.length === 0) return;
    selectMany(allSelections);
    log(`Selected ${allSelections.length} elements.`);
  }, [allSelections, log, selectMany]);

  const selectedBusId = useCallback((): string | null => {
    if (!selection.id) return project.system.buses[0]?.id ?? null;
    switch (selection.type) {
      case 'bus':
        return selection.id;
      case 'generator':
        return project.system.generators.find(item => item.id === selection.id)?.bus ?? null;
      case 'load':
        return project.system.loads.find(item => item.id === selection.id)?.bus ?? null;
      case 'shunt':
        return (project.system.shunts ?? []).find(item => item.id === selection.id)?.bus ?? null;
      default:
        return project.system.buses[0]?.id ?? null;
    }
  }, [project.system, selection]);

  const runStudy = useCallback(
    (kind: StudyKind) => {
      if (busy) return;
      if (project.system.buses.length === 0) {
        log('Cannot run a study: the project has no buses.');
        setToast({ type: 'error', text: 'Add at least one bus before running a study.' });
        return;
      }
      if (errorCount > 0) {
        log(`Cannot run ${studyLabels[kind]}: ${project.issues.find(issue => issue.severity === 'error')?.message}`);
        setDialog('validation');
        return;
      }

      setBusy(true);
      log(`Running ${studyLabels[kind]}...`);
      const generation = projectGeneration.current;
      window.setTimeout(() => {
        if (generation !== projectGeneration.current) {
          setBusy(false);
          return;
        }
        try {
          const run = executeStudy(kind, project.system, settings);
          setRuns(prev => [...prev, run]);
          setRunSystems(prev => ({ ...prev, [run.id]: project.system }));
          setActiveRunId(run.id);
          run.messages.forEach(message => log(message));
          log(`${run.title}: ${run.summary}`);
          log(
            kind === 'powerflow' || kind === 'fault'
              ? 'Results are drawn on the diagram. Open Results for tables, or Report for a full report.'
              : 'Open Results for tables and charts, or Report for a full report.'
          );
          setToast({
            type: run.status === 'success' ? 'success' : 'error',
            text: `${run.title}: ${run.summary}`,
          });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          log(`Study failed: ${text}`);
          setToast({ type: 'error', text: `Study failed: ${text}` });
        } finally {
          setBusy(false);
        }
      }, 40);
    },
    [busy, errorCount, log, project.issues, project.system, settings]
  );

  const saveProject = useCallback(
    (name?: string) => {
      const finalName = (name ?? project.name).trim() || 'Untitled Project';
      const payload = serializeProject({ ...project.system, name: finalName }, finalName);
      const filename = safeFileName(finalName, 'psa');
      downloadFile(filename, payload, 'application/json');
      project.markSaved();
      log(`Project saved as ${filename}`);
      setToast({ type: 'success', text: `Saved ${filename}` });
    },
    [log, project]
  );

  const confirmDiscard = useCallback(
    (action: string): boolean => {
      if (!project.dirty) return true;
      if (typeof window === 'undefined') return true;
      return window.confirm(`The current project has unsaved changes. Discard them and ${action}?`);
    },
    [project.dirty]
  );

  const newProject = useCallback(() => {
    if (!confirmDiscard('create a new project')) return;
    projectGeneration.current += 1;
    project.replaceSystem(emptySystem('Untitled Project'));
    setRevision(value => value + 1);
    setRuns([]);
    setRunSystems({});
    setActiveRunId(null);
    setSelection({ type: null, id: null });
    setTool('select');
    log('New project created.');
    setToast({ type: 'info', text: 'New project created' });
  }, [confirmDiscard, log, project, setSelection]);

  const openProject = useCallback(() => {
    if (!confirmDiscard('open another project')) return;
    fileInputRef.current?.click();
  }, [confirmDiscard]);

  const loadProjectFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const { system, name } = deserializeProject(text);
        projectGeneration.current += 1;
        project.replaceSystem(system, name);
        setRevision(value => value + 1);
        setRuns([]);
        setRunSystems({});
        setActiveRunId(null);
        setSelection({ type: null, id: null });
        setTool('select');
        log(`Opened project "${name}" (${system.buses.length} buses).`);
        setToast({ type: 'success', text: `Opened ${name}` });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        log(`Open failed: ${text}`);
        setToast({ type: 'error', text: `Open failed: ${text}` });
      }
    },
    [log, project, setSelection]
  );

  const loadSample = useCallback(
    (id: string) => {
      if (!confirmDiscard('load a sample system')) return;
      const system = buildSample(id);
      projectGeneration.current += 1;
      project.replaceSystem(system, system.name);
      setRevision(value => value + 1);
      setRuns([]);
      setRunSystems({});
      setActiveRunId(null);
      setSelection({ type: null, id: null });
      setTool('select');
      log(`Loaded sample system "${system.name}".`);
      setToast({ type: 'success', text: `Loaded ${system.name}` });
    },
    [confirmDiscard, log, project, setSelection]
  );

  const closeProject = useCallback(() => {
    if (!confirmDiscard('close the project')) return;
    projectGeneration.current += 1;
    project.replaceSystem(emptySystem('Untitled Project'));
    setRevision(value => value + 1);
    setRuns([]);
    setRunSystems({});
    setActiveRunId(null);
    setSelection({ type: null, id: null });
    setTool('select');
    log('Project closed. Open a .psa file or create a new project.');
    setToast({ type: 'info', text: 'Project closed' });
  }, [confirmDiscard, log, project, setSelection]);

  const addBus = useCallback(
    (type: Bus['type'], position?: { x: number; y: number }) => {
      const bus = project.addBus(type, position);
      if (bus) {
        setSelection({ type: 'bus', id: bus.id });
        log(`Added ${type} bus "${bus.name}".`);
        setToast({ type: 'success', text: `Added ${type} bus` });
      }
    },
    [log, project, setSelection]
  );

  const addDevice = useCallback(
    (kind: 'generator' | 'load' | 'shunt') => {
      let busId = selectedBusId();
      if (!busId) {
        const bus = project.addBus('slack');
        busId = bus?.id ?? null;
        if (bus) log(`Created slack bus "${bus.name}" for the new ${kind}.`);
      }
      if (!busId) {
        log(`Cannot add ${kind}: no bus available.`);
        return;
      }
      project.addDevice(kind, busId);
      log(`Added ${kind} at bus ${busId}.`);
      setToast({ type: 'success', text: `Added ${kind}` });
    },
    [log, project, selectedBusId]
  );

  const resolveDeviceBus = useCallback(
    (position?: { x: number; y: number }): string | null => {
      if (position) {
        const existing = findNearestBusIdWithin(project.system, position, ATTACH_RADIUS);
        if (existing) return existing;
        const hasSlack = project.system.buses.some(bus => bus.type === 'slack');
        const busType: Bus['type'] = project.system.buses.length === 0 || !hasSlack ? 'slack' : 'pq';
        const bus = project.addBus(busType, position);
        if (bus) log(`Created ${busType} bus "${bus.name}" at the drop point.`);
        return bus?.id ?? null;
      }
      const selected = selectedBusId();
      if (selected) return selected;
      const bus = project.addBus('slack');
      if (bus) log(`Created slack bus "${bus.name}" for the new device.`);
      return bus?.id ?? null;
    },
    [log, project, selectedBusId]
  );

  const addCatalogComponent = useCallback(
    (definitionId: string, position?: { x: number; y: number }) => {
      const definition = getComponentDefinition(definitionId);
      if (!definition) {
        log(`Unknown component "${definitionId}".`);
        return;
      }

      if (definition.model === 'bus') {
        const bus = project.addBus(definition.busType ?? 'pq', position, {
          name: definition.label,
          subtype: definition.busKind,
          symbol: definition.symbol,
        });
        if (bus) {
          setSelection({ type: 'bus', id: bus.id });
          log(`Added ${definition.label} bus "${bus.name}".`);
          setToast({ type: 'success', text: `Added ${definition.label}` });
        }
        return;
      }

      if (definition.model === 'line' || definition.model === 'transformer') {
        setPendingBranch(definition);
        setTool(definition.model === 'transformer' ? 'transformer' : 'line');
        setActiveTab('components');
        log(`Select two buses to place the ${definition.label}.`);
        return;
      }

      if (definition.model === 'generator' || definition.model === 'load' || definition.model === 'shunt') {
        const busId = resolveDeviceBus(position);
        if (!busId) {
          log(`Cannot add ${definition.label}: no bus available.`);
          return;
        }
        const overrides =
          definition.model === 'generator'
            ? definition.generatorDefaults
            : definition.model === 'load'
              ? definition.loadDefaults
              : definition.shuntDefaults;
        project.addDevice(definition.model, busId, overrides);
        log(`Added ${definition.label} at bus ${busId}.`);
        setToast({ type: 'success', text: `Added ${definition.label}` });
        return;
      }

      let busId: string | undefined;
      if (definition.attach === 'bus') {
        busId = position
          ? findNearestBusIdWithin(project.system, position, ATTACH_RADIUS)
          : selectedBusId() ?? undefined;
      }

      let spot = position;
      if (!spot) {
        if (busId) {
          const bus = project.system.buses.find(item => item.id === busId);
          const count = (project.system.components ?? []).filter(item => item.bus === busId).length;
          spot = bus
            ? { x: bus.x + 0.7 + (count % 3) * 0.45, y: bus.y + 0.7 + Math.floor(count / 3) * 0.45 }
            : { x: 0, y: 0 };
        } else {
          spot = findFreePosition(project.system);
        }
      }

      const created = project.addComponent(buildGenericComponent(definition, spot, busId));
      setSelection({ type: 'component', id: created.id });
      log(`Added ${definition.label}${busId ? ` at bus ${busId}` : ''}.`);
      setToast({ type: 'success', text: `Added ${definition.label}` });
    },
    [log, project, resolveDeviceBus, selectedBusId, setSelection]
  );

  const handleBranchConnect = useCallback(
    (fromBus: string, toBus: string) => {
      const kind = pendingBranch?.model === 'transformer' || tool === 'transformer' ? 'transformer' : 'line';
      const overrides = pendingBranch
        ? pendingBranch.model === 'transformer'
          ? pendingBranch.transformerDefaults
          : pendingBranch.lineDefaults
        : undefined;
      project.addBranch(kind, fromBus, toBus, overrides);
      log(`Added ${pendingBranch?.label ?? kind} from ${fromBus} to ${toBus}.`);
      setToast({ type: 'success', text: `Added ${pendingBranch?.label ?? kind}` });
      setPendingBranch(null);
      setTool('select');
    },
    [log, pendingBranch, project, tool]
  );

  const handleDropComponent = useCallback(
    (kind: string, position: { x: number; y: number }) => {
      if (kind.startsWith('component:')) {
        addCatalogComponent(kind.slice('component:'.length), position);
        return;
      }
      if (kind.startsWith('bus-')) {
        const type = kind.slice(4) as Bus['type'];
        addBus(type, position);
        return;
      }
      if (kind === 'line' || kind === 'transformer') {
        setTool(kind);
        setActiveTab('components');
        log(`Select two buses on the diagram to create the ${kind}.`);
        return;
      }
      if (kind === 'generator' || kind === 'load' || kind === 'shunt') {
        const busId = resolveDeviceBus(position);
        if (busId) {
          project.addDevice(kind, busId);
          log(`Added ${kind} at bus ${busId}.`);
          setToast({ type: 'success', text: `Added ${kind}` });
        }
        return;
      }
      log(`Component "${kind}" is a protection/measurement device. It is considered in the Short Circuit study.`);
    },
    [addBus, addCatalogComponent, log, project, resolveDeviceBus]
  );

  const deleteSelection = useCallback(() => {
    canvasRef.current?.cancelGesture();
    const candidates = selections.length > 0 ? selections : [selection];
    const targets = candidates.filter(
      (item): item is { type: ElementKind; id: string } => Boolean(item.type && item.id)
    );
    if (targets.length === 0) return;
    project.deleteElements(targets);
    clearSelection();
    log(`Deleted ${targets.length} element${targets.length === 1 ? '' : 's'}.`);
  }, [clearSelection, log, project, selection, selections]);

  const deletePrimarySelection = useCallback(() => {
    if (!selection.type || !selection.id) return;
    canvasRef.current?.cancelGesture();
    project.deleteElement(selection.type, selection.id);
    clearSelection();
    log(`Deleted ${selection.type} ${selection.id}.`);
  }, [clearSelection, log, project, selection]);

  const duplicateSelection = useCallback(() => {
    if (!selection.type || !selection.id) return;
    project.duplicateElement(selection.type, selection.id);
    log(`Duplicated ${selection.type} ${selection.id}.`);
  }, [log, project, selection]);

  const copySelection = useCallback(() => {
    if (!selection.type || !selection.id) return;
    project.copyElement(selection.type, selection.id);
    log(`Copied ${selection.type} ${selection.id}.`);
  }, [log, project, selection]);

  const cutSelection = useCallback(() => {
    if (!selection.type || !selection.id) return;
    canvasRef.current?.cancelGesture();
    project.copyElement(selection.type, selection.id);
    project.deleteElement(selection.type, selection.id);
    setSelection({ type: null, id: null });
    log(`Cut ${selection.type}.`);
  }, [log, project, selection, setSelection]);

  const exportCSV = useCallback(() => {
    if (!activeRun) {
      log('No results to export. Run a study first.');
      return;
    }
    const filename = safeFileName(`${project.name}-${activeRun.kind}`, 'csv');
    downloadFile(filename, studyToCSV(activeRun, project.system), 'text/csv');
    log(`Exported results to ${filename}.`);
    setToast({ type: 'success', text: `Exported ${filename}` });
  }, [activeRun, log, project.name, project.system]);

  const toggleSetting = useCallback(
    (
      key:
        | 'showSidebar'
        | 'showProperties'
        | 'showToolbar'
        | 'showGrid'
        | 'showBusNames'
        | 'showVoltageOverlay'
        | 'showFlowOverlay'
    ) => {
      const next = { ...settings, [key]: !settings[key] };
      setSettings(next);
      saveSettings(next);
    },
    [settings]
  );

  const toggleSidebar = useCallback(() => {
    if (narrowSidebar) {
      setMobileSidebar(value => !value);
      return;
    }
    setMobileSidebar(false);
    toggleSetting('showSidebar');
  }, [narrowSidebar, toggleSetting]);

  const toggleProperties = useCallback(() => {
    if (narrowProperties) {
      setMobileProperties(value => !value);
      return;
    }
    setMobileProperties(false);
    toggleSetting('showProperties');
  }, [narrowProperties, toggleSetting]);

  const showPropertiesPane = useCallback(() => {
    if (narrowProperties) {
      setMobileProperties(true);
      return;
    }
    if (!settings.showProperties) toggleSetting('showProperties');
  }, [narrowProperties, settings.showProperties, toggleSetting]);

  const handleAction = (action: string) => {
    setContextMenu(null);
    if (action.startsWith('component:')) {
      addCatalogComponent(action.slice('component:'.length));
      return;
    }
    switch (action) {
      case 'new':
        newProject();
        break;
      case 'open':
        openProject();
        break;
      case 'close-project':
        closeProject();
        break;
      case 'save':
        saveProject();
        break;
      case 'save-as': {
        const name = typeof window !== 'undefined' ? window.prompt('Save project as', project.name) : null;
        if (name && name.trim()) {
          project.setName(name.trim());
          saveProject(name.trim());
        }
        break;
      }
      case 'export':
        downloadFile(
          safeFileName(project.name, 'psa'),
          serializeProject(project.system, project.name),
          'application/json'
        );
        log(`Exported project ${project.name}.`);
        break;
      case 'samples':
        setDialog('samples');
        break;
      case 'undo':
        project.undo();
        setRunSystems({});
        setSelection({ type: null, id: null });
        setRevision(value => value + 1);
        log('Undo.');
        break;
      case 'redo':
        project.redo();
        setRunSystems({});
        setSelection({ type: null, id: null });
        setRevision(value => value + 1);
        log('Redo.');
        break;
      case 'copy':
        copySelection();
        break;
      case 'cut':
        cutSelection();
        break;
      case 'paste':
        project.pasteElement();
        log('Pasted element.');
        break;
      case 'duplicate':
        duplicateSelection();
        break;
      case 'delete':
        deleteSelection();
        break;
      case 'select-all':
        selectAll();
        break;
      case 'tool-select':
        setTool('select');
        break;
      case 'tool-pan':
        setTool('pan');
        break;
      case 'tool-line':
        setPendingBranch(null);
        setTool('line');
        setActiveTab('components');
        log('Line tool active: click the first bus, then the second bus.');
        break;
      case 'tool-transformer':
        setPendingBranch(null);
        setTool('transformer');
        setActiveTab('components');
        log('Transformer tool active: click the first bus, then the second bus.');
        break;
      case 'zoom-in':
        canvasRef.current?.zoomIn();
        break;
      case 'zoom-out':
        canvasRef.current?.zoomOut();
        break;
      case 'fit':
        canvasRef.current?.fit();
        break;
      case 'arrange':
        project.autoArrange();
        log('Auto-arranged the one-line diagram.');
        break;
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'toggle-properties':
        toggleProperties();
        break;
      case 'toggle-toolbar':
        toggleSetting('showToolbar');
        break;
      case 'toggle-grid':
        toggleSetting('showGrid');
        break;
      case 'toggle-names':
        toggleSetting('showBusNames');
        break;
      case 'toggle-voltage':
        toggleSetting('showVoltageOverlay');
        break;
      case 'toggle-flow':
        toggleSetting('showFlowOverlay');
        break;
      case 'add-slack':
        addBus('slack');
        break;
      case 'add-pv':
        addBus('pv');
        break;
      case 'add-pq':
        addBus('pq');
        break;
      case 'add-generator':
        addDevice('generator');
        break;
      case 'add-load':
        addDevice('load');
        break;
      case 'add-shunt':
        addDevice('shunt');
        break;
      case 'add-note':
        log('Breakers, relays and meters are protection devices used by the Short Circuit study.');
        setToast({ type: 'info', text: 'Protection devices are handled by the Short Circuit study' });
        break;
      case 'run-powerflow':
        runStudy('powerflow');
        break;
      case 'run-cpf':
        runStudy('cpf');
        break;
      case 'run-opf':
        runStudy('opf');
        break;
      case 'run-fault':
        runStudy('fault');
        break;
      case 'run-stability':
        runStudy('stability');
        break;
      case 'run-timeseries':
        runStudy('timeseries');
        break;
      case 'open-results':
        if (runs.length === 0) {
          log('No study results yet. Run a study first.');
        } else {
          setDialog('results');
        }
        break;
      case 'open-history':
        setDialog('results');
        break;
      case 'clear-results':
        setRuns([]);
        setRunSystems({});
        setActiveRunId(null);
        log('Cleared all study results.');
        break;
      case 'export-csv':
        exportCSV();
        break;
      case 'report':
        if (activeRun) setReportRunId(activeRun.id);
        else {
          log('No results available for a report. Run a study first.');
          setToast({ type: 'error', text: 'Run a study before generating a report' });
        }
        break;
      case 'print':
        if (typeof window !== 'undefined') window.print();
        break;
      case 'specialty-arcflash':
        setSpecialtyTab('arcflash');
        break;
      case 'specialty-motor':
        setSpecialtyTab('motor');
        break;
      case 'specialty-harmonics':
        setSpecialtyTab('harmonics');
        break;
      case 'specialty-protection':
        setSpecialtyTab('protection');
        break;
      case 'specialty-groundgrid':
        setSpecialtyTab('groundgrid');
        break;
      case 'validate':
        setDialog('validation');
        log(
          project.issues.length === 0
            ? 'Model check passed.'
            : `Model check found ${project.issues.length} issue(s).`
        );
        break;
      case 'settings':
        setDialog('settings');
        break;
      case 'shortcuts':
        setDialog('shortcuts');
        break;
      case 'about':
        setDialog('about');
        break;
      case 'focus-properties':
        showPropertiesPane();
        log('Edit the selected element in the Properties panel.');
        break;
      case 'escape':
        canvasRef.current?.cancelGesture();
        setPendingBranch(null);
        setTool('select');
        setDialog(null);
        setContextMenu(null);
        clearSelection();
        break;
      default:
        log(`Action "${action}" is not available.`);
    }
  };

  const actionRef = useRef(handleAction);

  useEffect(() => {
    actionRef.current = handleAction;
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]') && event.key !== 'Escape') return;
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl) {
        const keyLower = event.key.toLowerCase();
        if (event.shiftKey && keyLower === 'b') {
          event.preventDefault();
          actionRef.current('toggle-properties');
          return;
        }
        if (event.shiftKey && keyLower === 't') {
          event.preventDefault();
          actionRef.current('toggle-toolbar');
          return;
        }
        const key = keyLower;
        const map: Record<string, string> = {
          n: 'new',
          o: 'open',
          s: 'save',
          z: 'undo',
          y: 'redo',
          c: 'copy',
          v: 'paste',
          x: 'cut',
          d: 'duplicate',
          a: 'select-all',
          b: 'toggle-sidebar',
          '0': 'fit',
          '=': 'zoom-in',
          '+': 'zoom-in',
          '-': 'zoom-out',
        };
        const action = map[key];
        if (action) {
          event.preventDefault();
          actionRef.current(action);
        }
        return;
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          actionRef.current('delete');
          break;
        case 'F5':
          event.preventDefault();
          actionRef.current('run-powerflow');
          break;
        case 'F6':
          event.preventDefault();
          actionRef.current('run-cpf');
          break;
        case 'F7':
          event.preventDefault();
          actionRef.current('run-fault');
          break;
        case 'F8':
          event.preventDefault();
          actionRef.current('run-opf');
          break;
        case 'F9':
          event.preventDefault();
          actionRef.current('run-timeseries');
          break;
        case 'F10':
          event.preventDefault();
          actionRef.current('open-results');
          break;
        case 'Escape':
          actionRef.current('escape');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggles = {
    'tool-select': tool === 'select',
    'tool-pan': tool === 'pan',
    'tool-line': tool === 'line',
    'tool-transformer': tool === 'transformer',
    sidebar: narrowSidebar ? mobileSidebar : settings.showSidebar,
    properties: narrowProperties ? mobileProperties : settings.showProperties,
    toolbar: settings.showToolbar,
    grid: settings.showGrid,
    names: settings.showBusNames,
    voltage: settings.showVoltageOverlay,
    flow: settings.showFlowOverlay,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#eef1f5] text-slate-800">
      <TitleBar
        projectName={project.name}
        dirty={project.dirty}
        canUndo={project.canUndo}
        canRedo={project.canRedo}
        onAction={handleAction}
        onRename={name => {
          project.setName(name);
          log(`Renamed project to "${name}".`);
        }}
      />

      <Ribbon
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAction={handleAction}
        toggles={toggles}
        hasSelection={selections.length > 0}
        canUndo={project.canUndo}
        canRedo={project.canRedo}
        canPaste={project.canPaste}
      />

      <Toolbar
        method={settings.method}
        onMethodChange={method => {
          const next = { ...settings, method };
          setSettings(next);
          saveSettings(next);
          log(`Load flow method set to ${method}.`);
        }}
        onRunPowerFlow={() => runStudy('powerflow')}
        onRunFault={() => runStudy('fault')}
        onRunTimeSeries={() => runStudy('timeseries')}
        onOpenResults={() => setDialog('results')}
        onOpenSettings={() => setDialog('settings')}
        isProcessing={busy}
        hasResults={runs.length > 0}
        resultSummary={activeRun ? `${activeRun.title}: ${activeRun.summary}` : undefined}
        issueCount={project.issues.length}
        visible={settings.showToolbar}
        onToggleVisible={() => {
          toggleSetting('showToolbar');
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          system={project.system}
          selection={selection}
          onSelect={setSelection}
          onAction={handleAction}
          visible={settings.showSidebar}
          mobileVisible={mobileSidebar}
          onToggle={toggleSidebar}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 border-y border-[#d5dde7] bg-white">
            <Canvas
              ref={canvasRef}
              system={project.system}
              selections={selections}
              tool={tool}
              results={powerFlowOverlay}
              faultResults={faultOverlay}
              showGrid={settings.showGrid}
              snapToGrid={settings.snapToGrid}
              showBusNames={settings.showBusNames}
              showVoltageOverlay={settings.showVoltageOverlay}
              showFlowOverlay={settings.showFlowOverlay}
              onSelect={(hit, additive) => {
                if (additive) toggleSelection(hit);
                else setSelection(hit);
              }}
              onElementClick={hit => {
                if (hit.type && hit.id) showPropertiesPane();
              }}
              onSelectMany={selectMany}
              onMoveStart={project.beginMove}
              onMoveEnd={project.endMove}
              onMoveElements={project.moveElements}
              onBranchConnect={handleBranchConnect}
              onDropComponent={handleDropComponent}
              onContextMenu={(hit, x, y) => {
                if (hit.type && hit.id) setPrimary(hit);
                setContextMenu({ x, y, selection: hit });
              }}
              onCursorMove={setCursor}
              onDoubleClickElement={() => {
                /* selection already updates the properties panel */
              }}
              fitKey={revision}
            />

            <button
              className="absolute bottom-2 left-2 z-30 rounded border border-[#c9d2dd] bg-white px-2 py-1 text-[10.5px] font-medium text-[#1f4d85] shadow md:hidden"
              data-testid="mobile-components-toggle"
              onClick={() => setMobileSidebar(value => !value)}
            >
              {mobileSidebar ? 'Hide components' : 'Components'}
            </button>

            <div className="absolute left-2 top-2 flex items-center gap-1 rounded border border-[#d5dde7] bg-white/95 px-1 py-0.5 shadow-sm">
              <button
                className={`rounded p-1 ${tool === 'select' ? 'bg-[#dbe7f6] text-[#1f4d85]' : 'text-slate-600 hover:bg-slate-100'}`}
                title="Select tool"
                onClick={() => setTool('select')}
              >
                <Icon name="select" size={14} />
              </button>
              <button
                className={`rounded p-1 ${tool === 'pan' ? 'bg-[#dbe7f6] text-[#1f4d85]' : 'text-slate-600 hover:bg-slate-100'}`}
                title="Pan tool"
                onClick={() => setTool('pan')}
              >
                <Icon name="pan" size={14} />
              </button>
              <div className="mx-0.5 h-4 w-px bg-slate-200" />
              <button className="rounded p-1 text-slate-600 hover:bg-slate-100" title="Zoom in" onClick={() => canvasRef.current?.zoomIn()}>
                <Icon name="zoomIn" size={14} />
              </button>
              <button className="rounded p-1 text-slate-600 hover:bg-slate-100" title="Zoom out" onClick={() => canvasRef.current?.zoomOut()}>
                <Icon name="zoomOut" size={14} />
              </button>
              <button className="rounded p-1 text-slate-600 hover:bg-slate-100" title="Fit to window" onClick={() => canvasRef.current?.fit()}>
                <Icon name="fit" size={14} />
              </button>
            </div>

            <div className="pointer-events-none absolute right-2 top-2 rounded bg-white/90 px-2 py-0.5 text-[10px] text-slate-500 shadow-sm">
              {stats.buses} buses · {stats.lines + stats.transformers} branches
              {tool !== 'select' && <span className="ml-2 font-medium text-[#1f4d85]">Tool: {tool}</span>}
            </div>

            {contextMenu && (
              <div
                className="context-menu"
                style={{
                  left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 200),
                  top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 240),
                }}
                onMouseDown={event => event.stopPropagation()}
              >
                <button
                  disabled={!contextMenu.selection.type}
                  onClick={() => {
                    handleAction('focus-properties');
                    setContextMenu(null);
                  }}
                >
                  <Icon name="settings" size={12} /> Properties
                </button>
                <button
                  disabled={!contextMenu.selection.type}
                  onClick={() => {
                    handleAction('duplicate');
                    setContextMenu(null);
                  }}
                >
                  <Icon name="duplicate" size={12} /> Duplicate
                </button>
                <button
                  disabled={!contextMenu.selection.type}
                  onClick={() => {
                    handleAction('delete');
                    setContextMenu(null);
                  }}
                >
                  <Icon name="delete" size={12} /> Delete
                </button>
                {contextMenu.selection.type === 'bus' && (
                  <>
                    <div className="menu-sep" />
                    <button
                      onClick={() => {
                        setSelection(contextMenu.selection);
                        setTool('line');
                        setContextMenu(null);
                        log('Line tool active: select the second bus.');
                      }}
                    >
                      <Icon name="line" size={12} /> Start line from this bus
                    </button>
                    <button
                      onClick={() => {
                        setSelection(contextMenu.selection);
                        addDevice('generator');
                        setContextMenu(null);
                      }}
                    >
                      <Icon name="generator" size={12} /> Add generator
                    </button>
                    <button
                      onClick={() => {
                        setSelection(contextMenu.selection);
                        addDevice('load');
                        setContextMenu(null);
                      }}
                    >
                      <Icon name="load" size={12} /> Add load
                    </button>
                    <button
                      onClick={() => {
                        setSelection(contextMenu.selection);
                        addDevice('shunt');
                        setContextMenu(null);
                      }}
                    >
                      <Icon name="shunt" size={12} /> Add shunt
                    </button>
                  </>
                )}
                <div className="menu-sep" />
                <button
                  onClick={() => {
                    canvasRef.current?.fit();
                    setContextMenu(null);
                  }}
                >
                  <Icon name="fit" size={12} /> Fit view
                </button>
              </div>
            )}
          </div>

          <OutputWindow messages={messages} onClear={() => setMessages([])} />
        </main>

        <PropertiesPanel
          key={`${selection.type ?? 'none'}:${selection.id ?? 'none'}:${revision}`}
          system={project.system}
          selection={selection}
          results={activeRun?.kind === 'powerflow' ? activeRun.data : null}
          issues={project.issues}
          onChange={(kind, element) => {
            if (!kind) return;
            project.updateElement(kind, element);
          }}
          onDelete={deletePrimarySelection}
          onDuplicate={duplicateSelection}
          onMetaChange={changes => project.updateSystemMeta(changes)}
          onSelect={setSelection}
          visible={settings.showProperties}
          mobileVisible={mobileProperties}
          onToggle={toggleProperties}
        />
      </div>

      <div className="flex items-center justify-between border-t border-[#c9d2dd] bg-[#eef2f7] px-2 py-0.5 text-[10.5px] text-slate-600" data-testid="statusbar">
        <div className="flex items-center gap-3">
          <span>Buses: {stats.buses}</span>
          <span>Lines: {stats.lines}</span>
          <span>Transformers: {stats.transformers}</span>
          <span>Loads: {stats.loads}</span>
          <span>Generators: {stats.generators}</span>
          <span>Shunts: {stats.shunts}</span>
          <span>Components: {stats.components}</span>
          <span>Selected: {selections.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {cursor && <span className="font-mono text-slate-500">X {cursor.x.toFixed(0)} Y {cursor.y.toFixed(0)}</span>}
          <span>Base: {project.system.baseMVA} MVA</span>
          <span>Frequency: {project.system.baseFreq} Hz</span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${busy ? 'bg-amber-500' : activeRun?.status === 'failed' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
            {busy ? 'Running...' : activeRun ? activeRun.summary : 'Ready'}
          </span>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".psa,.json,application/json"
        className="hidden"
        aria-label="Open project file"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void loadProjectFile(file);
          event.target.value = '';
        }}
      />

      {dialog === 'settings' && (
        <SettingsDialog
          settings={settings}
          system={project.system}
          onSave={next => {
            setSettings(next);
            saveSettings(next);
            log('Study options saved.');
            setToast({ type: 'success', text: 'Settings saved' });
          }}
          onMetaChange={changes => project.updateSystemMeta(changes)}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'samples' && <SampleDialog onLoad={loadSample} onClose={() => setDialog(null)} />}

      {specialtyTab && (
        <SpecialtyDialog
          system={project.system}
          faultStudy={latestFaultStudy}
          initialTab={specialtyTab}
          onClose={() => setSpecialtyTab(null)}
        />
      )}

      {dialog === 'results' && (
        <ResultsDialog
          runs={runs}
          activeRunId={activeRun?.id ?? null}
          system={project.system}
          onSelectRun={setActiveRunId}
          onClose={() => setDialog(null)}
          onExportCSV={run => {
            const filename = safeFileName(`${project.name}-${run.kind}`, 'csv');
            downloadFile(filename, studyToCSV(run, project.system), 'text/csv');
            log(`Exported results to ${filename}.`);
          }}
          onReport={run => {
            setReportRunId(run.id);
            setDialog(null);
          }}
          onClearResults={() => {
            setRuns([]);
            setRunSystems({});
            setActiveRunId(null);
            setDialog(null);
            log('Cleared all study results.');
          }}
        />
      )}

      {reportRun && <ReportDialog run={reportRun} system={project.system} onClose={() => setReportRunId(null)} />}

      {dialog === 'validation' && (
        <ValidationDialog
          issues={project.issues}
          onClose={() => setDialog(null)}
          onSelect={elementId => {
            const type = project.system.buses.some(bus => bus.id === elementId)
              ? 'bus'
              : project.system.lines.some(line => line.id === elementId)
                ? 'line'
                : project.system.transformers.some(txf => txf.id === elementId)
                  ? 'transformer'
                  : project.system.generators.some(gen => gen.id === elementId)
                    ? 'generator'
                    : project.system.loads.some(load => load.id === elementId)
                      ? 'load'
                      : 'shunt';
            setSelection({ type, id: elementId });
            setDialog(null);
          }}
        />
      )}

      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}

      {toast && (
        <div
          className={`psat-fade-in fixed bottom-7 right-3 z-[90] flex items-center gap-2 rounded border px-3 py-1.5 text-[11.5px] shadow-lg ${
            toast.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : toast.type === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-800'
                : 'border-slate-300 bg-white text-slate-700'
          }`}
          role="status"
        >
          <Icon name={toast.type === 'success' ? 'check' : toast.type === 'error' ? 'warning' : 'about'} size={13} />
          {toast.text}
        </div>
      )}
    </div>
  );
}
