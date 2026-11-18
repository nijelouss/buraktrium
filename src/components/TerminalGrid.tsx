import { useEffect, useRef, useState, memo, useCallback, useMemo, forwardRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, Plus, Grid3X3, Layers, Pin, Move, LayoutGrid, Expand } from 'lucide-react';
import { useTerminalStore } from '../store/terminalStore';
import { useAppStore, GridLayout } from '../store/appStore';
import { TerminalView } from './TerminalView';
import { setDragData, getDragData, isTerminalDrag } from '../utils/dragDrop';
import { computeGridNavTarget } from '../lib/gridNav';
import { computeEmptyCellCount } from '../lib/gridEmptyCells';
import { applyDock, fillGaps, moveRect, pickDragAction, placeNewRect, resizeRect, swapRects, tileRects, dockRect, type ContainerSize, type DragAction, type PaneRect, type ResizeEdges } from '../lib/freeformLayout';
import { matchPanes } from '../lib/savedLayouts';
import { GridLayoutsMenu } from './GridLayoutsMenu';
import { rememberFreeLayout, terminalInfo } from '../lib/sessionDock';
import { BrandIcon } from './BrandIcon';

// Grid layout configurations
const GRID_CONFIGS: Record<GridLayout, { cols: number; rows: number }> = {
  '1x1': { cols: 1, rows: 1 },
  '1x2': { cols: 2, rows: 1 },
  '2x1': { cols: 1, rows: 2 },
  '2x2': { cols: 2, rows: 2 },
  '1x3': { cols: 3, rows: 1 },
  '3x1': { cols: 1, rows: 3 },
  '2x3': { cols: 3, rows: 2 },
  '3x2': { cols: 2, rows: 3 },
  '2x4': { cols: 4, rows: 2 },
  '4x2': { cols: 2, rows: 4 },
};

/**
 * A miniature schematic of the actual grid layout, so the picker's icon
 * always matches the layout it applies. Replaces the earlier scheme where
 * '2x2' rendered a 3x3 lucide icon and '2x3'/'2x4' shared the same icon.
 */
function LayoutIcon({ rows, cols, size = 14 }: { rows: number; cols: number; size?: number }) {
  const cellW = 24 / cols;
  const cellH = 24 / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={c * cellW + 1.5}
          y={r * cellH + 1.5}
          width={cellW - 3}
          height={cellH - 3}
          rx="1"
          fill="currentColor"
        />
      );
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {cells}
    </svg>
  );
}

const LAYOUT_OPTIONS: { layout: GridLayout; label: string }[] = [
  { layout: '1x1', label: 'Single' },
  { layout: '1x2', label: '2 Columns' },
  { layout: '2x1', label: '2 Rows' },
  { layout: '2x2', label: '2x2 Grid' },
  { layout: '2x3', label: '2x3 Grid' },
  { layout: '2x4', label: '2x4 Grid' },
];

