/**
 * Deterministic large-grid samples.
 *
 * Builds a ten-level network from 220 V to 500 kV and places one of every
 * component in the catalog, then fills to an exact element count. The samples
 * are for layout, selection and performance work; every voltage level is
 * represented at the system 100 MVA base, so low-voltage branches carry large
 * per-unit impedances and proportionally small loads, as they would in a real
 * per-unit study.
 */

import type {
  Bus,
  BusType,
  GenericComponent,
  Generator,
  Line,
  LineType,
  Load,
  PowerSystem,
  Shunt,
  Transformer,
  VectorGroup,
} from '@/types';
import { COMPONENT_CATALOG, defaultComponentProperties } from './component-catalog';

const BASE_MVA = 100;
const BASE_FREQ = 50;

interface LevelSpec {
  kv: number;
  label: string;
  weight: number;
  row: number;
  spacing: number;
  lineR: number;
  lineX: number;
  lineB: number;
  lengthKm: number;
  ratingMVA: number;
  lineType: LineType;
  loadMW: number;
  genMW: number;
  transformerMVA: number;
  transformerZ: number;
  shuntB: number;
}

export const GRID_VOLTAGE_LEVELS: LevelSpec[] = [
  { kv: 500, label: '500 kV', weight: 0.05, row: -18, spacing: 2.4, lineR: 0.0012, lineX: 0.012, lineB: 0.020, lengthKm: 120, ratingMVA: 1500, lineType: 'overhead', loadMW: 40, genMW: 600, transformerMVA: 500, transformerZ: 0.14, shuntB: 0.05 },
  { kv: 330, label: '330 kV', weight: 0.06, row: -14.5, spacing: 2.4, lineR: 0.002, lineX: 0.018, lineB: 0.020, lengthKm: 100, ratingMVA: 900, lineType: 'overhead', loadMW: 30, genMW: 150, transformerMVA: 400, transformerZ: 0.12, shuntB: 0.05 },
  { kv: 220, label: '220 kV', weight: 0.09, row: -11, spacing: 2.3, lineR: 0.004, lineX: 0.03, lineB: 0.015, lengthKm: 70, ratingMVA: 600, lineType: 'overhead', loadMW: 25, genMW: 160, transformerMVA: 400, transformerZ: 0.10, shuntB: 0.04 },
  { kv: 110, label: '110 kV', weight: 0.10, row: -7.5, spacing: 2.3, lineR: 0.01, lineX: 0.06, lineB: 0.010, lengthKm: 40, ratingMVA: 200, lineType: 'overhead', loadMW: 15, genMW: 100, transformerMVA: 300, transformerZ: 0.09, shuntB: 0.04 },
  { kv: 66, label: '66 kV', weight: 0.10, row: -4.2, spacing: 2.2, lineR: 0.02, lineX: 0.1, lineB: 0.008, lengthKm: 25, ratingMVA: 120, lineType: 'overhead', loadMW: 10, genMW: 70, transformerMVA: 200, transformerZ: 0.08, shuntB: 0.03 },
  { kv: 33, label: '33 kV', weight: 0.14, row: -1, spacing: 2.2, lineR: 0.05, lineX: 0.18, lineB: 0.005, lengthKm: 12, ratingMVA: 60, lineType: 'overhead', loadMW: 4, genMW: 40, transformerMVA: 120, transformerZ: 0.07, shuntB: 0.03 },
  { kv: 11, label: '11 kV', weight: 0.16, row: 2.4, spacing: 2.1, lineR: 0.2, lineX: 0.5, lineB: 0.002, lengthKm: 6, ratingMVA: 25, lineType: 'cable', loadMW: 1.2, genMW: 12, transformerMVA: 40, transformerZ: 0.06, shuntB: 0.02 },
  { kv: 6.6, label: '6.6 kV', weight: 0.09, row: 5.4, spacing: 2.1, lineR: 0.4, lineX: 0.9, lineB: 0.001, lengthKm: 3, ratingMVA: 15, lineType: 'cable', loadMW: 0.6, genMW: 4, transformerMVA: 12, transformerZ: 0.06, shuntB: 0.015 },
  { kv: 0.4, label: '400 V', weight: 0.12, row: 8.8, spacing: 2.0, lineR: 12, lineX: 3, lineB: 0, lengthKm: 0.15, ratingMVA: 2, lineType: 'cable', loadMW: 0.08, genMW: 0.2, transformerMVA: 2, transformerZ: 0.06, shuntB: 0.005 },
  { kv: 0.22, label: '220 V', weight: 0.09, row: 12, spacing: 2.0, lineR: 30, lineX: 8, lineB: 0, lengthKm: 0.08, ratingMVA: 1, lineType: 'cable', loadMW: 0.03, genMW: 0.1, transformerMVA: 0.6, transformerZ: 0.04, shuntB: 0.003 },
];

