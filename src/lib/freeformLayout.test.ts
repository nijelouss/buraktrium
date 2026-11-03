import { describe, expect, it } from 'vitest';
import { applyDock, fillGaps, dockRect, dockZoneAt, moveRect, pickDragAction, placeNewRect, resizeRect, swapRects, tileRects } from './freeformLayout';

const SIZE = { width: 1000, height: 800 };

describe('tileRects', () => {
  it('returns nothing for no panes', () => {
    expect(tileRects(0)).toEqual([]);
  });

  it('covers the whole area without gaps for an odd count', () => {
    const rects = tileRects(3);
    expect(rects).toHaveLength(3);
    const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(area).toBeCloseTo(1);
    expect(rects[2].w).toBeCloseTo(1); // last row stretches
  });
});

describe('placeNewRect', () => {
  it('stays inside the container for any count', () => {
    for (let i = 0; i < 20; i++) {
      const r = placeNewRect(i);
      expect(r.x + r.w).toBeLessThanOrEqual(1);
      expect(r.y + r.h).toBeLessThanOrEqual(1);
    }
  });
});

describe('moveRect', () => {
  const start = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };

  it('moves freely away from any snap target', () => {
    const r = moveRect(start, 0.1, 0.1, [], SIZE);
    expect(r.x).toBeCloseTo(0.3);
    expect(r.y).toBeCloseTo(0.3);
  });

  it('snaps to the container edge', () => {
    const r = moveRect(start, -0.195, 0, [], SIZE);
    expect(r.x).toBe(0);
  });

  it('snaps next to another pane', () => {
    const other = { x: 0.6, y: 0, w: 0.4, h: 1 };
    const r = moveRect(start, 0.095, 0, [other], SIZE);
    expect(r.x + r.w).toBeCloseTo(0.6);
  });

  it('never leaves the container', () => {
    const r = moveRect(start, 5, 5, [], SIZE);
    expect(r.x + r.w).toBeCloseTo(1);
    expect(r.y + r.h).toBeCloseTo(1);
  });
});

describe('resizeRect', () => {
  const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

  it('moves only the dragged edge', () => {
    const r = resizeRect(start, { right: true }, 0.1, 0, [], SIZE);
    expect(r.x).toBeCloseTo(0.2);
    expect(r.w).toBeCloseTo(0.5);
    expect(r.h).toBeCloseTo(0.4);
  });

  it('keeps the opposite edge fixed when dragging left', () => {
    const r = resizeRect(start, { left: true }, -0.1, 0, [], SIZE);
    expect(r.x).toBeCloseTo(0.1);
    expect(r.x + r.w).toBeCloseTo(0.6);
  });

  it('enforces the minimum size', () => {
    const r = resizeRect(start, { right: true, bottom: true }, -1, -1, [], SIZE);
    expect(r.w * SIZE.width).toBeCloseTo(260);
    expect(r.h * SIZE.height).toBeCloseTo(140);
  });

  it('snaps the dragged edge to the container', () => {
    const r = resizeRect(start, { right: true }, 0.395, 0, [], SIZE);
    expect(r.x + r.w).toBe(1);
  });
});

describe('dockZoneAt', () => {
  it('finds edges and corners, and nothing in the middle', () => {
    expect(dockZoneAt(990, 400, SIZE)).toBe('right');
    expect(dockZoneAt(5, 400, SIZE)).toBe('left');
    expect(dockZoneAt(500, 5, SIZE)).toBe('top');
    expect(dockZoneAt(500, 795, SIZE)).toBe('bottom');
    expect(dockZoneAt(5, 5, SIZE)).toBe('top-left');
    expect(dockZoneAt(995, 795, SIZE)).toBe('bottom-right');
    expect(dockZoneAt(500, 400, SIZE)).toBeNull();
  });
});

describe('pickDragAction', () => {
  const others = [{ id: 'b', rect: { x: 0.5, y: 0, w: 0.5, h: 1 } }];

  it('prefers the window edge over a pane under the pointer', () => {
    expect(pickDragAction(995, 400, SIZE, others, false)).toEqual({ type: 'dock', zone: 'right' });
  });

  it('swaps when dropped on another pane', () => {
    expect(pickDragAction(700, 400, SIZE, others, false)).toEqual({ type: 'swap', id: 'b' });
  });

  it('does nothing over empty space', () => {
    expect(pickDragAction(200, 400, SIZE, others, false)).toBeNull();
  });

  it('Alt always means a free drop', () => {
    expect(pickDragAction(995, 400, SIZE, others, true)).toBeNull();
    expect(pickDragAction(700, 400, SIZE, others, true)).toBeNull();
  });
});

describe('swapRects', () => {
  it('exchanges exactly two panes', () => {
    const a = { x: 0, y: 0, w: 0.5, h: 1 };
    const b = { x: 0.5, y: 0, w: 0.5, h: 1 };
    const c = { x: 0.2, y: 0.2, w: 0.1, h: 0.1 };
    expect(swapRects({ a, b, c }, 'a', 'b')).toEqual({ a: b, b: a, c });
  });
});

describe('applyDock', () => {
  const left = dockRect('left');
  const right = dockRect('right');

  it('moving left to right trades places with the pane there', () => {
    expect(applyDock('a', 'right', { a: left, b: right })).toEqual({ a: right, b: left });
  });

  it('a pane that was full screen sends the other to the opposite side', () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    expect(applyDock('a', 'right', { a: full, b: right })).toEqual({ a: right, b: left });
  });

  it('a full-screen pane makes way for one docked beside it', () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    expect(applyDock('a', 'right', { a: right, b: full })).toEqual({ a: right, b: left });
  });

  it('leaves panes the docked one does not cover', () => {
    const small = { x: 0, y: 0, w: 0.2, h: 0.2 };
    expect(applyDock('a', 'right', { a: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, b: small })).toEqual({ a: right, b: small });
  });
});

describe('fillGaps', () => {
  const area = (rects: Record<string, { w: number; h: number }>) =>
    Object.values(rects).reduce((sum, r) => sum + r.w * r.h, 0);

  it('a lone pane takes the whole area', () => {
    expect(fillGaps({ a: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 } })).toEqual({ a: { x: 0, y: 0, w: 1, h: 1 } });
  });

  it('closing one of three leaves no empty space', () => {
    const rest = { a: { x: 0, y: 0, w: 0.5, h: 0.5 }, c: { x: 0, y: 0.5, w: 1, h: 0.5 } };
    const filled = fillGaps(rest);
    expect(area(filled)).toBeCloseTo(1);
    expect(filled.a).toEqual({ x: 0, y: 0, w: 1, h: 0.5 });
  });

  it('side-by-side panes share the height and keep their border', () => {
    const filled = fillGaps({ a: { x: 0, y: 0.1, w: 0.5, h: 0.5 }, b: { x: 0.5, y: 0.1, w: 0.5, h: 0.5 } });
    expect(filled.a).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(filled.b).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it('does not grow panes into each other', () => {
    const filled = fillGaps({ a: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, b: { x: 0.6, y: 0.1, w: 0.2, h: 0.2 } });
    expect(filled.a.x + filled.a.w).toBeLessThanOrEqual(filled.b.x);
  });

  it('leaves panes stacked on purpose where they are', () => {
    const a = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    const b = { x: 0.3, y: 0.3, w: 0.5, h: 0.5 };
    const filled = fillGaps({ a, b });
    expect(filled.a.x).toBeCloseTo(a.x);
    expect(filled.a.w).toBeCloseTo(a.w);
  });
});
