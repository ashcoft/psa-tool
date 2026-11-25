'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Bus,
  Generator,
  GenericComponent,
  IECSymbolType,
  Load,
  Line,
  PowerSystem,
  Shunt,
  Transformer,
} from '@/types';
import { cloneSystem, findFreePosition, nextId, validateSystem, ValidationIssue } from './project';

export type ElementKind = 'bus' | 'line' | 'transformer' | 'generator' | 'load' | 'shunt' | 'component';

export interface Selection {
  type: ElementKind | null;
  id: string | null;
}

interface Snapshot {
  system: PowerSystem;
  name: string;
}

interface ProjectState {
  system: PowerSystem;
  name: string;
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
}

interface ClipboardPayload {
  kind: ElementKind;
  element: Bus | Line | Transformer | Generator | Load | Shunt | GenericComponent;
}

const HISTORY_LIMIT = 60;
const COALESCE_MS = 600;

export interface UseProjectResult {
  system: PowerSystem;
  name: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  issues: ValidationIssue[];
  canPaste: boolean;
  setName: (name: string) => void;
  replaceSystem: (system: PowerSystem, name?: string) => void;
  commit: (system: PowerSystem, description: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  updateSystemMeta: (changes: Partial<Pick<PowerSystem, 'baseMVA' | 'baseFreq' | 'name'>>) => void;
  addBus: (type: Bus['type'], position?: { x: number; y: number }, options?: { name?: string; subtype?: string; symbol?: IECSymbolType }) => Bus | null;
  addBranch: (kind: 'line' | 'transformer', fromBus: string, toBus: string, overrides?: Partial<Line> & Partial<Transformer>) => void;
  addDevice: (kind: 'generator' | 'load' | 'shunt', busId: string, overrides?: Partial<Generator> & Partial<Load> & Partial<Shunt>) => void;
  addComponent: (component: Omit<GenericComponent, 'id'>) => GenericComponent;
  updateElement: (kind: ElementKind, element: Bus | Line | Transformer | Generator | Load | Shunt | GenericComponent) => void;
  deleteElement: (kind: ElementKind, id: string) => void;
  duplicateElement: (kind: ElementKind, id: string) => void;
  copyElement: (kind: ElementKind, id: string) => void;
  pasteElement: () => void;
  setBusType: (busId: string, type: Bus['type']) => void;
  beginMove: () => void;
  endMove: () => void;
  moveBus: (busId: string, x: number, y: number) => void;
  moveComponent: (componentId: string, x: number, y: number) => void;
  autoArrange: () => void;
}

function initialProject(system: PowerSystem, name?: string): ProjectState {
  return {
    system,
    name: name ?? system.name ?? 'Untitled Project',
    past: [],
    future: [],
    dirty: false,
  };
}

export function useProject(initialSystem: PowerSystem, initialName?: string): UseProjectResult {
  const [state, setState] = useState<ProjectState>(() => initialProject(initialSystem, initialName));
  const [clipboard, setClipboard] = useState<ClipboardPayload | null>(null);
  const lastCommit = useRef<{ description: string; time: number }>({ description: '', time: 0 });
  const moveSnapshot = useRef<Snapshot | null>(null);

  // Updater functions must stay pure: StrictMode invokes them twice, so the
  // coalescing decision and lastCommit bookkeeping happen in the event handler.
  const beginCommit = useCallback((description: string): boolean => {
    const now = Date.now();
    const coalesce =
      lastCommit.current.description === description && now - lastCommit.current.time < COALESCE_MS;
    lastCommit.current = { description, time: now };
    return coalesce;
  }, []);

  const applyCommit = useCallback(
    (prev: ProjectState, system: PowerSystem, coalesce: boolean): ProjectState => {
      const past =
        coalesce && prev.past.length > 0
          ? prev.past
          : [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT);
      return { ...prev, system, name: system.name ?? prev.name, past, future: [], dirty: true };
    },
    []
  );

  const commit = useCallback(
    (system: PowerSystem, description: string) => {
      const coalesce = beginCommit(description);
      setState(prev => applyCommit(prev, system, coalesce));
    },
    [applyCommit, beginCommit]
  );

  const beginMove = useCallback(() => {
    lastCommit.current = { description: '', time: 0 };
    moveSnapshot.current = { system: state.system, name: state.name };
  }, [state.name, state.system]);

  const endMove = useCallback(() => {
    const snapshot = moveSnapshot.current;
    moveSnapshot.current = null;
    if (!snapshot) return;
    setState(prev => {
      if (prev.system === snapshot.system) return prev;
      return {
        ...prev,
        past: [...prev.past, snapshot].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  }, []);

  const replaceSystem = useCallback((system: PowerSystem, name?: string) => {
    lastCommit.current = { description: '', time: 0 };
    moveSnapshot.current = null;
    setState(initialProject(cloneSystem(system), name));
  }, []);

  const undo = useCallback(() => {
    endMove();
    lastCommit.current = { description: '', time: 0 };
    setState(prev => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        system: previous.system,
        name: previous.name,
        past: prev.past.slice(0, -1),
        future: [{ system: prev.system, name: prev.name }, ...prev.future].slice(0, HISTORY_LIMIT),
        dirty: true,
      };
    });
  }, [endMove]);

  const redo = useCallback(() => {
    endMove();
    lastCommit.current = { description: '', time: 0 };
    setState(prev => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        system: next.system,
        name: next.name,
        past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
        future: prev.future.slice(1),
        dirty: true,
      };
    });
  }, [endMove]);

