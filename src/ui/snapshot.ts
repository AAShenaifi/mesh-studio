import { safeName, saveBlob } from '../features/export/writers';
import { useSceneStore } from '../store/useSceneStore';
import { useAppStore } from '../store/useAppStore';

/** Saves the current viewport as PNG (the canvas keeps its drawing buffer). */
export function saveSnapshot() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid=viewport] canvas');
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return useAppStore.getState().setError('Could not capture the viewport image.');
    const s = useSceneStore.getState();
    const sel = s.objects.find((o) => s.selectedIds.includes(o.id));
    saveBlob(`${safeName(sel?.name ?? 'mesh-studio')}.png`, blob);
  }, 'image/png');
}
