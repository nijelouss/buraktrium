import { describe, expect, it } from 'vitest';
import { nextWaitingId } from './sessionFocus';
import type { SessionState } from './terminalState';

const states = (entries: Record<string, SessionState>) => new Map(Object.entries(entries));

describe('nextWaitingId', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('returns null when nothing is waiting', () => {
    expect(nextWaitingId(ids, states({ a: 'busy', b: 'idle' }), 'a')).toBeNull();
  });

  it('goes to the next waiting session after the active one', () => {
    expect(nextWaitingId(ids, states({ a: 'waiting', c: 'waiting' }), 'a')).toBe('c');
  });

  it('wraps around, so repeated presses visit every waiting session', () => {
    expect(nextWaitingId(ids, states({ a: 'waiting', c: 'waiting' }), 'c')).toBe('a');
  });

  it('uses the active session only when it is the only one waiting', () => {
    expect(nextWaitingId(ids, states({ b: 'waiting' }), 'b')).toBe('b');
  });

  it('starts from the beginning with nothing active', () => {
    expect(nextWaitingId(ids, states({ b: 'waiting', d: 'waiting' }), null)).toBe('b');
  });
});