interface TerminalCellProps {
  terminalId: string;
  index: number;
  isFocused: boolean;
  onFocus: () => void;
  onRemove: () => void;
  /** Toggles filling the whole grid; the other panes stay where they are. */
  onMaximize: () => void;
  maximized: boolean;
  /** Free-form mode: the header moves the pane instead of swapping cells. */
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const TerminalCell = memo(function TerminalCell({ terminalId, index, isFocused, onFocus, onRemove, onMaximize, maximized, onHeaderPointerDown }: TerminalCellProps) {
  const { terminals } = useTerminalStore();
  const { swapGridPositions, replaceInGrid } = useAppStore();
  const pinnedTabIds = useAppStore((s) => s.pinnedTabIds);
  const isPinned = pinnedTabIds.includes(terminalId);
  const [dropOver, setDropOver] = useState(false);
  const isWaiting = useTerminalStore((s) => s.terminalStates.get(terminalId) === 'waiting');
  const terminal = terminals.get(terminalId);

  // Grid cells hold onto ids that may become stale: a right-click restart
  // gives a terminal a new id, and app restart repopulates terminals with
  // fresh ids. Auto-prune those stale entries once the terminals map has
  // actually been populated (guards against pruning during first mount
  // before session restore lands). Without this, cells rendered forever
  // as "Terminal not found".
  useEffect(() => {
    if (!terminal && terminals.size > 0) {
      onRemove();
    }
  }, [terminal, terminals.size, onRemove]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isTerminalDrag(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (isTerminalDrag(e)) {
      e.preventDefault();
      setDropOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the cell entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const payload = getDragData(e);
    if (!payload || payload.terminalId === terminalId) return;

    if (payload.source === 'grid' && payload.sourceIndex !== undefined) {
      swapGridPositions(payload.sourceIndex, index);
    } else {
      replaceInGrid(index, payload.terminalId);
    }
  }, [terminalId, index, swapGridPositions, replaceInGrid]);

  if (!terminal) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-secondary border border-border rounded-md">
        <p className="text-text-tertiary text-[12px]">Terminal not found</p>
      </div>
    );
  }

  return (
    <div
      draggable={!onHeaderPointerDown}
      onDragStart={(e) => {
        setDragData(e, { terminalId, source: 'grid', sourceIndex: index });
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-terminal-pane={terminalId}
      data-waiting={isWaiting || undefined}
      // Opaque because the focused header is only a tint, and free-form panes
      // can sit on top of each other.
      className={`${maximized && !onHeaderPointerDown ? 'absolute inset-1 z-[900]' : 'relative h-full min-h-0 min-w-0'} bg-elevation-0 flex flex-col rounded-md overflow-clip transition-all ${
        dropOver
          ? 'ring-2 ring-accent-primary bg-accent-primary/5'
          : isWaiting && !isFocused
            ? 'pane-waiting'
          : isFocused
            ? 'ring-2 ring-accent-primary shadow-glow-md'
            : 'ring-1 ring-border hover:ring-border-light hover:shadow-elevation-2'
      }`}
      onClick={onFocus}
    >
      {/* Drop overlay */}
      {dropOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent-primary/10 border-2 border-dashed border-accent-primary/40 rounded pointer-events-none">
          <span className="text-accent-primary text-[11px] font-medium">Drop to swap</span>
        </div>
      )}

      {/* Cell Header - sketch: pin + name + status dot + maximize + close */}
      <div
        data-pane-header
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={(e) => {
          if (e.target instanceof Element && e.target.closest('button')) return;
          onMaximize();
        }}
        className={`flex items-center justify-between px-3 h-7 border-b gap-2 ${onHeaderPointerDown && !maximized ? 'cursor-move touch-none select-none' : 'select-none'} ${
          isFocused ? 'bg-accent-primary/10 border-accent-primary/40' : 'bg-bg-secondary border-border'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isPinned && (
            <Pin size={10} strokeWidth={2} className="text-accent-primary flex-shrink-0" />
          )}
          <span className="opacity-70 flex-shrink-0 flex items-center" title={`Agent: ${terminal.config.agent}`}>
            <BrandIcon kind={terminal.config.agent} size={12} />
          </span>
          <span className={`text-[11px] truncate font-medium ${onHeaderPointerDown ? '' : 'cursor-grab'} ${
            isFocused ? 'text-text-primary' : 'text-text-secondary'
          }`}>
            {terminal.config.nickname || terminal.config.label}
          </span>
          {terminal.sessionContext?.title && terminal.sessionContext.title !== (terminal.config.nickname || terminal.config.label) && (
            <span className="text-[11px] text-text-secondary truncate" title={terminal.sessionContext.title}>
              {'\u00b7'} {terminal.sessionContext.title}
            </span>
          )}
          {/* Status dot - pulses when running (matches sketch's cell head) */}
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              terminal.config.status === 'Running'
                ? 'bg-success ct-working-dot'
                : terminal.config.status === 'Idle'
                ? 'bg-warning'
                : terminal.config.status === 'Error'
                ? 'bg-error'
                : 'bg-text-tertiary'
            }`}
            title={terminal.config.status}
          />
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
            className="p-0.5 rounded hover:bg-fill-hover text-text-tertiary hover:text-text-secondary transition-colors"
            title={maximized ? 'Back to layout (double-click the title)' : 'Fill the grid (double-click the title)'}
            aria-label={maximized ? 'Back to layout' : 'Fill the grid'}
          >
            {maximized ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-0.5 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-colors"
            title="Remove from grid"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 min-h-0 overflow-clip" onScroll={resetScroll}>
        <TerminalView terminalId={terminalId} />
      </div>
    </div>
  );
});

/* forwardRef is load-bearing here, not ceremony: the empty cells render inside
 * AnimatePresence mode="popLayout", which measures each child through
 * PopChild's ref before pulling it out of flow. A plain function component
 * swallows that ref, so the pop-out never gets its measured size and React
 * warns on every layout change. Same reason ToastCard forwards its ref. */
const AddTerminalCell = forwardRef<HTMLDivElement>(function AddTerminalCell(_props, ref) {
  const { terminals } = useTerminalStore();
  const { gridTerminalIds, openNewTerminalModal, addToGrid } = useAppStore();
  const [showPicker, setShowPicker] = useState(false);
  const [dropOver, setDropOver] = useState(false);

  const availableTerminals = useMemo(() =>
    Array.from(terminals.values())
      .filter(t => !gridTerminalIds.includes(t.config.id)),
    [terminals, gridTerminalIds]
  );

  return (
    <div
      ref={ref}
      className={`h-full flex flex-col items-center justify-center bg-elevation-0 rounded-xl transition-all cursor-pointer group relative ${
        dropOver
          ? 'ring-2 ring-accent-primary bg-accent-primary/5'
          : 'ring-1 ring-seam hover:ring-seam-strong hover:shadow-elevation-2'
      }`}
      onClick={() => setShowPicker(true)}
      onDragOver={(e) => {
        if (isTerminalDrag(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDragEnter={(e) => {
        if (isTerminalDrag(e)) {
          e.preventDefault();
          setDropOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDropOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropOver(false);
        const payload = getDragData(e);
        if (payload && !gridTerminalIds.includes(payload.terminalId)) {
          addToGrid(payload.terminalId);
        }
      }}
    >
      {dropOver ? (
        <span className="text-accent-primary text-[11px] font-medium">Drop here</span>
      ) : (
        <Plus size={24} className="text-border-light group-hover:text-text-tertiary transition-colors" />
      )}

      {/* Terminal Picker Dropdown */}
      <AnimatePresence>
        {showPicker && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setShowPicker(false);
              }}
            />
            <div
              className="absolute z-50 material-popover rounded-lg p-2 min-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-text-tertiary text-[11px] px-2 py-1 mb-1">Select Terminal</p>
              {availableTerminals.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {availableTerminals.map((t) => (
                    <button
                      key={t.config.id}
                      onClick={() => {
                        addToGrid(t.config.id);
                        setShowPicker(false);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-fill-hover text-left"
                    >
                      <span className="opacity-70 flex-shrink-0 flex items-center">
                        <BrandIcon kind={t.config.agent} size={12} />
                      </span>
                      <span className="text-text-primary text-[12px] truncate">
                        {t.config.nickname || t.config.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-text-tertiary text-[11px] px-2 py-2">No available terminals</p>
              )}
              <div className="border-t border-border mt-2 pt-2">
                <button
                  onClick={() => {
                    openNewTerminalModal();
                    setShowPicker(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent-primary/10 text-accent-primary text-[12px]"
                >
                  <Plus size={14} />
                  Create New Terminal
                </button>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

const RESIZE_HANDLES: { edges: ResizeEdges; className: string }[] = [
  { edges: { top: true }, className: 'top-0 left-2 right-2 h-1 cursor-ns-resize' },
  { edges: { bottom: true }, className: 'bottom-0 left-2 right-2 h-1 cursor-ns-resize' },
  { edges: { left: true }, className: 'left-0 top-2 bottom-2 w-1 cursor-ew-resize' },
  { edges: { right: true }, className: 'right-0 top-2 bottom-2 w-1 cursor-ew-resize' },
  { edges: { top: true, left: true }, className: 'top-0 left-0 w-2.5 h-2.5 cursor-nwse-resize' },
  { edges: { top: true, right: true }, className: 'top-0 right-0 w-2.5 h-2.5 cursor-nesw-resize' },
  { edges: { bottom: true, left: true }, className: 'bottom-0 left-0 w-2.5 h-2.5 cursor-nesw-resize' },
  { edges: { bottom: true, right: true }, className: 'bottom-0 right-0 w-2.5 h-2.5 cursor-nwse-resize' },
];

// Containers that only clip must never scroll. With `overflow: hidden` the
// browser still scrolls them to reveal a focused element (xterm's hidden
// textarea follows the cursor), which shifts every pane off screen and leaves
// the wheel unable to reach the terminals until the grid is rebuilt.
// `overflow: clip` (below) stops that; this resets any scroll that slips past.
const resetScroll = (e: React.UIEvent<HTMLElement>) => {
  const el = e.currentTarget;
  if (el.scrollTop !== 0) el.scrollTop = 0;
  if (el.scrollLeft !== 0) el.scrollLeft = 0;
};

const FULL_RECT: PaneRect = { x: 0, y: 0, w: 1, h: 1 };
const MAXIMIZED_Z = 900;

const rectStyle = (r: PaneRect): React.CSSProperties => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});

interface FreeformPaneProps extends Omit<TerminalCellProps, 'onHeaderPointerDown'> {
  rect: PaneRect;
  zIndex: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * One freely placed terminal. Moving updates live, since the size is unchanged.
 * Resizing shows an outline and applies on release: every size change resizes
 * the PTY and makes the agent's interface redraw, so doing that on each pointer
 * move would flood the terminal with repaints.
 */
function FreeformPane({ rect, zIndex, containerRef, ...cell }: FreeformPaneProps) {
  const setGridFreeRect = useAppStore((s) => s.setGridFreeRect);
  const [ghost, setGhost] = useState<PaneRect | null>(null);
  const { terminalId, onFocus, maximized } = cell;

  const startGesture = useCallback((
    e: React.PointerEvent<HTMLElement>,
    compute: (dx: number, dy: number, others: PaneRect[], size: ContainerSize) => PaneRect,
    commit: 'live' | 'on-release',
  ) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || e.button !== 0 || box.width === 0 || box.height === 0) return;
    e.preventDefault();
    onFocus();

    const { gridFreeRects, gridTerminalIds } = useAppStore.getState();
    const others = gridTerminalIds
      .filter((id) => id !== terminalId)
      .map((id) => gridFreeRects[id])
      .filter((r): r is PaneRect => Boolean(r));
    const size = { width: box.width, height: box.height };
    const startX = e.clientX;
    const startY = e.clientY;
    const handle = e.currentTarget;
    let latest: PaneRect | null = null;
    handle.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      latest = compute((ev.clientX - startX) / box.width, (ev.clientY - startY) / box.height, others, size);
      if (commit === 'live') setGridFreeRect(terminalId, latest);
      else setGhost(latest);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      setGhost(null);
      if (latest) {
        setGridFreeRect(terminalId, latest);
        rememberFreeLayout();
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }, [containerRef, onFocus, setGridFreeRect, terminalId]);

  /**
   * Dragging by the title. The pane follows the pointer, and the outline shows
   * where it will land if released: the window edge docks it, another pane swaps
   * with it, anywhere else it stays put. Alt forces a free drop, so panes can
   * still be stacked on purpose.
   */
  const handleHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (maximized || e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    e.preventDefault();
    onFocus();

    const start = rect;
    const { gridFreeRects, gridTerminalIds } = useAppStore.getState();
    const others = gridTerminalIds
      .filter((id) => id !== terminalId && gridFreeRects[id])
      .map((id) => ({ id, rect: gridFreeRects[id] }));
    const size = { width: box.width, height: box.height };
    const startX = e.clientX;
    const startY = e.clientY;
    const handle = e.currentTarget;
    let moved = false;
    let action: DragAction = null;
    handle.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      moved = true;
      const next = moveRect(start, (ev.clientX - startX) / box.width, (ev.clientY - startY) / box.height, others.map((o) => o.rect), size);
      setGridFreeRect(terminalId, next);
      action = pickDragAction(ev.clientX - box.left, ev.clientY - box.top, size, others, ev.altKey);
      if (action?.type === 'dock') setGhost(dockRect(action.zone));
      else if (action?.type === 'swap') {
        const targetId = action.id;
        setGhost(others.find((o) => o.id === targetId)?.rect ?? null);
      } else setGhost(null);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      setGhost(null);
      if (!moved) return;
      const app = useAppStore.getState();
      const current = { ...app.gridFreeRects, [terminalId]: start };
      if (action?.type === 'dock') app.setGridFreeRects(applyDock(terminalId, action.zone, current));
      else if (action?.type === 'swap') app.setGridFreeRects(swapRects(current, terminalId, action.id));
      rememberFreeLayout();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }, [containerRef, maximized, onFocus, rect, setGridFreeRect, terminalId]);

  return (
    <>
      <div
        className="absolute p-px"
        style={maximized ? { ...rectStyle(FULL_RECT), zIndex: MAXIMIZED_Z } : { ...rectStyle(rect), zIndex }}
      >
        <TerminalCell {...cell} onHeaderPointerDown={handleHeaderPointerDown} />
        {!maximized && RESIZE_HANDLES.map(({ edges, className }) => (
          <div
            key={className}
            aria-hidden
            className={`absolute touch-none ${className}`}
            onPointerDown={(e) => startGesture(
              e,
              (dx, dy, others, size) => resizeRect(rect, edges, dx, dy, others, size),
              'on-release',
            )}
          />
        ))}
      </div>
      {ghost && (
        <div
          aria-hidden
          data-testid="pane-ghost"
          className="absolute pointer-events-none rounded-md border-2 border-accent-primary bg-accent-primary/10"
          style={{ ...rectStyle(ghost), zIndex: 1000 }}
        />
      )}
    </>
  );
}

export function TerminalGrid() {
  const {
    gridTerminalIds,
    gridLayout,
    gridFocusedIndex,
    gridFreeform,
    gridFreeRects,
    setGridFocusedIndex,
    removeFromGrid,
    setGridLayout,
    setGridMode,
    setGridTerminals,
    setGridFreeform,
    setGridFreeRects,
    openNewTerminalModal,
  } = useAppStore();
  // Most recently focused last, so the pane you click comes to the front.
  const [paneOrder, setPaneOrder] = useState<string[]>([]);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<Element | null>(null);
  useEffect(() => {
    setToolbarSlot(document.querySelector('[data-toolbar-slot]'));
  }, []);
  const placeToolbar = (node: ReactNode) => (toolbarSlot ? createPortal(node, toolbarSlot) : node);
  const { terminals, setActiveTerminal } = useTerminalStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const allTerminalIds = useMemo(() => Array.from(terminals.keys()), [terminals]);
  const canAddAll = allTerminalIds.length > 0 && (
    allTerminalIds.length !== gridTerminalIds.length ||
    allTerminalIds.some((id, i) => gridTerminalIds[i] !== id)
  );

  const handleAddAll = useCallback(() => {
    setGridTerminals(allTerminalIds);
  }, [allTerminalIds, setGridTerminals]);

  const config = GRID_CONFIGS[gridLayout];
  const emptyCells = computeEmptyCellCount({
    layoutCols: config.cols,
    layoutRows: config.rows,
    filledCount: gridTerminalIds.length,
  });

  // Move real keyboard focus to a pane's terminal so the user can type right
  // after navigating, without clicking.
  const focusPaneTerminal = useCallback((id: string | undefined) => {
    if (!id) return;
    requestAnimationFrame(() => {
      useTerminalStore.getState().terminals.get(id)?.xterm?.focus();
    });
  }, []);

  // Grid focus lived only in appStore.gridFocusedIndex, while every contextual
  // panel - the Inspector's Changes tab, the file tree, the title-bar git chip
  // - reads terminalStore.activeTerminalId. Moving between panes therefore
  // left them all pinned to whichever tab was last clicked (#71). Mirror the
  // focused pane into the active terminal from one place, so clicks, Alt
  // navigation, pane swaps and removals all stay in sync. Keyed on the focused
  // pane's terminal id, not the index, so appending a freshly created terminal
  // to the grid does not steal "active" back from it.
  const focusedTerminalId = gridFocusedIndex === null ? null : gridTerminalIds[gridFocusedIndex] ?? null;
  useEffect(() => {
    if (!focusedTerminalId) return;
    if (useTerminalStore.getState().activeTerminalId === focusedTerminalId) return;
    setActiveTerminal(focusedTerminalId);
  }, [focusedTerminalId, setActiveTerminal]);

  // Spatial pane navigation, gated behind Alt. The old handler hijacked BARE
  // arrow keys whenever a pane was focused, so they were double-handled - the
  // PTY received them (shell history / cursor / vim) AND the grid moved focus.
  // Alt frees bare arrows for the terminal; capture phase + stopImmediate-
  // Propagation keep Alt+Arrow / Alt+1-8 from also reaching xterm.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ids = gridTerminalIds;
      const target = computeGridNavTarget(e, gridFocusedIndex, config.cols, ids.length);
      if (target === null) return; // not ours - pass through to the focused terminal

      // Consume so Alt+Arrow / Alt+1-8 never also reach xterm.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (target !== gridFocusedIndex) {
        setGridFocusedIndex(target);
        focusPaneTerminal(ids[target]);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [gridFocusedIndex, config, gridTerminalIds, setGridFocusedIndex, focusPaneTerminal]);

  // Give every pane a position. The first time, tile them so free-form mode
  // starts tidy; a pane added later lands cascaded on top.
  useEffect(() => {
    if (!gridFreeform || gridTerminalIds.length === 0) return;
    const missing = gridTerminalIds.filter((id) => !gridFreeRects[id]);
    if (missing.length === 0) return;
    const placed = gridTerminalIds.length - missing.length;
    if (placed === 0) {
      // Nothing placed yet this launch: bring back the last arrangement if any.
      const open = terminalInfo(terminals).filter((t) => gridTerminalIds.includes(t.id));
      const { rects } = matchPanes(useAppStore.getState().gridFreeLast, open);
      if (Object.keys(rects).length > 0) {
        const next = { ...gridFreeRects, ...rects };
        missing
          .filter((id) => !rects[id])
          .forEach((id, i) => {
            next[id] = placeNewRect(Object.keys(rects).length + i);
          });
        setGridFreeRects(next);
        return;
      }
      const tiled = tileRects(gridTerminalIds.length);
      setGridFreeRects(Object.fromEntries(gridTerminalIds.map((id, i) => [id, tiled[i]])));
      return;
    }
    const next = { ...gridFreeRects };
    missing.forEach((id, i) => {
      next[id] = placeNewRect(placed + i);
    });
    setGridFreeRects(next);
  }, [gridFreeform, gridTerminalIds, gridFreeRects, setGridFreeRects, terminals]);

  const handleRemove = useCallback((terminalId: string) => {
    removeFromGrid(terminalId);
    const app = useAppStore.getState();
    if (!app.gridFreeform) return;
    const remaining: Record<string, PaneRect> = {};
    for (const id of app.gridTerminalIds) if (app.gridFreeRects[id]) remaining[id] = app.gridFreeRects[id];
    app.setGridFreeRects(fillGaps(remaining));
    rememberFreeLayout();
  }, [removeFromGrid]);

  const handleFill = useCallback(() => {
    const app = useAppStore.getState();
    const current: Record<string, PaneRect> = {};
    for (const id of app.gridTerminalIds) if (app.gridFreeRects[id]) current[id] = app.gridFreeRects[id];
    app.setGridFreeRects(fillGaps(current));
    rememberFreeLayout();
  }, []);

  const handleTile = useCallback(() => {
    const tiled = tileRects(gridTerminalIds.length);
    setGridFreeRects(Object.fromEntries(gridTerminalIds.map((id, i) => [id, tiled[i]])));
    rememberFreeLayout();
  }, [gridTerminalIds, setGridFreeRects]);

  // Whatever moved the focus (click, Alt+arrows, jumping to a waiting session),
  // that pane comes to the front, and a filled grid shows it.
  useEffect(() => {
    if (!focusedTerminalId) return;
    setPaneOrder((order) => (
      order[order.length - 1] === focusedTerminalId
        ? order
        : [...order.filter((id) => id !== focusedTerminalId), focusedTerminalId]
    ));
    setMaximizedId((current) => (current === null ? null : focusedTerminalId));
  }, [focusedTerminalId]);

  // A pane that left the grid cannot stay filling it.
  useEffect(() => {
    setMaximizedId((current) => (current !== null && !gridTerminalIds.includes(current) ? null : current));
  }, [gridTerminalIds]);

  const handleMaximize = useCallback((terminalId: string, index: number) => {
    setGridFocusedIndex(index);
    setMaximizedId((current) => (current === terminalId ? null : terminalId));
    focusPaneTerminal(terminalId);
  }, [focusPaneTerminal, setGridFocusedIndex]);

  return (
    <div className="h-full flex flex-col">
      {/* Grid controls: in the title row, so they cost the terminals no height. */}
      {placeToolbar(
        <div data-grid-toolbar className="no-drag flex items-center gap-1 min-w-0">
          <span className="text-text-tertiary text-[11px] tabular-nums px-1 flex-shrink-0" title="Alt+Arrows or Alt+1-8 move between terminals">
            {gridTerminalIds.length}/8
          </span>
          {/* Layout Selector */}
          <div className="flex items-center gap-0.5 bg-bg-primary rounded-md p-0.5">
            {LAYOUT_OPTIONS.map((option) => {
              const cfg = GRID_CONFIGS[option.layout];
              return (
                <button
                  key={option.layout}
                  onClick={() => {
                    setGridFreeform(false);
                    setGridLayout(option.layout);
                  }}
                  className={`p-1 rounded transition-colors ${
                    !gridFreeform && gridLayout === option.layout
                      ? 'bg-accent-primary text-white'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-fill-hover'
                  }`}
                  title={option.label}
                >
                  <LayoutIcon rows={cfg.rows} cols={cfg.cols} />
                </button>
              );
            })}
            <button
              onClick={() => setGridFreeform(true)}
              aria-pressed={gridFreeform}
              className={`p-1 rounded transition-colors ${
                gridFreeform
                  ? 'bg-accent-primary text-white'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-fill-hover'
              }`}
              title="Free layout: drag a terminal by its title, resize from its edges"
            >
              <Move size={14} />
            </button>
          </div>

          {gridFreeform && gridTerminalIds.length > 0 && (
            <button
              onClick={handleTile}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-fill-hover rounded transition-colors"
              title="Arrange all terminals evenly"
            >
              <LayoutGrid size={12} />
              <span className="max-[1180px]:hidden">Tile</span>
            </button>
          )}

          {gridFreeform && gridTerminalIds.length > 0 && (
            <button
              onClick={handleFill}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-fill-hover rounded transition-colors"
              title="Grow terminals into the empty space around them"
            >
              <Expand size={12} />
              <span className="max-[1180px]:hidden">Fill</span>
            </button>
          )}

          <GridLayoutsMenu />

          {/* New Terminal Button */}
          <button
            onClick={() => openNewTerminalModal()}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-fill-hover rounded transition-colors"
            title="Create a new terminal in the grid"
          >
            <Plus size={12} />
            <span className="max-[1180px]:hidden">New Terminal</span>
          </button>

          {/* Add All Terminals Button */}
          <button
            onClick={handleAddAll}
            disabled={!canAddAll}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-fill-hover rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            title={
              allTerminalIds.length === 0
                ? 'No active terminals'
                : allTerminalIds.length > 8
                  ? `Add first 8 of ${allTerminalIds.length} terminals to grid`
                  : `Add all ${allTerminalIds.length} terminals to grid`
            }
          >
            <Layers size={12} />
            <span className="max-[1180px]:hidden">Add All</span>
          </button>

          {/* Exit Grid Mode */}
          <button
            onClick={() => setGridMode(false)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-fill-hover rounded transition-colors"
          >
            <Minimize2 size={12} />
            <span className="max-[1180px]:hidden">Exit Grid</span>
          </button>
        </div>,
      )}

      {/* Grid Container */}
      {gridFreeform ? (
        <div ref={containerRef} data-free-container className="relative isolate flex-1 min-h-0 m-0.5 overflow-clip"
          onScroll={resetScroll}>
          {gridTerminalIds.map((terminalId, index) => {
            const rect = gridFreeRects[terminalId];
            if (!rect) return null;
            return (
              <FreeformPane
                key={terminalId}
                terminalId={terminalId}
                index={index}
                rect={rect}
                zIndex={paneOrder.indexOf(terminalId) + 1}
                containerRef={containerRef}
                isFocused={gridFocusedIndex === index}
                maximized={maximizedId === terminalId}
                onFocus={() => setGridFocusedIndex(index)}
                onRemove={() => handleRemove(terminalId)}
                onMaximize={() => handleMaximize(terminalId, index)}
              />
            );
          })}
        </div>
      ) : (
      <div
        ref={containerRef}
        className="relative isolate flex-1 min-h-0 p-0.5 overflow-clip"
        onScroll={resetScroll}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${config.rows}, minmax(0, 1fr))`,
          gap: '2px',
        }}
      >
        <AnimatePresence mode="popLayout">
          {/* Filled terminal cells */}
          {gridTerminalIds.map((terminalId, index) => (
            <TerminalCell
              key={terminalId}
              terminalId={terminalId}
              index={index}
              isFocused={gridFocusedIndex === index}
              maximized={maximizedId === terminalId}
              onFocus={() => setGridFocusedIndex(index)}
              onRemove={() => handleRemove(terminalId)}
              onMaximize={() => handleMaximize(terminalId, index)}
            />
          ))}

          {/* Empty cells for adding more terminals */}
          {Array.from({ length: emptyCells }).map((_, index) => (
            <AddTerminalCell key={`empty-${index}`} />
          ))}
        </AnimatePresence>
      </div>
      )}

      {/* Empty State */}
      {gridTerminalIds.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-xl bg-fill-hover ring-1 ring-seam flex items-center justify-center">
              <Grid3X3 size={28} className="text-text-tertiary" />
            </div>
            <div className="space-y-1">
              <p className="text-text-secondary text-[13px] font-medium">No terminals in grid</p>
              <p className="text-text-tertiary text-[12px]">
                {gridFreeform
                  ? 'Use New Terminal or Add All above to place terminals'
                  : <>Click any <Plus size={12} className="inline -mt-0.5" /> cell to add a terminal</>}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
