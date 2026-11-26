/**
 * Panel meter symbols (voltmeter, ammeter, power-factor meter)
 *
 * The badges are drawn as a circle with a short lead above and below, a style
 * shared with the numbered protection relays so a metering row reads as one set.
 */

import { IECSymbol } from '@/types';

function setStroke(ctx: CanvasRenderingContext2D, color = '#000', width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSize = 10) {
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

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
    const cx = x + 17;
    const cy = y + 19;
    setStroke(ctx, '#000', 1.3);
    drawLine(ctx, cx, y, cx, cy - 13);
    drawLine(ctx, cx, cy + 13, cx, y + 38);
    drawCircle(ctx, cx, cy, 13);
    ctx.fillStyle = '#000';
    drawText(ctx, label, cx, cy + 0.5, 14);
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
    const cx = x + 17;
    const cy = y + 19;
    const pivotY = cy + 4;
    setStroke(ctx, '#000', 1.3);
    drawLine(ctx, cx, y, cx, cy - 13);
    drawLine(ctx, cx, cy + 13, cx, y + 38);
    drawCircle(ctx, cx, cy, 13);
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
