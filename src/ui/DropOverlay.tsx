import { useEffect, useState } from 'react';
import { openFiles } from '../loaders/openFiles';
import { UploadIcon } from './icons';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Window-wide drag-and-drop. The whole app is a drop target, and the browser's
 * default "open the file in this tab" is always prevented.
 */
export function DropOverlay() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let depth = 0; // dragenter/dragleave fire for every child element
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = e.dataTransfer?.files;
      if (files) void openFiles(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-page/70 backdrop-blur-[2px]">
      <div className="rounded-2xl border-2 border-dashed border-accent-hi bg-accent/15 px-10 py-8 text-center">
        <UploadIcon className="mx-auto mb-2 text-accent-soft" width={30} height={30} />
        <b className="block text-lg">Drop to open</b>
        <span className="text-[13px] text-muted">STL, OBJ, GLB, or glTF with its .bin and textures</span>
      </div>
    </div>
  );
}
