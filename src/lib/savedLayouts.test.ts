import { describe, expect, it } from 'vitest';
import { capturePanes, matchPanes, type OpenTerminalInfo, type SavedPane } from './savedLayouts';

const rectA = { x: 0, y: 0, w: 0.5, h: 1 };
const rectB = { x: 0.5, y: 0, w: 0.5, h: 1 };

const pane = (cwd: string, agent: string, name: string, rect = rectA): SavedPane => ({ cwd, agent, name, rect });
const term = (id: string, cwd: string, agent = 'claude', name = 'x'): OpenTerminalInfo => ({ id, cwd, agent, name });

describe('capturePanes', () => {
  it('skips panes with no position or no terminal', () => {
    const panes = capturePanes(['a', 'b', 'c'], { a: rectA, c: rectB }, [term('a', 'C:\\p'), term('b', 'C:\\q')]);
    expect(panes).toEqual([{ cwd: 'C:\\p', agent: 'claude', name: 'x', rect: rectA }]);
  });
});

describe('matchPanes', () => {
  it('matches by folder regardless of terminal id and slash style', () => {
    const m = matchPanes([pane('C:\\dev\\LockLock\\', 'claude', 'a')], [term('new-id', 'c:/dev/locklock')]);
    expect(m.rects).toEqual({ 'new-id': rectA });
    expect(m.missing).toBe(0);
  });

  it('keeps two sessions in one folder in their own places by name', () => {
    const panes = [pane('C:\\p', 'claude', 'left', rectA), pane('C:\\p', 'claude', 'right', rectB)];
    const m = matchPanes(panes, [term('r', 'C:\\p', 'claude', 'right'), term('l', 'C:\\p', 'claude', 'left')]);
    expect(m.rects).toEqual({ l: rectA, r: rectB });
  });

  it('prefers a real match over filling an earlier pane with a stranger', () => {
    const panes = [pane('C:\\gone', 'claude', 'a', rectA), pane('C:\\here', 'claude', 'b', rectB)];
    const m = matchPanes(panes, [term('h', 'C:\\here'), term('o', 'C:\\other')]);
    expect(m.rects).toEqual({ h: rectB, o: rectA });
  });

  it('reports panes with nothing to fill them', () => {
    const m = matchPanes([pane('C:\\a', 'claude', 'a'), pane('C:\\b', 'claude', 'b', rectB)], [term('a', 'C:\\a')]);
    expect(Object.keys(m.rects)).toEqual(['a']);
    expect(m.missing).toBe(1);
  });

  it('reports terminals the layout has no room for', () => {
    const m = matchPanes([pane('C:\\a', 'claude', 'a')], [term('a', 'C:\\a'), term('b', 'C:\\b')]);
    expect(m.extra).toEqual(['b']);
  });
});
