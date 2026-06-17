import { describe, expect, test } from 'bun:test'
import { mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EvalInputSchema, TaskSchema } from '../eval.schemas.ts'

describe('eval schemas', () => {
  test('TaskSchema rejects unknown fields', () => {
    const parsed = TaskSchema.safeParse({
      id: 'task-1',
      prompts: ['hello'],
      extra: true,
    })

    expect(parsed.success).toBe(false)
  })

  test('EvalInputSchema parses run mode with defaults', () => {
    const parsed = EvalInputSchema.parse({
      mode: 'run',
      tasksPath: './tasks.jsonl',
      adapter: {
        command: ['bun', './adapter.ts'],
      },
    })

    expect(parsed.mode).toBe('run')
    if (parsed.mode !== 'run') {
      throw new Error('Expected run mode')
    }
    expect(parsed.k).toBe(1)
    expect(parsed.concurrency).toBe(1)
  })
})

describe('eval schema discovery', () => {
  const cliPath = `${import.meta.dir}/../cli.ts`

  test('eval --schema task returns task schema', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'eval', '--schema', 'task'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr.trim()).toBe('')
    const schema = JSON.parse(stdout)
    expect(schema.type).toBe('object')
    expect(schema.properties.id).toBeDefined()
    expect(schema.properties.prompts).toBeDefined()
  })

  test('eval --schema invalid-target exits 2', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'eval', '--schema', 'invalid-target'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(2)
    expect(stderr).toContain('Invalid schema target')
  })
})

