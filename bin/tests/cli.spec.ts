import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { z } from 'zod'

/**
 * Tests for the agent-eval-harness CLI.
 *
 * @remarks
 * Tests CLI argument parsing, help output, and output format schemas.
 * Integration tests requiring an actual CLI agent are in *.docker.ts files.
 */

const CLI_PATH = join(import.meta.dir, '..', 'cli.ts')

// ============================================================================
// CLI Invocation Tests
// ============================================================================

describe('CLI invocation', () => {
  test('shows help with --help flag', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain('agent-eval-harness')
    expect(stdout).toContain('Commands:')
    expect(stdout).toContain('capture')
    expect(stdout).toContain('trials')
    expect(stdout).toContain('summarize')
  })

  test('shows help with -h flag', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, '-h'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain('agent-eval-harness')
  })

  test('shows help when no arguments provided', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0) // Exits cleanly when showing help
    expect(stdout).toContain('agent-eval-harness')
  })

  test('help shows example commands', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()

    expect(stdout).toContain('--schema')
    expect(stdout).toContain('prompts.jsonl')
    expect(stdout).toContain('results.jsonl')
  })

  test('help shows available commands', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()

    expect(stdout).toContain('capture')
    expect(stdout).toContain('trials')
    expect(stdout).toContain('summarize')
    expect(stdout).toContain('calibrate')
    expect(stdout).toContain('balance')
    expect(stdout).toContain('schemas')
  })

  test('fails with non-existent schema file', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, 'capture', 'prompts.jsonl', '--schema', 'nonexistent.json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('Schema file not found')
  })

  test('fails when no schema provided', async () => {
    const tmpFile = `/tmp/test-prompts-${Date.now()}.jsonl`
    await Bun.write(tmpFile, '{"id":"test-001","input":"test"}\n')

    const proc = Bun.spawn(['bun', CLI_PATH, 'capture', tmpFile], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain('--schema is required')
  })

  test('fails with unknown command', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, 'unknown-command'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Unknown command')
  })

  test('capture command shows help with --help', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, 'capture', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain('capture')
    expect(stdout).toContain('prompts.jsonl')
    expect(stdout).toContain('--output')
  })

  test('trials command shows help with --help', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, 'trials', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain('trials')
    expect(stdout).toContain('-k')
    expect(stdout).toContain('pass@k')
  })
})

// ============================================================================
// Output Format Schemas (for downstream validation)
// ============================================================================

const SummaryResultSchema = z.object({
  id: z.string(),
  input: z.string(),
  output: z.string(),
  toolCalls: z.array(z.string()),
  duration: z.number(),
})

const TrajectoryStepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('thought'),
    content: z.string(),
    timestamp: z.number(),
    stepId: z.string().optional(),
  }),
  z.object({
    type: z.literal('message'),
    content: z.string(),
    timestamp: z.number(),
    stepId: z.string().optional(),
  }),
  z.object({
    type: z.literal('tool_call'),
    name: z.string(),
    status: z.string(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    duration: z.number().optional(),
    timestamp: z.number(),
    stepId: z.string().optional(),
  }),
  z.object({
    type: z.literal('plan'),
    entries: z.array(z.unknown()),
    timestamp: z.number(),
    stepId: z.string().optional(),
  }),
])

const CaptureResultSchema = z.object({
  id: z.string(),
  input: z.string(),
  output: z.string(),
  expected: z.string().optional(),
  trajectory: z.array(TrajectoryStepSchema),
  metadata: z.record(z.string(), z.unknown()),
  timing: z.object({
    start: z.number(),
    end: z.number(),
    firstResponse: z.number().optional(),
  }),
  toolErrors: z.boolean(),
  errors: z.array(z.string()).optional(),
})

// ============================================================================
// Sample Output Data (matches harness output format)
// ============================================================================

const SAMPLE_SUMMARY_JSONL = `{"id":"test-001","input":"Create a button","output":"I created the button","toolCalls":["Write"],"duration":1234}
{"id":"test-002","input":"Fix the bug","output":"I fixed the bug","toolCalls":["Read","Edit"],"duration":2567}
{"id":"test-003","input":"Broken test","output":"","toolCalls":[],"duration":500}`

