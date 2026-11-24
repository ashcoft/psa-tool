/**
 * Ready-to-run example power systems.
 */

import { PowerSystem, Bus, Line, Transformer, Generator, Load, Shunt, BusType } from '@/types';

export interface SampleDefinition {
  id: string;
  name: string;
  description: string;
  build: () => PowerSystem;
}

interface BusSpec {
  id: string;
  name: string;
  type: BusType;
  x: number;
  y: number;
  voltage?: number;
  vbase?: number;
}

interface BranchSpec {
  id: string;
  name?: string;
  from: string;
  to: string;
  r: number;
  x: number;
  b?: number;
  rating?: number;
  length?: number;
}

const buses = (specs: BusSpec[]): Bus[] => specs.map(spec => ({
  id: spec.id,
  name: spec.name,
  type: spec.type,
  voltage: spec.voltage ?? (spec.type === 'slack' ? 1.0 : spec.type === 'pv' ? 1.02 : 1.0),
  angle: 0,
  vmin: 0.9,
  vmax: 1.1,
  area: 1,
  region: 1,
  x: spec.x,
  y: spec.y,
  vbase: spec.vbase,
  active: true,
}));

const lines = (specs: BranchSpec[]): Line[] => specs.map(spec => ({
  id: spec.id,
  name: spec.name ?? `Line ${spec.from}-${spec.to}`,
  fromBus: spec.from,
  toBus: spec.to,
  resistance: spec.r,
  reactance: spec.x,
  susceptance: spec.b ?? 0,
  rating: spec.rating ?? 100,
  length: spec.length,
  active: true,
}));

const transformers = (specs: (BranchSpec & { tap?: number; shift?: number; vhigh?: number; vlow?: number })[]): Transformer[] =>
  specs.map(spec => ({
    id: spec.id,
    name: spec.name ?? `Transformer ${spec.from}-${spec.to}`,
    fromBus: spec.from,
    toBus: spec.to,
    resistance: spec.r,
    reactance: spec.x,
    tap: spec.tap ?? 1,
    shift: spec.shift ?? 0,
    rating: spec.rating ?? 100,
    vhigh: spec.vhigh,
    vlow: spec.vlow,
    active: true,
  }));

const generators = (
  specs: { id: string; bus: string; pg: number; qg?: number; v: number; pmax: number; pmin?: number; qmax?: number; qmin?: number; cost?: { c2: number; c1: number; c0: number } }[]
): Generator[] => specs.map(spec => ({
  id: spec.id,
  name: `Generator ${spec.id}`,
  bus: spec.bus,
  pg: spec.pg,
  qg: spec.qg ?? 0,
  v: spec.v,
  pmax: spec.pmax,
  pmin: spec.pmin ?? 0,
  qmax: spec.qmax ?? Math.max(spec.pmax * 2, 100),
  qmin: spec.qmin ?? -Math.max(spec.pmax * 2, 100),
  cost: spec.cost ? { model: 'polynomial', c2: spec.cost.c2, c1: spec.cost.c1, c0: spec.cost.c0 } : undefined,
  active: true,
}));

const loads = (specs: { id: string; bus: string; pl: number; ql: number }[]): Load[] =>
  specs.map(spec => ({
    id: spec.id,
    name: `Load ${spec.bus}`,
    bus: spec.bus,
    pl: spec.pl,
    ql: spec.ql,
    demandModel: 'constant-power',
    active: true,
  }));

const shunts = (specs: { id: string; bus: string; g: number; b: number }[]): Shunt[] =>
  specs.map(spec => ({
    id: spec.id,
    name: `Shunt ${spec.bus}`,
    bus: spec.bus,
    g: spec.g,
    b: spec.b,
    active: true,
  }));

