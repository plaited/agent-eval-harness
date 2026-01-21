/**
 * Pipeline compare command - compare multiple runs of the same prompts.
 *
 * @remarks
 * Compares results from different configurations (agents, MCP servers, models)
 * using a user-provided comparison grader that ranks the runs.
 *
 * Terminology: "runs" (not "agents") because comparisons can be:
 * - Same agent, different MCP servers
 * - Same agent, different skills enabled
 * - Same agent, different system prompts
 * - Same agent, different model versions
 * - Different agents entirely
 *
 * @packageDocumentation
 */

import { basename, extname } from 'node:path'
import { parseArgs } from 'node:util'
import { loadResults, logProgress, writeOutput } from '../core.ts'
import type { CaptureResult } from '../schemas.ts'
import type {
  CompareConfig,
  ComparisonGrader,
  ComparisonGraderInput,
  ComparisonResult,
  LabeledRun,
} from './pipeline.types.ts'

/**
 * Load comparison grader from file.
 *
 * @remarks
 * Similar to loadGrader but expects ComparisonGrader interface.
 *
 * @param path - Path to grader module
 * @returns Loaded comparison grader function
 */
const loadComparisonGrader = async (path: string): Promise<ComparisonGrader> => {
  const module = await import(path)

  if (typeof module.grade === 'function') {
    return module.grade as ComparisonGrader
  }
  if (typeof module.default === 'function') {
    return module.default as ComparisonGrader
  }
  if (typeof module.compare === 'function') {
    return module.compare as ComparisonGrader
  }

  throw new Error(`Comparison grader must export 'grade', 'compare', or 'default' function`)
}

/**
 * Derive label from file path.
 *
 * @param path - File path
 * @returns Label derived from filename without extension
 */
const labelFromPath = (path: string): string => {
  const base = basename(path)
  const ext = extname(base)
  return base.slice(0, -ext.length)
}

/**
 * Parse labeled run argument.
 *
 * @remarks
 * Supports formats:
 * - "path.jsonl" - label derived from filename
 * - "label:path.jsonl" - explicit label
 *
 * @param arg - Run argument string
 * @returns Labeled run object
 */
const parseLabeledRun = (arg: string): LabeledRun => {
  const colonIndex = arg.indexOf(':')

  // Check if this looks like a label:path format (not a Windows drive letter)
  if (colonIndex > 0 && colonIndex !== 1) {
    return {
      label: arg.slice(0, colonIndex),
      path: arg.slice(colonIndex + 1),
    }
  }

  return {
    label: labelFromPath(arg),
    path: arg,
  }
}

/**
 * Execute pipeline compare with configuration.
 *
 * @param config - Compare configuration
 */
export const runCompare = async (config: CompareConfig): Promise<void> => {
  const { runs, graderPath, outputPath, progress = false } = config

  if (runs.length < 2) {
    throw new Error('At least 2 runs required for comparison')
  }

  // Load comparison grader
  const grader = await loadComparisonGrader(graderPath)

  logProgress(`Comparing ${runs.length} runs with: ${graderPath}`, progress)
  for (const run of runs) {
    logProgress(`  - ${run.label}: ${run.path}`, progress)
  }

  // Load all runs
  const runResults: Record<string, CaptureResult[]> = {}
  for (const run of runs) {
    logProgress(`Loading ${run.label}...`, progress)
    runResults[run.label] = await loadResults(run.path)
  }

  // Build map of prompt IDs to runs
  const promptIds = new Set<string>()
  for (const results of Object.values(runResults)) {
    for (const result of results) {
      promptIds.add(result.id)
    }
  }

  logProgress(`Comparing ${promptIds.size} prompts...`, progress)

  let isFirstOutput = true

  // Clear output file if specified
  if (outputPath) {
    await Bun.write(outputPath, '')
  }

  const results: ComparisonResult[] = []

  for (const promptId of promptIds) {
    logProgress(`  ${promptId}`, progress)

    // Build comparison input
    const runsData: ComparisonGraderInput['runs'] = {}
    let input: string | string[] = ''
    let hint: string | undefined

    for (const [label, labelResults] of Object.entries(runResults)) {
      const result = labelResults.find((r) => r.id === promptId)
      if (result) {
        runsData[label] = {
          output: result.output,
          trajectory: result.trajectory,
        }
        // Use first found input/hint as the reference
        if (!input) {
          input = result.input
          hint = result.hint
        }
      }
    }

    // Skip if not present in at least 2 runs
    if (Object.keys(runsData).length < 2) {
      logProgress(`    Skipped (only in ${Object.keys(runsData).length} run)`, progress)
      continue
    }

    // Apply comparison grader
    const graderInput: ComparisonGraderInput = {
      id: promptId,
      input,
      hint,
      runs: runsData,
    }

    const graderResult = await grader(graderInput)

    const comparisonResult: ComparisonResult = {
      id: promptId,
      input,
      hint,
      rankings: graderResult.rankings,
      reasoning: graderResult.reasoning,
    }

    results.push(comparisonResult)

    // Log winner
    const winner = graderResult.rankings.find((r) => r.rank === 1)
    if (winner) {
      logProgress(`    Winner: ${winner.run} (${winner.score.toFixed(2)})`, progress)
    }

    await writeOutput(JSON.stringify(comparisonResult), outputPath, !isFirstOutput)
    isFirstOutput = false
  }

  // Summary statistics
  logProgress('', progress)
  logProgress('=== Summary ===', progress)

  const winCounts: Record<string, number> = {}
  for (const run of runs) {
    winCounts[run.label] = 0
  }

  for (const result of results) {
    const winner = result.rankings.find((r) => r.rank === 1)
    if (winner && winner.run in winCounts) {
      const currentCount = winCounts[winner.run] ?? 0
      winCounts[winner.run] = currentCount + 1
    }
  }

  for (const [label, wins] of Object.entries(winCounts)) {
    const pct = ((wins / results.length) * 100).toFixed(1)
    logProgress(`  ${label}: ${wins} wins (${pct}%)`, progress)
  }

  logProgress('Done!', progress)
}

