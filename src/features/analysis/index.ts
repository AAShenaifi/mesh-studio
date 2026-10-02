import { registerPanel } from '../../ui/panels';
import { registerOverlay } from '../../viewport/overlays';
import { AnalysisPanel } from './AnalysisPanel';
import { analysisExtras } from './extras';
import { ThicknessCheck, ThicknessOverlay } from './Thickness';

registerPanel({ tab: 'edit', title: 'Analysis & repair', order: 5, Component: AnalysisPanel });
analysisExtras.push(ThicknessCheck);
registerOverlay(ThicknessOverlay);
