import type { IconName } from '@/components/Icon';
import type {
  BusType,
  ComponentCategory,
  Generator,
  GenericComponent,
  IECSymbolType,
  Line,
  Load,
  Shunt,
  Transformer,
} from '@/types';

export type ComponentModel = 'bus' | 'line' | 'transformer' | 'generator' | 'load' | 'shunt' | 'generic';

export type ComponentPropertyType = 'number' | 'text' | 'boolean' | 'select';

export interface ComponentPropertyDefinition {
  key: string;
  label: string;
  type: ComponentPropertyType;
  unit?: string;
  default: string | number | boolean;
  options?: string[];
}

export interface ComponentDefinition {
  id: string;
  label: string;
  category: ComponentCategory;
  group: string;
  icon: IconName;
  model: ComponentModel;
  symbol?: IECSymbolType;
  attach?: 'bus' | 'branch' | 'none';
  busType?: BusType;
  busKind?: string;
  lineDefaults?: Partial<Line>;
  transformerDefaults?: Partial<Transformer>;
  generatorDefaults?: Partial<Generator>;
  loadDefaults?: Partial<Load>;
  shuntDefaults?: Partial<Shunt>;
  properties?: ComponentPropertyDefinition[];
  description?: string;
}

const branchProperties: ComponentPropertyDefinition[] = [
  { key: 'ratingMVA', label: 'Rating', type: 'number', unit: 'MVA', default: 100 },
  { key: 'lengthKm', label: 'Length', type: 'number', unit: 'km', default: 1 },
  { key: 'notes', label: 'Notes', type: 'text', default: '' },
];

const dcProperties: ComponentPropertyDefinition[] = [
  { key: 'voltageV', label: 'Voltage', type: 'number', unit: 'V', default: 480 },
  { key: 'ratingKW', label: 'Rating', type: 'number', unit: 'kW', default: 100 },
  { key: 'notes', label: 'Notes', type: 'text', default: '' },
];

const protectionProperties: ComponentPropertyDefinition[] = [
  { key: 'ratingA', label: 'Rating', type: 'number', unit: 'A', default: 100 },
  { key: 'clearingTime', label: 'Clearing time', type: 'number', unit: 's', default: 0.05 },
  { key: 'notes', label: 'Notes', type: 'text', default: '' },
];

const instrumentProperties: ComponentPropertyDefinition[] = [
  { key: 'ratio', label: 'Ratio', type: 'text', default: '100/5' },
  { key: 'accuracyClass', label: 'Accuracy class', type: 'text', default: '1.0' },
  { key: 'notes', label: 'Notes', type: 'text', default: '' },
];

const controlProperties: ComponentPropertyDefinition[] = [
  { key: 'gain', label: 'Gain', type: 'number', default: 1 },
  { key: 'timeConstant', label: 'Time constant', type: 'number', unit: 's', default: 0.1 },
  { key: 'notes', label: 'Notes', type: 'text', default: '' },
];

const conversionProperties: ComponentPropertyDefinition[] = [
  { key: 'ratingKVA', label: 'Rating', type: 'number', unit: 'kVA', default: 100 },
  { key: 'efficiency', label: 'Efficiency', type: 'number', unit: 'pu', default: 0.95 },
  { key: 'notes', label: 'Notes', type: 'text', default: '' },
];

const genericProperties: ComponentPropertyDefinition[] = [
  { key: 'rating', label: 'Rating', type: 'number', default: 100 },
  { key: 'notes', label: 'Notes', type: 'text', default: '' },
];

const bus = (
  id: string,
  label: string,
  busKind: string,
  icon: IconName = 'bus',
  symbol: IECSymbolType = 'busbar',
  busType: BusType = 'pq'
): ComponentDefinition => ({
  id,
  label,
  category: 'AC',
  group: 'Buses',
  icon,
  model: 'bus',
  symbol,
  busType,
  busKind,
  attach: 'none',
  description: `${label} bus element`,
});

