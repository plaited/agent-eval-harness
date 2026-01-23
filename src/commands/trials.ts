/**
 * Multi-run trials command for pass@k/pass^k analysis.
 *
 * @remarks
 * Runs each prompt k times to measure non-determinism.
 * Without a grader, captures raw trials. With a grader, computes:
 * - passRate: Simple pass rate (passes / k)
 * - passAtK: Probability of at least one pass in k samples
 * - passExpK: Probability of all k samples passing
 *
 * @packageDocumentation
 */

import { parseArgs } from 'node:util'
import { extractOutput, extractTrajectory, loadPrompts, logProgress, resolvePath, writeOutput } from '../core.ts'
import { type HeadlessAdapterConfig, parseHeadlessConfig } from '../headless/headless.schemas.ts'
import type { ParsedUpdate } from '../headless/headless-output-parser.ts'
import { createSessionManager } from '../headless/headless-session-manager.ts'
import { DEFAULT_HARNESS_TIMEOUT, DEFAULT_TRIAL_COUNT } from '../schemas/constants.ts'
import { loadGrader } from '../schemas/grader-loader.ts'
import type { Grader, TrialEntry, TrialResult } from '../schemas.ts'

// ============================================================================
// Pass@k/Pass^k Calculation
// ============================================================================

/**
 * Calculate pass@k: probability of at least one pass in k samples.
 *
 * @remarks
 * Uses the unbiased estimator: 1 - C(n-c, k) / C(n, k)
 * where n = total samples, c = correct samples, k = samples per trial
 *
 * For our case where n = k (we run exactly k trials per prompt):
 * pass@k = 1 - (1 - passRate)^k (simplified)
 *
 * @param passes - Number of passing trials
 * @param k - Total number of trials
 * @returns Probability of at least one pass
 *
 * @public
 */
export const calculatePassAtK = (passes: number, k: number): number => {
  if (passes >= k) return 1
  if (passes === 0) return 0

  // Simplified formula when n = k
  const passRate = passes / k
  return 1 - (1 - passRate) ** k
}

/**
 * Calculate pass^k: probability of all k samples passing.
 *
 * @remarks
 * This is simply passRate^k
 *
 * @param passes - Number of passing trials
 * @param k - Total number of trials
 * @returns Probability of all k samples passing
 *
 * @public
 */
export const calculatePassExpK = (passes: number, k: number): number => {
  if (passes === k) return 1
  if (passes === 0) return 0

  const passRate = passes / k
  return passRate ** k
}

// ============================================================================
// Types
// ============================================================================

/** Configuration for trials command */
export type TrialsConfig = {
  /** Path to prompts.jsonl file */
  promptsPath: string
  /** Path to agent schema JSON file */
  schemaPath: string
  /** Number of trials per prompt */
  k: number
  /** Output file path */
  outputPath?: string
  /** Working directory for agent */
  cwd?: string
  /** Timeout per prompt in milliseconds (overrides schema default) */
  timeout?: number
  /** Show progress to stderr */
  progress?: boolean
  /** Append to output file */
  append?: boolean
  /** Optional grader function */
  grader?: Grader
  /** Enable debug mode */
  debug?: boolean
}

// ============================================================================
// Trials Implementation
// ============================================================================

/**
 * Execute trials with configuration object.
 *
 * @param config - Trials configuration
 * @returns Array of trial results
 */