const CATALOG = {
  buses: COMPONENT_CATALOG.filter(definition => definition.model === 'bus'),
  generators: COMPONENT_CATALOG.filter(definition => definition.model === 'generator'),
  loads: COMPONENT_CATALOG.filter(definition => definition.model === 'load'),
  shunts: COMPONENT_CATALOG.filter(definition => definition.model === 'shunt'),
  lines: COMPONENT_CATALOG.filter(definition => definition.model === 'line'),
  transformers: COMPONENT_CATALOG.filter(definition => definition.model === 'transformer'),
  generic: COMPONENT_CATALOG.filter(definition => definition.model === 'generic'),
};

const VECTOR_GROUPS: VectorGroup[] = ['Yy0', 'Dy11', 'Yy6', 'Dy5', 'Dy1', 'Yy8', 'Dy7', 'Yy4'];
const DEMAND_MODELS: NonNullable<Load['demandModel']>[] = [
  'constant-power',
  'constant-impedance',
  'constant-current',
  'mixed',
];

export interface LargeGridOptions {
  /** Total element count: buses, branches, machines, loads, shunts and generic components. */
  elements: number;
  /** Override the bus count. Leave room for branches, loads and devices in `elements`. */
  buses?: number;
}

function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const raw = weights.map(weight => (weight / sum) * total);
  const counts = raw.map(value => Math.floor(value));
  let remainder = total - counts.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < order.length && remainder > 0; i += 1, remainder -= 1) {
    counts[order[i].index] += 1;
  }
  return counts;
}

function pad(value: number, width = 3): string {
  return String(value).padStart(width, '0');
}

