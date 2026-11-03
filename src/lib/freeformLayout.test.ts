import { describe, expect, it } from 'vitest';
import { moveRect, placeNewRect, resizeRect, tileRects } from './freeformLayout';

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
