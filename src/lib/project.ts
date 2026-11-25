/**
 * Project model utilities: creation, validation, serialization and file I/O.
 */

import { PowerSystem, Bus, Line, Transformer, Generator, Load, Shunt, GenericComponent, ComponentCategory } from '@/types';

export const PROJECT_VERSION = 1;
export const PROJECT_APPLICATION = 'psat-web';

export interface ProjectFile {
  version: number;
  application: string;
  name: string;
  savedAt: string;
  system: PowerSystem;
}

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  message: string;
  elementId?: string;
}

export interface SystemStats {
  buses: number;
  lines: number;
  transformers: number;
  generators: number;
  loads: number;
  shunts: number;
  components: number;
  dcComponents: number;
  instruments: number;
  controls: number;
  totalLoadMW: number;
  totalLoadMvar: number;
  totalGenerationMW: number;
  totalGenerationCapacityMW: number;
  totalLineLengthKm: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return isFiniteNumber(parsed) ? parsed : fallback;
}

export function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function cloneSystem(system: PowerSystem): PowerSystem {
  return JSON.parse(JSON.stringify(system)) as PowerSystem;
}

export function emptySystem(name = 'Untitled Project'): PowerSystem {
  return {
    name,
    buses: [],
    lines: [],
    transformers: [],
    generators: [],
    loads: [],
    shunts: [],
    areas: [{ id: 'A1', name: 'Area 1', slackBus: '' }],
    baseMVA: 100,
    baseFreq: 50,
  };
}