describe('run mode', () => {
  test('streams compact trial rows from adapter command', async () => {
    const dir = join(tmpdir(), `eval-run-${Date.now()}`)
    await mkdir(dir, { recursive: true })

    try {
      const adapterPath = join(dir, 'adapter.js')
      const tasksPath = join(dir, 'tasks.jsonl')

      await Bun.write(
        adapterPath,
        [
          '#!/usr/bin/env bun',
          'const input = JSON.parse(await Bun.stdin.text())',
          'const output = {',
          "  result: { status: 'completed', message: 'done:' + input.task.id },",
          "  trajectory: [{ type: 'message', role: 'assistant', content: 'ok' }],",
          "  metadata: { adapter: 'test' }",
          '}',
          'process.stdout.write(JSON.stringify(output))',
        ].join('\n'),
      )
      await Bun.$`chmod +x ${adapterPath}`.quiet()

      await Bun.write(
        tasksPath,
        ['{"id":"task-1","prompts":["hello"]}', '{"id":"task-2","prompts":["world"]}'].join('\n'),
      )

      const payload = JSON.stringify({
        mode: 'run',
        tasksPath,
        adapter: { command: [adapterPath] },
        runId: 'run-test',
        label: 'adapter-test',
      })

      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      expect(stderr).toContain('Completed 2/2')
      const lines = stdout.trim().split('\n')
      expect(lines).toHaveLength(2)
      const first = JSON.parse(lines[0] ?? '{}')
      const second = JSON.parse(lines[1] ?? '{}')
      expect(first.type).toBe('trial_result')
      expect(second.type).toBe('trial_result')
      expect(first.runId).toBe('run-test')
      expect(first.pass).toBe(null)
      expect(first.graderResults).toEqual([])
      expect(first.trial.result.status).toBe('completed')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  test('captures signalCode when adapter is killed by timeout', async () => {
    const dir = join(tmpdir(), `eval-run-timeout-${Date.now()}`)
    await mkdir(dir, { recursive: true })

    try {
      const adapterPath = join(dir, 'adapter.js')
      const tasksPath = join(dir, 'tasks.jsonl')

      await Bun.write(
        adapterPath,
        [
          '#!/usr/bin/env bun',
          'await Bun.stdin.text()',
          'await new Promise((resolve) => setTimeout(resolve, 60_000))',
        ].join('\n'),
      )
      await Bun.$`chmod +x ${adapterPath}`.quiet()

      await Bun.write(tasksPath, '{"id":"task-1","prompts":["hello"]}')

      const payload = JSON.stringify({
        mode: 'run',
        tasksPath,
        adapter: { command: [adapterPath], timeoutMs: 250 },
        runId: 'run-timeout',
        label: 'timeout-test',
      })

      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, , exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      const row = JSON.parse(stdout.trim())
      expect(row.trial.result.status).toBe('timed_out')
      expect(row.trial.invocation.timedOut).toBe(true)
      expect(row.trial.invocation.exitCode).toBe(null)
      expect(row.trial.invocation.signalCode).toBe('SIGTERM')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})

describe('grade mode', () => {
  const createCompletedRow = () => ({
    schemaVersion: 1,
    type: 'trial_result',
    harness: { name: '@plaited/agent-eval-harness', version: '1.0.0' },
    runId: 'run-1',
    label: 'test',
    taskId: 'task-1',
    trialIndex: 0,
    trialId: 'run-1-task-1-hash-0',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    trial: {
      id: 'run-1-task-1-hash-0',
      cwd: '/tmp',
      task: {
        id: 'task-1',
        prompts: ['hello'],
        source: { path: 'tasks.jsonl', resolvedPath: '/tmp/tasks.jsonl', line: 1 },
      },
      result: { status: 'completed', message: 'done' },
      trajectory: [{ type: 'message', role: 'assistant', content: 'ok' }],
      invocation: {
        command: ['bun', './adapter.ts'],
        resolvedCommand: ['/usr/bin/bun', './adapter.ts'],
        exitCode: 0,
        signalCode: null,
        timedOut: false,
        durationMs: 100,
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:01.000Z',
        stdinBytes: 10,
        stdinSha256: 'abc',
        stdoutBytes: 10,
        stderrBytes: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    },
    process: {
      eventCount: 1,
      messageCount: 1,
      toolCallCount: 0,
      commandCount: 0,
      errorCount: 0,
      failedToolCallCount: 0,
      failedCommandCount: 0,
      timedOutCommandCount: 0,
      adapterTimedOut: false,
      adapterExitCodeNonZero: false,
      runtimeErrorDetected: false,
      workerFailureDetected: false,
      repeatedToolCallCount: 0,
      maxRepeatedToolCallNameCount: 0,
    },
    graderResults: [],
    pass: null,
    score: null,
    reasoning: null,
  })

  test('grades raw trial rows from stdin and replaces grader results', async () => {
    const row = {
      schemaVersion: 1,
      type: 'trial_result',
      harness: { name: '@plaited/agent-eval-harness', version: '1.0.0' },
      runId: 'run-1',
      label: 'test',
      taskId: 'task-1',
      trialIndex: 0,
      trialId: 'run-1-task-1-hash-0',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      trial: {
        id: 'run-1-task-1-hash-0',
        cwd: '/tmp',
        task: {
          id: 'task-1',
          prompts: ['hello'],
          source: { path: 'tasks.jsonl', resolvedPath: '/tmp/tasks.jsonl', line: 1 },
        },
        result: { status: 'completed', message: 'done' },
        trajectory: [{ type: 'message', role: 'assistant', content: 'ok' }],
        invocation: {
          command: ['bun', './adapter.ts'],
          resolvedCommand: ['/usr/bin/bun', './adapter.ts'],
          exitCode: 0,
          signalCode: null,
          timedOut: false,
          durationMs: 100,
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          stdinBytes: 10,
          stdinSha256: 'abc',
          stdoutBytes: 10,
          stderrBytes: 0,
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      },
      process: {
        eventCount: 1,
        messageCount: 1,
        toolCallCount: 0,
        commandCount: 0,
        errorCount: 0,
        failedToolCallCount: 0,
        failedCommandCount: 0,
        timedOutCommandCount: 0,
        adapterTimedOut: false,
        adapterExitCodeNonZero: false,
        runtimeErrorDetected: false,
        workerFailureDetected: false,
        repeatedToolCallCount: 0,
        maxRepeatedToolCallNameCount: 0,
      },
      graderResults: [
        {
          id: 'old',
          type: 'json',
          required: true,
          weight: 1,
          skipped: false,
          pass: false,
          score: 0,
          reasoning: null,
        },
      ],
      pass: false,
      score: 0,
      reasoning: 'old',
    }

    const payload = JSON.stringify({
      mode: 'grade',
      graders: [{ id: 'g1', type: 'json', result: { pass: true, score: 1 } }],
    })

    const cliPath = `${import.meta.dir}/../cli.ts`
    const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
      stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).toContain('Completed 1/1')
    const graded = JSON.parse(stdout.trim())
    expect(graded.graderResults).toHaveLength(1)
    expect(graded.graderResults[0].id).toBe('g1')
    expect(graded.pass).toBe(true)
    expect(graded.score).toBe(1)
  })

  test('forces overall failure for non-completed trials', async () => {
    const row = {
      schemaVersion: 1,
      type: 'trial_result',
      harness: { name: '@plaited/agent-eval-harness', version: '1.0.0' },
      runId: 'run-1',
      label: 'test',
      taskId: 'task-1',
      trialIndex: 0,
      trialId: 'run-1-task-1-hash-0',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      trial: {
        id: 'run-1-task-1-hash-0',
        cwd: '/tmp',
        task: {
          id: 'task-1',
          prompts: ['hello'],
          source: { path: 'tasks.jsonl', resolvedPath: '/tmp/tasks.jsonl', line: 1 },
        },
        result: { status: 'failed', error: 'bad', failureKind: 'adapter_exit_nonzero' },
        trajectory: [{ type: 'error', message: 'bad' }],
        invocation: {
          command: ['bun', './adapter.ts'],
          resolvedCommand: ['/usr/bin/bun', './adapter.ts'],
          exitCode: 1,
          signalCode: null,
          timedOut: false,
          durationMs: 100,
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          stdinBytes: 10,
          stdinSha256: 'abc',
          stdoutBytes: 10,
          stderrBytes: 0,
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      },
      process: {
        eventCount: 1,
        messageCount: 0,
        toolCallCount: 0,
        commandCount: 0,
        errorCount: 1,
        failedToolCallCount: 0,
        failedCommandCount: 0,
        timedOutCommandCount: 0,
        adapterTimedOut: false,
        adapterExitCodeNonZero: true,
        runtimeErrorDetected: true,
        workerFailureDetected: false,
        repeatedToolCallCount: 0,
        maxRepeatedToolCallNameCount: 0,
      },
      graderResults: [],
      pass: null,
      score: null,
      reasoning: null,
    }

    const payload = JSON.stringify({
      mode: 'grade',
      graders: [{ id: 'g1', type: 'json', result: { pass: true, score: 1 } }],
    })
    const cliPath = `${import.meta.dir}/../cli.ts`
    const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
      stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, , exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    const graded = JSON.parse(stdout.trim())
    expect(graded.graderResults[0].pass).toBe(true)
    expect(graded.pass).toBe(false)
    expect(graded.score).toBe(0)
  })

  test('command grader spawn failure is row data and does not fail grade command', async () => {
    const row = createCompletedRow()
    const payload = JSON.stringify({
      mode: 'grade',
      graders: [
        {
          id: 'spawn-fail',
          type: 'command',
          options: { command: ['./missing-grader-command'] },
        },
      ],
    })
    const cliPath = `${import.meta.dir}/../cli.ts`
    const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
      stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).toContain('Completed 1/1')
    const graded = JSON.parse(stdout.trim())
    expect(graded.graderResults).toHaveLength(1)
    const result = graded.graderResults[0]
    expect(result.skipped).toBe(false)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
    expect(result.reasoning).toContain('spawn')
    expect(result.outcome.invocation.command).toEqual(['./missing-grader-command'])
    expect(result.outcome.invocation.exitCode).toBe(null)
    expect(graded.pass).toBe(false)
    expect(graded.score).toBe(0)
  })

  test('grader_json command grader with non-zero exit cannot pass', async () => {
    const dir = join(tmpdir(), `eval-grader-json-nonzero-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const graderPath = join(dir, 'nonzero-grader.js')
      await Bun.write(
        graderPath,
        [
          '#!/usr/bin/env bun',
          "process.stdout.write(JSON.stringify({ pass: true, score: 1, reasoning: 'looks good' }))",
          'process.exit(3)',
        ].join('\n'),
      )
      await Bun.$`chmod +x ${graderPath}`.quiet()

      const row = createCompletedRow()
      const payload = JSON.stringify({
        mode: 'grade',
        graders: [
          {
            id: 'json-grader',
            type: 'command',
            options: {
              command: [graderPath],
              output: 'grader_json',
            },
          },
        ],
      })

      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
        stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, , exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      const graded = JSON.parse(stdout.trim())
      const result = graded.graderResults[0]
      expect(result.pass).toBe(false)
      expect(result.score).toBe(0)
      expect(result.reasoning).toContain('non-zero')
      expect(result.outcome.invocation.exitCode).toBe(3)
      expect(result.outcome.invocation.stdout).toContain('"pass":true')
      expect(result.outcome.invocation.stderr).toBeDefined()
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  test('exit_code command grader success includes normalized invocation with stdout/stderr evidence', async () => {
    const dir = join(tmpdir(), `eval-grader-exit-code-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const graderPath = join(dir, 'exit-code-grader.js')
      await Bun.write(
        graderPath,
        [
          '#!/usr/bin/env bun',
          "process.stdout.write('grader-stdout')",
          "process.stderr.write('grader-stderr')",
          'process.exit(0)',
        ].join('\n'),
      )
      await Bun.$`chmod +x ${graderPath}`.quiet()

      const row = createCompletedRow()
      const payload = JSON.stringify({
        mode: 'grade',
        graders: [{ id: 'exit-grader', type: 'command', options: { command: [graderPath], output: 'exit_code' } }],
      })
      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
        stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, , exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      const graded = JSON.parse(stdout.trim())
      const invocation = graded.graderResults[0].outcome.invocation
      expect(graded.graderResults[0].pass).toBe(true)
      expect(invocation.command).toEqual([graderPath])
      expect(invocation.resolvedCommand).toBeDefined()
      expect(invocation.exitCode).toBe(0)
      expect(invocation.signalCode).toBe(null)
      expect(invocation.timedOut).toBe(false)
      expect(typeof invocation.durationMs).toBe('number')
      expect(typeof invocation.startedAt).toBe('string')
      expect(typeof invocation.completedAt).toBe('string')
      expect(typeof invocation.stdinBytes).toBe('number')
      expect(typeof invocation.stdinSha256).toBe('string')
      expect(typeof invocation.stdoutBytes).toBe('number')
      expect(typeof invocation.stderrBytes).toBe('number')
      expect(typeof invocation.stdoutTruncated).toBe('boolean')
      expect(typeof invocation.stderrTruncated).toBe('boolean')
      expect(invocation.stdout).toContain('grader-stdout')
      expect(invocation.stderr).toContain('grader-stderr')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  test('runs command graders from the trial cwd', async () => {
    const dir = join(tmpdir(), `eval-grader-cwd-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const cwd = await realpath(dir)
      const row = createCompletedRow()
      row.trial.cwd = cwd
      const payload = JSON.stringify({
        mode: 'grade',
        graders: [
          {
            id: 'cwd-grader',
            type: 'command',
            options: {
              command: [
                'bun',
                '-e',
                'if (process.cwd() !== Bun.argv[1]) { process.stderr.write(process.cwd()); process.exit(1) }',
                cwd,
              ],
              output: 'exit_code',
            },
          },
        ],
      })

      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
        stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, , exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      const graded = JSON.parse(stdout.trim())
      const result = graded.graderResults[0]
      expect(result.pass).toBe(true)
      expect(result.outcome.invocation.exitCode).toBe(0)
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  test('grader_json success includes normalized invocation without retaining stdout text', async () => {
    const dir = join(tmpdir(), `eval-grader-json-success-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const graderPath = join(dir, 'json-grader.js')
      await Bun.write(
        graderPath,
        [
          '#!/usr/bin/env bun',
          "process.stderr.write('grader-json-stderr')",
          "process.stdout.write(JSON.stringify({ pass: true, score: 0.5, outcome: { details: 'ok' } }))",
          'process.exit(0)',
        ].join('\n'),
      )
      await Bun.$`chmod +x ${graderPath}`.quiet()

      const row = createCompletedRow()
      const payload = JSON.stringify({
        mode: 'grade',
        graders: [{ id: 'json-success', type: 'command', options: { command: [graderPath], output: 'grader_json' } }],
      })
      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
        stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, , exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      const graded = JSON.parse(stdout.trim())
      const result = graded.graderResults[0]
      const invocation = result.outcome.invocation
      expect(result.pass).toBe(true)
      expect(result.score).toBe(0.5)
      expect(result.outcome.details).toBe('ok')
      expect(invocation.command).toEqual([graderPath])
      expect(invocation.resolvedCommand).toBeDefined()
      expect(invocation.exitCode).toBe(0)
      expect(invocation.signalCode).toBe(null)
      expect(invocation.timedOut).toBe(false)
      expect(typeof invocation.durationMs).toBe('number')
      expect(typeof invocation.startedAt).toBe('string')
      expect(typeof invocation.completedAt).toBe('string')
      expect(typeof invocation.stdinBytes).toBe('number')
      expect(typeof invocation.stdinSha256).toBe('string')
      expect(typeof invocation.stdoutBytes).toBe('number')
      expect(typeof invocation.stderrBytes).toBe('number')
      expect(typeof invocation.stdoutTruncated).toBe('boolean')
      expect(typeof invocation.stderrTruncated).toBe('boolean')
      expect(invocation.stderr).toContain('grader-json-stderr')
      expect(invocation.stdout).toBeUndefined()
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})

describe('compare mode', () => {
  test('compares two graded JSONL files and emits bounded JSON', async () => {
    const dir = join(tmpdir(), `eval-compare-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const baselinePath = join(dir, 'baseline.jsonl')
      const challengerPath = join(dir, 'challenger.jsonl')

      const baseRow = {
        schemaVersion: 1,
        type: 'trial_result',
        harness: { name: '@plaited/agent-eval-harness', version: '1.0.0' },
        runId: 'run-b',
        label: 'baseline',
        taskId: 'task-1',
        trialIndex: 0,
        trialId: 'run-b-task-1-a-0',
        createdAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:01.000Z',
        trial: {
          id: 'run-b-task-1-a-0',
          cwd: '/tmp',
          task: {
            id: 'task-1',
            prompts: ['hello'],
            source: { path: 'tasks.jsonl', resolvedPath: '/tmp/tasks.jsonl', line: 1 },
          },
          result: { status: 'completed', message: 'ok' },
          trajectory: [{ type: 'message', role: 'assistant', content: 'ok' }],
          invocation: {
            command: ['bun', './adapter.ts'],
            resolvedCommand: ['/usr/bin/bun', './adapter.ts'],
            exitCode: 0,
            signalCode: null,
            timedOut: false,
            durationMs: 100,
            startedAt: '2026-01-01T00:00:00.000Z',
            completedAt: '2026-01-01T00:00:01.000Z',
            stdinBytes: 10,
            stdinSha256: 'abc',
            stdoutBytes: 10,
            stderrBytes: 0,
            stdoutTruncated: false,
            stderrTruncated: false,
          },
        },
        process: {
          eventCount: 1,
          messageCount: 1,
          toolCallCount: 0,
          commandCount: 0,
          errorCount: 0,
          failedToolCallCount: 0,
          failedCommandCount: 0,
          timedOutCommandCount: 0,
          adapterTimedOut: false,
          adapterExitCodeNonZero: false,
          runtimeErrorDetected: false,
          workerFailureDetected: false,
          repeatedToolCallCount: 0,
          maxRepeatedToolCallNameCount: 0,
        },
        graderResults: [
          { id: 'g1', type: 'json', required: true, weight: 1, skipped: false, pass: true, score: 1, reasoning: null },
        ],
        pass: true,
        score: 1,
        reasoning: null,
      }
      const challengerRow = {
        ...baseRow,
        runId: 'run-c',
        label: 'challenger',
        trialId: 'run-c-task-1-a-0',
        score: 0,
        pass: false,
      }

      await Bun.write(baselinePath, `${JSON.stringify(baseRow)}\n`)
      await Bun.write(challengerPath, `${JSON.stringify(challengerRow)}\n`)

      const payload = JSON.stringify({ mode: 'compare', baselinePath, challengerPath, k: 1 })
      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', payload], { stdout: 'pipe', stderr: 'pipe' })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      expect(stderr.trim()).toBe('')
      const report = JSON.parse(stdout)
      expect(report.mode).toBe('compare')
      expect(report.baseline.rowCount).toBe(1)
      expect(report.challenger.rowCount).toBe(1)
      expect(report.comparable.taskCount).toBe(1)
      expect(report.baseline.estimatedPassAtKByTask).toBeUndefined()
      expect(report.challenger.estimatedPassAtKByTask).toBeUndefined()
      expect(report.baseline.exactPassAtKByTask).toHaveLength(1)
      expect(report.baseline.exactPassAtKByTask[0].exactPassAtK).toBe(1)
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  test('supports --human output for compare mode', async () => {
    const dir = join(tmpdir(), `eval-compare-human-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const baselinePath = join(dir, 'baseline.jsonl')
      const challengerPath = join(dir, 'challenger.jsonl')
      const row = {
        schemaVersion: 1,
        type: 'trial_result',
        harness: { name: '@plaited/agent-eval-harness', version: '1.0.0' },
        runId: 'run-x',
        label: 'label-x',
        taskId: 'task-1',
        trialIndex: 0,
        trialId: 'run-x-task-1-a-0',
        createdAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:01.000Z',
        trial: {
          id: 'run-x-task-1-a-0',
          cwd: '/tmp',
          task: {
            id: 'task-1',
            prompts: ['hello'],
            source: { path: 'tasks.jsonl', resolvedPath: '/tmp/tasks.jsonl', line: 1 },
          },
          result: { status: 'completed', message: 'ok' },
          trajectory: [{ type: 'message', role: 'assistant', content: 'ok' }],
          invocation: {
            command: ['bun', './adapter.ts'],
            resolvedCommand: ['/usr/bin/bun', './adapter.ts'],
            exitCode: 0,
            signalCode: null,
            timedOut: false,
            durationMs: 100,
            startedAt: '2026-01-01T00:00:00.000Z',
            completedAt: '2026-01-01T00:00:01.000Z',
            stdinBytes: 10,
            stdinSha256: 'abc',
            stdoutBytes: 10,
            stderrBytes: 0,
            stdoutTruncated: false,
            stderrTruncated: false,
          },
        },
        process: {
          eventCount: 1,
          messageCount: 1,
          toolCallCount: 0,
          commandCount: 0,
          errorCount: 0,
          failedToolCallCount: 0,
          failedCommandCount: 0,
          timedOutCommandCount: 0,
          adapterTimedOut: false,
          adapterExitCodeNonZero: false,
          runtimeErrorDetected: false,
          workerFailureDetected: false,
          repeatedToolCallCount: 0,
          maxRepeatedToolCallNameCount: 0,
        },
        graderResults: [
          { id: 'g1', type: 'json', required: true, weight: 1, skipped: false, pass: true, score: 1, reasoning: null },
        ],
        pass: true,
        score: 1,
        reasoning: null,
      }
      await Bun.write(baselinePath, `${JSON.stringify(row)}\n`)
      await Bun.write(challengerPath, `${JSON.stringify(row)}\n`)

      const payload = JSON.stringify({ mode: 'compare', baselinePath, challengerPath, k: 1 })
      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', '--human', payload], { stdout: 'pipe', stderr: 'pipe' })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(0)
      expect(stderr.trim()).toBe('')
      expect(stdout).toContain('Baseline:')
      expect(stdout).toContain('Challenger:')
      expect(stdout).toContain('Comparable tasks:')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})

describe('calibrate mode', () => {
  test('samples graded rows and emits review packet', async () => {
    const row = {
      schemaVersion: 1,
      type: 'trial_result',
      harness: { name: '@plaited/agent-eval-harness', version: '1.0.0' },
      runId: 'run-1',
      label: 'test',
      taskId: 'task-1',
      trialIndex: 0,
      trialId: 'run-1-task-1-a-0',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      trial: {
        id: 'run-1-task-1-a-0',
        cwd: '/tmp',
        task: {
          id: 'task-1',
          prompts: ['hello'],
          source: { path: 'tasks.jsonl', resolvedPath: '/tmp/tasks.jsonl', line: 1 },
        },
        result: { status: 'completed', message: 'ok' },
        trajectory: [{ type: 'message', role: 'assistant', content: 'ok' }],
        invocation: {
          command: ['bun', './adapter.ts'],
          resolvedCommand: ['/usr/bin/bun', './adapter.ts'],
          exitCode: 0,
          signalCode: null,
          timedOut: false,
          durationMs: 100,
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          stdinBytes: 10,
          stdinSha256: 'abc',
          stdoutBytes: 10,
          stderrBytes: 0,
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      },
      process: {
        eventCount: 1,
        messageCount: 1,
        toolCallCount: 0,
        commandCount: 0,
        errorCount: 0,
        failedToolCallCount: 0,
        failedCommandCount: 0,
        timedOutCommandCount: 0,
        adapterTimedOut: false,
        adapterExitCodeNonZero: false,
        runtimeErrorDetected: false,
        workerFailureDetected: false,
        repeatedToolCallCount: 0,
        maxRepeatedToolCallNameCount: 0,
      },
      graderResults: [
        { id: 'g1', type: 'json', required: true, weight: 1, skipped: false, pass: true, score: 1, reasoning: null },
      ],
      pass: true,
      score: 1,
      reasoning: null,
    }
    const payload = JSON.stringify({ mode: 'calibrate', sample: 1, seed: 'seed-1' })
    const cliPath = `${import.meta.dir}/../cli.ts`
    const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
      stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr.trim()).toBe('')
    const packet = JSON.parse(stdout)
    expect(packet.mode).toBe('calibrate')
    expect(packet.samples).toHaveLength(1)
    expect(packet.samples[0].source.path).toBe(null)
    expect(packet.reviewResponseContract.labels).toContain('needs_human')
  })

  test('rejects rows that have graderResults but null overall pass/score', async () => {
    const row = {
      schemaVersion: 1,
      type: 'trial_result',
      harness: { name: '@plaited/agent-eval-harness', version: '1.0.0' },
      runId: 'run-1',
      label: 'test',
      taskId: 'task-1',
      trialIndex: 0,
      trialId: 'run-1-task-1-a-0',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      trial: {
        id: 'run-1-task-1-a-0',
        cwd: '/tmp',
        task: {
          id: 'task-1',
          prompts: ['hello'],
          source: { path: 'tasks.jsonl', resolvedPath: '/tmp/tasks.jsonl', line: 1 },
        },
        result: { status: 'completed', message: 'ok' },
        trajectory: [{ type: 'message', role: 'assistant', content: 'ok' }],
        invocation: {
          command: ['bun', './adapter.ts'],
          resolvedCommand: ['/usr/bin/bun', './adapter.ts'],
          exitCode: 0,
          signalCode: null,
          timedOut: false,
          durationMs: 100,
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          stdinBytes: 10,
          stdinSha256: 'abc',
          stdoutBytes: 10,
          stderrBytes: 0,
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      },
      process: {
        eventCount: 1,
        messageCount: 1,
        toolCallCount: 0,
        commandCount: 0,
        errorCount: 0,
        failedToolCallCount: 0,
        failedCommandCount: 0,
        timedOutCommandCount: 0,
        adapterTimedOut: false,
        adapterExitCodeNonZero: false,
        runtimeErrorDetected: false,
        workerFailureDetected: false,
        repeatedToolCallCount: 0,
        maxRepeatedToolCallNameCount: 0,
      },
      graderResults: [
        {
          id: 'g1',
          type: 'json',
          required: true,
          weight: 1,
          skipped: false,
          pass: true,
          score: 1,
          reasoning: null,
        },
      ],
      pass: null,
      score: null,
      reasoning: null,
    }

    const payload = JSON.stringify({ mode: 'calibrate', sample: 1, seed: 'seed-1' })
    const cliPath = `${import.meta.dir}/../cli.ts`
    const proc = Bun.spawn(['bun', cliPath, 'eval', payload], {
      stdin: new TextEncoder().encode(`${JSON.stringify(row)}\n`),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(2)
    expect(stderr).toContain('requires graded rows')
  })
})

describe('eval CLI flags', () => {
  test('--human is rejected for run mode', async () => {
    const payload = JSON.stringify({
      mode: 'run',
      tasksPath: './tasks.jsonl',
      adapter: { command: ['bun', './adapter.ts'] },
    })
    const cliPath = `${import.meta.dir}/../cli.ts`
    const proc = Bun.spawn(['bun', cliPath, 'eval', '--human', payload], { stdout: 'pipe', stderr: 'pipe' })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(2)
    expect(stderr).toContain('not supported')
  })

  test('--dry-run for run mode validates tasks and emits bounded summary', async () => {
    const dir = join(tmpdir(), `eval-dry-run-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const tasksPath = join(dir, 'tasks.jsonl')
      await Bun.write(tasksPath, '{"id":"task-1","prompts":["hello"]}\n')
      const payload = JSON.stringify({
        mode: 'run',
        tasksPath,
        adapter: { command: ['bun', './adapter.ts'] },
        label: 'my-run',
      })
      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', '--dry-run', payload], { stdout: 'pipe', stderr: 'pipe' })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      expect(exitCode).toBe(0)
      expect(stderr.trim()).toBe('')
      const dryRun = JSON.parse(stdout)
      expect(dryRun.mode).toBe('dry_run')
      expect(dryRun.commandMode).toBe('run')
      expect(dryRun.summary.taskCount).toBe(1)
      expect(dryRun.summary.label).toBe('my-run')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  test('--dry-run run mode rejects missing adapter path commands', async () => {
    const dir = join(tmpdir(), `eval-dry-run-missing-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    try {
      const tasksPath = join(dir, 'tasks.jsonl')
      await Bun.write(tasksPath, '{"id":"task-1","prompts":["hello"]}\n')
      const payload = JSON.stringify({
        mode: 'run',
        tasksPath,
        adapter: { command: ['./does-not-exist.sh'] },
      })
      const cliPath = `${import.meta.dir}/../cli.ts`
      const proc = Bun.spawn(['bun', cliPath, 'eval', '--dry-run', payload], { stdout: 'pipe', stderr: 'pipe' })
      const [, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect(exitCode).toBe(2)
      expect(stderr).toContain('Adapter command path does not exist')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
