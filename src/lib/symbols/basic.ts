/**
 * Basic power system symbols (bus, generator, load, motor, line)
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

function drawRectangle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSize = 10) {
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export const busSymbol: IECSymbol = {
  type: 'bus',
  name: 'Bus',
  ieeeSymbol: 'JIC S1',
  category: 'network',
  width: 30,
  height: 10,
  connectionPoints: [
    { id: 'top', x: 15, y: 0, type: 'top' },
    { id: 'bottom', x: 15, y: 10, type: 'bottom' },
    { id: 'left', x: 0, y: 5, type: 'left' },
    { id: 'right', x: 30, y: 5, type: 'right' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'voltage', label: 'Voltage (kV)', type: 'number', unit: 'kV', default: 138 },
  ],
  render: (ctx, x, y) => {
    setStroke(ctx);
    drawLine(ctx, x - 15, y, x + 15, y);
  },
};

export const generatorSymbol: IECSymbol = {
  type: 'generator',
  name: 'Synchronous Generator',
  ieeeSymbol: 'IEEE 315 11-2-1',
  category: 'generation',
  width: 50,
  height: 40,
  connectionPoints: [
    { id: 'top', x: 25, y: 0, type: 'top' },
    { id: 'bottom', x: 25, y: 40, type: 'bottom' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'pg', label: 'P Generation', type: 'number', unit: 'MW', default: 100 },
    { key: 'qg', label: 'Q Generation', type: 'number', unit: 'MVAR', default: 50 },
    { key: 'v', label: 'Voltage Setpoint', type: 'number', unit: 'p.u.', default: 1.0, min: 0.9, max: 1.1 },
    { key: 'pmax', label: 'P Max', type: 'number', unit: 'MW', default: 200 },
    { key: 'pmin', label: 'P Min', type: 'number', unit: 'MW', default: 0 },
    { key: 'qmax', label: 'Q Max', type: 'number', unit: 'MVAR', default: 100 },
    { key: 'qmin', label: 'Q Min', type: 'number', unit: 'MVAR', default: -50 },
  ],
  render: (ctx, x, y) => {
    const cx = x + 25, cy = y + 20;
    setStroke(ctx);
    drawCircle(ctx, cx, cy, 15);
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();
    drawLine(ctx, cx, cy - 8, cx, cy - 15);
    drawLine(ctx, cx - 8, cy, cx + 8, cy);
    drawLine(ctx, cx, cy + 8, cx, cy + 15);
  },
};

export const loadSymbol: IECSymbol = {
  type: 'load',
  name: 'Load',
  ieeeSymbol: 'IEEE 315 10-3-1',
  category: 'load',
  width: 40,
  height: 40,
  connectionPoints: [
    { id: 'top', x: 20, y: 0, type: 'top' },
    { id: 'bottom', x: 20, y: 40, type: 'bottom' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'pl', label: 'P Demand', type: 'number', unit: 'MW', default: 50 },
    { key: 'ql', label: 'Q Demand', type: 'number', unit: 'MVAR', default: 30 },
    { key: 'demandModel', label: 'Demand Model', type: 'select', options: [
      { value: 'constant-power', label: 'Constant Power' },
      { value: 'constant-impedance', label: 'Constant Impedance' },
      { value: 'constant-current', label: 'Constant Current' },
    ]},
  ],
  render: (ctx, x, y) => {
    const cx = x + 20, cy = y + 20;
    setStroke(ctx);
    drawRectangle(ctx, cx, cy, 25, 25);
    drawLine(ctx, cx - 10, cy - 10, cx + 10, cy + 10);
    drawLine(ctx, cx - 10, cy + 10, cx + 10, cy - 10);
  },
};

export const motorSymbol: IECSymbol = {
  type: 'motor',
  name: 'Motor',
  ieeeSymbol: 'IEEE 315 11-4-1',
  category: 'load',
  width: 50,
  height: 40,
  connectionPoints: [
    { id: 'top', x: 25, y: 0, type: 'top' },
    { id: 'bottom', x: 25, y: 40, type: 'bottom' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'pm', label: 'Motor Power', type: 'number', unit: 'MW', default: 50 },
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'induction', label: 'Induction' },
      { value: 'synchronous', label: 'Synchronous' },
    ]},
  ],
  render: (ctx, x, y) => {
    const cx = x + 25, cy = y + 20;
    setStroke(ctx);
    drawCircle(ctx, cx, cy, 15);
    drawText(ctx, 'M', cx, cy, 14);
  },
};

export const lineSymbol: IECSymbol = {
  type: 'line',
  name: 'Transmission Line',
  ieeeSymbol: 'IEEE 315 11-5-1',
  category: 'transmission',
  width: 60,
  height: 20,
  connectionPoints: [
    { id: 'left', x: 0, y: 10, type: 'left' },
    { id: 'right', x: 60, y: 10, type: 'right' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'r', label: 'Resistance', type: 'number', unit: 'p.u.', default: 0.01 },
    { key: 'x', label: 'Reactance', type: 'number', unit: 'p.u.', default: 0.04 },
    { key: 'b', label: 'Susceptance', type: 'number', unit: 'p.u.', default: 0 },
    { key: 'rating', label: 'Rating', type: 'number', unit: 'MVA', default: 100 },
    { key: 'length', label: 'Length', type: 'number', unit: 'km', default: 100 },
  ],
  render: (ctx, x, y) => {
    setStroke(ctx);
    drawLine(ctx, x, y + 10, x + 60, y + 10);
  },
};

export const nodeSymbol: IECSymbol = {
  type: 'node',
  name: 'Node',
  ieeeSymbol: 'IEC 60617 03-02-01',
  category: 'network',
  width: 30,
  height: 30,
  connectionPoints: [
    { id: 'top', x: 15, y: 0, type: 'top' },
    { id: 'bottom', x: 15, y: 30, type: 'bottom' },
    { id: 'left', x: 0, y: 15, type: 'left' },
    { id: 'right', x: 30, y: 15, type: 'right' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'voltage', label: 'Voltage (kV)', type: 'number', unit: 'kV', default: 138 },
  ],
  render: (ctx, x, y) => {
    const cx = x + 15;
    const cy = y + 15;
    setStroke(ctx, '#000', 1.3);
    drawLine(ctx, cx, y, cx, cy - 8);
    drawLine(ctx, cx, cy + 8, cx, y + 30);
    drawCircle(ctx, cx, cy, 6);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  },
};

export const towerSymbol: IECSymbol = {
  type: 'tower',
  name: 'Transmission Tower',
  ieeeSymbol: 'IEC 60617 11-06-01',
  category: 'transmission',
  width: 44,
  height: 60,
  connectionPoints: [
    { id: 'top', x: 22, y: 0, type: 'top' },
    { id: 'bottom', x: 22, y: 60, type: 'bottom' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'height', label: 'Height', type: 'number', unit: 'm', default: 30 },
  ],
  render: (ctx, x, y) => {
    setStroke(ctx, '#000', 1.2);
    drawLine(ctx, x + 22, y, x + 22, y + 60);
    drawLine(ctx, x + 8, y + 60, x + 18, y + 18);
    drawLine(ctx, x + 36, y + 60, x + 26, y + 18);
    drawLine(ctx, x + 2, y + 16, x + 42, y + 16);
    drawLine(ctx, x + 7, y + 32, x + 37, y + 32);
    drawLine(ctx, x + 12, y + 46, x + 32, y + 46);
    drawLine(ctx, x + 18, y + 18, x + 22, y + 8);
    drawLine(ctx, x + 26, y + 18, x + 22, y + 8);
    drawLine(ctx, x + 18, y + 18, x + 26, y + 32);
    drawLine(ctx, x + 26, y + 18, x + 18, y + 32);
  },
};

export const waveTrapSymbol: IECSymbol = {
  type: 'wave-trap',
  name: 'Line Trap',
  ieeeSymbol: 'IEC 60617 11-07-01',
  category: 'transmission',
  width: 60,
  height: 30,
  connectionPoints: [
    { id: 'left', x: 0, y: 15, type: 'left' },
    { id: 'right', x: 60, y: 15, type: 'right' },
  ],
  properties: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'inductance', label: 'Inductance', type: 'number', unit: 'mH', default: 0.5 },
    { key: 'tuning', label: 'Tuning frequency', type: 'number', unit: 'kHz', default: 100 },
  ],
  render: (ctx, x, y) => {
    setStroke(ctx, '#000', 1.3);
    drawLine(ctx, x, y + 15, x + 8, y + 15);
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath();
      ctx.arc(x + 13 + index * 9, y + 15, 4.5, Math.PI, 0);
      ctx.stroke();
    }
    drawLine(ctx, x + 35, y + 15, x + 44, y + 15);
    drawLine(ctx, x + 44, y + 5, x + 44, y + 25);
    drawLine(ctx, x + 50, y + 5, x + 50, y + 25);
    drawLine(ctx, x + 50, y + 15, x + 60, y + 15);
  },
};
