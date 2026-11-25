'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IECSymbolType, PowerFlowResult, PowerSystem } from '@/types';
import { Selection, selectionKey } from '@/lib/useProject';
import { getComponentDefinition } from '@/lib/component-catalog';
import { componentAnchor, componentCategoryShort } from '@/lib/component-utils';
import { getSymbol, renderSymbol } from '@/lib/symbols';

export type CanvasTool = 'select' | 'pan' | 'line' | 'transformer';

export interface CanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  reset: () => void;
  cancelGesture: () => void;
  getScale: () => number;
}

interface CanvasProps {
  system: PowerSystem;
  selections: Selection[];
  tool: CanvasTool;
  results?: PowerFlowResult | null;
  showGrid: boolean;
  snapToGrid: boolean;
  showBusNames: boolean;
  showVoltageOverlay: boolean;
  showFlowOverlay: boolean;
  onSelect: (selection: Selection, additive?: boolean) => void;
  onSelectMany: (selections: Selection[], additive?: boolean) => void;
  onMoveStart: () => void;
  onMoveEnd: () => void;
  onMoveElements: (moves: { kind: 'bus' | 'component'; id: string; x: number; y: number }[]) => void;
  onBranchConnect: (fromBus: string, toBus: string) => void;
  onDropComponent: (kind: string, position: { x: number; y: number }) => void;
  onContextMenu: (selection: Selection, clientX: number, clientY: number) => void;
  onCursorMove?: (world: { x: number; y: number } | null) => void;
  onDoubleClickElement?: (selection: Selection) => void;
  fitKey?: number;
}

interface DeviceHit {
  kind: 'generator' | 'load' | 'shunt';
  id: string;
  x: number;
  y: number;
}

interface MoveOrigin {
  kind: 'bus' | 'component';
  id: string;
  x: number;
  y: number;
}

interface DragState {
  origins: MoveOrigin[];
  startWorld: { x: number; y: number };
  hit: Selection;
  moved: boolean;
}

interface MarqueeState {
  start: { x: number; y: number };
  current: { x: number; y: number };
  additive: boolean;
}

interface TransformerMarkerOptions {
  midX: number;
  midY: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  symbol: IECSymbolType | undefined;
  isSelected: boolean;
}

const GRID_UNIT = 100;
const SNAP = 0.4;
const BUS_HALF_WIDTH = 34;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

const colors = {
  slack: '#15803d',
  pv: '#1d4ed8',
  pq: '#475569',
  isolated: '#94a3b8',
  line: '#64748b',
  selected: '#ea580c',
};

function voltageColor(v: number, vmin: number, vmax: number): string {
  if (v < vmin - 0.05 || v > vmax + 0.05) return '#dc2626';
  if (v < vmin || v > vmax) return '#d97706';
  return '#15803d';
}

function loadingColor(loading: number): string {
  if (loading > 100) return '#dc2626';
  if (loading > 80) return '#d97706';
  return '#0f766e';
}

function cursorFor(tool: CanvasTool, hover: Selection): string {
  if (tool === 'pan') return 'grab';
  if (tool === 'line' || tool === 'transformer') return 'crosshair';
  if (hover.type === 'bus' || hover.type === 'component') return 'grab';
  return hover.type ? 'pointer' : 'default';
}

function pointSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

interface RectBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function pointInRect(x: number, y: number, rect: RectBounds): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

interface Point {
  x: number;
  y: number;
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: RectBounds): boolean {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
  const a = { x: x1, y: y1 };
  const b = { x: x2, y: y2 };
  return (
    segmentsIntersect(a, b, { x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY }) ||
    segmentsIntersect(a, b, { x: rect.maxX, y: rect.minY }, { x: rect.maxX, y: rect.maxY }) ||
    segmentsIntersect(a, b, { x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }) ||
    segmentsIntersect(a, b, { x: rect.minX, y: rect.maxY }, { x: rect.minX, y: rect.minY })
  );
}

