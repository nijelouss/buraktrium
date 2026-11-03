// Placing a session on the screen by dragging it from the sidebar or the session
// header, and the arrangement helpers shared with the grid and the layouts menu.

import { useAppStore } from '../store/appStore';
import { useTerminalStore, type TerminalInstance } from '../store/terminalStore';
import { toast } from '../store/toastStore';
import { applyDock, dockRect, dockZoneAt, swapRects, tileRects, type DockZone, type PaneRect } from './freeformLayout';
import { MAX_GRID_TERMINALS } from './gridEmptyCells';
import { capturePanes, type OpenTerminalInfo } from './savedLayouts';
import { focusSession, listSessions } from './sessionFocus';

export function terminalInfo(terminals: Map<string, TerminalInstance>): OpenTerminalInfo[] {
  return Array.from(terminals.values())
    .filter((t) => !t.scriptParentId)
    .map((t) => ({
      id: t.config.id,
      cwd: t.config.working_directory ?? '',
      agent: String(t.config.agent),
      name: t.config.nickname || t.config.label,
    }));
}

/** Remember the current arrangement, so it survives closing the app. */
export function rememberFreeLayout(): void {
  const { gridTerminalIds, gridFreeRects, setGridFreeLast } = useAppStore.getState();
  const panes = capturePanes(gridTerminalIds, gridFreeRects, terminalInfo(useTerminalStore.getState().terminals));
  if (panes.length > 0) setGridFreeLast(panes);
}

function showArrangement(ids: string[], rects: Record<string, PaneRect>, focusId: string): void {
  const app = useAppStore.getState();
  // Positions first: the grid tiles any pane it finds without one.
  app.setGridFreeRects({ ...app.gridFreeRects, ...rects });
  app.setGridTerminals(ids);
  app.setGridFreeform(true);
  app.setGridMode(true);
  rememberFreeLayout();
  focusSession(focusId);
}

/** Put a session at a window edge or corner, entering the grid if needed. */
export function dockSession(id: string, zone: DockZone): void {
  const app = useAppStore.getState();
  const { terminals, activeTerminalId } = useTerminalStore.getState();

  if (!app.gridMode) {
    // One terminal is showing: the other one takes the opposite side.
    const others = listSessions(terminals).map((t) => t.config.id).filter((x) => x !== id);
    const companion = activeTerminalId && activeTerminalId !== id && others.includes(activeTerminalId)
      ? activeTerminalId
      : others[others.length - 1];
    const rects: Record<string, PaneRect> = { [id]: dockRect(zone) };
    if (companion) rects[companion] = { x: 0, y: 0, w: 1, h: 1 };
    const placed = companion ? applyDock(id, zone, rects) : rects;
    showArrangement(companion ? [companion, id] : [id], placed, id);
    return;
  }

  const current = app.gridTerminalIds;
  if (!current.includes(id) && current.length >= MAX_GRID_TERMINALS) {
    toast.warning(`The grid holds ${MAX_GRID_TERMINALS} terminals. Remove one first.`);
    return;
  }
  const ids = current.includes(id) ? current : [...current, id];
  // Coming from the fixed grid, or from a pane not placed yet: start from a tiling.
  const tiled = tileRects(ids.length);
  const rects: Record<string, PaneRect> = {};
  ids.forEach((x, i) => {
    rects[x] = app.gridFreeform && app.gridFreeRects[x] ? app.gridFreeRects[x] : tiled[i];
  });
  showArrangement(ids, applyDock(id, zone, rects), id);
}

/** Drop a session on a grid pane: trade places, or take over its spot if new to the grid. */
function dropOnPane(id: string, targetId: string): void {
  if (id === targetId) return;
  const app = useAppStore.getState();
  const ids = app.gridTerminalIds;
  const rects = app.gridFreeRects;
  if (ids.includes(id)) {
    if (rects[id] && rects[targetId]) {
      app.setGridFreeRects(swapRects(rects, id, targetId));
    } else {
      app.swapGridPositions(ids.indexOf(id), ids.indexOf(targetId));
    }
  } else {
    if (rects[targetId]) app.setGridFreeRects({ ...rects, [id]: rects[targetId] });
    app.replaceInGrid(ids.indexOf(targetId), id);
  }
  rememberFreeLayout();
  focusSession(id);
}

function paneUnder(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const pane = el.closest<HTMLElement>('[data-terminal-pane]');
    if (pane?.dataset.terminalPane) return pane.dataset.terminalPane;
  }
  return null;
}

type Drop = { type: 'dock'; zone: DockZone } | { type: 'pane'; id: string } | null;

const DRAG_START_PX = 6;

/**
 * Follow a press on a session card or header. It stays a click, or a reorder in
 * the sidebar, until the pointer has moved and left `origin`; from then on it
 * shows where the session would land and places it on release.
 */
export function startSessionDrag(e: React.PointerEvent, id: string, origin: Element | null): void {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let drop: Drop = null;

  const area = () => (
    (useAppStore.getState().gridMode && document.querySelector('[data-free-container]'))
    || document.querySelector('[data-dock-root]')
  )?.getBoundingClientRect() ?? null;

  const onMove = (ev: PointerEvent) => {
    if (!dragging) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START_PX) return;
      const from = origin?.getBoundingClientRect();
      if (from && ev.clientX >= from.left && ev.clientX <= from.right && ev.clientY >= from.top && ev.clientY <= from.bottom) return;
      dragging = true;
      useAppStore.getState().setSidebarPeek(false);
      document.body.style.cursor = 'grabbing';
    }
    const box = area();
    if (!box) return;
    const px = ev.clientX - box.left;
    const py = ev.clientY - box.top;
    const size = { width: box.width, height: box.height };
    const app = useAppStore.getState();
    const zone = px >= 0 && py >= 0 ? dockZoneAt(px, py, size) : null;
    const target = zone ? null : paneUnder(ev.clientX, ev.clientY);
    if (zone) {
      drop = { type: 'dock', zone };
      const r = dockRect(zone);
      app.setDockPreview({ x: box.left + r.x * box.width, y: box.top + r.y * box.height, w: r.w * box.width, h: r.h * box.height });
    } else if (target && target !== id) {
      drop = { type: 'pane', id: target };
      const r = document.querySelector(`[data-terminal-pane="${CSS.escape(target)}"]`)?.getBoundingClientRect();
      app.setDockPreview(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
    } else if (!app.gridMode && px >= 0) {
      // A single terminal fills the view, so anywhere on it means a side.
      const side: DockZone = px < box.width / 2 ? 'left' : 'right';
      drop = { type: 'dock', zone: side };
      const r = dockRect(side);
      app.setDockPreview({ x: box.left + r.x * box.width, y: box.top, w: r.w * box.width, h: box.height });
    } else {
      drop = null;
      app.setDockPreview(null);
    }
  };

  const finish = (apply: boolean) => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    if (!dragging) return;
    document.body.style.cursor = '';
    useAppStore.getState().setDockPreview(null);
    // The click ending this drag must not also select the card it started on.
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    if (!apply) return;
    if (drop?.type === 'dock') dockSession(id, drop.zone);
    else if (drop?.type === 'pane') dropOnPane(id, drop.id);
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);

  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
}
