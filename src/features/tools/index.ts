import { registerPanel } from '../../ui/panels';
import { DrillPanel } from './DrillPanel';
import { ResizePanel } from './ResizePanel';
import { RotateMirrorPanel } from './RotateMirrorPanel';
import { TextPanel } from './TextPanel';
import { SurfaceTextTool } from './surfaceText';
import { TextGhost } from './TextGhost';
import { registerOverlay } from '../../viewport/overlays';

registerPanel({ tab: 'edit', title: 'Resize / scale', order: 20, Component: ResizePanel });
registerPanel({ tab: 'edit', title: 'Rotate / mirror', order: 25, Component: RotateMirrorPanel });
registerPanel({ tab: 'edit', title: 'Drill hole', order: 30, Component: DrillPanel });
registerPanel({ tab: 'edit', title: 'Add text', order: 35, Component: TextPanel });
registerOverlay(SurfaceTextTool);
registerOverlay(TextGhost);
