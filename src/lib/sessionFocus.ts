import { useAppStore } from '../store/appStore';
import { useTerminalStore, type TerminalInstance } from '../store/terminalStore';
import { toast } from '../store/toastStore';
import { MAX_GRID_TERMINALS } from './gridEmptyCells';
import type { SessionState } from './terminalState';

/** Real agent sessions, oldest first: not plain shells or script children. */
export function listSessions(terminals: Map<string, TerminalInstance>): TerminalInstance[] {
  return Array.from(terminals.values())
    .filter((t) => !t.scriptParentId && !t.isShellTerminal)
    .sort((a, b) => (a.config.created_at < b.config.created_at ? -1 : 1));
}

/**
 * The waiting session to go to next: the first one after `activeId` in `ids`,
 * wrapping around, so repeated presses visit each of them in turn. The active
 * session counts only if nothing else is waiting.
 */
export function nextWaitingId(
  ids: string[],
  states: Map<string, SessionState>,
  activeId: string | null,
): string | null {
  const waiting = ids.filter((id) => states.get(id) === 'waiting');
  if (waiting.length === 0) return null;
  const start = activeId === null ? -1 : ids.indexOf(activeId);
  for (let step = 1; step <= ids.length; step++) {
    const id = ids[(start + step + ids.length) % ids.length];
    if (id !== activeId && waiting.includes(id)) return id;
  }
  return waiting[0];
}

/** Show a session wherever the current view keeps it, and put the cursor in it. */
export function focusSession(id: string): void {
  const app = useAppStore.getState();
  const terminals = useTerminalStore.getState();
  if (app.gridMode) {
    let index = app.gridTerminalIds.indexOf(id);
    if (index < 0 && app.gridTerminalIds.length < MAX_GRID_TERMINALS) {
      index = app.gridTerminalIds.length;
      app.addToGrid(id);
    }
    if (index >= 0) app.setGridFocusedIndex(index);
    else app.setGridMode(false); // The grid is full: show it as a tab instead.
  }
  terminals.setActiveTerminal(id);
  requestAnimationFrame(() => {
    useTerminalStore.getState().terminals.get(id)?.xterm?.focus();
  });
}

export function jumpToNextWaiting(): void {
  const { terminals, terminalStates, activeTerminalId } = useTerminalStore.getState();
  const ids = listSessions(terminals).map((t) => t.config.id);
  const target = nextWaitingId(ids, terminalStates, activeTerminalId);
  if (target) focusSession(target);
  else toast.info('No session is waiting for you');
}
