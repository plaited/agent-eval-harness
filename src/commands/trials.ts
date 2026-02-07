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

import { mkdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import {
  createWorkspaceDir,
  createWriteMutex,
  extractOutput,
  extractTrajectory,
  loadPrompts,
  logProgress,
  readStdinPrompts,
  resolvePath,
  runWorkerPool,
  writeOutput,
} from '../core.ts'
import { type HeadlessAdapterConfig, parseHeadlessConfig } from '../headless/headless.schemas.ts'
import type { ParsedUpdate } from '../headless/headless-output-parser.ts'
import { createSessionManager } from '../headless/headless-session-manager.ts'
import { DEFAULT_HARNESS_TIMEOUT, DEFAULT_TRIAL_COUNT } from '../schemas/constants.ts'
import { loadGrader } from '../schemas/grader-loader.ts'
import type { Grader, PromptCase, TrialEntry, TrialResult } from '../schemas.ts'

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
  /** Path to prompts.jsonl file (required unless prompts provided) */
  promptsPath?: string
  /** Path to agent schema JSON file */
  schemaPath: string
  /** Pre-loaded prompt cases (from stdin); skips file loading when set */
  prompts?: PromptCase[]
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
  /** Number of concurrent workers (default: 1 for sequential) */
  concurrency?: number
  /** RSS limit in bytes; pauses spawning when process RSS exceeds this */
  maxWorkersRss?: number
  /** Base directory for per-prompt workspace isolation */
  workspaceDir?: string
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
    concurrency = 1,
    maxWorkersRss,
    workspaceDir,
  } = config

  // Validate that we have a prompt source
  if (!config.prompts && !promptsPath) {
    throw new Error('Either promptsPath or prompts must be provided')
  }

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

  // Load prompts from pre-loaded array or file
  const prompts = config.prompts ?? (await loadPrompts(promptsPath!))

  // Resolve paths
  const resolvedOutputPath = outputPath ? resolvePath(outputPath) : undefined
  const resolvedWorkspaceDir = workspaceDir ? resolvePath(workspaceDir) : undefined

  // Determine effective timeout (CLI flag > schema default > harness default)
  const schemaTimeout = 'timeout' in schema ? schema.timeout : undefined
  const effectiveTimeout = timeout ?? schemaTimeout ?? DEFAULT_HARNESS_TIMEOUT

  // Log progress info
  logProgress(`Loaded ${prompts.length} prompts from ${promptsPath ?? 'stdin'}`, progress)
  logProgress(`Running ${k} trials per prompt (${prompts.length * k} total executions)`, progress)
  logProgress(`Schema: ${schema.name} (${schemaPath})`, progress)
  logProgress(`Timeout: ${effectiveTimeout}ms`, progress)
  if (concurrency > 1) {
    logProgress(`Concurrency: ${concurrency} workers`, progress)
  }
  if (maxWorkersRss) {
    logProgress(`RSS limit: ${Math.round(maxWorkersRss / 1024 / 1024)}MB`, progress)
  }
  if (resolvedWorkspaceDir) {
    logProgress(`Workspace: ${resolvedWorkspaceDir}`, progress)
  }
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

  // Create workspace base directory if specified
  // Uses fs.mkdir instead of shell to prevent command injection
  if (resolvedWorkspaceDir) {
    await mkdir(resolvedWorkspaceDir, { recursive: true })
  }

  const defaultWorkingDir = cwd ?? process.cwd()

  // Create write mutex for coordinating JSONL output
  const writeMutex = createWriteMutex()
  let isFirstOutput = true

  // Process all trials for a single prompt
  const processPromptTrials = async (promptCase: (typeof prompts)[number], index: number): Promise<TrialResult> => {
    logProgress(`[${index + 1}/${prompts.length}] ${promptCase.id}: Running ${k} trials...`, progress)

    const trialEntries: TrialEntry[] = []

    for (let trialNum = 1; trialNum <= k; trialNum++) {
      // Determine working directory (per-prompt workspace or default)
      // For trials, include trial number in workspace path for isolation
      const workingDir = resolvedWorkspaceDir
        ? await createWorkspaceDir(resolvedWorkspaceDir, `${promptCase.id}-trial-${trialNum}`)
        : defaultWorkingDir

      // Create fresh session for each trial
      const session = await sessions.create(workingDir)
      const startTime = Date.now()

      try {
        // Handle string or array input
        const inputs = Array.isArray(promptCase.input) ? promptCase.input : [promptCase.input]
        const allUpdates: ParsedUpdate[] = []

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
            cwd: session.cwd,
          })
          entry.pass = graderResult.pass
          entry.score = graderResult.score
          entry.reasoning = graderResult.reasoning

          if (graderResult.outcome) {
            entry.outcome = graderResult.outcome
          }
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
      } finally {
        // Always clean up session
        sessions.destroy(session.id)
      }
    }

    // Build result
    const result: TrialResult = {
      id: promptCase.id,
      input: promptCase.input,
      ...(promptCase.hint && { hint: promptCase.hint }),
      k,
      trials: trialEntries,
      metadata: {
        ...promptCase.metadata,
        agent: schema.name,
        ...(resolvedWorkspaceDir && { workspaceDir: resolvedWorkspaceDir }),
      },
    }

    // Calculate metrics if grader was used
    if (grader) {
      const passes = trialEntries.filter((t) => t.pass).length
      result.passRate = passes / k
      result.passAtK = calculatePassAtK(passes, k)
      result.passExpK = calculatePassExpK(passes, k)
    }

    // Write result immediately (coordinated via mutex for concurrent writes)
    await writeMutex.write(async () => {
      const formatted = JSON.stringify(result)
      await writeOutput(formatted, resolvedOutputPath, !isFirstOutput)
      isFirstOutput = false
    })

    if (grader) {
      logProgress(
        `  → ${promptCase.id}: passRate=${(result.passRate ?? 0).toFixed(2)}, pass@${k}=${(result.passAtK ?? 0).toFixed(2)}`,
        progress,
      )
    }

    return result
  }

  // Run with worker pool (parallelizes across prompts, trials for each prompt run sequentially)
  const { results, errors } = await runWorkerPool(prompts, processPromptTrials, {
    concurrency,
    maxWorkersRss,
    onThrottle: (currentRss, limit) => {
      logProgress(
        `RSS throttle: ${Math.round(currentRss / 1024 / 1024)}MB > ${Math.round(limit / 1024 / 1024)}MB limit, pausing...`,
        progress,
      )
    },
    onProgress: (completed, total) => {
      logProgress(`Progress: ${completed}/${total} prompts completed`, progress)
    },
  })

  // Log any errors that occurred
  if (errors.length > 0) {
    logProgress(`Completed with ${errors.length} error(s)`, progress)
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
      stdin: { type: 'boolean', default: false },
      concurrency: { type: 'string', short: 'j' },
      'max-workers-rss': { type: 'string' },
      'workspace-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`
Usage: agent-eval-harness trials <prompts.jsonl> --schema <schema.json> [options]
       cat prompts.jsonl | agent-eval-harness trials --stdin --schema <schema.json> [options]

Arguments:
  prompts.jsonl     Input file with evaluation prompts

Options:
  -s, --schema      Path to agent schema JSON file (required)
  -o, --output      Output file (default: stdout)
  -k                Number of trials per prompt (default: ${DEFAULT_TRIAL_COUNT})
  -c, --cwd         Working directory for agent
  -t, --timeout     Request timeout in ms (overrides schema default)
  -j, --concurrency Number of concurrent workers (default: 1)
  --stdin           Read prompts from stdin (mutually exclusive with file arg)
  --max-workers-rss RSS limit in MB; pauses spawning when exceeded
  --workspace-dir   Base directory for per-trial workspace isolation
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

Parallelization:
  Use -j/--concurrency to run multiple prompts' trials in parallel.
  Each prompt's k trials still run sequentially (required for aggregation).
  With 151 prompts and -j 4, you get 4 prompts running trials concurrently.

  Memory: Stream-mode agents (e.g. Claude Code) spawn real subprocesses
  at ~400-500MB RSS each. With -j 8 that is 3-4GB of resident memory.
  In memory-constrained environments (Docker, CI) this can cause OOM kills.
  Use --max-workers-rss to pause spawning when RSS exceeds a threshold,
  or pipe prompts via --stdin for container-level orchestration.

Workspace Isolation:
  Use --workspace-dir to create per-trial directories.
  Each trial runs in {workspace-dir}/prompt-{id}-trial-{n}/.
  Useful for code generation tasks requiring filesystem isolation.

Examples:
  # Basic trials
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 -o trials.jsonl

  # Run 4 prompts' trials in parallel (4x faster for 151 prompts)
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 -j 4 -o trials.jsonl

  # With workspace isolation for code generation
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 -j 4 \\
    --workspace-dir ./workspaces -o trials.jsonl

  # With TypeScript grader
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 --grader ./grader.ts -o trials.jsonl

  # Read prompts from stdin (container orchestration)
  cat prompts.jsonl | agent-eval-harness trials --stdin -s claude.json -k 5 -o trials.jsonl
`)
    return
  }

  const promptsPath = positionals[0]
  const useStdin = values.stdin ?? false

  // Mutual exclusivity: --stdin and positional file
  if (useStdin && promptsPath) {
    console.error('Error: --stdin and prompts file argument are mutually exclusive')
    process.exit(1)
  }

  if (!useStdin && !promptsPath) {
    console.error('Error: prompts.jsonl path is required (or use --stdin)')
    process.exit(1)
  }

  if (!values.schema) {
    console.error('Error: --schema is required')
    console.error('Example: agent-eval-harness trials prompts.jsonl --schema ./claude.json')
    process.exit(1)
  }

  // Read prompts from stdin if requested
  let prompts: PromptCase[] | undefined
  if (useStdin) {
    const stdinPrompts = await readStdinPrompts()
    if (!stdinPrompts || stdinPrompts.length === 0) {
      console.error('Error: no prompts received on stdin')
      process.exit(1)
    }
    prompts = stdinPrompts
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

  // Validate and parse concurrency
  let concurrency = 1
  if (values.concurrency) {
    const parsed = Number.parseInt(values.concurrency, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      console.error('Error: --concurrency must be a positive integer')
      process.exit(1)
    }
    concurrency = parsed
  }

  // Validate and parse max-workers-rss (MB → bytes)
  let maxWorkersRss: number | undefined
  if (values['max-workers-rss']) {
    const parsed = Number.parseInt(values['max-workers-rss'], 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      console.error('Error: --max-workers-rss must be a positive integer (MB)')
      process.exit(1)
    }
    maxWorkersRss = parsed * 1024 * 1024
  }

  await runTrials({
    promptsPath: promptsPath ?? undefined,
    prompts,
    schemaPath: values.schema,
    k: Number.parseInt(values.k ?? String(DEFAULT_TRIAL_COUNT), 10),
    outputPath: values.output,
    cwd: values.cwd,
    timeout: values.timeout ? Number.parseInt(values.timeout, 10) : undefined,
    progress: values.progress ?? false,
    append: values.append ?? false,
    grader,
    debug: values.debug ?? false,
    concurrency,
    maxWorkersRss,
    workspaceDir: values['workspace-dir'],
  })
}
