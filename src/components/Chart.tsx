'use client';

import { useId } from 'react';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
  dashed?: boolean;
}

interface ChartProps {
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
  mode?: 'line' | 'scatter';
  yMin?: number;
  yMax?: number;
  xMin?: number;
  xMax?: number;
  referenceY?: { value: number; label: string; color?: string }[];
  showLegend?: boolean;
  emptyMessage?: string;
  xLog?: boolean;
  yLog?: boolean;
}

const WIDTH = 640;
const HEIGHT = 300;
const PADDING = { left: 54, right: 16, top: 16, bottom: 38 };

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min];
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const candidates = [1, 2, 2.5, 5, 10];
  const niceStep = candidates.map(c => c * step).find(c => span / c <= count * 1.4) ?? step * 10;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let value = start; value <= max + niceStep * 0.001; value += niceStep) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks.length >= 2 ? ticks : [min, max];
}

const formatTick = (value: number): string => {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  if (abs === 0) return '0';
  return value.toFixed(3);
};

export default function Chart({
  series,
  xLabel,
  yLabel,
  height = 320,
  mode = 'line',
  yMin,
  yMax,
  xMin,
  xMax,
  referenceY = [],
  showLegend = true,
  emptyMessage = 'No data to plot',
  xLog = false,
  yLog = false,
}: ChartProps) {
  const id = useId().replace(/:/g, '');
  const allPoints = series.flatMap(item => item.points);
  if (allPoints.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded border border-dashed border-slate-300 text-[11px] text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const tx = (value: number) => (xLog ? Math.log10(Math.max(value, 1e-9)) : value);
  const ty = (value: number) => (yLog ? Math.log10(Math.max(value, 1e-9)) : value);
  const tickLabel = (value: number) => formatTick(Math.pow(10, value));

  const domainXMin = tx(xMin ?? Math.min(...allPoints.map(point => point.x)));
  const domainXMax = tx(xMax ?? Math.max(...allPoints.map(point => point.x)));
  const domainYMin = ty(yMin ?? Math.min(...allPoints.map(point => point.y)));
  const domainYMax = ty(yMax ?? Math.max(...allPoints.map(point => point.y)));

  const paddedYMin = domainYMin === domainYMax ? domainYMin - 1 : domainYMin;
  const paddedYMax = domainYMin === domainYMax ? domainYMax + 1 : domainYMax;
  const yTicks = niceTicks(paddedYMin, paddedYMax, 5);
  const xTicks = niceTicks(domainXMin, domainXMax, 6);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const scaleX = (value: number) =>
    PADDING.left + ((tx(value) - domainXMin) / Math.max(1e-9, domainXMax - domainXMin)) * plotWidth;
  const scaleY = (value: number) =>
    PADDING.top + plotHeight - ((ty(value) - paddedYMin) / Math.max(1e-9, paddedYMax - paddedYMin)) * plotHeight;

  return (
    <div className="rounded border border-[#dde4ec] bg-white p-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height }} role="img" aria-label={`${yLabel} versus ${xLabel}`}>
        <defs>
          <clipPath id={`clip-${id}`}>
            <rect x={PADDING.left} y={PADDING.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        {yTicks.map(tick => (
          <g key={`y-${tick}`}>
            <line
              x1={PADDING.left}
              y1={scaleY(tick)}
              x2={WIDTH - PADDING.right}
              y2={scaleY(tick)}
              stroke="#eef2f7"
              strokeWidth={1}
            />
            <text x={PADDING.left - 6} y={scaleY(tick) + 3} textAnchor="end" fontSize={9} fill="#64748b">
              {yLog ? tickLabel(tick) : formatTick(tick)}
            </text>
          </g>
        ))}
        {xTicks.map(tick => (
          <g key={`x-${tick}`}>
            <line
              x1={scaleX(tick)}
              y1={PADDING.top}
              x2={scaleX(tick)}
              y2={HEIGHT - PADDING.bottom}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
            <text x={scaleX(tick)} y={HEIGHT - PADDING.bottom + 13} textAnchor="middle" fontSize={9} fill="#64748b">
              {xLog ? tickLabel(tick) : formatTick(tick)}
            </text>
          </g>
        ))}

        <line x1={PADDING.left} y1={HEIGHT - PADDING.bottom} x2={WIDTH - PADDING.right} y2={HEIGHT - PADDING.bottom} stroke="#94a3b8" />
        <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={HEIGHT - PADDING.bottom} stroke="#94a3b8" />

        {referenceY.map(reference => (
          <g key={reference.label}>
            <line
              x1={PADDING.left}
              y1={scaleY(reference.value)}
              x2={WIDTH - PADDING.right}
              y2={scaleY(reference.value)}
              stroke={reference.color ?? '#ef4444'}
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <text x={WIDTH - PADDING.right - 2} y={scaleY(reference.value) - 3} textAnchor="end" fontSize={8.5} fill={reference.color ?? '#ef4444'}>
              {reference.label}
            </text>
          </g>
        ))}

        <g clipPath={`url(#clip-${id})`}>
          {series.map(item => {
            if (item.points.length === 0) return null;
            if (mode === 'scatter') {
              return (
                <g key={item.name}>
                  {item.points.map((point, index) => (
                    <circle key={index} cx={scaleX(point.x)} cy={scaleY(point.y)} r={2.6} fill={item.color} opacity={0.85} />
                  ))}
                </g>
              );
            }
            const path = item.points
              .map((point, index) => `${index === 0 ? 'M' : 'L'}${scaleX(point.x).toFixed(2)},${scaleY(point.y).toFixed(2)}`)
              .join(' ');
            return (
              <path
                key={item.name}
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={1.8}
                strokeDasharray={item.dashed ? '5 4' : undefined}
                strokeLinejoin="round"
              />
            );
          })}
        </g>

        <text x={PADDING.left + plotWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={10} fill="#475569">
          {xLabel}
        </text>
        <text x={12} y={PADDING.top + plotHeight / 2} textAnchor="middle" fontSize={10} fill="#475569" transform={`rotate(-90 12 ${PADDING.top + plotHeight / 2})`}>
          {yLabel}
        </text>
      </svg>

      {showLegend && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {series.map(item => (
            <span key={item.name} className="flex items-center gap-1 text-[10px] text-slate-600">
              <span className="inline-block h-2 w-4 rounded" style={{ background: item.color }} />
              {item.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface BarChartProps {
  labels: string[];
  values: number[];
  yLabel: string;
  xLabel?: string;
  color?: (value: number, index: number) => string;
  referenceY?: { value: number; label: string; color?: string }[];
  height?: number;
  yMin?: number;
  yMax?: number;
}

export function BarChart({
  labels,
  values,
  yLabel,
  xLabel = '',
  color,
  referenceY = [],
  height = 320,
  yMin,
  yMax,
}: BarChartProps) {
  const id = useId().replace(/:/g, '');
  if (values.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded border border-dashed border-slate-300 text-[11px] text-slate-400">
        No data to plot
      </div>
    );
  }

  const maxValue = Math.max(yMax ?? -Infinity, ...values, ...referenceY.map(item => item.value));
  const minValue = Math.min(yMin ?? Infinity, ...values, 0);
  const yTicks = niceTicks(minValue, maxValue === minValue ? maxValue + 1 : maxValue, 5);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const scaleY = (value: number) =>
    PADDING.top + plotHeight - ((value - minValue) / Math.max(1e-9, maxValue - minValue)) * plotHeight;
  const barWidth = Math.max(2, Math.min(28, plotWidth / Math.max(1, values.length) - 4));

  return (
    <div className="rounded border border-[#dde4ec] bg-white p-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', height }} role="img" aria-label={yLabel}>
        <defs>
          <clipPath id={`bar-clip-${id}`}>
            <rect x={PADDING.left} y={PADDING.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>
        {yTicks.map(tick => (
          <g key={tick}>
            <line x1={PADDING.left} y1={scaleY(tick)} x2={WIDTH - PADDING.right} y2={scaleY(tick)} stroke="#eef2f7" />
            <text x={PADDING.left - 6} y={scaleY(tick) + 3} textAnchor="end" fontSize={9} fill="#64748b">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#bar-clip-${id})`}>
          {values.map((value, index) => {
            const slot = plotWidth / Math.max(1, values.length);
            const x = PADDING.left + slot * index + (slot - barWidth) / 2;
            const y = Math.min(scaleY(value), scaleY(0));
            const barHeight = Math.abs(scaleY(value) - scaleY(0));
            return (
              <rect
                key={`${labels[index]}-${index}`}
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(1, barHeight)}
                fill={color ? color(value, index) : '#2b62a3'}
                opacity={0.9}
              >
                <title>{`${labels[index]}: ${value.toFixed(3)}`}</title>
              </rect>
            );
          })}
        </g>
        {referenceY.map(reference => (
          <g key={reference.label}>
            <line
              x1={PADDING.left}
              y1={scaleY(reference.value)}
              x2={WIDTH - PADDING.right}
              y2={scaleY(reference.value)}
              stroke={reference.color ?? '#ef4444'}
              strokeDasharray="4 3"
            />
            <text x={WIDTH - PADDING.right - 2} y={scaleY(reference.value) - 3} textAnchor="end" fontSize={8.5} fill={reference.color ?? '#ef4444'}>
              {reference.label}
            </text>
          </g>
        ))}
        <line x1={PADDING.left} y1={scaleY(0)} x2={WIDTH - PADDING.right} y2={scaleY(0)} stroke="#94a3b8" />
        <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={HEIGHT - PADDING.bottom} stroke="#94a3b8" />
        <text x={PADDING.left + plotWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={10} fill="#475569">
          {xLabel}
        </text>
        <text x={12} y={PADDING.top + plotHeight / 2} textAnchor="middle" fontSize={10} fill="#475569" transform={`rotate(-90 12 ${PADDING.top + plotHeight / 2})`}>
          {yLabel}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] text-slate-500">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: color ? color(values[index], index) : '#2b62a3' }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
