import { registerOverlay } from '../../viewport/overlays';
import { registerPanel } from '../../ui/panels';
import { MeasurePanel, MeasureTool } from './MeasureTool';

registerOverlay(MeasureTool);
registerPanel({ tab: 'scene', title: 'Measure', order: 40, Component: MeasurePanel, collapsed: true });