const source = (
  id: string,
  label: string,
  icon: IconName,
  symbol: IECSymbolType,
  defaults: Partial<Generator>
): ComponentDefinition => ({
  id,
  label,
  category: 'AC',
  group: 'Sources',
  icon,
  model: 'generator',
  symbol,
  attach: 'bus',
  generatorDefaults: { name: label, pg: 0, qg: 0, v: 1, pmax: 100, pmin: 0, qmax: 50, qmin: -50, symbol, ...defaults },
  description: `${label} source`,
});

const acBranch = (
  id: string,
  label: string,
  model: 'line' | 'transformer',
  icon: IconName,
  symbol: IECSymbolType,
  defaults: Partial<Line> | Partial<Transformer>,
  description?: string
): ComponentDefinition => ({
  id,
  label,
  category: 'AC',
  group: 'Branches',
  icon,
  model,
  symbol,
  attach: 'branch',
  ...(model === 'line'
    ? { lineDefaults: { name: label, resistance: 0.01, reactance: 0.05, susceptance: 0, rating: 100, length: 10, symbol, ...(defaults as Partial<Line>) } }
    : { transformerDefaults: { name: label, resistance: 0.001, reactance: 0.05, tap: 1, shift: 0, rating: 100, symbol, ...(defaults as Partial<Transformer>) } }),
  description: description ?? `${label} branch`,
});

const acLoad = (
  id: string,
  label: string,
  icon: IconName,
  symbol: IECSymbolType,
  defaults: Partial<Load>
): ComponentDefinition => ({
  id,
  label,
  category: 'AC',
  group: 'Loads & Motors',
  icon,
  model: 'load',
  symbol,
  attach: 'bus',
  loadDefaults: { name: label, pl: 10, ql: 5, demandModel: 'constant-power', symbol, ...defaults },
  description: `${label} load`,
});

const shunt = (
  id: string,
  label: string,
  icon: IconName,
  symbol: IECSymbolType,
  defaults: Partial<Shunt>,
  description?: string
): ComponentDefinition => ({
  id,
  label,
  category: 'AC',
  group: 'Loads & Motors',
  icon,
  model: 'shunt',
  symbol,
  attach: 'bus',
  shuntDefaults: { name: label, g: 0, b: 0.05, symbol, ...defaults },
  description: description ?? `${label} shunt element`,
});

const generic = (
  id: string,
  label: string,
  category: ComponentCategory,
  group: string,
  icon: IconName,
  symbol: IECSymbolType | undefined,
  properties: ComponentPropertyDefinition[] = genericProperties,
  attach: 'bus' | 'branch' | 'none' = 'none',
  description?: string
): ComponentDefinition => ({
  id,
  label,
  category,
  group,
  icon,
  model: 'generic',
  symbol,
  attach,
  properties,
  description: description ?? `${label} element`,
});