  const setName = useCallback((name: string) => {
    setState(prev => ({ ...prev, name, system: { ...prev.system, name }, dirty: true }));
  }, []);

  const markSaved = useCallback(() => {
    setState(prev => ({ ...prev, dirty: false }));
  }, []);

  const updateSystemMeta = useCallback((changes: Partial<Pick<PowerSystem, 'baseMVA' | 'baseFreq' | 'name'>>) => {
    setState(prev => ({
      ...prev,
      system: { ...prev.system, ...changes },
      name: changes.name ?? prev.name,
      past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
    }));
  }, []);

  const addBus = useCallback((type: Bus['type'], position?: { x: number; y: number }, options?: { name?: string; subtype?: string; symbol?: IECSymbolType }): Bus | null => {
    const spot = position ?? findFreePosition(state.system);
    const bus: Bus = {
      id: nextId(state.system.buses, 'bus_'),
      name: options?.name ?? `Bus ${state.system.buses.length + 1}`,
      subtype: options?.subtype,
      symbol: options?.symbol,
      type,
      voltage: type === 'pv' ? 1.02 : 1.0,
      angle: 0,
      vmin: 0.9,
      vmax: 1.1,
      area: 1,
      region: 1,
      x: spot.x,
      y: spot.y,
      active: true,
    };
    setState(prev => ({
      ...prev,
      system: { ...prev.system, buses: [...prev.system.buses, bus] },
      past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
    }));
    return bus;
  }, [state.system]);

