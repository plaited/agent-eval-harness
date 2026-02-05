/**
 * Core utilities for agent-eval-harness.
 *
 * @remarks
 * Re-exports shared utilities used across all commands:
 * - Loading: JSONL file parsing for prompts and results
 * - Trajectory: Extraction and analysis of agent trajectories
 * - Output: Writing results, progress logging, path resolution
 *
 * @packageDocumentation
 */

// Loading utilities
export { buildResultsIndex, countLines, loadJsonl, loadPrompts, loadResults, streamResults } from './loading.ts'
// Output utilities
export { getInputPreview, headTailPreview, logProgress, resolvePath, writeOutput } from './output.ts'
// Trajectory utilities
export {
  detectTrajectoryRichness,
  extractContent,
  extractFilePath,
  extractOutput,
  extractTrajectory,
  hasToolErrors,
} from './trajectory.ts'
// Worker pool utilities
export {
  createWorkspaceDir,
  createWriteMutex,
  type ProgressCallback,
  runWorkerPool,
  type WorkerPoolOptions,
  type WorkerPoolResult,
  type WriteMutex,
} from './worker-pool.ts'
