/**
 * Shared canvas primitives for the IEC symbol library.
 *
 * Every symbol module draws with the same stroke, shape and badge helpers, so
 * the symbol families stay visually consistent and the helpers live once.
 */

export function setStroke(ctx: CanvasRenderingContext2D, color = '#000', width = 1): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
}

export function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawFilledCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawRectangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize = 10,
  bold = false
): void {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/**
 * Circle badge with a short lead above and below, used by the panel meters and
 * the numbered protection relays. The label is centred inside the circle.
 */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label?: string
): void {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const radius = Math.min(width, height) / 2 - 4;
  setStroke(ctx, '#000', 1.3);
  drawLine(ctx, cx, y, cx, cy - radius);
  drawLine(ctx, cx, cy + radius, cx, y + height);
  drawCircle(ctx, cx, cy, radius);
  if (label) {
    ctx.fillStyle = '#000';
    drawText(ctx, label, cx, cy + 0.5, label.length > 2 ? 9 : 13, true);
  }
}
