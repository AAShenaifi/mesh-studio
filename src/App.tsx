import * as Tooltip from '@radix-ui/react-tooltip';
import { Viewport } from './viewport/Viewport';
import { TopToolbar } from './ui/TopToolbar';
import { Sidebar } from './ui/Sidebar';
import { SettingsDialog } from './ui/SettingsDialog';
import { ShortcutsDialog } from './ui/ShortcutsDialog';
import { StatusBar } from './ui/StatusBar';
import { ErrorBanner } from './ui/ErrorBanner';
import { NoticeBar } from './ui/NoticeBar';
import { EmptyState } from './ui/EmptyState';
import { BusyOverlay } from './ui/BusyOverlay';
import { DropOverlay } from './ui/DropOverlay';
import { ViewportErrorBoundary } from './ui/ViewportErrorBoundary';
import { useShortcuts } from './ui/useShortcuts';
import { dialogs } from './ui/dialogs';

export function App() {
  useShortcuts();
  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="flex h-full flex-col">
        <TopToolbar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1" data-testid="viewport">
              <ViewportErrorBoundary>
                <Viewport />
              </ViewportErrorBoundary>
              <EmptyState />
              <BusyOverlay />
              <ErrorBanner />
              <NoticeBar />
            </div>
            <StatusBar />
          </main>
        </div>
      </div>
      <SettingsDialog />
      <ShortcutsDialog />
      {dialogs.map((D, i) => (
        <D key={i} />
      ))}
      <DropOverlay />
    </Tooltip.Provider>
  );
}
