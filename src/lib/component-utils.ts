import { GenericComponent, PowerSystem } from '@/types';
import { getComponentDefinition } from './component-catalog';

const GRID_UNIT = 100;

export interface Anchor {
  x: number;
  y: number;
}

export function componentAnchor(system: PowerSystem, component: GenericComponent): Anchor {
  const from = system.buses.find(bus => bus.id === component.fromBus);
  const to = system.buses.find(bus => bus.id === component.toBus);
  if (from && to) {
    return {
      x: ((from.x + to.x) / 2) * GRID_UNIT,
      y: ((from.y + to.y) / 2) * GRID_UNIT,
    };
  }
  return { x: component.x * GRID_UNIT, y: component.y * GRID_UNIT };
}

export function findNearestBusId(system: PowerSystem, position: { x: number; y: number }): string | undefined {
  if (system.buses.length === 0) return undefined;
  return system.buses.reduce(
    (best, bus) => {
      const distance = Math.hypot(bus.x - position.x, bus.y - position.y);
      return distance < best.distance ? { id: bus.id, distance } : best;
    },
    { id: system.buses[0].id, distance: Number.POSITIVE_INFINITY }
  ).id;
}

export function componentCategoryLabel(component: GenericComponent): string {
  return getComponentDefinition(component.type)?.label ?? component.name;
}
