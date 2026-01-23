/**
 * Built-in comparison graders for the agent eval harness.
 *
 * @remarks
 * Provides two built-in strategies for comparing multiple runs:
 * - **weighted**: Configurable weights for quality, latency, reliability
 * - **statistical**: Bootstrap sampling for confidence intervals
 *
 * @packageDocumentation
 */

export { createStatisticalGrader, grade as statisticalGrade } from './graders/compare-statistical.ts'
export {
  createWeightedGrader,
  DEFAULT_WEIGHTS,
  getWeightsFromEnv,
  grade as weightedGrade,
  type Weights,
} from './graders/compare-weighted.ts'