  const addBranch = useCallback((kind: 'line' | 'transformer', fromBus: string, toBus: string, overrides?: Partial<Line> & Partial<Transformer>) => {
    if (fromBus === toBus) return;
    setState(prev => {
      const system = cloneSystem(prev.system);
      if (kind === 'line') {
        system.lines.push({
          name: `Line ${fromBus}-${toBus}`,
          resistance: 0.01,
          reactance: 0.05,
          susceptance: 0,
          rating: 100,
          length: 10,
          active: true,
          ...overrides,
          id: nextId(system.lines, 'line_'),
          fromBus,
          toBus,
        });
      } else {
        system.transformers.push({
          name: `Transformer ${fromBus}-${toBus}`,
          resistance: 0.001,
          reactance: 0.05,
          tap: 1,
          shift: 0,
          rating: 100,
          active: true,
          ...overrides,
          id: nextId(system.transformers, 'txf_'),
          fromBus,
          toBus,
        });
      }
      return {
        ...prev,
        system,
        past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  }, []);

  const addDevice = useCallback((kind: 'generator' | 'load' | 'shunt', busId: string, overrides?: Partial<Generator> & Partial<Load> & Partial<Shunt>) => {
    setState(prev => {
      const system = cloneSystem(prev.system);
      if (kind === 'generator') {
        const generator: Generator = {
          name: `Generator ${system.generators.length + 1}`,
          pg: 20,
          qg: 0,
          v: 1.0,
          pmax: 100,
          pmin: 0,
          qmax: 50,
          qmin: -50,
          active: true,
          ...overrides,
          id: nextId(system.generators, 'gen_'),
          bus: busId,
        };
        system.generators.push(generator);
      } else if (kind === 'load') {
        const load: Load = {
          name: `Load ${system.loads.length + 1}`,
          pl: 10,
          ql: 5,
          demandModel: 'constant-power',
          active: true,
          ...overrides,
          id: nextId(system.loads, 'load_'),
          bus: busId,
        };
        system.loads.push(load);
      } else {
        const shunt: Shunt = {
          name: `Shunt ${(system.shunts?.length ?? 0) + 1}`,
          g: 0,
          b: 0.05,
          active: true,
          ...overrides,
          id: nextId(system.shunts ?? [], 'shunt_'),
          bus: busId,
        };
        system.shunts = [...(system.shunts ?? []), shunt];
      }
      return {
        ...prev,
        system,
        past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  }, []);

  const addComponent = useCallback((component: Omit<GenericComponent, 'id'>): GenericComponent => {
    const created: GenericComponent = {
      ...component,
      id: nextId(state.system.components ?? [], 'cmp_'),
    };
    setState(prev => ({
      ...prev,
      system: { ...prev.system, components: [...(prev.system.components ?? []), created] },
      past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
    }));
    return created;
  }, [state.system]);

  const updateElement = useCallback(
    (kind: ElementKind, element: Bus | Line | Transformer | Generator | Load | Shunt | GenericComponent) => {
      endMove();
      lastCommit.current = { description: '', time: 0 };
      setState(prev => {
        const system = cloneSystem(prev.system);
        switch (kind) {
          case 'bus':
            system.buses = system.buses.map(item => (item.id === element.id ? (element as Bus) : item));
            break;
          case 'line':
            system.lines = system.lines.map(item => (item.id === element.id ? (element as Line) : item));
            break;
          case 'transformer':
            system.transformers = system.transformers.map(item =>
              item.id === element.id ? (element as Transformer) : item
            );
            break;
          case 'generator':
            system.generators = system.generators.map(item =>
              item.id === element.id ? (element as Generator) : item
            );
            break;
          case 'load':
            system.loads = system.loads.map(item => (item.id === element.id ? (element as Load) : item));
            break;
          case 'shunt':
            system.shunts = (system.shunts ?? []).map(item =>
              item.id === element.id ? (element as Shunt) : item
            );
            break;
          case 'component':
            system.components = (system.components ?? []).map(item =>
              item.id === element.id ? (element as GenericComponent) : item
            );
            break;
        }
        return {
          ...prev,
          system,
          past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
          future: [],
          dirty: true,
        };
      });
    },
    [endMove]
  );

  const deleteElement = useCallback((kind: ElementKind, id: string) => {
    endMove();
    setState(prev => {
      const system = cloneSystem(prev.system);
      switch (kind) {
        case 'bus':
          system.buses = system.buses.filter(item => item.id !== id);
          system.lines = system.lines.filter(item => item.fromBus !== id && item.toBus !== id);
          system.transformers = system.transformers.filter(item => item.fromBus !== id && item.toBus !== id);
          system.generators = system.generators.filter(item => item.bus !== id);
          system.loads = system.loads.filter(item => item.bus !== id);
          system.shunts = (system.shunts ?? []).filter(item => item.bus !== id);
          system.components = (system.components ?? []).filter(
            item => item.bus !== id && item.fromBus !== id && item.toBus !== id
          );
          break;
        case 'line':
          system.lines = system.lines.filter(item => item.id !== id);
          break;
        case 'transformer':
          system.transformers = system.transformers.filter(item => item.id !== id);
          break;
        case 'generator':
          system.generators = system.generators.filter(item => item.id !== id);
          break;
        case 'load':
          system.loads = system.loads.filter(item => item.id !== id);
          break;
        case 'shunt':
          system.shunts = (system.shunts ?? []).filter(item => item.id !== id);
          break;
        case 'component':
          system.components = (system.components ?? []).filter(item => item.id !== id);
          break;
      }
      return {
        ...prev,
        system,
        past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  }, [endMove]);

  const copyElement = useCallback((kind: ElementKind, id: string) => {
    setState(prev => {
      let element: ClipboardPayload['element'] | undefined;
      switch (kind) {
        case 'bus':
          element = prev.system.buses.find(item => item.id === id);
          break;
        case 'line':
          element = prev.system.lines.find(item => item.id === id);
          break;
        case 'transformer':
          element = prev.system.transformers.find(item => item.id === id);
          break;
        case 'generator':
          element = prev.system.generators.find(item => item.id === id);
          break;
        case 'load':
          element = prev.system.loads.find(item => item.id === id);
          break;
        case 'shunt':
          element = (prev.system.shunts ?? []).find(item => item.id === id);
          break;
        case 'component':
          element = (prev.system.components ?? []).find(item => item.id === id);
          break;
      }
      if (element) setClipboard({ kind, element: JSON.parse(JSON.stringify(element)) });
      return prev;
    });
  }, []);

  const pasteElement = useCallback(() => {
    if (!clipboard) return;
    setState(prev => {
      const system = cloneSystem(prev.system);
      const { kind, element } = clipboard;
      switch (kind) {
        case 'bus': {
          const bus = element as Bus;
          system.buses.push({
            ...bus,
            id: nextId(system.buses, 'bus_'),
            name: `${bus.name} copy`,
            x: bus.x + 1.6,
            y: bus.y + 1.6,
          });
          break;
        }
        case 'line': {
          const line = element as Line;
          if (!system.buses.some(bus => bus.id === line.fromBus) || !system.buses.some(bus => bus.id === line.toBus)) {
            return prev;
          }
          system.lines.push({ ...line, id: nextId(system.lines, 'line_'), name: `${line.name ?? line.id} copy` });
          break;
        }
        case 'transformer': {
          const txf = element as Transformer;
          if (!system.buses.some(bus => bus.id === txf.fromBus) || !system.buses.some(bus => bus.id === txf.toBus)) {
            return prev;
          }
          system.transformers.push({ ...txf, id: nextId(system.transformers, 'txf_') });
          break;
        }
        case 'generator': {
          const gen = element as Generator;
          if (!system.buses.some(bus => bus.id === gen.bus)) return prev;
          system.generators.push({ ...gen, id: nextId(system.generators, 'gen_') });
          break;
        }
        case 'load': {
          const load = element as Load;
          if (!system.buses.some(bus => bus.id === load.bus)) return prev;
          system.loads.push({ ...load, id: nextId(system.loads, 'load_') });
          break;
        }
        case 'shunt': {
          const shunt = element as Shunt;
          if (!system.buses.some(bus => bus.id === shunt.bus)) return prev;
          system.shunts = [...(system.shunts ?? []), { ...shunt, id: nextId(system.shunts ?? [], 'shunt_') }];
          break;
        }
        case 'component': {
          const component = element as GenericComponent;
          system.components = [
            ...(system.components ?? []),
            {
              ...component,
              id: nextId(system.components ?? [], 'cmp_'),
              name: `${component.name} copy`,
              x: component.x + 0.6,
              y: component.y + 0.6,
            },
          ];
          break;
        }
      }
      return {
        ...prev,
        system,
        past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  }, [clipboard]);

  const duplicateElement = useCallback((kind: ElementKind, id: string) => {
    setState(prev => {
      const system = cloneSystem(prev.system);
      switch (kind) {
        case 'bus': {
          const bus = system.buses.find(item => item.id === id);
          if (!bus) return prev;
          system.buses.push({
            ...bus,
            id: nextId(system.buses, 'bus_'),
            name: `${bus.name} copy`,
            x: bus.x + 1.6,
            y: bus.y + 1.6,
          });
          break;
        }
        case 'line': {
          const line = system.lines.find(item => item.id === id);
          if (!line) return prev;
          system.lines.push({ ...line, id: nextId(system.lines, 'line_'), name: `${line.name ?? line.id} copy` });
          break;
        }
        case 'transformer': {
          const txf = system.transformers.find(item => item.id === id);
          if (!txf) return prev;
          system.transformers.push({ ...txf, id: nextId(system.transformers, 'txf_') });
          break;
        }
        case 'generator': {
          const gen = system.generators.find(item => item.id === id);
          if (!gen) return prev;
          system.generators.push({ ...gen, id: nextId(system.generators, 'gen_') });
          break;
        }
        case 'load': {
          const load = system.loads.find(item => item.id === id);
          if (!load) return prev;
          system.loads.push({ ...load, id: nextId(system.loads, 'load_') });
          break;
        }
        case 'shunt': {
          const shunt = (system.shunts ?? []).find(item => item.id === id);
          if (!shunt) return prev;
          system.shunts = [...(system.shunts ?? []), { ...shunt, id: nextId(system.shunts ?? [], 'shunt_') }];
          break;
        }
        case 'component': {
          const component = (system.components ?? []).find(item => item.id === id);
          if (!component) return prev;
          system.components = [
            ...(system.components ?? []),
            {
              ...component,
              id: nextId(system.components ?? [], 'cmp_'),
              name: `${component.name} copy`,
              x: component.x + 0.6,
              y: component.y + 0.6,
            },
          ];
          break;
        }
      }
      return {
        ...prev,
        system,
        past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  }, []);

  const setBusType = useCallback((busId: string, type: Bus['type']) => {
    setState(prev => ({
      ...prev,
      system: {
        ...prev.system,
        buses: prev.system.buses.map(bus => (bus.id === busId ? { ...bus, type } : bus)),
      },
      past: [...prev.past, { system: prev.system, name: prev.name }].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
    }));
  }, []);

  const moveBus = useCallback((busId: string, x: number, y: number) => {
    setState(prev => ({
      ...prev,
      system: {
        ...prev.system,
        buses: prev.system.buses.map(bus => (bus.id === busId ? { ...bus, x, y } : bus)),
      },
      dirty: true,
    }));
  }, []);

  const moveComponent = useCallback((componentId: string, x: number, y: number) => {
    setState(prev => ({
      ...prev,
      system: {
        ...prev.system,
        components: (prev.system.components ?? []).map(component =>
          component.id === componentId ? { ...component, x, y } : component
        ),
      },
      dirty: true,
    }));
  }, []);

  const autoArrange = useCallback(() => {
    if (state.system.buses.length === 0) return;
    const coalesce = beginCommit('auto-arrange');
    setState(prev => {
      const system = cloneSystem(prev.system);
      if (system.buses.length === 0) return prev;

      const adjacency = new Map<string, string[]>();
      system.buses.forEach(bus => adjacency.set(bus.id, []));
      [...system.lines, ...system.transformers].forEach(branch => {
        if (branch.active === false) return;
        adjacency.get(branch.fromBus)?.push(branch.toBus);
        adjacency.get(branch.toBus)?.push(branch.fromBus);
      });

      const slack = system.buses.find(bus => bus.type === 'slack') ?? system.buses[0];
      const depth = new Map<string, number>([[slack.id, 0]]);
      const queue = [slack.id];
      while (queue.length > 0) {
        const id = queue.shift() as string;
        const next = (depth.get(id) ?? 0) + 1;
        (adjacency.get(id) ?? []).forEach(neighbor => {
          if (depth.has(neighbor)) return;
          depth.set(neighbor, next);
          queue.push(neighbor);
        });
      }

      const fallbackDepth = Math.max(0, ...depth.values()) + 1;
      system.buses.forEach(bus => {
        if (!depth.has(bus.id)) depth.set(bus.id, fallbackDepth);
      });

      const layers = new Map<number, Bus[]>();
      system.buses.forEach(bus => {
        const level = depth.get(bus.id) ?? 0;
        layers.set(level, [...(layers.get(level) ?? []), bus]);
      });
      layers.forEach((buses, level) => {
        buses.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        buses.forEach((bus, index) => {
          bus.x = level * 2.4;
          bus.y = (index - (buses.length - 1) / 2) * 1.5;
        });
      });

      const attached = new Map<string, number>();
      (system.components ?? []).forEach(component => {
        if (!component.bus) return;
        const bus = system.buses.find(item => item.id === component.bus);
        if (!bus) return;
        const slot = attached.get(bus.id) ?? 0;
        attached.set(bus.id, slot + 1);
        component.x = bus.x + 0.9 + (slot % 2) * 0.75;
        component.y = bus.y + 0.7 + Math.floor(slot / 2) * 0.7;
      });

      return applyCommit(prev, system, coalesce);
    });
  }, [applyCommit, beginCommit, state.system.buses.length]);

  const issues = useMemo(() => validateSystem(state.system), [state.system]);

  return {
    system: state.system,
    name: state.name,
    dirty: state.dirty,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    issues,
    canPaste: clipboard !== null,
    setName,
    replaceSystem,
    commit,
    undo,
    redo,
    markSaved,
    updateSystemMeta,
    addBus,
    addBranch,
    addDevice,
    addComponent,
    updateElement,
    deleteElement,
    duplicateElement,
    copyElement,
    pasteElement,
    setBusType,
    beginMove,
    endMove,
    moveBus,
    moveComponent,
    autoArrange,
  };
}
