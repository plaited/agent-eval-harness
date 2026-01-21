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

import { appendFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { createACPClient } from './acp-client.ts'
import { createPrompt } from './acp-helpers.ts'
import { extractOutput, extractTrajectory, loadPrompts } from './capture.ts'
import { DEFAULT_HARNESS_TIMEOUT, DEFAULT_TRIAL_COUNT } from './constants.ts'
import { loadGrader } from './grader-loader.ts'
import type { Grader, TrialEntry, TrialResult } from './schemas.ts'

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
  /** ACP agent command */
  agentCommand: string[]
  /** Number of trials per prompt */
  k: number
  /** Output file path */
  outputPath?: string
  /** Working directory for agent */
  cwd?: string
  /** Timeout per prompt in milliseconds */
  timeout?: number
  /** Show progress to stderr */
  progress?: boolean
  /** Append to output file */
  append?: boolean
  /** Optional grader function */
  grader?: Grader
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve path relative to process.cwd() */
const resolvePath = (path: string): string => {
  if (path.startsWith('/')) return path
  return `${process.cwd()}/${path}`
}

/** Write output line */
const writeOutput = async (line: string, outputPath?: string, append?: boolean): Promise<void> => {
  if (outputPath) {
    if (append) {
      await appendFile(outputPath, `${line}\n`)
    } else {
      await Bun.write(outputPath, `${line}\n`)
    }
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI stdout output
    console.log(line)
  }
}

/** Log progress to stderr */
const logProgress = (message: string, showProgress: boolean): void => {
  if (showProgress) {
    console.error(message)
  }
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
    agentCommand,
    k,
    outputPath,
    cwd,
    timeout = DEFAULT_HARNESS_TIMEOUT,
    progress = false,
    append = false,
    grader,
  } = config

  // Load prompts
  const prompts = await loadPrompts(promptsPath)

  // Resolve output path
  const resolvedOutputPath = outputPath ? resolvePath(outputPath) : undefined

  // Log progress info
  logProgress(`Loaded ${prompts.length} prompts from ${promptsPath}`, progress)
  logProgress(`Running ${k} trials per prompt`, progress)
  logProgress(`Command: ${agentCommand.join(' ')}`, progress)
  if (grader) {
    logProgress('Grader: enabled (will compute pass@k metrics)', progress)
  }

  // Create ACP client
  const client = createACPClient({
    command: agentCommand,
    cwd,
    timeout,
  })

  // Clear output file if not appending
  if (resolvedOutputPath && !append) {
    await Bun.write(resolvedOutputPath, '')
  }

  // Session params - agents auto-discover MCP configs from cwd
  const sessionParams = {
    cwd: cwd ?? process.cwd(),
  }

  const results: TrialResult[] = []
  let isFirstOutput = true

  try {
    logProgress('Connecting to agent...', progress)
    await client.connect()
    logProgress('Connected!', progress)

    // Run evaluations
    for (let i = 0; i < prompts.length; i++) {
      const promptCase = prompts[i]
      if (!promptCase) continue

      logProgress(`[${i + 1}/${prompts.length}] ${promptCase.id}: Running ${k} trials...`, progress)

      const trialEntries: TrialEntry[] = []

      for (let trialNum = 1; trialNum <= k; trialNum++) {
        // Create fresh session for each trial
        const session = await client.createSession(sessionParams)
        const startTime = Date.now()

        try {
          const inputText = Array.isArray(promptCase.input) ? promptCase.input.join('\n') : promptCase.input
          const prompt = createPrompt(inputText)
          const { updates } = await client.promptSync(session.id, prompt)

          const endTime = Date.now()
          const trajectory = extractTrajectory(updates, startTime)
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
  } finally {
    logProgress('Disconnecting...', progress)
    await client.disconnect()
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
      output: { type: 'string', short: 'o' },
      k: { type: 'string', short: 'k', default: String(DEFAULT_TRIAL_COUNT) },
      cwd: { type: 'string', short: 'c' },
      timeout: { type: 'string', short: 't', default: String(DEFAULT_HARNESS_TIMEOUT) },
      progress: { type: 'boolean', default: false },
      append: { type: 'boolean', default: false },
      grader: { type: 'string', short: 'g' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    // biome-ignore lint/suspicious/noConsole: CLI help output
    console.log(`
Usage: acp-harness trials <prompts.jsonl> <command> [args...] [options]

Arguments:
  prompts.jsonl     Input file with evaluation prompts
  command [args]    ACP agent command to execute

Options:
  -o, --output      Output file (default: stdout)
  -k                Number of trials per prompt (default: ${DEFAULT_TRIAL_COUNT})
  -c, --cwd         Working directory for agent (agents auto-discover MCP configs from here)
  -t, --timeout     Request timeout in ms (default: ${DEFAULT_HARNESS_TIMEOUT})
  --progress        Show progress to stderr
  --append          Append to output file
  -g, --grader      Path to grader (.ts/.js module or executable script)
  -h, --help        Show this help message

Output Format:
  Without grader: Raw trials with trajectories
  With grader: Trials plus pass@k metrics (passRate, passAtK, passExpK)

Graders:
  TS/JS modules must export a 'grade' function.
  Executable scripts (Python, etc.) use stdin/stdout JSON protocol.

Examples:
  # Capture only
  acp-harness trials prompts.jsonl bunx claude-code-acp -k 5 -o trials.jsonl

  # With TypeScript grader
  acp-harness trials prompts.jsonl bunx claude-code-acp -k 5 --grader ./grader.ts -o trials.jsonl

  # With Python grader
  acp-harness trials prompts.jsonl bunx claude-code-acp -k 5 --grader ./grader.py -o trials.jsonl
`)
    return
  }

  const promptsPath = positionals[0]
  if (!promptsPath) {
    console.error('Error: prompts.jsonl path is required')
    process.exit(1)
  }

  const agentCommand = positionals.slice(1)
  if (agentCommand.length === 0) {
    console.error('Error: ACP agent command is required')
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
    agentCommand,
    k: Number.parseInt(values.k ?? String(DEFAULT_TRIAL_COUNT), 10),
    outputPath: values.output,
    cwd: values.cwd,
    timeout: Number.parseInt(values.timeout ?? String(DEFAULT_HARNESS_TIMEOUT), 10),
    progress: values.progress ?? false,
    append: values.append ?? false,
    grader,
  })
}