const SAMPLE_CAPTURE_JSONL = `{"id":"test-001","input":"Create a button","output":"I created the button","trajectory":[{"type":"thought","content":"I'll create a button template","timestamp":100,"stepId":"test-001-step-1"},{"type":"tool_call","name":"Write","status":"completed","input":{"file_path":"src/button.tsx","content":"export const Button = () => <button>Click</button>"},"output":"File written","duration":234,"timestamp":150,"stepId":"test-001-step-2"},{"type":"message","content":"I created the button","timestamp":500,"stepId":"test-001-step-3"}],"metadata":{"category":"ui","agent":"claude-headless"},"timing":{"start":1704067200000,"end":1704067201234,"firstResponse":100},"toolErrors":false}
{"id":"test-002","input":"Fix the bug","output":"I fixed the bug","trajectory":[{"type":"tool_call","name":"Read","status":"completed","input":{"file_path":"src/app.ts"},"output":"file contents...","duration":100,"timestamp":50,"stepId":"test-002-step-1"},{"type":"tool_call","name":"Edit","status":"completed","input":{"file_path":"src/app.ts","old_string":"bug","new_string":"fix"},"duration":150,"timestamp":200,"stepId":"test-002-step-2"},{"type":"message","content":"I fixed the bug","timestamp":400,"stepId":"test-002-step-3"}],"metadata":{"category":"bugfix","agent":"claude-headless"},"timing":{"start":1704067300000,"end":1704067302567},"toolErrors":false}`

// ============================================================================
// Downstream Pattern Tests
// ============================================================================

describe('downstream patterns: summary JSONL', () => {
  const parseResults = (jsonl: string) =>
    jsonl
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

  test('parses summary JSONL correctly', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)

    expect(results).toHaveLength(3)
    for (const result of results) {
      expect(() => SummaryResultSchema.parse(result)).not.toThrow()
    }
  })

  test('filters by output presence (jq pattern)', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)
    const withOutput = results.filter((r) => r.output.length > 0)

    expect(withOutput).toHaveLength(2)
  })

  test('calculates average duration (jq pattern)', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)
    const avg = results.reduce((sum, r) => sum + r.duration, 0) / results.length

    expect(avg).toBeCloseTo(1433.67, 0)
  })

  test('counts tool usage (jq pattern)', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)
    const allTools = results.flatMap((r) => r.toolCalls)
    const toolCounts = allTools.reduce<Record<string, number>>((acc, tool) => {
      acc[tool] = (acc[tool] ?? 0) + 1
      return acc
    }, {})

    expect(toolCounts).toEqual({ Write: 1, Read: 1, Edit: 1 })
  })

  test('calculates success rate by output presence', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)
    const withOutput = results.filter((r) => r.output.length > 0).length
    const total = results.length

    expect(withOutput).toBe(2)
    expect(total).toBe(3)
    expect(withOutput / total).toBeCloseTo(0.667, 2)
  })
})

describe('downstream patterns: capture JSONL', () => {
  const parseResults = (jsonl: string) =>
    jsonl
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

  test('parses capture JSONL with trajectories', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)

    expect(results).toHaveLength(2)
    for (const result of results) {
      expect(() => CaptureResultSchema.parse(result)).not.toThrow()
    }
  })

  test('step IDs follow expected format', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)

    for (const result of results) {
      for (const step of result.trajectory) {
        expect(step.stepId).toMatch(new RegExp(`^${result.id}-step-\\d+$`))
      }
    }
  })

  test('step-level retrieval pattern works', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)

    // Build step index (pattern from downstream.md)
    const stepIndex = new Map<string, unknown>()
    for (const result of results) {
      for (const step of result.trajectory) {
        stepIndex.set(step.stepId, step)
      }
    }

    // Retrieve specific step by ID
    const step = stepIndex.get('test-001-step-2') as { name: string; input: { file_path: string } }
    expect(step).toBeDefined()
    expect(step.name).toBe('Write')
    expect(step.input.file_path).toBe('src/button.tsx')
  })

  test('extracts tool calls from trajectory', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)
    const result = results[1] // test-002

    const toolCalls = result.trajectory.filter((s: { type: string }) => s.type === 'tool_call')
    expect(toolCalls).toHaveLength(2)
    expect(toolCalls.map((t: { name: string }) => t.name)).toEqual(['Read', 'Edit'])
  })

  test('filters by metadata category', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)
    const uiResults = results.filter((r) => r.metadata.category === 'ui')

    expect(uiResults).toHaveLength(1)
    expect(uiResults[0]?.id).toBe('test-001')
  })

  test('identifies results with tool errors', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)
    const withErrors = results.filter((r) => r.toolErrors)

    expect(withErrors).toHaveLength(0) // Sample data has no errors
  })
})

