/**
 * Panel meter symbols (voltmeter, ammeter, power-factor meter)
 *
 * The badges share the circle-and-lead style of the numbered protection relays
 * so a metering row reads as one set.
 */

import { IECSymbol } from '@/types';
import { drawBadge, drawLine, setStroke } from './primitives';

const meterBadge = (type: IECSymbol['type'], name: string, label: string): IECSymbol => ({
  type,
  name,
  ieeeSymbol: 'IEEE 315 11-1-1',
  category: 'measurement',
  width: 34,
  height: 38,
  connectionPoints: [
    { id: 'top', x: 17, y: 0, type: 'top' },
    { id: 'bottom', x: 17, y: 38, type: 'bottom' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'ratio', label: 'Ratio', type: 'string', default: '100/5' },
    { key: 'accuracyClass', label: 'Accuracy class', type: 'string', default: '1.0' },
  ],
  render: (ctx, x, y) => {
    drawBadge(ctx, x, y, 34, 38, label);
  },
});

export const voltmeterSymbol = meterBadge('voltmeter', 'Voltmeter', 'V');
export const ammeterSymbol = meterBadge('ammeter', 'Ammeter', 'A');

export const pfMeterSymbol: IECSymbol = {
  type: 'pf-meter',
  name: 'Power Factor Meter',
  ieeeSymbol: 'IEEE 315 11-1-4',
  category: 'measurement',
  width: 34,
  height: 38,
  connectionPoints: [
    { id: 'top', x: 17, y: 0, type: 'top' },
    { id: 'bottom', x: 17, y: 38, type: 'bottom' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'ratio', label: 'Ratio', type: 'string', default: '100/5' },
    { key: 'accuracyClass', label: 'Accuracy class', type: 'string', default: '1.0' },
  ],
  render: (ctx, x, y) => {
    drawBadge(ctx, x, y, 34, 38);
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
