/**
 * Core utilities re-export.
 *
 * @remarks
 * Public API for core utilities. Import from here for external use.
 *
 * @packageDocumentation
 */

export {
  // Loading
  buildResultsIndex,
  countLines,
  // Trajectory
  detectTrajectoryRichness,
  extractContent,
  extractFilePath,
  extractOutput,
  extractTrajectory,
  // Output
  getInputPreview,
  hasToolErrors,
  headTailPreview,
  loadJsonl,
  loadPrompts,
  loadResults,
  logProgress,
  resolvePath,
  streamResults,
  writeOutput,
} from './core/core.ts'
