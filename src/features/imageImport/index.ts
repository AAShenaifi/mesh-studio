import { registerLoader } from '../../loaders/openFiles';
import { registerPanel } from '../../ui/panels';
import { registerDialog } from '../../ui/dialogs';
import { ImageImportDialog } from './ImageImportDialog';
import { ImageImportPanel } from './ImageImportPanel';
import { useImageImportStore } from './store';

// Images open the dialog; the object is added when the user presses Import.
for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
  registerLoader(ext, async (file) => {
    useImageImportStore.getState().openFor(file, file.name);
    return [];
  });
}
registerDialog(ImageImportDialog);
registerPanel({ tab: 'create', title: 'Image import', order: 9, Component: ImageImportPanel });
