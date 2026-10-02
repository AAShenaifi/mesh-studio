import { registerPanel } from '../../ui/panels';
import { BooleanPanel, HollowPanel } from './BooleanPanel';
import { PrimitivesPanel } from './PrimitivesPanel';

registerPanel({ tab: 'edit', title: 'Booleans', order: 12, Component: BooleanPanel });
registerPanel({ tab: 'edit', title: 'Hollow', order: 14, Component: HollowPanel, collapsed: true });
registerPanel({ tab: 'create', title: 'Primitives', order: 1, Component: PrimitivesPanel });
