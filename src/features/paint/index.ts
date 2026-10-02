import { registerPanel } from '../../ui/panels';
import { registerOverlay } from '../../viewport/overlays';
import { PaintPanel } from './PaintPanel';
import { PaintTool } from './PaintTool';

registerPanel({ tab: 'paint', title: 'Paint', order: 1, Component: PaintPanel });
registerOverlay(PaintTool);
