import { describe, it, expect } from 'vitest';
import {
  COMPONENT_CATALOG,
  COMPONENT_CATEGORIES,
  buildGenericComponent,
  defaultComponentProperties,
  getComponentDefinition,
  getComponentsByCategory,
  getComponentGroups,
} from './component-catalog';

describe('component catalog', () => {
  it('covers every PSAT palette category', () => {
    expect(COMPONENT_CATEGORIES.map(category => category.id)).toEqual(['AC', 'DC', 'Instrument', 'Control', 'Other']);
    COMPONENT_CATEGORIES.forEach(category => {
      expect(getComponentsByCategory(category.id).length).toBeGreaterThan(0);
    });
  });

  it('has unique ids and required fields', () => {
    const ids = new Set<string>();
    COMPONENT_CATALOG.forEach(definition => {
      expect(definition.id).toBeTruthy();
      expect(definition.label).toBeTruthy();
      expect(definition.icon).toBeTruthy();
      expect(ids.has(definition.id)).toBe(false);
      ids.add(definition.id);
    });
    expect(COMPONENT_CATALOG.length).toBeGreaterThan(80);
  });

  it('includes the core AC, DC, instrument and control elements', () => {
    [
      'external-grid',
      'synchronous-generator',
      'two-winding-transformer',
      'overhead-line',
      'induction-motor',
      'current-transformer',
      'overcurrent-relay',
      'exciter',
      'governor',
      'pss',
      'dc-bus',
      'dc-motor',
      'dc-circuit-breaker',
      'push-button',
      'ground-grid-system',
    ].forEach(id => {
      expect(getComponentDefinition(id), id).toBeDefined();
    });
  });

  it('groups definitions for the palette', () => {
    expect(getComponentGroups('AC')).toContain('Buses');
    expect(getComponentGroups('DC')).toContain('DC Buses');
    expect(getComponentGroups('Instrument')).toContain('Relays');
    expect(getComponentGroups('Control')).toContain('Generator Controls');
  });

  it('builds generic components with default properties', () => {
    const definition = getComponentDefinition('dc-bus');
    expect(definition).toBeDefined();
    if (!definition) return;
    const component = buildGenericComponent(definition, { x: 2, y: 3 }, 'bus_1');
    expect(component.type).toBe('dc-bus');
    expect(component.category).toBe('DC');
    expect(component.bus).toBe('bus_1');
    expect(component.x).toBe(2);
    expect(component.y).toBe(3);
    expect(component.active).toBe(true);
    expect(component.properties.voltageV).toBe(480);
    expect(defaultComponentProperties(definition)).toEqual(component.properties);
  });
});
