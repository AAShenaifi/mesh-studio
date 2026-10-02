import { registerPanel } from '../../ui/panels';
import { ArrangePanel, MeshToolsPanel, PartsPanel } from './panels';
import { PatternPanel, PatternPreview } from './PatternPanel';
import { registerOverlay } from '../../viewport/overlays';

registerPanel({ tab: 'scene', title: 'Arrange / align', order: 50, Component: ArrangePanel, collapsed: true });
registerPanel({ tab: 'edit', title: 'Parts', order: 11, Component: PartsPanel });
registerPanel({ tab: 'edit', title: 'Simplify / smooth / extrude', order: 16, Component: MeshToolsPanel, collapsed: true });
registerPanel({ tab: 'edit', title: 'Pattern / copies', order: 13, Component: PatternPanel, collapsed: true });
registerOverlay(PatternPreview);
import { PlaceOnTool } from './placeOn';
registerOverlay(PlaceOnTool);
