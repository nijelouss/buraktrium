import { describe, expect, it, vi } from 'vitest';
import { imageFromClipboard, pathForPaste } from './pasteImage';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

function clipboard(text: string, items: { kind: string; type: string; file?: File }[]): DataTransfer {
  return {
    getData: (t: string) => (t === 'text/plain' ? text : ''),
    items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })),
  } as unknown as DataTransfer;
}

describe('imageFromClipboard', () => {
  const png = new File(['x'], 'a.png', { type: 'image/png' });

  it('finds an image', () => {
    expect(imageFromClipboard(clipboard('', [{ kind: 'file', type: 'image/png', file: png }]))).toBe(png);
  });

  it('leaves plain text to the terminal', () => {
    expect(imageFromClipboard(clipboard('hello', [{ kind: 'string', type: 'text/plain' }]))).toBeNull();
  });

  it('treats text with a picture of itself as text', () => {
    expect(imageFromClipboard(clipboard('a\tb', [{ kind: 'file', type: 'image/png', file: png }]))).toBeNull();
  });

  it('ignores files that are not images', () => {
    expect(imageFromClipboard(clipboard('', [{ kind: 'file', type: 'application/pdf' }]))).toBeNull();
  });

  it('copes with no clipboard data', () => {
    expect(imageFromClipboard(null)).toBeNull();
  });
});

describe('pathForPaste', () => {
  it('quotes only when a space would split the path', () => {
    expect(pathForPaste('C:\\dev\\a.png')).toBe('C:\\dev\\a.png');
    expect(pathForPaste('C:\\my dev\\a.png')).toBe('"C:\\my dev\\a.png"');
  });
});
