import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Marks the document while the window fills the screen. The floating look (a gap
 * around the cards, rounded window corners) only makes sense for a window with
 * something behind it; filling the screen, those gaps just show the backdrop.
 * The styling itself lives under `:root[data-window-maximized]` in index.css.
 */
export function useWindowMaximized(): void {
  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const sync = async () => {
      try {
        const [maximized, fullscreen] = await Promise.all([win.isMaximized(), win.isFullscreen()]);
        if (disposed) return;
        if (maximized || fullscreen) document.documentElement.dataset.windowMaximized = 'true';
        else delete document.documentElement.dataset.windowMaximized;
      } catch {
        // Cosmetic only: if the query fails the window keeps its floating look.
      }
    };

    void sync();
    win.onResized(() => void sync()).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
      delete document.documentElement.dataset.windowMaximized;
    };
  }, []);
}