function rectContains(outer: RectBounds, inner: RectBounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

function rectsIntersect(a: RectBounds, b: RectBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    system,
    selections,
    tool,
    results,
    showGrid,
    snapToGrid,
    showBusNames,
    showVoltageOverlay,
    showFlowOverlay,
    onSelect,
    onSelectMany,
    onMoveStart,
    onMoveEnd,
    onMoveElements,
    onBranchConnect,
    onDropComponent,
    onContextMenu,
    onCursorMove,
    onDoubleClickElement,
    fitKey,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState<Selection>({ type: null, id: null });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const deviceHitsRef = useRef<DeviceHit[]>([]);
  const didFitRef = useRef(false);
  const lastFitKey = useRef(fitKey);

  const busById = useMemo(() => new Map(system.buses.map(bus => [bus.id, bus])), [system.buses]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - rect.width / 2 - offset.x) / scale,
        y: (sy - rect.height / 2 - offset.y) / scale,
      };
    },
    [offset, scale]
  );

  const fit = useCallback(() => {
    if (system.buses.length === 0) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const xs = system.buses.map(bus => bus.x * GRID_UNIT);
    const ys = system.buses.map(bus => bus.y * GRID_UNIT);
    const minX = Math.min(...xs) - 140;
    const maxX = Math.max(...xs) + 140;
    const minY = Math.min(...ys) - 140;
    const maxY = Math.max(...ys) + 140;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const newScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min(size.width / width, size.height / height))
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setScale(newScale);
    setOffset({ x: -centerX * newScale, y: -centerY * newScale });
  }, [system.buses, size]);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const updateMarquee = useCallback((next: MarqueeState | null) => {
    marqueeRef.current = next;
    setMarquee(next);
  }, []);

  const cancelGesture = useCallback(() => {
    updateMarquee(null);
    setConnectFrom(null);
    panRef.current = null;
    if (dragRef.current) onMoveEnd();
    dragRef.current = null;
  }, [onMoveEnd, updateMarquee]);

  const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    setScale(current => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current * factor));
      if (next === current) return current;
      if (anchor) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = anchor.x - rect.left;
          const sy = anchor.y - rect.top;
          setOffset(prev => {
            const worldX = (sx - rect.width / 2 - prev.x) / current;
            const worldY = (sy - rect.height / 2 - prev.y) / current;
            return {
              x: sx - rect.width / 2 - worldX * next,
              y: sy - rect.height / 2 - worldY * next,
            };
          });
        }
      }
      return next;
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomBy(1.2),
      zoomOut: () => zoomBy(1 / 1.2),
      fit,
      reset,
      cancelGesture,
      getScale: () => scale,
    }),
    [cancelGesture, fit, reset, scale, zoomBy]
  );

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    if (typeof ResizeObserver === 'undefined') {
      const measure = () =>
        setSize({
          width: Math.max(200, element.clientWidth || 800),
          height: Math.max(200, element.clientHeight || 600),
        });
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.max(200, Math.floor(entry.contentRect.width)),
        height: Math.max(200, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!didFitRef.current && system.buses.length > 0 && size.width > 0) {
      didFitRef.current = true;
      fit();
    }
  }, [fit, size.width, system.buses.length]);

  useEffect(() => {
    if (fitKey === undefined || lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    setConnectFrom(null);
    dragRef.current = null;
    panRef.current = null;
    if (system.buses.length > 0) fit();
  }, [fitKey, fit, system.buses.length]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);

    if (showGrid) {
      const step = 25 * scale;
      if (step > 6) {
        ctx.strokeStyle = '#eef2f7';
        ctx.lineWidth = 1;
        const startX = ((size.width / 2 + offset.x) % step + step) % step;
        const startY = ((size.height / 2 + offset.y) % step + step) % step;
        for (let x = startX; x < size.width; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size.height);
          ctx.stroke();
        }
        for (let y = startY; y < size.height; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(size.width, y);
          ctx.stroke();
        }
      }
      const major = 100 * scale;
      if (major > 20) {
        ctx.strokeStyle = '#e2e8f0';
        const startX = ((size.width / 2 + offset.x) % major + major) % major;
        const startY = ((size.height / 2 + offset.y) % major + major) % major;
        for (let x = startX; x < size.width; x += major) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size.height);
          ctx.stroke();
        }
        for (let y = startY; y < size.height; y += major) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(size.width, y);
          ctx.stroke();
        }
      }
    }

    ctx.save();
    ctx.translate(size.width / 2 + offset.x, size.height / 2 + offset.y);
    ctx.scale(scale, scale);

    const selectedKeys = new Set(selections.map(selectionKey));
    const selected = (type: Selection['type'], id: string) => selectedKeys.has(`${type}:${id}`);

    const lineResults = new Map((results?.lineResults ?? []).map(item => [item.line, item]));
    const busResults = new Map((results?.busResults ?? []).map(item => [item.bus, item]));

    const drawCatalogSymbol = (
      symbol: IECSymbolType | undefined,
      x: number,
      y: number,
      symbolScale = 1
    ): boolean => {
      const definition = symbol ? getSymbol(symbol) : undefined;
      if (!definition?.render) return false;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(symbolScale, symbolScale);
      renderSymbol(ctx, symbol as IECSymbolType, 0, 0);
      ctx.restore();
      return true;
    };

    const drawSelectionOutline = (x: number, y: number, width: number, height: number) => {
      ctx.save();
      ctx.setLineDash([4 / Math.max(0.7, scale), 3 / Math.max(0.7, scale)]);
      ctx.strokeStyle = colors.selected;
      ctx.lineWidth = 1.2 / Math.max(0.6, scale);
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    };

    const drawTransformerMarker = ({
      midX,
      midY,
      x1,
      y1,
      x2,
      y2,
      symbol,
      isSelected,
    }: TransformerMarkerOptions) => {
      const definition = symbol ? getSymbol(symbol) : undefined;
      if (definition?.render) {
        const symbolScale = 0.8;
        const width = definition.width * symbolScale;
        const height = definition.height * symbolScale;
        drawCatalogSymbol(symbol, midX - width / 2, midY - height / 2, symbolScale);
        if (isSelected) drawSelectionOutline(midX - width / 2 - 4, midY - height / 2 - 4, width + 8, height + 8);
        return;
      }
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const gap = 9;
      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1.8 / Math.max(0.6, scale);
      ctx.beginPath();
      ctx.arc(-gap, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gap, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const drawFlowLabel = (midX: number, midY: number, loading: number) => {
      const label = `${loading.toFixed(0)}%`;
      ctx.font = `${11 / Math.max(0.7, scale)}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      const metrics = ctx.measureText(label);
      const boxWidth = metrics.width + 8;
      const boxHeight = 14;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(midX - boxWidth / 2, midY - boxHeight - 4, boxWidth, boxHeight);
      ctx.fillStyle = loadingColor(loading);
      ctx.fillText(label, midX, midY - 6);
    };

    const drawBranch = (
      id: string,
      fromId: string,
      toId: string,
      kind: 'line' | 'transformer',
      symbol?: IECSymbolType
    ) => {
      const from = busById.get(fromId);
      const to = busById.get(toId);
      if (!from || !to) return;
      const x1 = from.x * GRID_UNIT;
      const y1 = from.y * GRID_UNIT;
      const x2 = to.x * GRID_UNIT;
      const y2 = to.y * GRID_UNIT;
      const isSelected = selected(kind, id);
      const isHovered = hover.type === kind && hover.id === id;
      const result = lineResults.get(id);
      const loading = result?.loading ?? 0;

      let stroke = colors.line;
      if (result && showFlowOverlay) stroke = loadingColor(loading);
      if (isSelected) stroke = colors.selected;
      else if (isHovered) stroke = '#0f172a';

      ctx.strokeStyle = stroke;
      ctx.lineWidth = (isSelected ? 3.2 : 1.8) / Math.max(0.6, scale);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (kind === 'transformer') {
        drawTransformerMarker({
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2,
          x1,
          y1,
          x2,
          y2,
          symbol,
          isSelected,
        });
      }

      if (result && showFlowOverlay) {
        drawFlowLabel((x1 + x2) / 2, (y1 + y2) / 2, loading);
      }
    };

    system.lines.forEach(line => {
      drawBranch(line.id, line.fromBus, line.toBus, 'line', line.symbol);
    });
    system.transformers.forEach(txf => {
      drawBranch(txf.id, txf.fromBus, txf.toBus, 'transformer', txf.symbol);
    });

    if (connectFrom && cursorWorld) {
      const from = busById.get(connectFrom);
      if (from) {
        ctx.save();
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.6 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(from.x * GRID_UNIT, from.y * GRID_UNIT);
        ctx.lineTo(cursorWorld.x, cursorWorld.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    deviceHitsRef.current = [];
    const deviceSlots = new Map<string, number>();

    const nextSlot = (busId: string): number => {
      const slot = deviceSlots.get(busId) ?? 0;
      deviceSlots.set(busId, slot + 1);
      return slot;
    };

    (system.generators ?? []).forEach(gen => {
      const bus = busById.get(gen.bus);
      if (!bus) return;
      const slot = nextSlot(gen.bus);
      const bx = bus.x * GRID_UNIT + slot * 26 - 13;
      const by = bus.y * GRID_UNIT;
      const gx = bx;
      const gy = by - 46;
      const isSelected = selected('generator', gen.id);
      const isHovered = hover.type === 'generator' && hover.id === gen.id;
      const color = isSelected ? colors.selected : isHovered ? '#0f172a' : '#15803d';
      const definition = gen.symbol ? getSymbol(gen.symbol) : undefined;

      if (definition?.render) {
        const symbolScale = 0.8;
        const width = definition.width * symbolScale;
        const height = definition.height * symbolScale;
        const left = gx - width / 2;
        const top = gy - height / 2;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(gx, top + height);
        ctx.stroke();

        drawCatalogSymbol(gen.symbol, left, top, symbolScale);
        if (isSelected) drawSelectionOutline(left - 4, top - 4, width + 8, height + 8);

        if (showBusNames) {
          ctx.fillStyle = '#334155';
          ctx.font = '9px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(gen.id, gx, top + height + 12);
        }
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(gx, gy + 13);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(gx, gy, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', gx, gy + 1);
        ctx.textBaseline = 'alphabetic';

        if (showBusNames) {
          ctx.fillStyle = '#334155';
          ctx.font = '9px "Segoe UI", sans-serif';
          ctx.fillText(gen.id, gx, gy + 25);
        }
      }

      deviceHitsRef.current.push({ kind: 'generator', id: gen.id, x: gx, y: gy });
    });

    (system.loads ?? []).forEach(load => {
      const bus = busById.get(load.bus);
      if (!bus) return;
      const slot = nextSlot(load.bus);
      const bx = bus.x * GRID_UNIT + slot * 26 - 13;
      const by = bus.y * GRID_UNIT;
      const ly = by + 30;
      const isSelected = selected('load', load.id);
      const isHovered = hover.type === 'load' && hover.id === load.id;
      const color = isSelected ? colors.selected : isHovered ? '#0f172a' : '#b91c1c';
      const definition = load.symbol ? getSymbol(load.symbol) : undefined;
      let hitY = ly + 4;

      if (definition?.render) {
        const symbolScale = 0.8;
        const width = definition.width * symbolScale;
        const height = definition.height * symbolScale;
        const left = bx - width / 2;
        const top = ly;
        hitY = top + height / 2;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, top);
        ctx.stroke();

        drawCatalogSymbol(load.symbol, left, top, symbolScale);
        if (isSelected) drawSelectionOutline(left - 4, top - 4, width + 8, height + 8);

        if (showBusNames) {
          ctx.fillStyle = '#7f1d1d';
          ctx.font = '9px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${load.pl.toFixed(1)} MW`, bx, top + height + 12);
        }
      } else {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.8 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, ly + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx - 8, ly);
        ctx.lineTo(bx + 8, ly);
        ctx.lineTo(bx, ly + 12);
        ctx.closePath();
        ctx.fill();

        if (showBusNames) {
          ctx.fillStyle = '#7f1d1d';
          ctx.font = '9px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${load.pl.toFixed(1)} MW`, bx, ly + 26);
        }
      }

      deviceHitsRef.current.push({ kind: 'load', id: load.id, x: bx, y: hitY });
    });

    (system.shunts ?? []).forEach(shunt => {
      const bus = busById.get(shunt.bus);
      if (!bus) return;
      const slot = nextSlot(shunt.bus);
      const bx = bus.x * GRID_UNIT + slot * 26 - 13;
      const by = bus.y * GRID_UNIT;
      const sy = by + 34;
      const isSelected = selected('shunt', shunt.id);
      const isHovered = hover.type === 'shunt' && hover.id === shunt.id;
      const color = isSelected ? colors.selected : isHovered ? '#0f172a' : '#7c3aed';
      const definition = shunt.symbol ? getSymbol(shunt.symbol) : undefined;
      let hitY = sy - 4;

      if (definition?.render) {
        const symbolScale = 0.8;
        const width = definition.width * symbolScale;
        const height = definition.height * symbolScale;
        const left = bx - width / 2;
        const top = sy - 8;
        hitY = top + height / 2;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, top);
        ctx.stroke();

        drawCatalogSymbol(shunt.symbol, left, top, symbolScale);
        if (isSelected) drawSelectionOutline(left - 4, top - 4, width + 8, height + 8);

        if (showBusNames) {
          ctx.fillStyle = '#5b21b6';
          ctx.font = '9px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${shunt.b.toFixed(3)} pu`, bx, top + height + 12);
        }
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, sy - 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx - 10, sy - 8);
        ctx.lineTo(bx + 10, sy - 8);
        ctx.moveTo(bx - 10, sy);
        ctx.lineTo(bx + 10, sy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx, sy);
        ctx.lineTo(bx, sy + 10);
        ctx.stroke();

        if (showBusNames) {
          ctx.fillStyle = '#5b21b6';
          ctx.font = '9px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${shunt.b.toFixed(3)} pu`, bx, sy + 22);
        }
      }

      deviceHitsRef.current.push({ kind: 'shunt', id: shunt.id, x: bx, y: hitY });
    });

    system.buses.forEach(bus => {
      const x = bus.x * GRID_UNIT;
      const y = bus.y * GRID_UNIT;
      const isSelected = selected('bus', bus.id);
      const isHovered = hover.type === 'bus' && hover.id === bus.id;
      const result = busResults.get(bus.id);
      let color = colors[bus.type as keyof typeof colors] ?? colors.pq;
      if (result && showVoltageOverlay) color = voltageColor(result.v, bus.vmin, bus.vmax);
      if (isSelected) color = colors.selected;
      else if (isHovered) color = '#0f172a';

      ctx.strokeStyle = color;
      ctx.lineWidth = (isSelected ? 5 : 3.6) / Math.max(0.6, scale);
      ctx.beginPath();
      ctx.moveTo(x - BUS_HALF_WIDTH, y);
      ctx.lineTo(x + BUS_HALF_WIDTH, y);
      ctx.stroke();

      if (bus.type === 'slack') {
        ctx.lineWidth = 1.6 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(x - BUS_HALF_WIDTH, y);
        ctx.lineTo(x - BUS_HALF_WIDTH + 9, y - 11);
        ctx.moveTo(x - BUS_HALF_WIDTH, y);
        ctx.lineTo(x - BUS_HALF_WIDTH + 9, y + 11);
        ctx.stroke();
      } else if (bus.type === 'pv') {
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 1.8 / Math.max(0.6, scale);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (bus.type === 'pq') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      const labelX = x + BUS_HALF_WIDTH + 7;

      if (showBusNames) {
        ctx.fillStyle = isSelected ? colors.selected : '#1e293b';
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(bus.name, labelX, y - 2);
      }

      if (result && showVoltageOverlay) {
        ctx.fillStyle = voltageColor(result.v, bus.vmin, bus.vmax);
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${result.v.toFixed(3)} pu`, labelX, y + 12);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '8.5px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`#${bus.id}`, x - BUS_HALF_WIDTH - 5, y - 2);
    });

    // Specialty components (DC, instruments, controls, protection, composite)
    const genericComponents = system.components ?? [];
    genericComponents.forEach(component => {
      const anchor = componentAnchor(system, component);
      const isSelected = selected('component', component.id);
      const isHovered = hover.type === 'component' && hover.id === component.id;
      const color = isSelected ? colors.selected : isHovered ? '#0f172a' : '#475569';
      const definition = getComponentDefinition(component.type);

      if (component.fromBus && component.toBus) {
        const from = busById.get(component.fromBus);
        const to = busById.get(component.toBus);
        if (from && to) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = (isSelected ? 2.8 : 1.4) / Math.max(0.6, scale);
          ctx.beginPath();
          ctx.moveTo(from.x * GRID_UNIT, from.y * GRID_UNIT);
          ctx.lineTo(to.x * GRID_UNIT, to.y * GRID_UNIT);
          ctx.stroke();
          ctx.restore();
        }
      } else if (component.bus) {
        const bus = busById.get(component.bus);
        if (bus) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2 / Math.max(0.6, scale);
          ctx.beginPath();
          ctx.moveTo(bus.x * GRID_UNIT, bus.y * GRID_UNIT);
          ctx.lineTo(anchor.x, anchor.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.save();
      ctx.globalAlpha = component.active === false ? 0.45 : 1;
      if (definition?.symbol) {
        ctx.save();
        ctx.translate(anchor.x, anchor.y);
        renderSymbol(ctx, definition.symbol, 0, 0);
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = (isSelected ? 2.4 : 1.4) / Math.max(0.6, scale);
        const width = 26;
        const height = 18;
        ctx.beginPath();
        ctx.rect(anchor.x - width / 2, anchor.y - height / 2, width, height);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 8px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(componentCategoryShort(component.category), anchor.x, anchor.y + 1);
        ctx.textBaseline = 'alphabetic';
      }

      if (isSelected) {
        ctx.setLineDash([4 / Math.max(0.7, scale), 3 / Math.max(0.7, scale)]);
        ctx.strokeStyle = colors.selected;
        ctx.lineWidth = 1.2 / Math.max(0.6, scale);
        ctx.strokeRect(anchor.x - 20, anchor.y - 16, 40, 32);
        ctx.setLineDash([]);
      }

      if (showBusNames) {
        ctx.fillStyle = isSelected ? colors.selected : '#334155';
        ctx.font = '8.5px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(component.name, anchor.x, anchor.y + 25);
      }
      ctx.restore();
    });

    if (marquee) {
      const minX = Math.min(marquee.start.x, marquee.current.x);
      const minY = Math.min(marquee.start.y, marquee.current.y);
      const width = Math.abs(marquee.current.x - marquee.start.x);
      const height = Math.abs(marquee.current.y - marquee.start.y);
      const crossing = marquee.current.x < marquee.start.x;
      ctx.save();
      ctx.fillStyle = crossing ? 'rgba(217,119,6,0.08)' : 'rgba(37,99,235,0.08)';
      ctx.strokeStyle = crossing ? '#d97706' : '#2563eb';
      ctx.lineWidth = 1.2 / Math.max(0.6, scale);
      ctx.setLineDash([5 / Math.max(0.7, scale), 3 / Math.max(0.7, scale)]);
      ctx.fillRect(minX, minY, width, height);
      ctx.strokeRect(minX, minY, width, height);
      ctx.restore();
    }

    if (results && showVoltageOverlay) {
      const legendX = -size.width / 2 / scale + 14 / scale;
      const legendY = -size.height / 2 / scale + 14 / scale;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1 / scale;
      ctx.fillRect(legendX, legendY, 116, 58);
      ctx.strokeRect(legendX, legendY, 116, 58);
      ctx.textAlign = 'left';
      ctx.font = '10px "Segoe UI", sans-serif';
      const rows: [string, string][] = [
        ['#15803d', 'Voltage within limits'],
        ['#d97706', 'Voltage violation'],
        ['#dc2626', 'Severe violation'],
      ];
      rows.forEach(([color, label], index) => {
        ctx.fillStyle = color;
        ctx.fillRect(legendX + 8, legendY + 10 + index * 14, 9, 9);
        ctx.fillStyle = '#334155';
        ctx.fillText(label, legendX + 22, legendY + 18 + index * 14);
      });
    }

    if (system.buses.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Add a bus from the component browser to start the one-line diagram', 0, 0);
    }

    ctx.restore();
  }, [
    busById,
    connectFrom,
    cursorWorld,
    hover,
    marquee,
    offset,
    results,
    scale,
    selections,
    showBusNames,
    showFlowOverlay,
    showGrid,
    showVoltageOverlay,
    size,
    system,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const hitTest = useCallback(
    (worldX: number, worldY: number): Selection => {
      for (const device of deviceHitsRef.current) {
        if (Math.hypot(worldX - device.x, worldY - device.y) < 18) {
          return { type: device.kind, id: device.id };
        }
      }
      for (const component of system.components ?? []) {
        const anchor = componentAnchor(system, component);
        if (Math.hypot(worldX - anchor.x, worldY - anchor.y) < 22) {
          return { type: 'component', id: component.id };
        }
        if (component.fromBus && component.toBus) {
          const from = busById.get(component.fromBus);
          const to = busById.get(component.toBus);
          if (
            from &&
            to &&
            pointSegmentDistance(
              worldX,
              worldY,
              from.x * GRID_UNIT,
              from.y * GRID_UNIT,
              to.x * GRID_UNIT,
              to.y * GRID_UNIT
            ) < 12
          ) {
            return { type: 'component', id: component.id };
          }
        }
      }

      for (const bus of system.buses) {
        if (Math.hypot(worldX - bus.x * GRID_UNIT, worldY - bus.y * GRID_UNIT) < 34) {
          return { type: 'bus', id: bus.id };
        }
      }
      for (const line of system.lines) {
        const from = busById.get(line.fromBus);
        const to = busById.get(line.toBus);
        if (!from || !to) continue;
        if (
          pointSegmentDistance(
            worldX,
            worldY,
            from.x * GRID_UNIT,
            from.y * GRID_UNIT,
            to.x * GRID_UNIT,
            to.y * GRID_UNIT
          ) < 12
        ) {
          return { type: 'line', id: line.id };
        }
      }
      for (const txf of system.transformers) {
        const from = busById.get(txf.fromBus);
        const to = busById.get(txf.toBus);
        if (!from || !to) continue;
        if (
          pointSegmentDistance(
            worldX,
            worldY,
            from.x * GRID_UNIT,
            from.y * GRID_UNIT,
            to.x * GRID_UNIT,
            to.y * GRID_UNIT
          ) < 14
        ) {
          return { type: 'transformer', id: txf.id };
        }
      }
      return { type: null, id: null };
    },
    [busById, system]
  );

  const handleConnectClick = (hit: Selection) => {
    if (!hit.id) return;
    if (!connectFrom) {
      setConnectFrom(hit.id);
      onSelect(hit);
    } else if (connectFrom !== hit.id) {
      onBranchConnect(connectFrom, hit.id);
      setConnectFrom(null);
    } else {
      setConnectFrom(null);
    }
  };

  const selectedSet = new Set(selections.map(selectionKey));

  const originForSelection = (item: Selection): MoveOrigin | null => {
    if (item.type === 'bus' && item.id) {
      const bus = busById.get(item.id);
      return bus ? { kind: 'bus', id: bus.id, x: bus.x, y: bus.y } : null;
    }
    if (item.type === 'component' && item.id) {
      const component = (system.components ?? []).find(entry => entry.id === item.id);
      if (!component || (component.fromBus && component.toBus)) return null;
      return { kind: 'component', id: component.id, x: component.x, y: component.y };
    }
    return null;
  };

  const draggableOrigins = (items: Selection[]): MoveOrigin[] =>
    items.map(originForSelection).filter((item): item is MoveOrigin => item !== null);

  const beginElementDrag = (hit: Selection, world: { x: number; y: number }, additive: boolean): boolean => {
    if (!hit.type || !hit.id) return false;
    if (additive) {
      onSelect(hit, true);
      return false;
    }
    const alreadySelected = selectedSet.has(selectionKey(hit));
    const origins =
      alreadySelected && selections.length > 1 ? draggableOrigins(selections) : draggableOrigins([hit]);
    if (!alreadySelected) onSelect(hit);
    if (origins.length === 0) return false;
    dragRef.current = { origins, startWorld: world, hit, moved: false };
    return true;
  };

  const collectMarqueeSelection = (rect: RectBounds, crossing: boolean): Selection[] => {
    const items: Selection[] = [];
    const seen = new Set<string>();
    const add = (item: Selection) => {
      const key = selectionKey(item);
      if (!item.type || !item.id || seen.has(key)) return;
      seen.add(key);
      items.push(item);
    };
    const branchSelected = (x1: number, y1: number, x2: number, y2: number) =>
      crossing
        ? segmentIntersectsRect(x1, y1, x2, y2, rect)
        : pointInRect(x1, y1, rect) && pointInRect(x2, y2, rect);
    const selectedByBounds = (x: number, y: number, halfWidth: number, halfHeight: number) => {
      const bounds = {
        minX: x - halfWidth,
        maxX: x + halfWidth,
        minY: y - halfHeight,
        maxY: y + halfHeight,
      };
      return crossing ? rectsIntersect(rect, bounds) : rectContains(rect, bounds);
    };

    system.buses.forEach(bus => {
      if (selectedByBounds(bus.x * GRID_UNIT, bus.y * GRID_UNIT, BUS_HALF_WIDTH, 12)) {
        add({ type: 'bus', id: bus.id });
      }
    });
    system.lines.forEach(line => {
      const from = busById.get(line.fromBus);
      const to = busById.get(line.toBus);
      if (from && to && branchSelected(from.x * GRID_UNIT, from.y * GRID_UNIT, to.x * GRID_UNIT, to.y * GRID_UNIT)) {
        add({ type: 'line', id: line.id });
      }
    });
    system.transformers.forEach(txf => {
      const from = busById.get(txf.fromBus);
      const to = busById.get(txf.toBus);
      if (from && to && branchSelected(from.x * GRID_UNIT, from.y * GRID_UNIT, to.x * GRID_UNIT, to.y * GRID_UNIT)) {
        add({ type: 'transformer', id: txf.id });
      }
    });
    deviceHitsRef.current.forEach(device => {
      if (selectedByBounds(device.x, device.y, 20, 20)) add({ type: device.kind, id: device.id });
    });
    (system.components ?? []).forEach(component => {
      if (component.fromBus && component.toBus) {
        const from = busById.get(component.fromBus);
        const to = busById.get(component.toBus);
        if (from && to && branchSelected(from.x * GRID_UNIT, from.y * GRID_UNIT, to.x * GRID_UNIT, to.y * GRID_UNIT)) {
          add({ type: 'component', id: component.id });
        }
        return;
      }
      const anchor = componentAnchor(system, component);
      if (selectedByBounds(anchor.x, anchor.y, 20, 20)) add({ type: 'component', id: component.id });
    });
    return items;
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || tool === 'pan') {
      panRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;

    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const world = toWorld(event.clientX, event.clientY);
    const hit = hitTest(world.x, world.y);

    if ((tool === 'line' || tool === 'transformer') && hit.type === 'bus' && hit.id) {
      handleConnectClick(hit);
      return;
    }

    if (hit.type && hit.id) {
      if (beginElementDrag(hit, world, additive)) onMoveStart();
      return;
    }

    if (!additive) onSelect({ type: null, id: null });
    updateMarquee({ start: world, current: world, additive });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const world = toWorld(event.clientX, event.clientY);
    setCursorWorld(world);
    onCursorMove?.(world);

    if (panRef.current) {
      setOffset({
        x: panRef.current.offsetX + (event.clientX - panRef.current.x),
        y: panRef.current.offsetY + (event.clientY - panRef.current.y),
      });
      return;
    }

    if (marquee) {
      updateMarquee(marqueeRef.current ? { ...marqueeRef.current, current: world } : null);
      return;
    }

    if (dragRef.current) {
      dragRef.current.moved = true;
      let dx = (world.x - dragRef.current.startWorld.x) / GRID_UNIT;
      let dy = (world.y - dragRef.current.startWorld.y) / GRID_UNIT;
      if (snapToGrid && !event.altKey) {
        dx = Math.round(dx / SNAP) * SNAP;
        dy = Math.round(dy / SNAP) * SNAP;
      }
      const moves = dragRef.current.origins.map(origin => ({
        kind: origin.kind,
        id: origin.id,
        x: origin.x + dx,
        y: origin.y + dy,
      }));
      onMoveElements(moves);
      return;
    }

    const hit = hitTest(world.x, world.y);
    setHover(prev => (prev.type === hit.type && prev.id === hit.id ? prev : hit));
  };

  const endInteraction = () => {
    if (dragRef.current) onMoveEnd();
    dragRef.current = null;
    panRef.current = null;
  };

  const handleMouseUp = () => {
    const activeDrag = dragRef.current;
    if (activeDrag && !activeDrag.moved && activeDrag.hit.type && activeDrag.hit.id) {
      onSelect(activeDrag.hit);
    }
    const activeMarquee = marqueeRef.current;
    if (activeMarquee) {
      const rect: RectBounds = {
        minX: Math.min(activeMarquee.start.x, activeMarquee.current.x),
        minY: Math.min(activeMarquee.start.y, activeMarquee.current.y),
        maxX: Math.max(activeMarquee.start.x, activeMarquee.current.x),
        maxY: Math.max(activeMarquee.start.y, activeMarquee.current.y),
      };
      const crossing = activeMarquee.current.x < activeMarquee.start.x;
      onSelectMany(collectMarqueeSelection(rect, crossing), activeMarquee.additive);
      updateMarquee(null);
      return;
    }
    endInteraction();
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const world = toWorld(event.clientX, event.clientY);
    const hit = hitTest(world.x, world.y);
    onContextMenu(hit, event.clientX, event.clientY);
  };

  const handleDrop = (event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setDropActive(false);
    const kind = event.dataTransfer.getData('application/x-psat-component');
    if (!kind) return;
    const world = toWorld(event.clientX, event.clientY);
    let x = world.x / GRID_UNIT;
    let y = world.y / GRID_UNIT;
    if (snapToGrid && !event.altKey) {
      x = Math.round(x / SNAP) * SNAP;
      y = Math.round(y / SNAP) * SNAP;
    }
    onDropComponent(kind, { x, y });
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const world = toWorld(event.clientX, event.clientY);
    const hit = hitTest(world.x, world.y);
    if (hit.type && hit.id) {
      onSelect(hit);
      onDoubleClickElement?.(hit);
    }
  };

  const cursor = cursorFor(tool, hover);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-white" data-testid="canvas">
      <canvas
        ref={canvasRef}
        className="block"
        style={{ cursor }}
        title="Drag buses and components to reposition them. Hold Alt to bypass grid snap."
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          updateMarquee(null);
          endInteraction();
          setHover({ type: null, id: null });
          setCursorWorld(null);
          onCursorMove?.(null);
        }}
        onWheel={event => {
          event.preventDefault();
          zoomBy(event.deltaY > 0 ? 0.9 : 1.1, { x: event.clientX, y: event.clientY });
        }}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onDragOver={event => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          if (!dropActive) setDropActive(true);
        }}
        onDragLeave={() => {
          setDropActive(false);
        }}
        onDrop={handleDrop}
      />
      {dropActive && (
        <div className="pointer-events-none absolute inset-1 flex items-start justify-center rounded border-2 border-dashed border-[#1f4d85]/60 bg-[#1f4d85]/5 pt-2">
          <span className="rounded bg-[#1f4d85] px-2 py-0.5 text-[10px] font-medium text-white">
            Drop to place · hold Alt for free positioning
          </span>
        </div>
      )}
      {connectFrom && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow">
          Select the second bus to create the {tool === 'line' ? 'line' : 'transformer'} (Esc to cancel)
        </div>
      )}
    </div>
  );
});

export default Canvas;
