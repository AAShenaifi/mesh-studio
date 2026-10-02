// Feature modules register their sidebar panels, dialogs, viewport overlays
// and file loaders on import.
import './features/analysis';
import './features/stats';
import './features/cut';
import './features/booleans';
import './features/tools';
import './features/paint';
import './features/prep';
import './features/meshTools';
import './features/export';
import './features/formats';
import './features/imageImport';
import './features/step';
import './features/zipImport';
import './features/measure';
import './features/generators';
// AI designer: temporarily disabled. It calls /api/stl-ai, a Cloudflare Pages
// Function that does not exist on this site.
// To bring it back: restore the line below and add a matching /api/stl-ai backend.
// import './features/ai';
