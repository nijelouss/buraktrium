import { useCallback, useEffect, useRef } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { SessionStrip } from './SessionStrip';
import { Sidebar } from './Sidebar';
import { SidebarWindowHeader } from './titlebar/WindowControls';

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 350;
// Menus and dialogs opened from the sidebar are portalled outside it. Leaving
// the panel for one of them must not close the panel underneath.
const FLOATING_UI = '.material-popover, [role="menu"], [role="dialog"]';

/** Switches the sidebar between auto-hide and always visible. */
export function SidebarPinButton() {
  const autoHide = useAppStore((s) => s.sidebarAutoHide);
  const setAutoHide = useAppStore((s) => s.setSidebarAutoHide);
  const label = autoHide ? 'Keep sidebar open' : 'Auto-hide sidebar';
  return (
    <button
      type="button"
      onClick={() => setAutoHide(!autoHide)}
      aria-label={label}
      title={label}
      className="no-drag absolute top-2.5 right-2.5 z-10 w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-fill-hover transition-colors"
    >
      {autoHide ? <Pin size={13} /> : <PinOff size={13} />}
    </button>
  );
}

/**
 * The sidebar as an overlay: hidden until the pointer reaches the left edge,
 * the handle is clicked, or Ctrl+B is pressed. Kept mounted so its scroll and
 * section state survive being hidden.
 */
export function AutoHideSidebar() {
  const open = useAppStore((s) => s.sidebarPeek);
  const setOpen = useAppStore((s) => s.setSidebarPeek);
  const width = useAppStore((s) => s.sidebarWidth);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Opened by hovering closes when the pointer leaves. Opened deliberately
  // (handle, Ctrl+B) stays until the user clicks elsewhere or presses Escape.
  const openedByHover = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // The narrow rail makes no sense for an overlay.
  useEffect(() => {
    if (collapsed) setCollapsed(false);
  }, [collapsed, setCollapsed]);

  useEffect(() => {
    if (!open) {
      openedByHover.current = false;
      return;
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target) || target.closest(FLOATING_UI)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector(FLOATING_UI)) setOpen(false);
    };
    // Follow the pointer instead of the panel's mouseleave: the pointer starts
    // on the window edge, outside the panel, so leaving straight from there
    // would never fire one and the panel would stay open.
    const onMove = (e: MouseEvent) => {
      if (!openedByHover.current) return;
      const right = panelRef.current?.getBoundingClientRect().right ?? 0;
      if (e.clientX <= right) {
        clearTimer();
      } else if (timerRef.current === null) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (!document.querySelector(FLOATING_UI)) setOpen(false);
        }, CLOSE_DELAY_MS);
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousemove', onMove);
    return () => {
      clearTimer();
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousemove', onMove);
    };
  }, [open, setOpen, clearTimer]);

  const handleEdgeEnter = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      openedByHover.current = true;
      setOpen(true);
    }, OPEN_DELAY_MS);
  };

  return (
    <>
      {!open && (
        <>
          <div
            aria-hidden
            data-testid="sidebar-edge"
            onMouseEnter={handleEdgeEnter}
            onMouseLeave={clearTimer}
            className="absolute left-0 inset-y-0 w-[var(--w-session-strip)] z-40"
          />
          <SessionStrip
            onExpand={() => {
              clearTimer();
              openedByHover.current = false;
              setOpen(true);
            }}
          />
        </>
      )}
      <div
        ref={panelRef}
        aria-hidden={!open}
        // `inert` keeps the hidden panel out of the Tab order.
        {...(open ? {} : { inert: true })}
        className="absolute z-40 top-[var(--inset-window)] bottom-[var(--inset-window)] left-[var(--inset-window)] overflow-hidden rounded-[var(--radius-card)] shadow-elevation-3 bg-elevation-1 ring-1 ring-seam flex flex-col transition-transform duration-150 ease-out"
        style={{
          width,
          transform: open ? 'translateX(0)' : 'translateX(calc(-100% - 2 * var(--inset-window)))',
        }}
      >
        <SidebarPinButton />
        <SidebarWindowHeader collapsed={false} />
        <div className="flex-1 min-h-0">
          <Sidebar />
        </div>
      </div>
    </>
  );
}