export const COMPONENT_CATALOG: ComponentDefinition[] = [
  // AC sources
  source('external-grid', 'External Grid', 'generator', 'external-grid', { pg: 0, pmax: 1000, qmax: 500, qmin: -500 }),
  source('power-grid', 'Power Grid', 'generator', 'external-grid', { pg: 0, pmax: 1000, qmax: 500, qmin: -500 }),
  source('synchronous-generator', 'Synchronous Generator', 'generator', 'generator', { pg: 50, pmax: 200 }),
  source('induction-generator', 'Induction Generator', 'generator', 'wind-turbine', { pg: 20, pmax: 100 }),
  source('wind-turbine-generator', 'Wind Turbine', 'wind', 'wind-turbine', { pg: 20, pmax: 100 }),
  source('photovoltaic-array', 'PV Array', 'solar', 'pv-array', { pg: 10, pmax: 50 }),
  source('solar-panel', 'Solar Panel', 'solar', 'pv-array', { pg: 5, pmax: 25 }),
  source('battery-storage', 'Battery Storage', 'battery', 'battery', { pg: 5, pmax: 25 }),

  // AC buses
  bus('bus', 'Bus', '', 'bus', 'bus'),
  bus('mcc', 'MCC', 'MCC'),
  bus('switchgear', 'Switchgear', 'Switchgear'),
  bus('switchboard', 'Switchboard', 'Switchboard'),
  bus('switchrack', 'Switchrack', 'Switchrack'),
  bus('panelboard', 'Panelboard', 'Panelboard'),
  bus('cable-bus', 'Cable Bus', 'Cable Bus'),
  bus('open-air', 'Open Air Bus', 'Open Air'),
  bus('bus-duct', 'Bus Duct', 'Bus Duct'),
  bus('busway', 'Busway', 'Busway'),
  generic('node', 'Node', 'AC', 'Buses', 'bus', 'node', genericProperties, 'none', 'Junction node on the one-line diagram'),

  // AC branches
  acBranch('overhead-line', 'Overhead Line', 'line', 'line', 'line', { lineType: 'overhead', resistance: 0.02, reactance: 0.08 }),
  acBranch('power-cable', 'Power Cable', 'line', 'line', 'line', { lineType: 'cable', resistance: 0.05, reactance: 0.03 }),
  acBranch('two-winding-transformer', '2-Winding Transformer', 'transformer', 'transformer', 'transformer', { reactance: 0.05 }),
  generic('three-winding-transformer', '3-Winding Transformer', 'AC', 'Branches', 'transformer', 'transformer-3w', branchProperties, 'branch'),
  acBranch('three-single-phase-transformers', '3 × 1-Phase Transformer', 'transformer', 'transformer', 'transformer', { reactance: 0.05 }),
  acBranch('open-delta-transformer', 'Open-Delta Transformer', 'transformer', 'transformer', 'transformer', { reactance: 0.06 }),
  acBranch('zigzag-grounding-transformer', 'ZigZag Grounding Transformer', 'transformer', 'transformer', 'transformer', { reactance: 0.04 }),
  acBranch('current-limiting-reactor', 'Current Limiting Reactor', 'line', 'line', 'line', { resistance: 0, reactance: 0.1 }),
  acBranch('series-capacitor', 'Series Capacitor', 'line', 'line', 'line', { resistance: 0, reactance: -0.05 }),
  acBranch('impedance', 'Impedance', 'line', 'line', 'line', { resistance: 0.01, reactance: 0.05 }),
  generic('hvdc-link', 'HVDC Link', 'AC', 'Branches', 'line', 'line', branchProperties, 'branch'),
  acBranch('distribution-voltage-regulator', 'Voltage Regulator', 'transformer', 'transformer', 'transformer-reg', { reactance: 0.04 }),
  generic('remote-connector', 'Remote Connector', 'AC', 'Branches', 'connect', 'junction', genericProperties, 'branch'),
  generic('phase-adapter', 'Phase Adapter', 'AC', 'Branches', 'connect', 'junction', genericProperties, 'branch'),
  generic('grounding-adapter', 'Grounding Adapter', 'AC', 'Branches', 'connect', 'ground', genericProperties, 'branch'),
  generic('transmission-tower', 'Transmission Tower', 'AC', 'Branches', 'line', 'tower', genericProperties, 'none'),
  generic('wave-trap', 'Line Trap (Wave Trap)', 'AC', 'Branches', 'line', 'wave-trap', branchProperties, 'branch'),

  // AC loads and motors
  acLoad('static-load', 'Static Load', 'load', 'load', { pl: 10, ql: 5 }),
  acLoad('lumped-load', 'Lumped Load', 'load', 'load', { pl: 20, ql: 10 }),
  acLoad('induction-motor', 'Induction Motor', 'motor', 'motor', { pl: 15, ql: 7 }),
  acLoad('synchronous-motor', 'Synchronous Motor', 'motor', 'motor', { pl: 20, ql: 8 }),
  source('synchronous-condenser', 'Synchronous Condenser', 'generator', 'generator', { pg: 0, pmax: 1, qmax: 100, qmin: -100 }),
  acLoad('panel-system', 'Panel System', 'load', 'load', { pl: 30, ql: 15 }),
  shunt('svc', 'Static Var Compensator', 'facts', 'svc', { b: 0.1 }),
  shunt('capacitor', 'Capacitor', 'shunt', 'capacitor', { b: 0.05 }),
  shunt('switched-capacitor', 'Switched Capacitor', 'shunt', 'capacitor', { b: 0.1 }),
  shunt('harmonic-filter-single-tuned', 'Single-Tuned Filter', 'shunt', 'shunt', { b: 0.05 }),
  shunt('harmonic-filter-high-pass', 'High-Pass Filter', 'shunt', 'shunt', { b: 0.05 }),
  shunt('harmonic-filter-band-pass', 'Band-Pass Filter', 'shunt', 'shunt', { b: 0.05 }),
  shunt('harmonic-filter-3rd-order', '3rd-Order Damped Filter', 'shunt', 'shunt', { b: 0.05 }),
  shunt('harmonic-filter-c-type', 'C-Type Filter', 'shunt', 'shunt', { b: 0.05 }),
  acLoad('motor-operated-valve', 'Motor Operated Valve', 'motor', 'motor', { pl: 1, ql: 0.5 }),

  // AC protection and switching
  generic('fuse', 'Fuse', 'AC', 'Protection & Switching', 'fuse', 'fuse', protectionProperties, 'branch'),
  generic('hv-circuit-breaker', 'HV Circuit Breaker', 'AC', 'Protection & Switching', 'breaker', 'breaker', protectionProperties, 'branch'),
  generic('recloser', 'Recloser', 'AC', 'Protection & Switching', 'breaker', 'recloser', protectionProperties, 'branch'),
  generic('overload-heater', 'Overload Heater', 'AC', 'Protection & Switching', 'relay', 'relay', protectionProperties, 'branch'),
  generic('single-throw-switch', 'Single Throw Switch', 'AC', 'Protection & Switching', 'breaker', 'switch', protectionProperties, 'branch'),
  generic('double-throw-switch', 'Double Throw Switch', 'AC', 'Protection & Switching', 'breaker', 'switch', protectionProperties, 'branch'),
  generic('ground-switch', 'Ground Switch', 'AC', 'Protection & Switching', 'breaker', 'switch', protectionProperties, 'branch'),
  generic('contactor', 'Contactor', 'AC', 'Protection & Switching', 'breaker', 'switch', protectionProperties, 'branch'),
  generic('disconnect-switch', 'Disconnect Switch', 'AC', 'Protection & Switching', 'breaker', 'disconnect', protectionProperties, 'branch'),
  generic('lv-circuit-breaker', 'LV Circuit Breaker', 'AC', 'Protection & Switching', 'breaker', 'breaker', protectionProperties, 'branch'),
  generic('in-line-overload-relay', 'In-Line Overload Relay', 'AC', 'Protection & Switching', 'relay', 'relay', protectionProperties, 'branch'),

  // AC conversion
  generic('ups', 'UPS', 'AC', 'Conversion', 'battery', 'battery', conversionProperties, 'bus'),
  generic('vfd', 'Variable Frequency Drive', 'AC', 'Conversion', 'facts', 'svc', conversionProperties, 'bus'),
  generic('battery-charger', 'Battery Charger / Rectifier', 'AC', 'Conversion', 'battery', 'battery', conversionProperties, 'bus'),
  generic('inverter', 'Inverter', 'AC', 'Conversion', 'solar', 'pv-array', conversionProperties, 'bus'),

  // Instruments
  generic('current-transformer', 'Current Transformer (CT)', 'Instrument', 'Meters', 'meter', 'current-transformer', instrumentProperties, 'bus'),
  generic('potential-transformer', 'Potential Transformer (PT/VT)', 'Instrument', 'Meters', 'meter', 'potential-transformer', instrumentProperties, 'bus'),
  generic('voltmeter', 'Voltmeter', 'Instrument', 'Meters', 'meter', 'voltmeter', instrumentProperties, 'bus'),
  generic('ammeter', 'Ammeter', 'Instrument', 'Meters', 'meter', 'ammeter', instrumentProperties, 'bus'),
  generic('power-factor-meter', 'Power Factor Meter', 'Instrument', 'Meters', 'meter', 'pf-meter', instrumentProperties, 'bus'),
  generic('multimeter', 'Multimeter', 'Instrument', 'Meters', 'meter', 'meter', instrumentProperties, 'bus'),
  generic('voltage-relay', 'Voltage Relay (27)', 'Instrument', 'Relays', 'relay', 'relay-27', instrumentProperties, 'bus'),
  generic('frequency-relay', 'Frequency Relay (81)', 'Instrument', 'Relays', 'relay', 'relay-81', instrumentProperties, 'bus'),
  generic('motor-relay', 'Motor Relay', 'Instrument', 'Relays', 'relay', 'relay', instrumentProperties, 'bus'),
  generic('differential-relay', 'Differential Relay (87)', 'Instrument', 'Relays', 'relay', 'relay-87', instrumentProperties, 'bus'),
  generic('reverse-power-relay', 'Reverse Power Relay (32)', 'Instrument', 'Relays', 'relay', 'relay-32', instrumentProperties, 'bus'),
  generic('solid-state-trip-relay', 'Solid-State Trip Relay (SST)', 'Instrument', 'Relays', 'relay', 'relay-sst', instrumentProperties, 'bus'),
  generic('overcurrent-relay', 'Overcurrent Relay (50/51)', 'Instrument', 'Relays', 'relay', 'relay-ocr', instrumentProperties, 'bus'),
  generic('distance-relay', 'Distance Relay (21)', 'Instrument', 'Relays', 'relay', 'relay-21', instrumentProperties, 'bus'),
  generic('overload-relay', 'Overload Relay', 'Instrument', 'Relays', 'relay', 'relay', instrumentProperties, 'bus'),
  generic('multi-functional-relay', 'Multi-Functional Relay (MR)', 'Instrument', 'Relays', 'relay', 'relay-mr', instrumentProperties, 'bus'),
  generic('reclosing-relay', 'Reclosing Relay (79)', 'Instrument', 'Relays', 'relay', 'relay-79', instrumentProperties, 'bus'),
  generic('lockout-relay', 'Lockout Relay (86)', 'Instrument', 'Relays', 'relay', 'relay-lockout', instrumentProperties, 'bus'),

  // Control systems
  generic('exciter', 'Exciter', 'Control', 'Generator Controls', 'settings', undefined, controlProperties, 'bus'),
  generic('governor', 'Governor', 'Control', 'Generator Controls', 'settings', undefined, controlProperties, 'bus'),
  generic('pss', 'Power System Stabilizer (PSS)', 'Control', 'Generator Controls', 'settings', undefined, controlProperties, 'bus'),
  generic('avr', 'Automatic Voltage Regulator (AVR)', 'Control', 'Generator Controls', 'settings', undefined, controlProperties, 'bus'),
  generic('ltc', 'Load Tap Changer (LTC)', 'Control', 'System Controls', 'settings', undefined, controlProperties, 'bus'),

  // DC elements
  generic('dc-bus', 'DC Bus', 'DC', 'DC Buses', 'bus', 'busbar', dcProperties),
  generic('dc-battery', 'DC Battery', 'DC', 'DC Sources', 'battery', 'battery', dcProperties),
  generic('dc-pv-array', 'DC PV Array', 'DC', 'DC Sources', 'solar', 'pv-array', dcProperties),
  generic('dc-dc-converter', 'DC-DC Converter', 'DC', 'DC Sources', 'facts', 'svc', dcProperties),
  generic('dc-motor', 'DC Motor', 'DC', 'DC Loads', 'motor', 'motor', dcProperties),
  generic('dc-static-load', 'DC Static Load', 'DC', 'DC Loads', 'load', 'load', dcProperties),
  generic('dc-lumped-load', 'DC Lumped Load', 'DC', 'DC Loads', 'load', 'load', dcProperties),
  generic('dc-branch-impedance', 'DC Branch Impedance', 'DC', 'DC Branches', 'line', 'line', branchProperties),
  generic('dc-cable', 'DC Cable', 'DC', 'DC Branches', 'line', 'line', branchProperties),
  generic('dc-fuse', 'DC Fuse', 'DC', 'DC Protection', 'fuse', 'fuse', protectionProperties),
  generic('dc-circuit-breaker', 'DC Circuit Breaker', 'DC', 'DC Protection', 'breaker', 'breaker', protectionProperties),
  generic('dc-switch-single', 'DC Switch (Single Throw)', 'DC', 'DC Protection', 'breaker', 'switch', protectionProperties),
  generic('dc-switch-double', 'DC Switch (Double Throw)', 'DC', 'DC Protection', 'breaker', 'switch', protectionProperties),

  // DC control system
  generic('dc-control-bus', 'DC Control Bus', 'DC', 'DC Control', 'bus', 'busbar', dcProperties),
  generic('dc-control-fuse', 'DC Control Fuse', 'DC', 'DC Control', 'fuse', 'fuse', protectionProperties),
  generic('dc-control-breaker', 'DC Control Breaker', 'DC', 'DC Control', 'breaker', 'breaker', protectionProperties),
  generic('push-button', 'Push Button', 'DC', 'DC Control', 'settings', undefined, genericProperties),
  generic('dc-control-switch', 'DC Control Switch', 'DC', 'DC Control', 'breaker', 'switch', protectionProperties),
  generic('contact', 'Contact', 'DC', 'DC Control', 'settings', undefined, genericProperties),
  generic('double-contact', 'Double Contact', 'DC', 'DC Control', 'settings', undefined, genericProperties),
  generic('macro-contact', 'Macro-Controlled Contact', 'DC', 'DC Control', 'settings', undefined, genericProperties),
  generic('wire', 'Wire', 'DC', 'DC Control', 'line', 'line', genericProperties),
  generic('dc-control-impedance', 'DC Control Impedance', 'DC', 'DC Control', 'line', 'line', genericProperties),
  generic('light', 'Light', 'DC', 'DC Control', 'settings', undefined, genericProperties),
  generic('solenoid', 'Solenoid', 'DC', 'DC Control', 'settings', undefined, genericProperties),
  generic('general-load', 'General Load', 'DC', 'DC Control', 'load', 'load', genericProperties),
  generic('control-relay', 'Control Relay', 'DC', 'DC Control', 'relay', 'relay', controlProperties),

  // Other / composite
  generic('ground-grid-system', 'Ground Grid System', 'Other', 'Grounding', 'area', 'ground', genericProperties),
  generic('composite-network', 'Composite Network', 'Other', 'Composite', 'project', 'consortium', genericProperties),
  generic('composite-motor', 'Composite Motor / MCC', 'Other', 'Composite', 'motor', 'motor', genericProperties),
  generic('remote-connector-other', 'Remote Connector', 'Other', 'Connectors', 'connect', 'junction', genericProperties),
  generic('phase-adapter-other', 'Phase Adapter', 'Other', 'Connectors', 'connect', 'junction', genericProperties),
  generic('grounding-adapter-other', 'Grounding Adapter', 'Other', 'Connectors', 'connect', 'ground', genericProperties),
];