export function buildLargeGrid({ elements, buses: requestedBuses }: LargeGridOptions): PowerSystem {
  if (!Number.isFinite(elements) || elements < 400) {
    throw new Error('Large grid samples need at least 400 elements.');
  }

  const buses: Bus[] = [];
  const lines: Line[] = [];
  const transformers: Transformer[] = [];
  const generators: Generator[] = [];
  const loads: Load[] = [];
  const shunts: Shunt[] = [];
  const components: GenericComponent[] = [];

  const busBudget = requestedBuses ?? Math.max(40, Math.round(elements * 0.12));
  const counts = allocate(busBudget, GRID_VOLTAGE_LEVELS.map(level => level.weight));
  const levelBuses: string[][] = [];

  GRID_VOLTAGE_LEVELS.forEach((level, levelIndex) => {
    const ids: string[] = [];
    for (let index = 0; index < counts[levelIndex]; index += 1) {
      const definition = CATALOG.buses[buses.length % CATALOG.buses.length];
      const id = `B${level.kv}-${pad(index + 1)}`;
      const type: BusType = levelIndex === 0 && index === 0 ? 'slack' : 'pq';
      buses.push({
        id,
        name: `${level.label} Bus ${index + 1}`,
        type,
        voltage: type === 'slack' ? 1.02 : 1.0,
        angle: 0,
        vmin: level.kv <= 0.4 ? 0.9 : 0.92,
        vmax: 1.08,
        area: 1,
        region: levelIndex + 1,
        x: index * level.spacing,
        y: level.row,
        active: true,
        vbase: level.kv,
        symbol: definition.symbol,
        subtype: definition.busKind,
      });
      ids.push(id);
    }
    levelBuses.push(ids);
  });

  const lineReactance = (definitionId: string, level: LevelSpec): number => {
    if (definitionId === 'series-capacitor') return -level.lineX * 0.4;
    if (definitionId === 'current-limiting-reactor') return level.lineX * 1.8;
    if (definitionId === 'impedance') return level.lineX * 0.2;
    return level.lineX;
  };

  const lineResistance = (definitionId: string, level: LevelSpec): number => {
    const seriesElement =
      definitionId === 'series-capacitor' || definitionId === 'current-limiting-reactor';
    return seriesElement ? level.lineR * 0.1 : level.lineR;
  };

  const addLine = (level: LevelSpec, fromBus: string, toBus: string, name: string): void => {
    const definition = CATALOG.lines[lines.length % CATALOG.lines.length];
    lines.push({
      id: `LN-${pad(lines.length + 1, 4)}`,
      name,
      fromBus,
      toBus,
      resistance: lineResistance(definition.id, level),
      reactance: lineReactance(definition.id, level),
      susceptance: level.lineB,
      rating: level.ratingMVA,
      length: level.lengthKm,
      active: true,
      lineType: definition.id === 'power-cable' ? 'cable' : level.lineType,
      symbol: definition.symbol,
    });
  };

  const trunkCount = (level: LevelSpec, count: number): number => {
    if (level.kv <= 0.4 || count < 6) return 1;
    return level.kv === 500 ? count : 2;
  };

  GRID_VOLTAGE_LEVELS.forEach((level, levelIndex) => {
    const ids = levelBuses[levelIndex];
    const trunks = trunkCount(level, ids.length);
    for (let index = 1; index < trunks; index += 1) {
      addLine(level, ids[index - 1], ids[index], `${level.label} Busbar Tie ${index}`);
    }
    for (let index = trunks; index < ids.length; index += 1) {
      const trunk = (index - trunks) % trunks;
      addLine(level, ids[trunk], ids[index], `${level.label} Feeder ${index}`);
    }
    if (level.kv >= 110 && ids.length > 3) {
      addLine(level, ids[0], ids[2], `${level.label} Tie 1`);
    }
  });

  GRID_VOLTAGE_LEVELS.slice(0, -1).forEach((upper, levelIndex) => {
    const lower = GRID_VOLTAGE_LEVELS[levelIndex + 1];
    const upperIds = levelBuses[levelIndex];
    const lowerIds = levelBuses[levelIndex + 1];
    const upperTrunks = trunkCount(upper, upperIds.length);
    const lowerTrunks = trunkCount(lower, lowerIds.length);
    const count = Math.min(upperTrunks, lowerTrunks);
    for (let index = 0; index < count; index += 1) {
      const definition = CATALOG.transformers[transformers.length % CATALOG.transformers.length];
      const rating = lower.transformerMVA;
      const zPu = (lower.transformerZ * BASE_MVA) / rating;
      transformers.push({
        id: `TX-${pad(transformers.length + 1, 3)}`,
        name: `${upper.label}/${lower.label} Transformer ${index + 1}`,
        fromBus: upperIds[index % upperTrunks],
        toBus: lowerIds[index % lowerTrunks],
        resistance: zPu * 0.08,
        reactance: zPu * 0.997,
        tap: 1,
        shift: 0,
        rating,
        vhigh: upper.kv,
        vlow: lower.kv,
        vectorGroup: VECTOR_GROUPS[transformers.length % VECTOR_GROUPS.length],
        connection: transformers.length % 2 === 0 ? 'wye' : 'delta',
        active: true,
        symbol: definition.symbol,
      });
    }
  });

  buses.forEach((bus, busIndex) => {
    if (bus.type === 'slack') return;
    const levelIndex = GRID_VOLTAGE_LEVELS.findIndex(level => level.kv === bus.vbase);
    const level = GRID_VOLTAGE_LEVELS[levelIndex];
    const factor = 0.75 + ((busIndex * 7 + levelIndex * 13) % 50) / 100;
    const definition = CATALOG.loads[loads.length % CATALOG.loads.length];
    const pl = level.loadMW * factor;
    loads.push({
      id: `LD-${pad(loads.length + 1, 3)}`,
      name: `${level.label} Load ${loads.length + 1}`,
      bus: bus.id,
      pl,
      ql: pl * 0.3,
      demandModel: DEMAND_MODELS[loads.length % DEMAND_MODELS.length],
      active: true,
      symbol: definition.symbol,
    });
  });

  GRID_VOLTAGE_LEVELS.forEach((level, levelIndex) => {
    if (level.kv < 6.6 || level.kv > 220) return;
    levelBuses[levelIndex].forEach((busId, index) => {
      if (index === 0 || index % 3 !== 0) return;
      const definition = CATALOG.shunts[shunts.length % CATALOG.shunts.length];
      const filter = definition.group === 'Loads & Motors' && definition.id.startsWith('harmonic');
      shunts.push({
        id: `SH-${pad(shunts.length + 1, 3)}`,
        name: `${level.label} ${filter ? 'Filter' : 'Capacitor'} ${index}`,
        bus: busId,
        g: 0,
        b: filter ? level.shuntB * 0.35 : level.shuntB,
        active: true,
        symbol: definition.symbol,
      });
    });
  });

  const addGenerator = (
    busId: string,
    level: LevelSpec,
    levelIndex: number,
    name: string,
    setpoint: number
  ): void => {
    const definition = CATALOG.generators[generators.length % CATALOG.generators.length];
    const bus = buses.find(item => item.id === busId);
    if (!bus) return;
    generators.push({
      id: `GEN-${pad(generators.length + 1, 3)}`,
      name,
      bus: busId,
      pg: setpoint,
      qg: 0,
      v: 1.02,
      pmax: Math.max(setpoint * 1.8, level.genMW * 2),
      pmin: 0,
      qmax: Math.max(setpoint, level.genMW) * 1.5,
      qmin: -Math.max(setpoint, level.genMW) * 1.5,
      cost: { model: 'polynomial', c2: 0.01, c1: 15 + (levelIndex % 5), c0: 100 },
      active: true,
      symbol: definition.symbol,
    });
    if (bus.type === 'pq') bus.type = 'pv';
  };

  addGenerator(levelBuses[0][0], GRID_VOLTAGE_LEVELS[0], 0, '500 kV Grid Intake', 0);

  const candidates: { busId: string; level: LevelSpec; levelIndex: number; weight: number }[] = [];
  GRID_VOLTAGE_LEVELS.forEach((level, levelIndex) => {
    if (level.kv < 6.6) return;
    const step = level.kv <= 11 ? 3 : 4;
    levelBuses[levelIndex].forEach((busId, index) => {
      if (levelIndex === 0 && index === 0) return;
      if (index % step !== 0) return;
      candidates.push({ busId, level, levelIndex, weight: level.loadMW });
    });
  });

  const totalLoad = loads.reduce((sum, load) => sum + load.pl, 0);
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  candidates.forEach((candidate, index) => {
    const share = totalWeight > 0 ? candidate.weight / totalWeight : 0;
    const setpoint = Math.round(totalLoad * 0.85 * share * 100) / 100;
    addGenerator(
      candidate.busId,
      candidate.level,
      candidate.levelIndex,
      `${candidate.level.label} Generator ${index + 1}`,
      setpoint
    );
  });

  let componentCursor = 0;
  const addComponent = (definition: (typeof CATALOG.generic)[number]): void => {
    const attach = definition.attach ?? 'none';
    if (attach === 'branch' && lines.length > 0) {
      const line = lines[componentCursor % lines.length];
      components.push({
        id: `CMP-${pad(components.length + 1, 4)}`,
        type: definition.id,
        category: definition.category,
        name: definition.label,
        fromBus: line.fromBus,
        toBus: line.toBus,
        x: 0,
        y: 0,
        properties: defaultComponentProperties(definition),
        active: true,
      });
    } else {
      const bus = buses[componentCursor % buses.length];
      const angle = componentCursor * 2.399963;
      const radius = 0.45 + 0.18 * (componentCursor % 4);
      components.push({
        id: `CMP-${pad(components.length + 1, 4)}`,
        type: definition.id,
        category: definition.category,
        name: definition.label,
        bus: attach === 'bus' ? bus.id : undefined,
        x: bus.x + radius * Math.cos(angle),
        y: bus.y + radius * Math.sin(angle),
        properties: defaultComponentProperties(definition),
        active: true,
      });
    }
    componentCursor += 1;
  };

  CATALOG.generic.forEach(addComponent);

  const totalElements = (): number =>
    buses.length + lines.length + transformers.length + generators.length + loads.length +
    shunts.length + components.length;

  if (totalElements() > elements) {
    throw new Error(
      `The requested ${busBudget} buses need more than ${elements} elements; ` +
        'raise the element target or lower the bus count.'
    );
  }

  let guard = 0;
  while (totalElements() < elements) {
    addComponent(CATALOG.generic[componentCursor % CATALOG.generic.length]);
    guard += 1;
    if (guard > elements * 2) throw new Error('Could not reach the requested element count.');
  }

  return {
    name: `${elements.toLocaleString('en-US')}-Element Grid (220 V – 500 kV)`,
    buses,
    lines,
    transformers,
    generators,
    loads,
    shunts,
    components,
    areas: [{ id: 'A1', name: 'Interconnected Grid', slackBus: buses[0].id }],
    baseMVA: BASE_MVA,
    baseFreq: BASE_FREQ,
    slackBus: buses[0].id,
  };
}

export const LARGE_GRID_TARGETS = [1000, 2000] as const;
