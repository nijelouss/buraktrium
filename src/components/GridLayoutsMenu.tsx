import { useEffect, useRef, useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useTerminalStore } from '../store/terminalStore';
import { toast } from '../store/toastStore';
import { MAX_GRID_TERMINALS } from '../lib/gridEmptyCells';
import { capturePanes, matchPanes, type SavedLayout } from '../lib/savedLayouts';
import { rememberFreeLayout, terminalInfo } from '../lib/sessionDock';

function applyLayout(layout: SavedLayout): void {
  const app = useAppStore.getState();
  const open = terminalInfo(useTerminalStore.getState().terminals);
  const { rects, missing, extra } = matchPanes(layout.panes.slice(0, MAX_GRID_TERMINALS), open);
  const ids = Object.keys(rects);
  if (ids.length === 0) {
    toast.warning(`Open a terminal first to use "${layout.name}"`);
    return;
  }
  // Positions first: the grid tiles any pane it finds without one.
  app.setGridFreeRects({ ...app.gridFreeRects, ...rects });
  app.setGridTerminals(ids);
  app.setGridFreeform(true);
  app.setGridMode(true);
  rememberFreeLayout();
  if (missing > 0) toast.info(`"${layout.name}": ${missing} saved terminal${missing === 1 ? ' is' : 's are'} not open`);
  else if (extra.length > 0) toast.info(`"${layout.name}": ${extra.length} open terminal${extra.length === 1 ? ' is' : 's are'} not in this layout`);
}

export function GridLayoutsMenu() {
  const gridFreeform = useAppStore((s) => s.gridFreeform);
  const savedLayouts = useAppStore((s) => s.savedLayouts);
  const setSavedLayouts = useAppStore((s) => s.setSavedLayouts);
  const hasPanes = useAppStore((s) => s.gridTerminalIds.length > 0);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const trimmed = name.trim();
  const canSave = gridFreeform && hasPanes && trimmed.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const { gridTerminalIds, gridFreeRects } = useAppStore.getState();
    const panes = capturePanes(gridTerminalIds, gridFreeRects, terminalInfo(useTerminalStore.getState().terminals));
    if (panes.length === 0) return;
    // Saving under an existing name replaces it, in the same place in the list.
    const existing = savedLayouts.find((l) => l.name === trimmed);
    const layout: SavedLayout = { id: existing?.id ?? crypto.randomUUID(), name: trimmed, panes };
    setSavedLayouts(existing
      ? savedLayouts.map((l) => (l.id === existing.id ? layout : l))
      : [...savedLayouts, layout]);
    setName('');
    toast.success(`Saved layout "${trimmed}"`);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-fill-hover rounded transition-colors"
        title="Save this arrangement or bring back a saved one"
      >
        <Bookmark size={12} />
        <span className="max-[1180px]:hidden">Layouts</span>
      </button>
      {open && (
        <div
          data-testid="layouts-menu"
          className="absolute right-0 top-full mt-1 z-[1100] w-[260px] material-popover rounded-lg p-2 space-y-2"
        >
          {savedLayouts.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto space-y-0.5">
              {savedLayouts.map((layout) => (
                <li key={layout.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => {
                      applyLayout(layout);
                      setOpen(false);
                    }}
                    className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-fill-hover text-left"
                  >
                    <span className="text-text-primary text-[12px] truncate">{layout.name}</span>
                    <span className="text-text-tertiary text-[11px] flex-shrink-0">{layout.panes.length}</span>
                  </button>
                  <button
                    onClick={() => setSavedLayouts(savedLayouts.filter((l) => l.id !== layout.id))}
                    aria-label={`Delete layout ${layout.name}`}
                    title="Delete"
                    className="p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-tertiary text-[11px] px-2 py-1">No saved layouts yet</p>
          )}
          <form
            className="flex items-center gap-1 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Layout name"
              placeholder={gridFreeform ? 'Name this layout' : 'Switch to free layout to save'}
              disabled={!gridFreeform || !hasPanes}
              maxLength={60}
              className="flex-1 min-w-0 h-7 px-2 rounded bg-elevation-0 ring-1 ring-seam text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-accent-primary disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!canSave}
              className="h-7 px-2 rounded text-[11px] font-medium text-accent-primary hover:bg-accent-primary/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Save
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
