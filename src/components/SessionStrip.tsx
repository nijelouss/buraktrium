import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTerminalStore } from '../store/terminalStore';
import { focusSession, listSessions } from '../lib/sessionFocus';
import { StateDot } from './StateDot';

const STATE_LABEL = {
  busy: 'working',
  waiting: 'waiting for you',
  idle: 'idle',
  stopped: 'stopped',
} as const;

/**
 * What stays visible while the sidebar is hidden: a dot per session showing
 * its state, so hiding the sidebar does not hide who needs you. Clicking a dot
 * goes to that session.
 */
export function SessionStrip({ onExpand }: { onExpand: () => void }) {
  const terminals = useTerminalStore((s) => s.terminals);
  const terminalStates = useTerminalStore((s) => s.terminalStates);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const sessions = useMemo(() => listSessions(terminals), [terminals]);

  return (
    <div
      data-testid="session-strip"
      className="no-drag absolute left-0.5 top-1/2 -translate-y-1/2 z-[41] w-[18px] max-h-[80%] flex flex-col items-center gap-1 py-1 rounded-md bg-elevation-2 ring-1 ring-seam overflow-y-auto"
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label="Show sidebar"
        title="Show sidebar (Ctrl+Shift+B)"
        className="w-4 h-5 flex-shrink-0 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-fill-hover transition-colors"
      >
        <ChevronRight size={12} />
      </button>
      {sessions.map((t) => {
        const id = t.config.id;
        const state = terminalStates.get(id) ?? 'idle';
        const failed = t.config.status === 'Error';
        const name = t.config.nickname || t.config.label;
        const label = `${name}: ${failed ? 'error' : STATE_LABEL[state]}`;
        return (
          <button
            key={id}
            type="button"
            data-session-state={failed ? 'error' : state}
            onClick={() => focusSession(id)}
            aria-label={label}
            title={label}
            aria-current={id === activeTerminalId ? 'true' : undefined}
            className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-fill-hover transition-colors ${
              id === activeTerminalId ? 'ring-1 ring-accent-primary' : ''
            }`}
          >
            {failed ? <span className="w-2 h-2 rounded-full bg-error" /> : <StateDot state={state} size={8} />}
          </button>
        );
      })}
    </div>
  );
}
