// Named free-form layouts. Terminal ids change on every launch, so a saved pane
// remembers what the terminal was (folder, agent, name) and is matched back to
// whatever is open when the layout is applied. Pure for unit testing.

import type { PaneRect } from './freeformLayout';

export interface SavedPane {
  cwd: string;
  agent: string;
  name: string;
  rect: PaneRect;
}

export interface SavedLayout {
  id: string;
  name: string;
  panes: SavedPane[];
}

export interface OpenTerminalInfo {
  id: string;
  cwd: string;
  agent: string;
  name: string;
}

export interface LayoutMatch {
  /** Terminal id to position, in saved order. */
  rects: Record<string, PaneRect>;
  /** Saved panes with no open terminal left to fill them. */
  missing: number;
  /** Open terminals the layout has no room for. */
  extra: string[];
}

const normalizeCwd = (cwd: string) => cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export function capturePanes(
  ids: string[],
  rects: Record<string, PaneRect>,
  terminals: OpenTerminalInfo[],
): SavedPane[] {
  const byId = new Map(terminals.map((t) => [t.id, t]));
  const panes: SavedPane[] = [];
  for (const id of ids) {
    const rect = rects[id];
    const t = byId.get(id);
    if (rect && t) panes.push({ cwd: t.cwd, agent: t.agent, name: t.name, rect });
  }
  return panes;
}

/**
 * Pair saved panes with open terminals, most specific match first, so that two
 * sessions in the same folder keep their own places. A pane nothing matches is
 * filled by any terminal still free: the arrangement is what was saved, and
 * after a restart it should apply even if a folder has changed.
 */
export function matchPanes(panes: SavedPane[], open: OpenTerminalInfo[]): LayoutMatch {
  const assigned = new Array<string | null>(panes.length).fill(null);
  const free = new Set(open.map((t) => t.id));

  const passes: ((p: SavedPane, t: OpenTerminalInfo) => boolean)[] = [
    (p, t) => normalizeCwd(p.cwd) === normalizeCwd(t.cwd) && p.agent === t.agent && p.name === t.name,
    (p, t) => normalizeCwd(p.cwd) === normalizeCwd(t.cwd) && p.agent === t.agent,
    (p, t) => normalizeCwd(p.cwd) === normalizeCwd(t.cwd),
    () => true,
  ];

  for (const matches of passes) {
    panes.forEach((pane, i) => {
      if (assigned[i] !== null) return;
      const hit = open.find((t) => free.has(t.id) && matches(pane, t));
      if (hit) {
        assigned[i] = hit.id;
        free.delete(hit.id);
      }
    });
  }

  const rects: Record<string, PaneRect> = {};
  assigned.forEach((id, i) => {
    if (id !== null) rects[id] = panes[i].rect;
  });
  return {
    rects,
    missing: assigned.filter((id) => id === null).length,
    extra: open.filter((t) => free.has(t.id)).map((t) => t.id),
  };
}
