/**
 * IEC/IEEE Standard Power System Symbols Library
 * Based on IEC 60617 and IEEE Std 315/315A standards
 *
 * Module structure to reduce code duplication:
 * - basic.ts: Core components (bus, generator, load, motor, line)
 * - transformers.ts: Transformer symbols
 * - protection.ts: Protection devices
 * - facts.ts: FACTS and renewable energy devices
 */

export * from './basic';
export * from './transformers';
export * from './protection';
export * from './measurement';
export * from './facts';

import { IECSymbol, IECSymbolType, IECSymbolCategory } from '@/types';

// Re-export types for consumers
export type { IECSymbol, IECSymbolType, IECSymbolCategory } from '@/types';

// Symbols record
import {
  busSymbol, generatorSymbol, loadSymbol, motorSymbol, lineSymbol,
  nodeSymbol, towerSymbol, waveTrapSymbol,
} from './basic';
import {
  transformerSymbol, transformer3WSymbol, transformerRegSymbol,
} from './transformers';
import {
  breakerSymbol, switchSymbol, disconnectSymbol, fuseSymbol, recloserSymbol,
  sectionalizerSymbol, ctSymbol, ptSymbol, relaySymbol,
  relay27Symbol, relay81Symbol, relay87Symbol, relay21Symbol, relay32Symbol,
  relayOcrSymbol, relay79Symbol, relayMrSymbol, relayLockoutSymbol, relaySstSymbol,
} from './protection';
import { voltmeterSymbol, ammeterSymbol, pfMeterSymbol } from './measurement';
import {
  svcSymbol, statcomSymbol, tcscSymbol, upfcSymbol, windTurbineSymbol,
  pvArraySymbol, batterySymbol, substationSymbol, arresterSymbol,
  shuntSymbol, capacitorBankSymbol, capacitorSymbol, busbarSymbol,
  meterSymbol, groundSymbol, externalGridSymbol, equivalentSymbol,
  consortiumSymbol, junctionSymbol,
} from './facts';

export const symbols: Record<IECSymbolType, IECSymbol> = {
  bus: busSymbol,
  generator: generatorSymbol,
  load: loadSymbol,
  motor: motorSymbol,
  shunt: shuntSymbol,
  capacitor: capacitorSymbol,
  'capacitor-bank': capacitorBankSymbol,
  'reactor-bank': shuntSymbol,
  busbar: busbarSymbol,
  line: lineSymbol,
  transformer: transformerSymbol,
  'transformer-3w': transformer3WSymbol,
  'transformer-reg': transformerRegSymbol,
  breaker: breakerSymbol,
  switch: switchSymbol,
  disconnect: disconnectSymbol,
  fuse: fuseSymbol,
  sectionalizer: sectionalizerSymbol,
  recloser: recloserSymbol,
  'current-transformer': ctSymbol,
  'potential-transformer': ptSymbol,
  relay: relaySymbol,
  meter: meterSymbol,
  ground: groundSymbol,
  'external-grid': externalGridSymbol,
  equivalent: equivalentSymbol,
  svc: svcSymbol,
  statcom: statcomSymbol,
  tcsc: tcscSymbol,
  upfc: upfcSymbol,
  'wind-turbine': windTurbineSymbol,
  'pv-array': pvArraySymbol,
  battery: batterySymbol,
  substation: substationSymbol,
  consortium: consortiumSymbol,
  arrestor: arresterSymbol,
  junction: junctionSymbol,
  reactor: shuntSymbol,
  node: nodeSymbol,
  tower: towerSymbol,
  'wave-trap': waveTrapSymbol,
  voltmeter: voltmeterSymbol,
  ammeter: ammeterSymbol,
  'pf-meter': pfMeterSymbol,
  'relay-27': relay27Symbol,
  'relay-81': relay81Symbol,
  'relay-87': relay87Symbol,
  'relay-21': relay21Symbol,
  'relay-32': relay32Symbol,
  'relay-ocr': relayOcrSymbol,
  'relay-79': relay79Symbol,
  'relay-mr': relayMrSymbol,
  'relay-lockout': relayLockoutSymbol,
  'relay-sst': relaySstSymbol,
};

export const symbolCategories = {
  generation: [generatorSymbol, externalGridSymbol, windTurbineSymbol],
  load: [loadSymbol, motorSymbol],
  transmission: [lineSymbol, transformerSymbol, transformer3WSymbol, transformerRegSymbol, towerSymbol, waveTrapSymbol],
  distribution: [lineSymbol, breakerSymbol, switchSymbol, disconnectSymbol],
  protection: [breakerSymbol, switchSymbol, disconnectSymbol, fuseSymbol, recloserSymbol, sectionalizerSymbol, relaySymbol, arresterSymbol,
    relay27Symbol, relay81Symbol, relay87Symbol, relay21Symbol, relay32Symbol, relayOcrSymbol, relay79Symbol, relayMrSymbol, relayLockoutSymbol, relaySstSymbol],
  measurement: [ctSymbol, ptSymbol, meterSymbol, voltmeterSymbol, ammeterSymbol, pfMeterSymbol],
  compensation: [shuntSymbol, capacitorBankSymbol, svcSymbol, statcomSymbol, tcscSymbol, upfcSymbol],
  storage: [batterySymbol],
  renewable: [windTurbineSymbol, pvArraySymbol],
  network: [busSymbol, busbarSymbol, substationSymbol, groundSymbol, equivalentSymbol, consortiumSymbol, junctionSymbol, nodeSymbol],
  substation: [substationSymbol],
} as const;

export function getSymbol(type: IECSymbolType): IECSymbol {
  return symbols[type];
}

export function getSymbolsByCategory(category: IECSymbolCategory): IECSymbol[] {
  const categoryMap: Record<string, IECSymbol[]> = symbolCategories as unknown as Record<string, IECSymbol[]>;
  return categoryMap[category] || [];
}

export function renderSymbol(ctx: CanvasRenderingContext2D, type: IECSymbolType, x: number, y: number): void {
  const symbol = symbols[type];
  if (symbol?.render) {
    symbol.render(ctx, x, y);
  }
}
