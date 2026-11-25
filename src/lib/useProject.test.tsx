import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Bus, GenericComponent, PowerSystem } from '@/types';
import { emptySystem } from './project';
import { useProject } from './useProject';

function bus(id: string, name: string, type: Bus['type'], x: number, y: number): Bus {
  return {
    id,
    name,
    type,
    voltage: 1,
    angle: 0,
    vmin: 0.9,
    vmax: 1.1,
    area: 1,
    region: 1,
    x,
    y,
    active: true,
  };
}

function placementSystem(): PowerSystem {
  return {
    ...emptySystem('Placement test'),
    buses: [bus('b1', 'Slack', 'slack', 0, 0), bus('b2', 'Load', 'pq', 4, 0), bus('b3', 'Island', 'pq', 9, 9)],
    lines: [
      {
        id: 'l1',
        fromBus: 'b1',
        toBus: 'b2',
        resistance: 0.01,
        reactance: 0.05,
        susceptance: 0,
        rating: 100,
        active: true,
      },
    ],
  };
}

function voltmeter(): Omit<GenericComponent, 'id'> {
  return {
    type: 'voltmeter',
    category: 'Instrument',
    name: 'Voltmeter',
    x: 1,
    y: 1,
    properties: {},
    active: true,
  };
}

describe('useProject placement', () => {
  it('moves a bus and restores it with undo and redo', () => {
    const { result } = renderHook(() => useProject(placementSystem()));

    act(() => {
      result.current.beginMove();
      result.current.moveBus('b2', 5, 2);
      result.current.endMove();
    });
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 5, y: 2 });

    act(() => result.current.undo());
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 4, y: 0 });

    act(() => result.current.redo());
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 5, y: 2 });
  });

  it('groups a drag into one undo step', () => {
    const { result } = renderHook(() => useProject(placementSystem()));

    act(() => {
      result.current.beginMove();
      result.current.moveBus('b2', 5, 1);
      result.current.moveBus('b2', 6, 2);
      result.current.moveBus('b2', 7, 3);
      result.current.endMove();
    });
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 7, y: 3 });

    act(() => result.current.undo());
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 4, y: 0 });
  });

  it('keeps separate drags as separate undo steps', () => {
    const { result } = renderHook(() => useProject(placementSystem()));

    act(() => {
      result.current.beginMove();
      result.current.moveBus('b2', 5, 2);
      result.current.endMove();
    });
    act(() => {
      result.current.beginMove();
      result.current.moveBus('b2', 6, 3);
      result.current.endMove();
    });

    act(() => result.current.undo());
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 5, y: 2 });
    act(() => result.current.undo());
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 4, y: 0 });
  });

  it('moves a generic component and restores it with undo', () => {
    const { result } = renderHook(() => useProject(placementSystem()));

    let componentId = '';
    act(() => {
      componentId = result.current.addComponent(voltmeter()).id;
    });
    act(() => {
      result.current.beginMove();
      result.current.moveComponent(componentId, 3.5, 4.5);
      result.current.endMove();
    });
    expect(result.current.system.components?.find(item => item.id === componentId)).toMatchObject({
      x: 3.5,
      y: 4.5,
    });

    act(() => result.current.undo());
    expect(result.current.system.components?.find(item => item.id === componentId)).toMatchObject({
      x: 1,
      y: 1,
    });
  });

  it('keeps the catalog symbol on a device', () => {
    const { result } = renderHook(() => useProject(placementSystem()));

    act(() => result.current.addDevice('generator', 'b1', { symbol: 'wind-turbine' }));
    expect(result.current.system.generators[0].symbol).toBe('wind-turbine');
  });

  it('arranges buses by network depth and keeps attached components nearby', () => {
    const system = placementSystem();
    system.components = [
      {
        ...voltmeter(),
        id: 'cmp_1',
        bus: 'b2',
      },
    ];
    const { result } = renderHook(() => useProject(system));

    act(() => result.current.autoArrange());

    const buses = new Map(result.current.system.buses.map(item => [item.id, item]));
    expect(buses.get('b1')?.x).toBe(0);
    expect(buses.get('b2')?.x).toBeCloseTo(2.4, 5);
    expect(buses.get('b3')?.x).toBeCloseTo(4.8, 5);
    expect(buses.get('b2')?.y).toBe(0);

    const component = result.current.system.components?.find(item => item.id === 'cmp_1');
    expect(component?.x).toBeCloseTo(3.3, 5);
    expect(component?.y).toBeCloseTo(0.7, 5);

    act(() => result.current.undo());
    expect(result.current.system.buses.find(item => item.id === 'b2')).toMatchObject({ x: 4, y: 0 });
  });
});
