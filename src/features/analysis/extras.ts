import type { ComponentType } from 'react';
import type { SceneObject } from '../../scene/types';
import type { AnalysisResult } from './analysisStore';

/** Extra rows under the analysis (e.g. weight estimate from Phase 3). */
export const analysisExtras: Array<ComponentType<{ result: AnalysisResult; object: SceneObject }>> = [];