export function buildDemoSystem(): PowerSystem {
  return {
    name: 'Demo 4-Bus System',
    buses: buses([
      { id: '1', name: 'Slack', type: 'slack', x: 0, y: 0, vbase: 230 },
      { id: '2', name: 'PV1', type: 'pv', x: 2, y: -1, voltage: 1.05, vbase: 230 },
      { id: '3', name: 'PQ1', type: 'pq', x: 4, y: 0, vbase: 230 },
      { id: '4', name: 'PQ2', type: 'pq', x: 6, y: -1, vbase: 230 },
    ]),
    lines: lines([
      { id: 'L12', from: '1', to: '2', r: 0.02, x: 0.04, rating: 150, length: 30 },
      { id: 'L23', from: '2', to: '3', r: 0.02, x: 0.04, rating: 150, length: 30 },
      { id: 'L34', from: '3', to: '4', r: 0.02, x: 0.04, rating: 150, length: 30 },
    ]),
    transformers: [],
    loads: loads([
      { id: 'LD3', bus: '3', pl: 70, ql: 30 },
      { id: 'LD4', bus: '4', pl: 50, ql: 20 },
    ]),
    generators: generators([
      { id: 'G1', bus: '1', pg: 80, v: 1.0, pmax: 200, cost: { c2: 0.01, c1: 20, c0: 100 } },
      { id: 'G2', bus: '2', pg: 60, v: 1.05, pmax: 150, cost: { c2: 0.012, c1: 22, c0: 80 } },
    ]),
    shunts: [],
    areas: [{ id: 'A1', name: 'Area 1', slackBus: '1' }],
    baseMVA: 100,
    baseFreq: 50,
  };
}

export function buildIEEE9(): PowerSystem {
  return {
    name: 'IEEE 9-Bus Test System',
    buses: buses([
      { id: '1', name: 'Bus 1 (Slack)', type: 'slack', x: 0, y: 0, voltage: 1.04, vbase: 345 },
      { id: '2', name: 'Bus 2', type: 'pv', x: 2, y: -1.6, voltage: 1.025, vbase: 345 },
      { id: '3', name: 'Bus 3', type: 'pv', x: 2, y: 1.6, voltage: 1.025, vbase: 345 },
      { id: '4', name: 'Bus 4', type: 'pq', x: 4, y: 0, vbase: 345 },
      { id: '5', name: 'Bus 5', type: 'pq', x: 5.4, y: -1.4, vbase: 345 },
      { id: '6', name: 'Bus 6', type: 'pq', x: 5.4, y: 1.4, vbase: 345 },
      { id: '7', name: 'Bus 7', type: 'pq', x: 7.4, y: -1.4, vbase: 345 },
      { id: '8', name: 'Bus 8', type: 'pq', x: 8.8, y: 0, vbase: 345 },
      { id: '9', name: 'Bus 9', type: 'pq', x: 7.4, y: 1.4, vbase: 345 },
    ]),
    lines: lines([
      { id: 'L45', from: '4', to: '5', r: 0.017, x: 0.092, b: 0.158, rating: 250, length: 90 },
      { id: 'L46', from: '4', to: '6', r: 0.039, x: 0.17, b: 0.358, rating: 250, length: 90 },
      { id: 'L57', from: '5', to: '7', r: 0.0085, x: 0.072, b: 0.149, rating: 250, length: 70 },
      { id: 'L69', from: '6', to: '9', r: 0.032, x: 0.161, b: 0.306, rating: 250, length: 90 },
      { id: 'L78', from: '7', to: '8', r: 0.01, x: 0.085, b: 0.176, rating: 250, length: 70 },
      { id: 'L89', from: '8', to: '9', r: 0.011, x: 0.072, b: 0.149, rating: 250, length: 70 },
    ]),
    transformers: transformers([
      { id: 'T14', from: '1', to: '4', r: 0, x: 0.0576, rating: 400, vhigh: 345, vlow: 345 },
      { id: 'T27', from: '2', to: '7', r: 0, x: 0.0625, rating: 400, vhigh: 345, vlow: 345 },
      { id: 'T39', from: '3', to: '9', r: 0, x: 0.0586, rating: 400, vhigh: 345, vlow: 345 },
    ]),
    loads: loads([
      { id: 'LD5', bus: '5', pl: 90, ql: 30 },
      { id: 'LD7', bus: '7', pl: 100, ql: 35 },
      { id: 'LD9', bus: '9', pl: 125, ql: 50 },
    ]),
    generators: generators([
      { id: 'G1', bus: '1', pg: 71.6, v: 1.04, pmax: 300, cost: { c2: 0.008, c1: 18, c0: 120 } },
      { id: 'G2', bus: '2', pg: 163, v: 1.025, pmax: 300, cost: { c2: 0.011, c1: 20, c0: 100 } },
      { id: 'G3', bus: '3', pg: 85, v: 1.025, pmax: 250, cost: { c2: 0.01, c1: 19, c0: 110 } },
    ]),
    shunts: [],
    areas: [{ id: 'A1', name: 'Area 1', slackBus: '1' }],
    baseMVA: 100,
    baseFreq: 60,
  };
}