/**
 * Pipeline compare command CLI handler.
 *
 * @param args - Command line arguments (after 'compare')
 */
export const compare = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      run: { type: 'string', multiple: true },
      grader: { type: 'string', short: 'g' },
      output: { type: 'string', short: 'o' },
      progress: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    // biome-ignore lint/suspicious/noConsole: CLI help output
    console.log(`
Usage: agent-eval-harness compare [files...] --grader <grader> [options]

Compare multiple runs of the same prompts.

Arguments:
  files...          Result files to compare (positional, unlimited)

Options:
  --run             Labeled run format: "label:path.jsonl" (alternative to positional)
  -g, --grader      Path to comparison grader (.ts/.js module) (required)
  -o, --output      Output file (default: stdout)
  --progress        Show progress to stderr
  -h, --help        Show this help message

Comparison Grader:
  Must export 'grade' or 'compare' function with signature:
    (params: ComparisonGraderInput) => Promise<ComparisonGraderResult>

  Input includes all runs' results for a single prompt.
  Output should rank runs from best to worst.

Examples:
  # Compare multiple result files (positional)
  agent-eval-harness compare run1.jsonl run2.jsonl run3.jsonl -g ./compare-grader.ts

  # With explicit labels
  agent-eval-harness compare \\
    --run "with-bun-mcp:results-bun.jsonl" \\
    --run "vanilla:results-vanilla.jsonl" \\
    -g ./compare-grader.ts

  # Mix positional and labeled
  agent-eval-harness compare results-*.jsonl \\
    --run "baseline:baseline.jsonl" \\
    -g ./compare-grader.ts -o comparison.jsonl

  # Typical workflow
  # 1. Capture with different configs
  agent-eval-harness capture prompts.jsonl -s claude.json -o vanilla.jsonl
  agent-eval-harness capture prompts.jsonl -s claude-with-mcp.json -o with-mcp.jsonl

  # 2. Compare results
  agent-eval-harness compare vanilla.jsonl with-mcp.jsonl -g ./compare-grader.ts
`)
    return
  }

  if (!values.grader) {
    console.error('Error: --grader is required')
    process.exit(1)
  }

  // Collect runs from positional args and --run flags
  const runs: LabeledRun[] = []

  // Positional arguments (file paths)
  for (const arg of positionals) {
    runs.push(parseLabeledRun(arg))
  }

  // --run flags
  if (values.run) {
    for (const arg of values.run) {
      runs.push(parseLabeledRun(arg))
    }
  }

  if (runs.length < 2) {
    console.error('Error: At least 2 result files required for comparison')
    console.error('Example: agent-eval-harness compare run1.jsonl run2.jsonl -g ./grader.ts')
    process.exit(1)
  }

  await runCompare({
    runs,
    graderPath: values.grader,
    outputPath: values.output,
    progress: values.progress,
  })
}