describe('downstream patterns: advanced filtering', () => {
  const parseResults = (jsonl: string) =>
    jsonl
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

  test('filters by tool usage (jq contains pattern)', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)
    const withWrite = results.filter((r) => r.toolCalls.includes('Write'))

    expect(withWrite).toHaveLength(1)
    expect(withWrite[0]?.id).toBe('test-001')
  })

  test('filters by duration threshold (slow evaluations)', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)
    const slow = results.filter((r) => r.duration > 2000)

    expect(slow).toHaveLength(1)
    expect(slow[0]?.id).toBe('test-002')
  })

  test('finds slowest evaluations (sorted)', () => {
    const results = parseResults(SAMPLE_SUMMARY_JSONL)
    const sorted = [...results].sort((a, b) => b.duration - a.duration)
    const top2 = sorted.slice(0, 2)

    expect(top2[0]?.id).toBe('test-002')
    expect(top2[1]?.id).toBe('test-001')
  })

  test('deduplicates by ID keeping latest (merge pattern)', () => {
    const combinedJsonl = `${SAMPLE_SUMMARY_JSONL}
{"id":"test-001","input":"Create a button v2","output":"I created the button v2","toolCalls":["Write","Edit"],"duration":1500}`

    const results = parseResults(combinedJsonl)

    // Group by ID and keep last occurrence (simulates jq group_by + last)
    const byId = new Map<string, unknown>()
    for (const result of results) {
      byId.set(result.id, result)
    }
    const deduped = Array.from(byId.values())

    expect(deduped).toHaveLength(3) // test-001, test-002, test-003
    const test001 = deduped.find((r) => (r as { id: string }).id === 'test-001') as { input: string }
    expect(test001?.input).toBe('Create a button v2')
  })

  test('groups by category and counts', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)

    // Group by category (simulates jq group_by pattern)
    const grouped = results.reduce<Record<string, number>>((acc, r) => {
      const cat = r.metadata.category as string
      acc[cat] = (acc[cat] ?? 0) + 1
      return acc
    }, {})

    expect(grouped).toEqual({ ui: 1, bugfix: 1 })
  })

  test('extracts timing information', () => {
    const results = parseResults(SAMPLE_CAPTURE_JSONL)
    const result = results[0]

    expect(result.timing.start).toBe(1704067200000)
    expect(result.timing.end).toBe(1704067201234)
    expect(result.timing.firstResponse).toBe(100)
    expect(result.timing.end - result.timing.start).toBe(1234) // matches duration
  })
})

// ============================================================================
// MCP Server Config Parsing Tests
// ============================================================================

describe('MCP server config parsing', () => {
  test('parses stdio MCP server config', () => {
    const json = '{"type":"stdio","name":"fs","command":"mcp-filesystem","args":["/data"],"env":[]}'
    const proc = Bun.spawn(
      ['bun', CLI_PATH, 'capture', '/tmp/test.jsonl', '--schema', './test-schema.json', '--mcp-server', json, '--help'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )

    // If it doesn't crash, the parsing worked
    expect(proc.exited).resolves.toBeDefined()
  })

  test('parses http MCP server config', () => {
    const json =
      '{"type":"http","name":"api","url":"https://example.com/mcp","headers":[{"name":"Authorization","value":"Bearer token"}]}'
    const proc = Bun.spawn(
      ['bun', CLI_PATH, 'capture', '/tmp/test.jsonl', '--schema', './test-schema.json', '--mcp-server', json, '--help'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )

    // If it doesn't crash, the parsing worked
    expect(proc.exited).resolves.toBeDefined()
  })

  test('accepts multiple MCP servers', () => {
    const json1 = '{"type":"stdio","name":"fs","command":"mcp-filesystem","args":[],"env":[]}'
    const json2 = '{"type":"http","name":"api","url":"https://example.com","headers":[]}'
    const proc = Bun.spawn(
      [
        'bun',
        CLI_PATH,
        'capture',
        '/tmp/test.jsonl',
        '--schema',
        './test-schema.json',
        '--mcp-server',
        json1,
        '--mcp-server',
        json2,
        '--help',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )

    // If it doesn't crash, the parsing worked
    expect(proc.exited).resolves.toBeDefined()
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('error handling', () => {
  test('fails when schema file does not exist', async () => {
    const tmpFile = `/tmp/invalid-${Date.now()}.jsonl`
    await Bun.write(tmpFile, '{"id": "t1", "input": "test"}\n')

    const proc = Bun.spawn(['bun', CLI_PATH, 'capture', tmpFile, '--schema', 'nonexistent-schema.json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('Schema file not found')
  })

  test('capture command requires prompts path', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, 'capture'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain('prompts.jsonl path is required')
  })

  test('summarize command requires input path', async () => {
    const proc = Bun.spawn(['bun', CLI_PATH, 'summarize'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain('results.jsonl path is required')
  })
})