export function buildIEEE14(): PowerSystem {
  return {
    name: 'IEEE 14-Bus Test System',
    buses: buses([
      { id: '1', name: 'Bus 1 (Slack)', type: 'slack', x: 0, y: 0, voltage: 1.06, vbase: 138 },
      { id: '2', name: 'Bus 2', type: 'pv', x: 2, y: -1.2, voltage: 1.045, vbase: 138 },
      { id: '3', name: 'Bus 3', type: 'pv', x: 2, y: 1.2, voltage: 1.01, vbase: 138 },
      { id: '4', name: 'Bus 4', type: 'pq', x: 4, y: -0.6, vbase: 138 },
      { id: '5', name: 'Bus 5', type: 'pq', x: 4, y: -2.2, vbase: 138 },
      { id: '6', name: 'Bus 6', type: 'pv', x: 4.4, y: 0.9, voltage: 1.07, vbase: 13.8 },
      { id: '7', name: 'Bus 7', type: 'pq', x: 6, y: -0.4, vbase: 13.8 },
      { id: '8', name: 'Bus 8', type: 'pv', x: 7.6, y: 0.2, voltage: 1.09, vbase: 18 },
      { id: '9', name: 'Bus 9', type: 'pq', x: 6.2, y: -2.2, vbase: 13.8 },
      { id: '10', name: 'Bus 10', type: 'pq', x: 7.8, y: -1.5, vbase: 13.8 },
      { id: '11', name: 'Bus 11', type: 'pq', x: 8.2, y: -0.6, vbase: 13.8 },
      { id: '12', name: 'Bus 12', type: 'pq', x: 6.4, y: 1.8, vbase: 13.8 },
      { id: '13', name: 'Bus 13', type: 'pq', x: 8, y: 1.4, vbase: 13.8 },
      { id: '14', name: 'Bus 14', type: 'pq', x: 9.4, y: 0.6, vbase: 13.8 },
    ]),
    lines: lines([
      { id: 'L12', from: '1', to: '2', r: 0.01938, x: 0.05917, b: 0.0528, rating: 200, length: 30 },
      { id: 'L15', from: '1', to: '5', r: 0.05403, x: 0.22304, b: 0.0492, rating: 200, length: 50 },
      { id: 'L23', from: '2', to: '3', r: 0.04699, x: 0.19797, b: 0.0438, rating: 200, length: 40 },
      { id: 'L24', from: '2', to: '4', r: 0.05811, x: 0.17632, b: 0.034, rating: 200, length: 40 },
      { id: 'L25', from: '2', to: '5', r: 0.05695, x: 0.17388, b: 0.0346, rating: 200, length: 40 },
      { id: 'L34', from: '3', to: '4', r: 0.06701, x: 0.17103, b: 0.0128, rating: 200, length: 35 },
      { id: 'L45', from: '4', to: '5', r: 0.01335, x: 0.04211, b: 0, rating: 200, length: 25 },
      { id: 'L611', from: '6', to: '11', r: 0.09498, x: 0.1989, b: 0, rating: 100, length: 30 },
      { id: 'L612', from: '6', to: '12', r: 0.12291, x: 0.25581, b: 0, rating: 100, length: 35 },
      { id: 'L613', from: '6', to: '13', r: 0.06615, x: 0.13027, b: 0, rating: 100, length: 30 },
      { id: 'L910', from: '9', to: '10', r: 0.03181, x: 0.0845, b: 0, rating: 100, length: 20 },
      { id: 'L914', from: '9', to: '14', r: 0.12711, x: 0.27038, b: 0, rating: 100, length: 40 },
      { id: 'L1011', from: '10', to: '11', r: 0.08205, x: 0.19207, b: 0, rating: 100, length: 25 },
      { id: 'L1213', from: '12', to: '13', r: 0.22092, x: 0.19988, b: 0, rating: 100, length: 25 },
      { id: 'L1314', from: '13', to: '14', r: 0.17093, x: 0.34802, b: 0, rating: 100, length: 35 },
    ]),
    transformers: transformers([
      { id: 'T47', from: '4', to: '7', r: 0, x: 0.20912, rating: 100, vhigh: 138, vlow: 13.8 },
      { id: 'T49', from: '4', to: '9', r: 0, x: 0.55618, rating: 100, vhigh: 138, vlow: 13.8 },
      { id: 'T56', from: '5', to: '6', r: 0, x: 0.25202, rating: 100, vhigh: 138, vlow: 13.8 },
      { id: 'T78', from: '7', to: '8', r: 0, x: 0.17615, rating: 100, vhigh: 13.8, vlow: 18 },
      { id: 'T79', from: '7', to: '9', r: 0, x: 0.11001, rating: 100, vhigh: 13.8, vlow: 13.8 },
    ]),
    loads: loads([
      { id: 'LD2', bus: '2', pl: 21.7, ql: 12.7 },
      { id: 'LD3', bus: '3', pl: 94.2, ql: 19 },
      { id: 'LD4', bus: '4', pl: 47.8, ql: -3.9 },
      { id: 'LD5', bus: '5', pl: 7.6, ql: 1.6 },
      { id: 'LD6', bus: '6', pl: 11.2, ql: 7.5 },
      { id: 'LD9', bus: '9', pl: 29.5, ql: 16.6 },
      { id: 'LD10', bus: '10', pl: 9, ql: 5.8 },
      { id: 'LD11', bus: '11', pl: 3.5, ql: 1.8 },
      { id: 'LD12', bus: '12', pl: 6.1, ql: 1.6 },
      { id: 'LD13', bus: '13', pl: 13.5, ql: 5.8 },
      { id: 'LD14', bus: '14', pl: 14.9, ql: 5 },
    ]),
    generators: generators([
      { id: 'G1', bus: '1', pg: 232.4, qg: -16.9, v: 1.06, pmax: 400, cost: { c2: 0.006, c1: 16, c0: 150 } },
      { id: 'G2', bus: '2', pg: 40, qg: 42.4, v: 1.045, pmax: 150, cost: { c2: 0.009, c1: 18, c0: 120 } },
      { id: 'G3', bus: '3', pg: 0, qg: 23.4, v: 1.01, pmax: 120, cost: { c2: 0.01, c1: 19, c0: 100 } },
      { id: 'G6', bus: '6', pg: 0, qg: 12.2, v: 1.07, pmax: 100, cost: { c2: 0.012, c1: 21, c0: 90 } },
      { id: 'G8', bus: '8', pg: 0, qg: 17.4, v: 1.09, pmax: 100, cost: { c2: 0.013, c1: 22, c0: 80 } },
    ]),
    shunts: shunts([{ id: 'SH9', bus: '9', g: 0, b: 0.19 }]),
    areas: [{ id: 'A1', name: 'Area 1', slackBus: '1' }],
    baseMVA: 100,
    baseFreq: 60,
  };
}

