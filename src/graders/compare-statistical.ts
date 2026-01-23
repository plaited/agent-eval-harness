/**
 * Built-in statistical significance comparison grader.
 *
 * @remarks
 * Uses bootstrap sampling to compute confidence intervals for score estimates.
 * Flags when the winner is statistically significant (p<0.05, non-overlapping CIs).
 *
 * Bootstrap iterations can be customized via environment variable:
 * - `COMPARE_BOOTSTRAP_ITERATIONS` (default: 1000)
 *
 * @packageDocumentation
 */

import type { ComparisonGrader, ComparisonGraderInput, ComparisonGraderResult } from '../pipeline/pipeline.types.ts'

/** Default number of bootstrap iterations */
const DEFAULT_ITERATIONS = 1000

/**
 * Bootstrap confidence interval result.
 */
type BootstrapResult = {
  /** Estimated mean from bootstrap */
  mean: number
  /** 95% confidence interval [lower, upper] */
  ci95: [number, number]
}

/**
 * Compute bootstrap confidence interval for sample mean.
 *
 * @remarks
 * Bootstrap resampling provides robust confidence intervals without
 * assuming a specific distribution. For small samples, it's more
 * reliable than parametric methods.
 *
 * @param samples - Array of numeric samples
 * @param iterations - Number of bootstrap iterations
 * @returns Bootstrap mean and 95% confidence interval
 */
const bootstrap = (samples: number[], iterations: number = DEFAULT_ITERATIONS): BootstrapResult => {
  if (samples.length === 0) {
    return { mean: 0, ci95: [0, 0] }
  }

  if (samples.length === 1) {
    const value = samples[0] ?? 0
    return { mean: value, ci95: [value, value] }
  }

  const means: number[] = []

  for (let i = 0; i < iterations; i++) {
    // Resample with replacement - we know samples.length > 1 at this point
    const resampled = Array.from(
      { length: samples.length },
      () => samples[Math.floor(Math.random() * samples.length)] as number,
    )

    // Compute mean of resampled data
    const sum = resampled.reduce((acc, val) => acc + val, 0)
    means.push(sum / resampled.length)
  }

  // Sort means for percentile calculation
  means.sort((a, b) => a - b)

  // 95% CI: 2.5th and 97.5th percentiles
  const lowerIdx = Math.floor(iterations * 0.025)
  const upperIdx = Math.floor(iterations * 0.975)

  return {
    mean: means[Math.floor(iterations / 2)] ?? 0,
    ci95: [means[lowerIdx] ?? 0, means[upperIdx] ?? 0],
  }
}

/**
 * Get bootstrap iterations from environment variable.
 *
 * @returns Number of bootstrap iterations
 */
const getIterationsFromEnv = (): number => {
  const envValue = process.env.COMPARE_BOOTSTRAP_ITERATIONS
  if (!envValue) return DEFAULT_ITERATIONS

  const parsed = Number.parseInt(envValue, 10)
  return Number.isNaN(parsed) || parsed < 100 ? DEFAULT_ITERATIONS : parsed
}

/**
 * Statistical significance comparison grader.
 *
 * @remarks
 * Compares runs using bootstrap sampling to determine if differences
 * are statistically significant. When confidence intervals don't overlap,
 * the difference is flagged as significant (p<0.05).
 *
 * **Single-sample limitation:** When comparing individual prompts, each run
 * provides only one score sample. Bootstrap with a single sample yields a
 * degenerate CI of `[value, value]`. This grader is most useful when:
 * - Aggregating results across multiple prompts
 * - Using with the full comparison report (which combines per-prompt comparisons)
 *
 * For single-prompt comparisons, consider the weighted grader instead.
 *
 * @public
 */
export const grade: ComparisonGrader = async ({ runs }: ComparisonGraderInput): Promise<ComparisonGraderResult> => {
  const iterations = getIterationsFromEnv()

  // Collect scores for each run
  const runStats = Object.entries(runs).map(([label, run]) => {
    // Use grader score if available, otherwise 0
    const score = run.score?.score ?? 0

    // For single-prompt comparison, we only have one sample
    // In practice, this grader is most useful when aggregating across prompts
    const stats = bootstrap([score], iterations)

    return { label, score, stats }
  })

  // Sort by bootstrap mean descending
  const sorted = runStats.sort((a, b) => b.stats.mean - a.stats.mean)

  // Check if winner is statistically significant
  // CIs don't overlap = significant difference (approximately p<0.05)
  let isSignificant = false
  const first = sorted[0]
  const second = sorted[1]
  if (first && second) {
    // Non-overlapping: first's lower bound > second's upper bound
    isSignificant = first.stats.ci95[0] > second.stats.ci95[1]
  }

  const reasoning = isSignificant
    ? `Winner "${first?.label}" is statistically significant (p<0.05, non-overlapping 95% CIs)`
    : 'No statistically significant difference between top runs (overlapping 95% CIs)'

  return {
    rankings: sorted.map((s, i) => ({
      run: s.label,
      rank: i + 1,
      score: s.stats.mean,
    })),
    reasoning,
  }
}

/**
 * Create a statistical grader with custom iteration count.
 *
 * @param iterations - Number of bootstrap iterations
 * @returns Comparison grader function
 *
 * @public
 */
export const createStatisticalGrader = (iterations: number = DEFAULT_ITERATIONS): ComparisonGrader => {
  return async ({ runs }: ComparisonGraderInput): Promise<ComparisonGraderResult> => {
    const runStats = Object.entries(runs).map(([label, run]) => {
      const score = run.score?.score ?? 0
      const stats = bootstrap([score], iterations)
      return { label, score, stats }
    })

    const sorted = runStats.sort((a, b) => b.stats.mean - a.stats.mean)

    let isSignificant = false
    const first = sorted[0]
    const second = sorted[1]
    if (first && second) {
      isSignificant = first.stats.ci95[0] > second.stats.ci95[1]
    }

    return {
      rankings: sorted.map((s, i) => ({
        run: s.label,
        rank: i + 1,
        score: s.stats.mean,
      })),
      reasoning: isSignificant
        ? `Winner "${first?.label}" is statistically significant (p<0.05)`
        : 'No statistically significant difference between top runs',
    }
  }
}
