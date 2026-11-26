/**
 * Panel meter symbols (voltmeter, ammeter, power-factor meter)
 *
 * The badges share the circle-and-lead style of the numbered protection relays
 * so a metering row reads as one set.
 */

import { IECSymbol } from '@/types';
import { drawBadge, drawLine, setStroke } from './primitives';

const meterBase = {
  ieeeSymbol: 'IEEE 315 11-1-1',
  category: 'measurement' as const,
  width: 34,
  height: 38,
  connectionPoints: [
    { id: 'top', x: 17, y: 0, type: 'top' as const },
    { id: 'bottom', x: 17, y: 38, type: 'bottom' as const },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' as const },
    { key: 'ratio', label: 'Ratio', type: 'string' as const, default: '100/5' },
    { key: 'accuracyClass', label: 'Accuracy class', type: 'string' as const, default: '1.0' },
  ],
};

const meterBadge = (type: IECSymbol['type'], name: string, label: string): IECSymbol => ({
  ...meterBase,
  type,
  name,
  render: (ctx, x, y) => {
    drawBadge(ctx, x, y, meterBase.width, meterBase.height, label);
  },
});

export const voltmeterSymbol = meterBadge('voltmeter', 'Voltmeter', 'V');
export const ammeterSymbol = meterBadge('ammeter', 'Ammeter', 'A');

export const pfMeterSymbol: IECSymbol = {
  ...meterBase,
  type: 'pf-meter',
  name: 'Power Factor Meter',
  ieeeSymbol: 'IEEE 315 11-1-4',
  render: (ctx, x, y) => {
    drawBadge(ctx, x, y, meterBase.width, meterBase.height);
    const cx = x + 17;
    const pivotY = y + 23;
    setStroke(ctx, '#000', 1.3);
    ctx.beginPath();
    ctx.arc(cx, pivotY, 8.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    drawLine(ctx, cx, pivotY, cx + 5.5, pivotY - 9);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, pivotY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  },
};
