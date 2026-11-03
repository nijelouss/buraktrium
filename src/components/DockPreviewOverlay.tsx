import { useAppStore } from '../store/appStore';

/** Outlines where a session dragged from the sidebar or header would land. */
export function DockPreviewOverlay() {
  const preview = useAppStore((s) => s.dockPreview);
  if (!preview) return null;
  return (
    <div
      aria-hidden
      data-testid="dock-preview"
      className="fixed z-[800] pointer-events-none rounded-md border-2 border-accent-primary bg-accent-primary/15"
      style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h }}
    />
  );
}
