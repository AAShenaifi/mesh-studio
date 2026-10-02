import { registerPanel } from '../../ui/panels';
import { GeneratorParamsPanel, GeneratorsPanel } from './GeneratorsPanel';

registerPanel({ tab: 'create', title: 'Generator parameters', order: 5, Component: GeneratorParamsPanel });
registerPanel({ tab: 'create', title: 'Generators (OpenSCAD)', order: 20, Component: GeneratorsPanel });