export const COMPONENT_CATEGORIES: { id: ComponentCategory; label: string; short: string }[] = [
  { id: 'AC', label: 'AC Components', short: 'AC' },
  { id: 'DC', label: 'DC Components', short: 'DC' },
  { id: 'Instrument', label: 'Instruments', short: 'Ins' },
  { id: 'Control', label: 'Control Systems', short: 'CS' },
  { id: 'Other', label: 'Other Components', short: 'Other' },
];

export function getComponentDefinition(id: string): ComponentDefinition | undefined {
  return COMPONENT_CATALOG.find(definition => definition.id === id);
}

export function getComponentsByCategory(category: ComponentCategory): ComponentDefinition[] {
  return COMPONENT_CATALOG.filter(definition => definition.category === category);
}

export function getComponentGroups(category: ComponentCategory): string[] {
  return Array.from(new Set(getComponentsByCategory(category).map(definition => definition.group)));
}

export function defaultComponentProperties(definition: ComponentDefinition): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = {};
  (definition.properties ?? []).forEach(property => {
    properties[property.key] = property.default;
  });
  return properties;
}

export function buildGenericComponent(
  definition: ComponentDefinition,
  position: { x: number; y: number },
  bus?: string
): Omit<GenericComponent, 'id'> {
  return {
    type: definition.id,
    category: definition.category,
    name: definition.label,
    bus,
    x: position.x,
    y: position.y,
    properties: defaultComponentProperties(definition),
    active: true,
  };
}
