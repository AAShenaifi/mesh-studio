import { registerPanel } from '../../ui/panels';
import { AiPanel } from './AiPanel';

registerPanel({ tab: 'create', title: 'AI designer', order: 30, Component: AiPanel });