export const runTrials = async (config: TrialsConfig): Promise<TrialResult[]> => {
  const {
    promptsPath,
    schemaPath,
    k,
    outputPath,
    cwd,
    timeout,
    progress = false,
    append = false,
    grader,
    debug = false,
  } = config

  // Load and validate schema
  const schemaFile = Bun.file(schemaPath)
  if (!(await schemaFile.exists())) {
    throw new Error(`Schema file not found: ${schemaPath}`)
  }

  let schema: HeadlessAdapterConfig
  try {
    const rawSchema = await schemaFile.json()
    schema = parseHeadlessConfig(rawSchema)
  } catch (error) {
    throw new Error(`Invalid schema: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Load prompts
  const prompts = await loadPrompts(promptsPath)

  // Resolve output path
  const resolvedOutputPath = outputPath ? resolvePath(outputPath) : undefined

  // Determine effective timeout (CLI flag > schema default > harness default)
  const schemaTimeout = 'timeout' in schema ? schema.timeout : undefined
  const effectiveTimeout = timeout ?? schemaTimeout ?? DEFAULT_HARNESS_TIMEOUT

  // Log progress info
  logProgress(`Loaded ${prompts.length} prompts from ${promptsPath}`, progress)
  logProgress(`Running ${k} trials per prompt`, progress)
  logProgress(`Schema: ${schema.name} (${schemaPath})`, progress)
  logProgress(`Timeout: ${effectiveTimeout}ms`, progress)
  if (grader) {
    logProgress('Grader: enabled (will compute pass@k metrics)', progress)
  }

  // Create session manager with schema
  const sessions = createSessionManager({
    schema,
    timeout: effectiveTimeout,
    verbose: progress,
    debug,
  })

  // Clear output file if not appending
  if (resolvedOutputPath && !append) {
    await Bun.write(resolvedOutputPath, '')
  }

  const workingDir = cwd ?? process.cwd()
  const results: TrialResult[] = []
  let isFirstOutput = true

  // Run evaluations
  for (let i = 0; i < prompts.length; i++) {
    const promptCase = prompts[i]
    if (!promptCase) continue

    logProgress(`[${i + 1}/${prompts.length}] ${promptCase.id}: Running ${k} trials...`, progress)

    const trialEntries: TrialEntry[] = []

    for (let trialNum = 1; trialNum <= k; trialNum++) {
      // Create fresh session for each trial
      const session = await sessions.create(workingDir)
      const startTime = Date.now()

      try {
        // Handle string or array input
        const inputs = Array.isArray(promptCase.input) ? promptCase.input : [promptCase.input]
        const allUpdates: ParsedUpdate[] = []

        // TODO: Per-prompt timeout from promptCase.timeout is documented but not yet implemented

        // Execute each turn sequentially
        for (const turnInput of inputs) {
          const turnResult = await sessions.prompt(session.id, turnInput)
          allUpdates.push(...turnResult.updates)
        }

        const endTime = Date.now()
        const trajectory = extractTrajectory(allUpdates, startTime)
        const output = extractOutput(trajectory)

        const entry: TrialEntry = {
          trialNum,
          output,
          trajectory,
          duration: endTime - startTime,
        }

        // Apply grader if provided
        if (grader) {
          const graderResult = await grader({
            input: promptCase.input,
            output,
            hint: promptCase.hint,
            trajectory,
            metadata: promptCase.metadata,
          })
          entry.pass = graderResult.pass
          entry.score = graderResult.score
          entry.reasoning = graderResult.reasoning
        }

        trialEntries.push(entry)
        logProgress(
          `    Trial ${trialNum}/${k}: ${entry.pass !== undefined ? (entry.pass ? '✓' : '✗') : '?'}`,
          progress,
        )

        // Clean up session
        sessions.destroy(session.id)
      } catch (error) {
        const endTime = Date.now()
        const message = error instanceof Error ? error.message : String(error)

        trialEntries.push({
          trialNum,
          output: '',
          trajectory: [],
          duration: endTime - startTime,
          pass: false,
          reasoning: `Error: ${message}`,
        })
        logProgress(`    Trial ${trialNum}/${k}: ! (error)`, progress)
      }
    }

    // Build result
    const result: TrialResult = {
      id: promptCase.id,
      input: promptCase.input,
      ...(promptCase.hint && { hint: promptCase.hint }),
      k,
      trials: trialEntries,
    }

    // Calculate metrics if grader was used
    if (grader) {
      const passes = trialEntries.filter((t) => t.pass).length
      result.passRate = passes / k
      result.passAtK = calculatePassAtK(passes, k)
      result.passExpK = calculatePassExpK(passes, k)
    }

    results.push(result)

    // Write result immediately
    const formatted = JSON.stringify(result)
    await writeOutput(formatted, resolvedOutputPath, !isFirstOutput)
    isFirstOutput = false

    if (grader) {
      logProgress(
        `  → passRate=${(result.passRate ?? 0).toFixed(2)}, pass@${k}=${(result.passAtK ?? 0).toFixed(2)}`,
        progress,
      )
    }
  }

  logProgress('Done!', progress)
  return results
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Trials command CLI handler.
 *
 * @param args - Command line arguments (after 'trials')
 */
export const trials = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      schema: { type: 'string', short: 's' },
      output: { type: 'string', short: 'o' },
      k: { type: 'string', short: 'k', default: String(DEFAULT_TRIAL_COUNT) },
      cwd: { type: 'string', short: 'c' },
      timeout: { type: 'string', short: 't' },
      progress: { type: 'boolean', default: false },
      append: { type: 'boolean', default: false },
      grader: { type: 'string', short: 'g' },
      debug: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`
Usage: agent-eval-harness trials <prompts.jsonl> --schema <schema.json> [options]

Arguments:
  prompts.jsonl     Input file with evaluation prompts

Options:
  -s, --schema      Path to agent schema JSON file (required)
  -o, --output      Output file (default: stdout)
  -k                Number of trials per prompt (default: ${DEFAULT_TRIAL_COUNT})
  -c, --cwd         Working directory for agent
  -t, --timeout     Request timeout in ms (overrides schema default)
  --progress        Show progress to stderr
  --append          Append to output file
  -g, --grader      Path to grader (.ts/.js module or executable script)
  --debug           Enable debug mode
  -h, --help        Show this help message

Output Format:
  Without grader: Raw trials with trajectories
  With grader: Trials plus pass@k metrics (passRate, passAtK, passExpK)

Graders:
  TS/JS modules must export a 'grade' function.
  Executable scripts (Python, etc.) use stdin/stdout JSON protocol.

Examples:
  # Capture only
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 -o trials.jsonl

  # With TypeScript grader
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 --grader ./grader.ts -o trials.jsonl

  # With Python grader
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 --grader ./grader.py -o trials.jsonl
`)
    return
  }

  const promptsPath = positionals[0]
  if (!promptsPath) {
    console.error('Error: prompts.jsonl path is required')
    process.exit(1)
  }

  if (!values.schema) {
    console.error('Error: --schema is required')
    console.error('Example: agent-eval-harness trials prompts.jsonl --schema ./claude.json')
    process.exit(1)
  }

  // Load grader if specified
  let grader: Grader | undefined
  if (values.grader) {
    try {
      grader = await loadGrader(values.grader)
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`)
      process.exit(1)
    }
  }

  await runTrials({
    promptsPath,
    schemaPath: values.schema,
    k: Number.parseInt(values.k ?? String(DEFAULT_TRIAL_COUNT), 10),
    outputPath: values.output,
    cwd: values.cwd,
    timeout: values.timeout ? Number.parseInt(values.timeout, 10) : undefined,
    progress: values.progress ?? false,
    append: values.append ?? false,
    grader,
    debug: values.debug ?? false,
  })
}
