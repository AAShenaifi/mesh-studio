import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { Button } from '../../ui/primitives';
import { useImageImportStore } from './store';

export function pickImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) useImageImportStore.getState().openFor(f, f.name);
  });
  input.click();
}

/** Create tab: open the Image import dialog, or re-open it on an imported image. */
export function ImageImportPanel() {
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const img = target?.source.image;
  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="primary" onClick={pickImage}>Import image (PNG / JPG)…</Button>
      <Button
        disabled={!img}
        onClick={() => img && target && useImageImportStore.getState().openFor(img.blob, img.name, target.id, img.settings)}
      >
        {img ? `Re-tune “${target!.name}”…` : 'Re-tune image (select an imported image)'}
      </Button>
      <p className="m-0 text-xs text-muted">Dropping a PNG or JPG anywhere opens the same dialog.</p>
    </div>
  );
}
