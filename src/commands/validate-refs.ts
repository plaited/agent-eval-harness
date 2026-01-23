/**
 * Validate-refs command - check reference solutions against grader.
 *
 * @remarks
 * Validates that reference solutions in prompts.jsonl pass the grader.
 * Helps identify prompts with broken or incorrect reference solutions.
 *
 * @packageDocumentation
 */

import { parseArgs } from 'node:util'
import { loadGrader } from '../schemas/grader-loader.ts'
import type { Grader, ValidationResult } from '../schemas.ts'
import { loadPrompts } from './capture.ts'

// ============================================================================
// Types
// ============================================================================

/** Configuration for validate-refs command */
export type ValidateRefsConfig = {
  /** Path to prompts.jsonl file */
  promptsPath: string
  /** Output file path */
  outputPath?: string
  /** Grader function */
  grader: Grader
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve path relative to process.cwd() */
const resolvePath = (path: string): string => {
  if (path.startsWith('/')) return path
  return `${process.cwd()}/${path}`
}

// ============================================================================
// Validate-Refs Implementation
// ============================================================================

/**
 * Execute validate-refs with configuration object.
 *
 * @param config - Validate-refs configuration
 * @returns Array of validation results
 */
export const runValidateRefs = async (config: ValidateRefsConfig): Promise<ValidationResult[]> => {
  const { promptsPath, outputPath, grader } = config

  // Load prompts
  const prompts = await loadPrompts(promptsPath)

  // Filter to prompts with reference solutions
  const promptsWithRefs = prompts.filter((p) => p.reference !== undefined)

  if (promptsWithRefs.length === 0) {
    console.error('No prompts with reference solutions found')
    return []
  }

  console.error(`Validating ${promptsWithRefs.length} reference solutions...`)

  const results: ValidationResult[] = []

  for (const prompt of promptsWithRefs) {
    const graderResult = await grader({
      input: prompt.input,
      output: prompt.reference as string,
      hint: prompt.hint,
      trajectory: [], // No trajectory for reference validation
      metadata: prompt.metadata,
    })

    results.push({
      id: prompt.id,
      reference: prompt.reference as string,
      passes: graderResult.pass,
      graderResult,
    })

    const icon = graderResult.pass ? '✓' : '✗'
    console.error(`  ${icon} ${prompt.id}`)
  }

  // Format output
  const output = results.map((r) => JSON.stringify(r)).join('\n')

  // Write output
  if (outputPath) {
    await Bun.write(resolvePath(outputPath), output)
  } else {
    console.log(output)
  }

  // Summary
  const passed = results.filter((r) => r.passes).length
  const failed = results.length - passed
  console.error(`\nResults: ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.error('\nFailing references:')
    for (const result of results.filter((r) => !r.passes)) {
      console.error(`  - ${result.id}: ${result.graderResult.reasoning ?? 'No reasoning'}`)
    }
  }

  return results
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Validate-refs command CLI handler.
 *
 * @param args - Command line arguments (after 'validate-refs')
 */
export const validateRefs = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
      grader: { type: 'string', short: 'g' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`
Usage: agent-eval-harness validate-refs <prompts.jsonl> --grader <grader.ts> [options]

Arguments:
  prompts.jsonl     Input file with prompts (must have 'reference' field)

Options:
  -o, --output      Output file (default: stdout)
  -g, --grader      Path to grader (.ts/.js module or executable script, required)
  -h, --help        Show this help message

Output:
  JSONL with validation results for each reference solution.

Prompt Format:
  {
    "id": "test-001",
    "input": "What is 2+2?",
    "expected": "4",
    "reference": "The answer is 4."
  }

Examples:
  agent-eval-harness validate-refs prompts.jsonl --grader ./grader.ts -o validation.jsonl
`)
    return
  }

  const promptsPath = positionals[0]
  if (!promptsPath) {
    console.error('Error: prompts.jsonl path is required')
    process.exit(1)
  }

  if (!values.grader) {
    console.error('Error: --grader is required for validate-refs')
    process.exit(1)
  }

  // Load grader
  let grader: Grader
  try {
    grader = await loadGrader(values.grader)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  await runValidateRefs({
    promptsPath,
    outputPath: values.output,
    grader,
  })
}
