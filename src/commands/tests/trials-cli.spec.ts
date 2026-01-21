import { describe, expect, test } from 'bun:test'
import type { TrialsConfig } from '../trials.ts'

// ============================================================================
// TrialsConfig type
// ============================================================================

describe('TrialsConfig configuration', () => {
  test('TrialsConfig type accepts valid configuration', () => {
    const config: TrialsConfig = {
      promptsPath: '/tmp/prompts.jsonl',
      schemaPath: './schemas/claude-headless.json',
      k: 5,
      outputPath: '/tmp/output.jsonl',
      cwd: '/tmp',
      timeout: 30000,
      progress: true,
      append: false,
      debug: false,
    }

    expect(config.promptsPath).toBe('/tmp/prompts.jsonl')
    expect(config.schemaPath).toBe('./schemas/claude-headless.json')
    expect(config.k).toBe(5)
  })

  test('TrialsConfig allows minimal configuration', () => {
    const config: TrialsConfig = {
      promptsPath: '/tmp/prompts.jsonl',
      schemaPath: './test-schema.json',
      k: 3,
    }

    expect(config.outputPath).toBeUndefined()
    expect(config.cwd).toBeUndefined()
    expect(config.timeout).toBeUndefined()
    expect(config.progress).toBeUndefined()
    expect(config.append).toBeUndefined()
    expect(config.grader).toBeUndefined()
  })
})

// ============================================================================
// CLI Help Output
// ============================================================================

describe('trials CLI', () => {
  test('displays help with --help flag', async () => {
    const proc = Bun.spawn(['bun', './bin/cli.ts', 'trials', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('Usage: agent-eval-harness trials')
    expect(stdout).toContain('prompts.jsonl')
    expect(stdout).toContain('-o, --output')
    expect(stdout).toContain('-k')
    expect(stdout).toContain('-c, --cwd')
    expect(stdout).toContain('-t, --timeout')
    expect(stdout).toContain('--progress')
    expect(stdout).toContain('-g, --grader')
    expect(stdout).toContain('-s, --schema')
    expect(stdout).toContain('pass@k')
  })

  test('shows error for missing prompts file argument', async () => {
    const proc = Bun.spawn(['bun', './bin/cli.ts', 'trials'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('prompts.jsonl path is required')
  })

  test('shows error for missing schema argument', async () => {
    const proc = Bun.spawn(['bun', './bin/cli.ts', 'trials', '/tmp/prompts.jsonl'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('--schema is required')
  })
})

// ============================================================================
// Schemas CLI
// ============================================================================

describe('schemas CLI', () => {
  test('displays help with --help flag', async () => {
    const proc = Bun.spawn(['bun', './bin/cli.ts', 'schemas', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('Usage: agent-eval-harness schemas')
    expect(stdout).toContain('-o, --output')
    expect(stdout).toContain('-j, --json')
    expect(stdout).toContain('-s, --split')
    expect(stdout).toContain('-l, --list')
    expect(stdout).toContain('Available Schemas')
  })

  test('lists schemas with --list flag', async () => {
    const proc = Bun.spawn(['bun', './bin/cli.ts', 'schemas', '--list'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('Available schemas')
    expect(stdout).toContain('PromptCase')
    expect(stdout).toContain('CaptureResult')
    expect(stdout).toContain('GraderResult')
  })

  test('exports schema as JSON', async () => {
    const proc = Bun.spawn(['bun', './bin/cli.ts', 'schemas', 'PromptCase', '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    const schema = JSON.parse(stdout)
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.title).toBe('PromptCase')
    expect(schema.type).toBe('object')
  })
})
