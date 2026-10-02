import JSZip from 'jszip';
import { registerLoader, loadFilesAsObjects } from '../loaders/openFiles';

// A .zip (for example an OBJ + MTL export) is opened by loading every model inside it.
registerLoader('zip', async (file, _all, existing) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const files: File[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name.startsWith('__MACOSX')) continue;
    const name = entry.name.split('/').pop()!;
    files.push(new File([await entry.async('arraybuffer')], name));
  }
  const { objects, errors } = await loadFilesAsObjects(files, existing);
  if (!objects.length) throw new Error(errors[0] ?? `${file.name} contains no supported models.`);
  return objects;
});
