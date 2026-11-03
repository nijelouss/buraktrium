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

/**
 * Grow panes into the empty space around them, up to the next pane or the
 * container: first sideways, then up and down, so panes in a row keep sharing it.
 * Panes that are not in each other's way are the only ones affected by a grow.
 */
export function fillGaps(rects: Record<string, PaneRect>): Record<string, PaneRect> {
  const next: Record<string, PaneRect> = {};
  for (const [id, r] of Object.entries(rects)) next[id] = { ...r };
  const EPS = 0.001;
  const entries = Object.keys(next);

  for (const id of entries) {
    const r = next[id];
    let left = 0;
    let right = 1;
    for (const other of entries) {
      if (other === id) continue;
      const o = next[other];
      if (o.y >= r.y + r.h - EPS || o.y + o.h <= r.y + EPS) continue; // not in this row
      if (o.x + o.w <= r.x + EPS) left = Math.max(left, o.x + o.w);
      else if (o.x >= r.x + r.w - EPS) right = Math.min(right, o.x);
      else { left = r.x; right = r.x + r.w; break; } // overlapping on purpose: leave it
    }
    next[id] = { ...r, x: left, w: right - left };
  }

  for (const id of entries) {
    const r = next[id];
    let top = 0;
    let bottom = 1;
    for (const other of entries) {
      if (other === id) continue;
      const o = next[other];
      if (o.x >= r.x + r.w - EPS || o.x + o.w <= r.x + EPS) continue; // not in this column
      if (o.y + o.h <= r.y + EPS) top = Math.max(top, o.y + o.h);
      else if (o.y >= r.y + r.h - EPS) bottom = Math.min(bottom, o.y);
      else { top = r.y; bottom = r.y + r.h; break; }
    }
    next[id] = { ...r, y: top, h: bottom - top };
  }
  return next;
}

export type DockZone =
  | 'left' | 'right' | 'top' | 'bottom'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type DragAction =
  | { type: 'dock'; zone: DockZone }
  | { type: 'swap'; id: string }
  | null;

export const DOCK_EDGE_PX = 40;

/** The window edge or corner a pointer is at, in pixels from the container's corner. */
export function dockZoneAt(px: number, py: number, size: ContainerSize): DockZone | null {
  const left = px <= DOCK_EDGE_PX;
  const right = px >= size.width - DOCK_EDGE_PX;
  const top = py <= DOCK_EDGE_PX;
  const bottom = py >= size.height - DOCK_EDGE_PX;
  if (top && left) return 'top-left';
  if (top && right) return 'top-right';
  if (bottom && left) return 'bottom-left';
  if (bottom && right) return 'bottom-right';
  if (left) return 'left';
  if (right) return 'right';
  if (top) return 'top';
  if (bottom) return 'bottom';
  return null;
}

const DOCK_RECTS: Record<DockZone, PaneRect> = {
  left: { x: 0, y: 0, w: 0.5, h: 1 },
  right: { x: 0.5, y: 0, w: 0.5, h: 1 },
  top: { x: 0, y: 0, w: 1, h: 0.5 },
  bottom: { x: 0, y: 0.5, w: 1, h: 0.5 },
  'top-left': { x: 0, y: 0, w: 0.5, h: 0.5 },
  'top-right': { x: 0.5, y: 0, w: 0.5, h: 0.5 },
  'bottom-left': { x: 0, y: 0.5, w: 0.5, h: 0.5 },
  'bottom-right': { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
};

const OPPOSITE_ZONE: Record<DockZone, DockZone> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
};

export function dockRect(zone: DockZone): PaneRect {
  return DOCK_RECTS[zone];
}

/** What releasing a dragged pane here would do. Alt always means a free drop. */
export function pickDragAction(
  px: number,
  py: number,
  size: ContainerSize,
  others: { id: string; rect: PaneRect }[],
  altKey: boolean,
): DragAction {
  if (altKey) return null;
  const zone = dockZoneAt(px, py, size);
  if (zone) return { type: 'dock', zone };
  const fx = px / size.width;
  const fy = py / size.height;
  const hit = others.find(({ rect: r }) => fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h);
  return hit ? { type: 'swap', id: hit.id } : null;
}

export function swapRects(rects: Record<string, PaneRect>, a: string, b: string): Record<string, PaneRect> {
  return { ...rects, [a]: rects[b], [b]: rects[a] };
}

/** How much of `a` lies under `b`, from 0 to 1. */
function coveredShare(a: PaneRect, b: PaneRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0 || a.w <= 0 || a.h <= 0) return 0;
  return (w * h) / (a.w * a.h);
}

/**
 * Dock a pane to a zone. The pane it mostly covers makes way, so dragging one of
 * two terminals across trades their places: it takes the docked pane's old spot,
 * or the opposite side if that spot would still be underneath.
 */
export function applyDock(
  id: string,
  zone: DockZone,
  rects: Record<string, PaneRect>,
): Record<string, PaneRect> {
  const target = dockRect(zone);
  const previous = rects[id];
  const next = { ...rects, [id]: target };
  let displaced: string | null = null;
  // Just under half: a full-screen pane is exactly half under a half-screen dock,
  // and must make way too.
  let most = 0.45;
  for (const [other, rect] of Object.entries(rects)) {
    if (other === id) continue;
    const share = coveredShare(rect, target);
    if (share > most) {
      most = share;
      displaced = other;
    }
  }
  if (displaced) {
    const previousIsFree = previous && coveredShare(previous, target) < 0.25;
    next[displaced] = previousIsFree ? previous : dockRect(OPPOSITE_ZONE[zone]);
  }
  return next;
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
