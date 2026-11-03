import { useAppStore } from '../store/appStore';
import { ProgressStripe } from './ui/ProgressStripe';

/**
 * Takes no space until a global background task runs, then shows its progress.
 * The app version is in Settings > About.
 */
export function StatusBar() {
  const globalBusy = useAppStore((s) => s.globalBusy);
  if (!globalBusy) return null;
  return (
    <div className="flex flex-col shrink-0" title={globalBusy}>
      <ProgressStripe />
    </div>
  );
}
