// Geometry for the free-form terminal layout. Pure so it can be unit-tested
// without rendering xterm. Rects are fractions of the container (0..1), so a
// layout survives window resizes.

export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContainerSize {
  width: number;
  height: number;
}

export interface ResizeEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

export const SNAP_PX = 10;
export const MIN_PANE_W_PX = 260;
export const MIN_PANE_H_PX = 140;

/** An even tiling for `count` panes; the last row stretches to fill. */
export function tileRects(count: number): PaneRect[] {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const rects: PaneRect[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? count - cols * (rows - 1) : cols;
    const col = i - row * cols;
    rects.push({ x: col / inRow, y: row / rows, w: 1 / inRow, h: 1 / rows });
  }
  return rects;
}

/** Where a pane added to an existing layout lands: cascaded, never off-screen. */
export function placeNewRect(existingCount: number): PaneRect {
  const step = (existingCount % 6) * 0.04;
  return { x: 0.1 + step, y: 0.1 + step, w: 0.5, h: 0.5 };
}

function closestSnap(value: number, targets: number[], threshold: number): number | null {
  let best: number | null = null;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

function snapTargets(others: PaneRect[]): { xs: number[]; ys: number[] } {
  const xs = [0, 1];
  const ys = [0, 1];
  for (const o of others) {
    xs.push(o.x, o.x + o.w);
    ys.push(o.y, o.y + o.h);
  }
  return { xs, ys };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Move by a fractional delta, snapping either edge, and stay inside the container. */
export function moveRect(
  start: PaneRect,
  dx: number,
  dy: number,
  others: PaneRect[],
  size: ContainerSize,
): PaneRect {
  const { xs, ys } = snapTargets(others);
  const tx = SNAP_PX / size.width;
  const ty = SNAP_PX / size.height;
  let x = start.x + dx;
  let y = start.y + dy;

  const snapLeft = closestSnap(x, xs, tx);
  const snapRight = closestSnap(x + start.w, xs, tx);
  if (snapLeft !== null && (snapRight === null || Math.abs(snapLeft - x) <= Math.abs(snapRight - (x + start.w)))) {
    x = snapLeft;
  } else if (snapRight !== null) {
    x = snapRight - start.w;
  }

  const snapTop = closestSnap(y, ys, ty);
  const snapBottom = closestSnap(y + start.h, ys, ty);
  if (snapTop !== null && (snapBottom === null || Math.abs(snapTop - y) <= Math.abs(snapBottom - (y + start.h)))) {
    y = snapTop;
  } else if (snapBottom !== null) {
    y = snapBottom - start.h;
  }

  return { x: clamp(x, 0, 1 - start.w), y: clamp(y, 0, 1 - start.h), w: start.w, h: start.h };
}

/** Drag the given edges by a fractional delta, snapping and enforcing a minimum size. */
export function resizeRect(
  start: PaneRect,
  edges: ResizeEdges,
  dx: number,
  dy: number,
  others: PaneRect[],
  size: ContainerSize,
): PaneRect {
  const { xs, ys } = snapTargets(others);
  const tx = SNAP_PX / size.width;
  const ty = SNAP_PX / size.height;
  const minW = Math.min(MIN_PANE_W_PX / size.width, 1);
  const minH = Math.min(MIN_PANE_H_PX / size.height, 1);

  let left = start.x;
  let right = start.x + start.w;
  let top = start.y;
  let bottom = start.y + start.h;

  if (edges.left) {
    const v = left + dx;
    left = clamp(closestSnap(v, xs, tx) ?? v, 0, right - minW);
  }
  if (edges.right) {
    const v = right + dx;
    right = clamp(closestSnap(v, xs, tx) ?? v, left + minW, 1);
  }
  if (edges.top) {
    const v = top + dy;
    top = clamp(closestSnap(v, ys, ty) ?? v, 0, bottom - minH);
  }
  if (edges.bottom) {
    const v = bottom + dy;
    bottom = clamp(closestSnap(v, ys, ty) ?? v, top + minH, 1);
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}