export function buildDistributionFeeder(): PowerSystem {
  return {
    name: 'Distribution Feeder with DER',
    buses: buses([
      { id: 'SUB', name: 'Substation', type: 'slack', x: 0, y: 0, vbase: 13.8 },
      { id: 'F1', name: 'Feeder 1', type: 'pq', x: 2, y: 0, vbase: 4.16 },
      { id: 'F2', name: 'Feeder 2', type: 'pq', x: 4, y: 0, vbase: 4.16 },
      { id: 'F3', name: 'Feeder 3', type: 'pq', x: 6, y: 0, vbase: 4.16 },
      { id: 'F4', name: 'Feeder 4', type: 'pq', x: 8, y: 0, vbase: 4.16 },
      { id: 'DG', name: 'DER Bus', type: 'pv', x: 8, y: -1.8, voltage: 1.01, vbase: 4.16 },
    ]),
    lines: lines([
      { id: 'L12', from: 'F1', to: 'F2', r: 0.06, x: 0.12, rating: 10, length: 1.2 },
      { id: 'L23', from: 'F2', to: 'F3', r: 0.08, x: 0.14, rating: 10, length: 1.4 },
      { id: 'L34', from: 'F3', to: 'F4', r: 0.1, x: 0.18, rating: 10, length: 1.6 },
      { id: 'L4D', from: 'F4', to: 'DG', r: 0.02, x: 0.05, rating: 10, length: 0.4 },
    ]),
    transformers: transformers([
      { id: 'T1', from: 'SUB', to: 'F1', r: 0.002, x: 0.06, rating: 12, vhigh: 13.8, vlow: 4.16 },
    ]),
    loads: loads([
      { id: 'LD1', bus: 'F1', pl: 2.5, ql: 1.0 },
      { id: 'LD2', bus: 'F2', pl: 3.0, ql: 1.2 },
      { id: 'LD3', bus: 'F3', pl: 3.5, ql: 1.5 },
      { id: 'LD4', bus: 'F4', pl: 2.0, ql: 0.8 },
    ]),
    generators: generators([
      { id: 'GSUB', bus: 'SUB', pg: 12, v: 1.0, pmax: 20, cost: { c2: 0.01, c1: 25, c0: 200 } },
      { id: 'GDG', bus: 'DG', pg: 3, v: 1.01, pmax: 5, cost: { c2: 0.002, c1: 8, c0: 20 } },
    ]),
    shunts: shunts([{ id: 'C3', bus: 'F3', g: 0, b: 0.12 }]),
    areas: [{ id: 'A1', name: 'Feeder Area', slackBus: 'SUB' }],
    baseMVA: 10,
    baseFreq: 60,
  };
}

export const SAMPLE_SYSTEMS: SampleDefinition[] = [
  {
    id: 'demo',
    name: 'Demo 4-Bus',
    description: 'Small 4-bus network with one slack and one PV generator.',
    build: buildDemoSystem,
  },
  {
    id: 'ieee9',
    name: 'IEEE 9-Bus',
    description: 'Classic 3-machine, 9-bus transmission test system.',
    build: buildIEEE9,
  },
  {
    id: 'ieee14',
    name: 'IEEE 14-Bus',
    description: '14-bus transmission system with 5 generators and 3 voltage levels.',
    build: buildIEEE14,
  },
  {
    id: 'feeder',
    name: 'Distribution Feeder',
    description: 'Radial feeder with a substation transformer, capacitor bank and DER.',
    build: buildDistributionFeeder,
  },
];

export function getSample(id: string): SampleDefinition | undefined {
  return SAMPLE_SYSTEMS.find(sample => sample.id === id);
}

export function buildSample(id: string): PowerSystem {
  const sample = getSample(id) ?? SAMPLE_SYSTEMS[0];
  return sample.build();
}
