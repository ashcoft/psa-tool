'use client';

import { useEffect, useRef } from 'react';
import { IECSymbolType } from '@/types';
import { getSymbol, renderSymbol } from '@/lib/symbols';

interface SymbolPreviewProps {
  symbol?: IECSymbolType;
  fallbackLabel: string;
  size?: number;
}

export default function SymbolPreview({ symbol, fallbackLabel, size = 30 }: Readonly<SymbolPreviewProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);

    const definition = symbol ? getSymbol(symbol) : undefined;
    if (definition?.render) {
      const scale = Math.min((size - 6) / definition.width, (size - 6) / definition.height, 0.8);
      ctx.scale(scale, scale);
      renderSymbol(ctx, symbol as IECSymbolType, 0, 0);
    } else {
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(-13, -9, 26, 18);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 8px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fallbackLabel, 0, 1);
    }
    ctx.restore();
  }, [fallbackLabel, size, symbol]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role="presentation"
      className="pointer-events-none"
      style={{ width: size, height: size }}
    />
  );
}
