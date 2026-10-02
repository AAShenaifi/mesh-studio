import * as Tabs from '@radix-ui/react-tabs';
import { useAppStore, type SidebarTab } from '../store/useAppStore';
import { useSceneStore } from '../store/useSceneStore';
import { pickFiles } from '../loaders/pickFiles';
import { ObjectList } from './ObjectList';
import { ObjectProperties } from './ObjectProperties';
import { UploadIcon } from './icons';
import { Button, Section } from './primitives';
import { panels } from './panels';

const TABS: Array<{ id: SidebarTab; label: string }> = [
  { id: 'scene', label: 'Scene' },
  { id: 'edit', label: 'Edit' },
  { id: 'paint', label: 'Paint' },
  { id: 'create', label: 'Create' },
];

function DropZone() {
  const loading = useAppStore((s) => s.status.kind === 'loading');
  return (
    <button
      type="button"
      onClick={pickFiles}
      disabled={loading}
      className="w-full rounded-[10px] border-2 border-dashed border-line-strong px-3.5 py-5 text-center text-muted transition-colors hover:border-accent-hi hover:bg-accent/10 hover:text-ink"
    >
      <UploadIcon className="mx-auto mb-1.5" width={22} height={22} />
      <b className="block text-ink">Drop models anywhere</b>
      <span className="text-[12.5px]">or click to choose · STL, OBJ, GLB, glTF</span>
      <span className="mt-1 block text-[11.5px] text-faint">Files stay on this device.</span>
    </button>
  );
}

function ScenePanel() {
  const count = useSceneStore((s) => s.objects.length);
  return (
    <>
      <Section title={`Objects (${count})`} action={count > 0 && <Button variant="ghost" className="!min-h-7 !px-2 text-xs" onClick={pickFiles}>+ Add</Button>}>
        {count ? <ObjectList /> : <DropZone />}
      </Section>
      <Section title="Selection">
        <ObjectProperties />
      </Section>
    </>
  );
}

export function Sidebar() {
  const tab = useAppStore((s) => s.sidebarTab);
  const setTab = useAppStore((s) => s.setSidebarTab);
  const panelOpen = useAppStore((s) => s.panelOpen);
  const setPanelOpen = useAppStore((s) => s.setPanelOpen);
  const visibleTabs = TABS.filter((t) => t.id === 'scene' || panels.some((p) => p.tab === t.id));
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-line bg-surface max-md:w-[280px]">
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as SidebarTab)} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List aria-label="Sidebar" className="flex shrink-0 gap-1 border-b border-line bg-surface p-1.5">
          {visibleTabs.map((t) => (
            <Tabs.Trigger
              key={t.id}
              value={t.id}
              className="flex-1 rounded-md px-2 py-1.5 text-xs font-bold text-muted hover:text-ink data-[state=active]:bg-accent data-[state=active]:text-white"
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {visibleTabs.map((t) => (
          <Tabs.Content key={t.id} value={t.id} className="min-h-0 flex-1 overflow-y-auto outline-none">
            {t.id === 'scene' && <ScenePanel />}
            {panels
              .filter((p) => p.tab === t.id)
              .map((p) => (
                <details
                  key={p.title}
                  open={panelOpen[p.title] ?? !p.collapsed}
                  onToggle={(e) => {
                    const open = (e.currentTarget as HTMLDetailsElement).open;
                    if (open !== (panelOpen[p.title] ?? !p.collapsed)) setPanelOpen(p.title, open);
                  }}
                  className="group border-b border-line"
                  data-panel={p.title}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-[0.8px] text-muted hover:text-ink">
                    {p.title}
                    <span aria-hidden="true" className="text-faint group-open:rotate-90">›</span>
                  </summary>
                  <div className="px-4 pb-3.5">
                    <p.Component />
                  </div>
                </details>
              ))}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </aside>
  );
}
