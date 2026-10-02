import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '../store/useAppStore';
import { SHORTCUTS } from './useShortcuts';
import { CloseIcon } from './icons';

export function ShortcutsDialog() {
  const open = useAppStore((s) => s.dialog === 'shortcuts');
  const setDialog = useAppStore((s) => s.setDialog);
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <Dialog.Root open={open} onOpenChange={(o) => setDialog(o ? 'shortcuts' : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-32px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line-strong bg-surface p-5 shadow-2xl outline-none">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="m-0 text-base font-extrabold">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close aria-label="Close" className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-ink">
              <CloseIcon />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">All keyboard shortcuts in Mesh Studio.</Dialog.Description>
          {groups.map((g) => (
            <section key={g} className="mb-3">
              <h3 className="m-0 mb-1 text-xs font-bold uppercase tracking-[0.8px] text-accent-soft">{g}</h3>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                  <div key={s.keys} className="contents">
                    <dt><kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px]">{s.keys}</kbd></dt>
                    <dd className="m-0 text-muted">{s.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
