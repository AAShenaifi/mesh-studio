import { registerLoader } from '../../loaders/openFiles';
import { loadCad } from './stepLoader';

for (const ext of ['step', 'stp', 'iges', 'igs', 'brep']) registerLoader(ext, (file, _all, existing) => loadCad(file, existing));
