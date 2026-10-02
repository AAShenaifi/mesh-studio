import { registerPanel } from '../../ui/panels';
import { registerOverlay } from '../../viewport/overlays';
import { CutPanel } from './CutPanel';
import { CutPlane } from './CutPlane';

registerPanel({ tab: 'edit', title: 'Cut / split', order: 10, Component: CutPanel });
registerOverlay(CutPlane);
