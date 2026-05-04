/**
 * Tests for CLI entry point and utilities.
 *
 * @remarks
 * Covers: CLI routing (trials/compare/calibrate/unknown),
 * parseCli meta flags (--help, --schema), and input validation.
 */

import { describe, expect, test } from 'bun:test'

// ============================================================================
// CLI Entry Point Routing
// ============================================================================

describe('CLI entry point', () => {
  const cliPath = `${import.meta.dir}/../cli.ts`

  test('trials command routes to trialCli', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'trials', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(exitCode).toBe(0)
    expect(stderr).toContain('Usage:')
  })

  test('compare command exits with error (stub)', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'compare'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('not yet implemented')
  })

  test('calibrate command exits with error (stub)', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'calibrate'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('not yet implemented')
  })

  test('unknown command exits with error', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'bogus'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('Unknown command: bogus')
    expect(stderr).toContain('Available commands')
  })

  test('no command exits with error', async () => {
    const proc = Bun.spawn(['bun', cliPath], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('Unknown command')
  })
})

// ============================================================================
// parseCli
// ============================================================================

describe('parseCli', () => {
  // parseCli calls process.exit() on meta flags, so we test via subprocess
  const runParseCli = async (args: string[]) => {
    // Create an inline script that uses parseCli
    const script = `
      import { parseCli } from '${import.meta.dir}/../cli.utils.ts'
      import * as z from 'zod'
      const schema = z.object({ name: z.string(), count: z.number().default(1) })
      const result = await parseCli(${JSON.stringify(args)}, schema, { name: 'test-cmd' })
      console.log(JSON.stringify(result))
    `
    const proc = Bun.spawn(['bun', '-e', script], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
  }

  test('--help exits 0 with usage', async () => {
    const { stderr, exitCode } = await runParseCli(['--help'])
    expect(exitCode).toBe(0)
    expect(stderr).toContain('Usage:')
    expect(stderr).toContain('test-cmd')
  })

  test('-h exits 0 with usage', async () => {
    const { stderr, exitCode } = await runParseCli(['-h'])
    expect(exitCode).toBe(0)
    expect(stderr).toContain('Usage:')
  })

  test('--schema input exits 0 with JSON Schema', async () => {
    const { stdout, exitCode } = await runParseCli(['--schema', 'input'])
    expect(exitCode).toBe(0)
    const schema = JSON.parse(stdout)
    expect(schema.type).toBe('object')
    expect(schema.properties).toBeDefined()
    expect(schema.properties.name).toBeDefined()
  })

  test('parses positional JSON arg', async () => {
    const { stdout, exitCode } = await runParseCli(['{"name": "hello"}'])
    expect(exitCode).toBe(0)
    const result = JSON.parse(stdout)
    expect(result.name).toBe('hello')
    expect(result.count).toBe(1) // default applied
  })

  test('invalid JSON exits 2', async () => {
    const { stderr, exitCode } = await runParseCli(['not-json'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Invalid JSON')
  })

  test('schema validation failure exits 2', async () => {
    const { exitCode } = await runParseCli(['{"wrong": "field"}'])
    expect(exitCode).toBe(2)
  })

  test('no input exits 2', async () => {
    const { stderr, exitCode } = await runParseCli([])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Usage:')
  })
})

// ============================================================================
// Export Contract
// ============================================================================

describe('export contract', () => {
  test('@plaited/agent-eval-harness exports runTrial', async () => {
    const mod = await import('../trial.ts')
    expect(typeof mod.runTrial).toBe('function')
    expect(typeof mod.calculatePassAtK).toBe('function')
    expect(typeof mod.calculatePassExpK).toBe('function')
    expect(typeof mod.trialCli).toBe('function')
  })

  test('@plaited/agent-eval-harness/schemas exports Grader type and schemas', async () => {
    const schemas = await import('../trial.schemas.ts')
    // Schemas exist and are Zod schemas
    expect(schemas.GraderResultSchema).toBeDefined()
    expect(schemas.TrajectoryStepSchema).toBeDefined()
    expect(schemas.TrialResultSchema).toBeDefined()
    expect(schemas.TrialEntrySchema).toBeDefined()
    expect(schemas.PromptCaseSchema).toBeDefined()
    expect(schemas.AdapterResultSchema).toBeDefined()
    expect(schemas.AdapterInputSchema).toBeDefined()

    // Verify Grader type works — parse a valid result
    const result = schemas.GraderResultSchema.parse({
      pass: true,
      score: 1.0,
      reasoning: 'test',
    })
    expect(result.pass).toBe(true)
  })
})
