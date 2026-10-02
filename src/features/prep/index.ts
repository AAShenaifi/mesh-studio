import { registerPanel } from '../../ui/panels';
import { registerOverlay } from '../../viewport/overlays';
import { LayFlatTool, OrientPanel } from './OrientPanel';

registerPanel({ tab: 'paint', title: 'Orientation', order: 20, Component: OrientPanel });
registerOverlay(LayFlatTool);
