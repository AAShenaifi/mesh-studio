import { FILE_ACCEPT } from './formats';
import { extraExtensions, openFiles } from './openFiles';

/** Opens the native file picker and loads the selection. Several files can be picked for .gltf + .bin + textures. */
export function pickFiles(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = [FILE_ACCEPT, ...extraExtensions().map((e) => '.' + e)].join(',');
  input.multiple = true;
  input.addEventListener('change', () => {
    if (input.files && input.files.length) void openFiles(input.files);
  });
  input.click();
}