export function nextId(existing: { id: string }[], prefix: string): string {
  let index = existing.length + 1;
  const ids = new Set(existing.map(item => item.id));
  while (ids.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

/** Places buses that share a position (or have no position) on a grid. */
export function autoLayout(system: PowerSystem): PowerSystem {
  const next = cloneSystem(system);
  const seen = new Set<string>();
  let column = 0;

  next.buses.forEach(bus => {
    const key = `${bus.x.toFixed(3)}:${bus.y.toFixed(3)}`;
    const duplicated = seen.has(key);
    seen.add(key);
    if (duplicated) {
      column += 1;
      bus.x = column * 1.6;
      bus.y = 0;
    }
  });

  return next;
}

export function normalizeSystem(input: unknown): PowerSystem {
  if (!input || typeof input !== 'object') {
    throw new Error('Project file does not contain a power system.');
  }

  const raw = input as Partial<PowerSystem>;
  if (!Array.isArray(raw.buses)) {
    throw new Error('Project file is missing the bus list.');
  }

  const buses: Bus[] = raw.buses.map((bus, index) => {
    const source = (bus ?? {}) as Partial<Bus>;
    const type = source.type === 'slack' || source.type === 'pv' || source.type === 'isolated'
      ? source.type
      : 'pq';
    return {
      id: toText(source.id, `bus_${index + 1}`),
      name: toText(source.name, `Bus ${index + 1}`),
      type,
      voltage: toNumber(source.voltage, 1),
      angle: toNumber(source.angle, 0),
      vmin: toNumber(source.vmin, 0.9),
      vmax: toNumber(source.vmax, 1.1),
      area: toNumber(source.area, 1),
      region: toNumber(source.region, 1),
      x: toNumber(source.x, index * 1.6),
      y: toNumber(source.y, 0),
      active: source.active !== false,
      symbol: source.symbol,
      vScheduled: source.vScheduled,
      vbase: source.vbase,
      zone: source.zone,
      owner: source.owner,
      comments: source.comments,
    };
  });

  const busIds = new Set(buses.map(bus => bus.id));

  const lines: Line[] = (Array.isArray(raw.lines) ? raw.lines : []).map((line, index) => {
    const source = (line ?? {}) as Partial<Line>;
    return {
      id: toText(source.id, `line_${index + 1}`),
      name: toText(source.name, `Line ${index + 1}`),
      fromBus: toText(source.fromBus, buses[0]?.id ?? ''),
      toBus: toText(source.toBus, buses[1]?.id ?? buses[0]?.id ?? ''),
      resistance: toNumber(source.resistance, 0.01),
      reactance: toNumber(source.reactance, 0.05),
      susceptance: toNumber(source.susceptance, 0),
      rating: toNumber(source.rating, 100),
      ratingA: source.ratingA,
      ratingB: source.ratingB,
      length: source.length,
      cost: source.cost,
      active: source.active !== false,
      symbol: source.symbol,
      lineType: source.lineType,
    };
  }).filter(line => busIds.has(line.fromBus) && busIds.has(line.toBus));

  const transformers: Transformer[] = (Array.isArray(raw.transformers) ? raw.transformers : []).map((txf, index) => {
    const source = (txf ?? {}) as Partial<Transformer>;
    return {
      id: toText(source.id, `txf_${index + 1}`),
      name: toText(source.name, `Transformer ${index + 1}`),
      fromBus: toText(source.fromBus, buses[0]?.id ?? ''),
      toBus: toText(source.toBus, buses[1]?.id ?? buses[0]?.id ?? ''),
      resistance: toNumber(source.resistance, 0.001),
      reactance: toNumber(source.reactance, 0.05),
      tap: toNumber(source.tap, 1),
      shift: toNumber(source.shift, 0),
      rating: toNumber(source.rating, 100),
      vhigh: source.vhigh,
      vlow: source.vlow,
      vectorGroup: source.vectorGroup,
      connection: source.connection,
      active: source.active !== false,
      symbol: source.symbol,
    };
  }).filter(txf => busIds.has(txf.fromBus) && busIds.has(txf.toBus));

  const generators: Generator[] = (Array.isArray(raw.generators) ? raw.generators : []).map((gen, index) => {
    const source = (gen ?? {}) as Partial<Generator>;
    return {
      id: toText(source.id, `gen_${index + 1}`),
      name: toText(source.name, `Generator ${index + 1}`),
      bus: toText(source.bus, buses[0]?.id ?? ''),
      pg: toNumber(source.pg, 0),
      qg: toNumber(source.qg, 0),
      v: toNumber(source.v, 1),
      pmax: toNumber(source.pmax, 100),
      pmin: toNumber(source.pmin, 0),
      qmax: toNumber(source.qmax, 50),
      qmin: toNumber(source.qmin, -50),
      cost: source.cost,
      model: source.model,
      active: source.active !== false,
      symbol: source.symbol,
    };
  }).filter(gen => busIds.has(gen.bus));

  const loads: Load[] = (Array.isArray(raw.loads) ? raw.loads : []).map((load, index) => {
    const source = (load ?? {}) as Partial<Load>;
    return {
      id: toText(source.id, `load_${index + 1}`),
      name: toText(source.name, `Load ${index + 1}`),
      bus: toText(source.bus, buses[0]?.id ?? ''),
      pl: toNumber(source.pl, 0),
      ql: toNumber(source.ql, 0),
      cl: source.cl,
      gl: source.gl,
      bl: source.bl,
      demandModel: source.demandModel,
      active: source.active !== false,
      symbol: source.symbol,
    };
  }).filter(load => busIds.has(load.bus));

  const shunts: Shunt[] = (Array.isArray(raw.shunts) ? raw.shunts : []).map((shunt, index) => {
    const source = (shunt ?? {}) as Partial<Shunt>;
    return {
      id: toText(source.id, `shunt_${index + 1}`),
      name: toText(source.name, `Shunt ${index + 1}`),
      bus: toText(source.bus, buses[0]?.id ?? ''),
      g: toNumber(source.g, 0),
      b: toNumber(source.b, 0),
      vlow: source.vlow,
      vhigh: source.vhigh,
      active: source.active !== false,
      symbol: source.symbol,
    };
  }).filter(shunt => busIds.has(shunt.bus));

  const components: GenericComponent[] = (Array.isArray(raw.components) ? raw.components : []).map((component, index) => {
    const source = (component ?? {}) as Partial<GenericComponent>;
    const category: ComponentCategory =
      source.category === 'DC' || source.category === 'Instrument' || source.category === 'Control' || source.category === 'Other'
        ? source.category
        : 'AC';
    return {
      id: toText(source.id, `component_${index + 1}`),
      type: toText(source.type, 'generic'),
      category,
      name: toText(source.name, `Component ${index + 1}`),
      bus: source.bus && busIds.has(source.bus) ? source.bus : undefined,
      fromBus: source.fromBus && busIds.has(source.fromBus) ? source.fromBus : undefined,
      toBus: source.toBus && busIds.has(source.toBus) ? source.toBus : undefined,
      x: toNumber(source.x, index * 1.2),
      y: toNumber(source.y, 0),
      properties: source.properties && typeof source.properties === 'object' ? source.properties : {},
      active: source.active !== false,
    };
  });

  return autoLayout({
    name: toText(raw.name, 'Untitled Project'),
    buses,
    lines,
    transformers,
    generators,
    loads,
    shunts,
    components,
    areas: Array.isArray(raw.areas) && raw.areas.length
      ? raw.areas.map((area, index) => ({
          id: toText(area?.id, `A${index + 1}`),
          name: toText(area?.name, `Area ${index + 1}`),
          slackBus: toText(area?.slackBus, ''),
        }))
      : [{ id: 'A1', name: 'Area 1', slackBus: '' }],
    baseMVA: toNumber(raw.baseMVA, 100),
    baseFreq: toNumber(raw.baseFreq, 50),
    slackBus: raw.slackBus,
  });
}

export function serializeProject(system: PowerSystem, name?: string): string {
  const file: ProjectFile = {
    version: PROJECT_VERSION,
    application: PROJECT_APPLICATION,
    name: name || system.name || 'Untitled Project',
    savedAt: new Date().toISOString(),
    system,
  };
  return JSON.stringify(file, null, 2);
}

export function deserializeProject(text: string): { system: PowerSystem; name: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  const container = parsed as Partial<ProjectFile> & Partial<PowerSystem>;
  const systemSource = container.system ?? container;
  const system = normalizeSystem(systemSource);
  const name = typeof container.name === 'string' && container.name.trim()
    ? container.name.trim()
    : system.name || 'Untitled Project';

  return { system: { ...system, name }, name };
}

export function validateSystem(system: PowerSystem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const busIds = new Set<string>();
  const duplicates = new Set<string>();

  system.buses.forEach(bus => {
    if (busIds.has(bus.id)) duplicates.add(bus.id);
    busIds.add(bus.id);
  });

  if (system.buses.length === 0) {
    issues.push({ severity: 'error', message: 'The project has no buses. Add at least one slack bus.' });
  }

  const slackBuses = system.buses.filter(bus => bus.type === 'slack');
  if (system.buses.length > 0 && slackBuses.length === 0) {
    issues.push({ severity: 'error', message: 'No slack bus defined. Set one bus as the slack (swing) bus.' });
  }
  if (slackBuses.length > 1) {
    issues.push({ severity: 'warning', message: `${slackBuses.length} slack buses found; only one is recommended.` });
  }

  duplicates.forEach(id => {
    issues.push({ severity: 'error', message: `Duplicate bus id "${id}".`, elementId: id });
  });

  const checkBranch = (branch: { id: string; fromBus: string; toBus: string }, label: string) => {
    if (!busIds.has(branch.fromBus) || !busIds.has(branch.toBus)) {
      issues.push({
        severity: 'error',
        message: `${label} "${branch.id}" is connected to a bus that does not exist.`,
        elementId: branch.id,
      });
    }
    if (branch.fromBus === branch.toBus) {
      issues.push({
        severity: 'warning',
        message: `${label} "${branch.id}" connects a bus to itself.`,
        elementId: branch.id,
      });
    }
  };

  system.lines.forEach(line => checkBranch(line, 'Line'));
  system.transformers.forEach(txf => checkBranch(txf, 'Transformer'));

  const connected = new Set<string>();
  [...system.lines, ...system.transformers].forEach(branch => {
    if (branch.active === false) return;
    connected.add(branch.fromBus);
    connected.add(branch.toBus);
  });
  system.buses.forEach(bus => {
    if (system.buses.length > 1 && !connected.has(bus.id)) {
      issues.push({
        severity: 'warning',
        message: `Bus "${bus.name || bus.id}" is not connected to any branch.`,
        elementId: bus.id,
      });
    }
  });

  system.generators.forEach(gen => {
    if (!busIds.has(gen.bus)) {
      issues.push({
        severity: 'error',
        message: `Generator "${gen.id}" is assigned to a missing bus.`,
        elementId: gen.id,
      });
    }
  });
  system.loads.forEach(load => {
    if (!busIds.has(load.bus)) {
      issues.push({
        severity: 'error',
        message: `Load "${load.id}" is assigned to a missing bus.`,
        elementId: load.id,
      });
    }
  });
  system.shunts?.forEach(shunt => {
    if (!busIds.has(shunt.bus)) {
      issues.push({
        severity: 'error',
        message: `Shunt "${shunt.id}" is assigned to a missing bus.`,
        elementId: shunt.id,
      });
    }
  });

  (system.components ?? []).forEach(component => {
    if (component.bus && !busIds.has(component.bus)) {
      issues.push({
        severity: 'warning',
        message: `Component "${component.name}" is attached to a missing bus.`,
        elementId: component.id,
      });
    }
    if (component.fromBus && !busIds.has(component.fromBus)) {
      issues.push({
        severity: 'warning',
        message: `Component "${component.name}" has a missing from-bus.`,
        elementId: component.id,
      });
    }
    if (component.toBus && !busIds.has(component.toBus)) {
      issues.push({
        severity: 'warning',
        message: `Component "${component.name}" has a missing to-bus.`,
        elementId: component.id,
      });
    }
  });

  const totalGeneration = system.generators.reduce((sum, gen) => sum + (gen.active ? gen.pg : 0), 0);
  const totalLoad = system.loads.reduce((sum, load) => sum + (load.active ? load.pl : 0), 0);
  if (totalGeneration + 1e-6 < totalLoad * 0.5) {
    issues.push({
      severity: 'warning',
      message: 'Total generation is far below total load. The power flow may not converge.',
    });
  }

  return issues;
}

export function systemStats(system: PowerSystem): SystemStats {
  const totalLoadMW = system.loads.reduce((sum, load) => sum + (load.active ? load.pl : 0), 0);
  const totalLoadMvar = system.loads.reduce((sum, load) => sum + (load.active ? load.ql : 0), 0);
  const totalGenerationMW = system.generators.reduce((sum, gen) => sum + (gen.active ? gen.pg : 0), 0);
  const totalGenerationCapacityMW = system.generators.reduce((sum, gen) => sum + (gen.active ? gen.pmax : 0), 0);
  const totalLineLengthKm = system.lines.reduce((sum, line) => sum + (line.length ?? 0), 0);

  const components = system.components ?? [];

  return {
    buses: system.buses.length,
    lines: system.lines.length,
    transformers: system.transformers.length,
    generators: system.generators.length,
    loads: system.loads.length,
    shunts: system.shunts?.length ?? 0,
    components: components.length,
    dcComponents: components.filter(component => component.category === 'DC').length,
    instruments: components.filter(component => component.category === 'Instrument').length,
    controls: components.filter(component => component.category === 'Control').length,
    totalLoadMW,
    totalLoadMvar,
    totalGenerationMW,
    totalGenerationCapacityMW,
    totalLineLengthKm,
  };
}

/** Triggers a browser download for a text payload. No-op outside the browser. */
export function downloadFile(filename: string, content: string, mime = 'application/json'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function safeFileName(name: string, extension: string): string {
  const base = (name || 'project').trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${base || 'project'}.${extension}`;
}

export function findFreePosition(system: PowerSystem): { x: number; y: number } {
  if (system.buses.length === 0) return { x: 0, y: 0 };
  const maxX = Math.max(...system.buses.map(bus => bus.x));
  const minY = Math.min(...system.buses.map(bus => bus.y));
  const occupied = new Set(system.buses.map(bus => `${bus.x.toFixed(2)}:${bus.y.toFixed(2)}`));
  let x = maxX + 1.6;
  let y = minY;
  while (occupied.has(`${x.toFixed(2)}:${y.toFixed(2)}`)) x += 1.6;
  return { x, y };
}
