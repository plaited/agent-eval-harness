/**
 * Polyglot grader loader module.
 *
 * @remarks
 * Supports loading graders from:
 * - TypeScript/JavaScript modules (import as ES module)
 * - Executable scripts (Python, Ruby, shell, etc. via subprocess)
 *
 * Executable graders use stdin/stdout JSON protocol:
 * - Input: `{"input": "...", "output": "...", "expected": "...", "trajectory": [...]}`
 * - Output: `{"pass": true, "score": 1.0, "reasoning": "..."}`
 *
 * @packageDocumentation
 */

import type { Grader, TrajectoryStep } from './schemas.ts'
import { GraderResultSchema } from './schemas.ts'

// ============================================================================
// Constants
// ============================================================================

/** File extensions that are imported as ES modules */
const JS_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs']

// ============================================================================
// Helpers
// ============================================================================

/** Check if a file path is a JavaScript/TypeScript module */
const isJsModule = (path: string): boolean => JS_EXTENSIONS.some((ext) => path.endsWith(ext))

/** Resolve path relative to process.cwd() */
const resolvePath = (path: string): string => {
  if (path.startsWith('/')) return path
  return `${process.cwd()}/${path}`
}

// ============================================================================
// Executable Grader
// ============================================================================

/** Input format for executable graders (stdin JSON) */
type ExecGraderInput = {
  input: string | string[]
  output: string
  hint?: string
  trajectory?: TrajectoryStep[]
}

/**
 * Create a grader function that executes an external script.
 *
 * @remarks
 * The script receives JSON on stdin and must output JSON on stdout.
 * Non-zero exit codes are treated as errors.
 *
 * @param execPath - Absolute path to the executable script
 * @returns Grader function
 */
const createExecGrader = (execPath: string): Grader => {
  return async (params) => {
    const input: ExecGraderInput = {
      input: params.input,
      output: params.output,
      hint: params.hint,
      trajectory: params.trajectory,
    }

    const inputJson = JSON.stringify(input)

    const proc = Bun.spawn([execPath], {
      stdin: new TextEncoder().encode(inputJson),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode !== 0) {
      throw new Error(`Grader exited with code ${exitCode}: ${stderr.trim() || 'No error output'}`)
    }

    const trimmedStdout = stdout.trim()
    if (!trimmedStdout) {
      throw new Error('Grader produced no output')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmedStdout)
    } catch {
      throw new Error(`Grader output is not valid JSON: ${trimmedStdout.slice(0, 100)}`)
    }

    const result = GraderResultSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(`Invalid grader result: ${result.error.message}`)
    }

    return result.data
  }
}

// ============================================================================
// Module Grader
// ============================================================================

/**
 * Load a grader from a JavaScript/TypeScript module.
 *
 * @remarks
 * The module must export a `grade` function matching the `Grader` type.
 *
 * @param modulePath - Absolute path to the module
 * @returns Grader function
 */
const loadModuleGrader = async (modulePath: string): Promise<Grader> => {
  const graderModule = await import(modulePath)

  if (typeof graderModule.grade !== 'function') {
    throw new Error(`Grader module must export a 'grade' function`)
  }

  return graderModule.grade as Grader
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load a grader from a file path.
 *
 * @remarks
 * Detection logic:
 * - `.ts`, `.js`, `.mjs`, `.cjs` → Import as ES module
 * - Everything else → Execute as subprocess
 *
 * @param graderPath - Path to the grader (relative or absolute)
 * @returns Grader function
 * @throws Error if grader not found or invalid
 *
 * @example
 * ```typescript
 * // TypeScript grader
 * const grader = await loadGrader('./grader.ts')
 *
 * // Python grader
 * const grader = await loadGrader('./grader.py')
 *
 * // Any executable
 * const grader = await loadGrader('./my-grader')
 * ```
 */
export const loadGrader = async (graderPath: string): Promise<Grader> => {
  const resolvedPath = resolvePath(graderPath)

  // Check file exists
  const file = Bun.file(resolvedPath)
  if (!(await file.exists())) {
    throw new Error(`Grader not found: ${resolvedPath}`)
  }

  if (isJsModule(resolvedPath)) {
    return loadModuleGrader(resolvedPath)
  }

  return createExecGrader(resolvedPath)
}
