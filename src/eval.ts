import { resolve } from 'node:path'
import * as z from 'zod'
import packageJson from '../package.json' with { type: 'json' }
import { DEFAULT_CONCURRENCY, DEFAULT_MAX_OUTPUT_BYTES, DEFAULT_TIMEOUT_MS, SCHEMA_VERSION } from './eval.constants.ts'
import {
  AdapterInputSchema,
  AdapterOutputSchema,
  CalibrateEvalInputSchema,
  CompareEvalInputSchema,
  DryRunOutputSchema,
  EvalInputSchema,
  EvalOutputSchema,
  GradeEvalInputSchema,
  GraderInputSchema,
  GraderOutputSchema,
  GraderResultSchema,
  type JsonObject,
  ProcessSummarySchema,
  RunEvalInputSchema,
  SCHEMA_TARGETS,
  type SchemaTarget,
  TaskSchema,
  type TrajectoryEventSchema,
  TrialResultRowSchema,
  TrialSchema,
} from './eval.schemas.ts'
import {
  createTrialId,
  generateRunId,
  inferLabel,
  looksLikePath,
  readJsonInput,
  resolveCommand,
  sanitizeLabelPart,
  sha256,
  stableSort,
} from './eval.utils.ts'

type TrajectoryEvent = z.infer<typeof TrajectoryEventSchema>
type Task = z.infer<typeof TaskSchema>
type RunEvalInput = z.infer<typeof RunEvalInputSchema>
type GradeEvalInput = z.infer<typeof GradeEvalInputSchema>
type CompareEvalInput = z.infer<typeof CompareEvalInputSchema>
type CalibrateEvalInput = z.infer<typeof CalibrateEvalInputSchema>
type TrialRow = z.infer<typeof TrialResultRowSchema>
type Trial = z.infer<typeof TrialSchema>
type ProcessSummary = z.infer<typeof ProcessSummarySchema>
type GraderResult = z.infer<typeof GraderResultSchema>

class CliError extends Error {
  readonly exitCode: 1 | 2

  constructor(message: string, exitCode: 1 | 2) {
    super(message)
    this.exitCode = exitCode
  }
}

const parseJsonLine = (line: string, lineNumber: number): unknown => {
  try {
    return JSON.parse(line)
  } catch (error) {
    throw new CliError(
      `Invalid JSON at line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
      2,
    )
  }
}

const loadJsonl = async (path: string): Promise<Array<{ line: number; value: unknown }>> => {
  const resolvedPath = resolve(process.cwd(), path)
  const file = Bun.file(resolvedPath)
  const exists = await file.exists()
  if (!exists) {
    throw new CliError(`Input file not found: ${path}`, 2)
  }
  const content = await file.text()
  const lines = content.split('\n')
  const rows: Array<{ line: number; value: unknown }> = []
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      continue
    }
    rows.push({ line: index + 1, value: parseJsonLine(line, index + 1) })
  }
  return rows
}

const loadTasks = async (tasksPath: string): Promise<Array<{ line: number; task: Task; resolvedPath: string }>> => {
  const rows = await loadJsonl(tasksPath)
  const resolvedPath = resolve(process.cwd(), tasksPath)
  const parsed = rows.map((row) => {
    const result = TaskSchema.safeParse(row.value)
    if (!result.success) {
      throw new CliError(`Invalid task at line ${row.line}: ${z.prettifyError(result.error)}`, 2)
    }
    return { line: row.line, task: result.data, resolvedPath }
  })

  const seen = new Map<string, number>()
  for (const entry of parsed) {
    const existing = seen.get(entry.task.id)
    if (existing !== undefined) {
      throw new CliError(`Duplicate task id '${entry.task.id}' found at lines ${existing} and ${entry.line}.`, 2)
    }
    seen.set(entry.task.id, entry.line)
  }

  return parsed
}

const readRowsFromStdin = async (): Promise<Array<{ line: number; value: unknown }>> => {
  if (process.stdin.isTTY) {
    return []
  }

  const content = await Bun.stdin.text()
  const lines = content.split('\n')
  const rows: Array<{ line: number; value: unknown }> = []
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      continue
    }
    rows.push({ line: index + 1, value: parseJsonLine(line, index + 1) })
  }
  return rows
}

const computeProcessSummary = (trial: Trial): ProcessSummary => {
  const events = trial.trajectory
  const messageCount = events.filter((event) => event.type === 'message').length
  const toolCalls = events.filter((event) => event.type === 'tool_call')
  const commands = events.filter((event) => event.type === 'command')
  const errors = events.filter((event) => event.type === 'error')
  const failedToolCallCount = toolCalls.filter((event) => event.status === 'failed').length
  const failedCommandCount = commands.filter((event) => event.status === 'failed').length
  const timedOutCommandCount = commands.filter((event) => event.status === 'timed_out').length

  const toolNameCounts = new Map<string, number>()
  for (const event of toolCalls) {
    const current = toolNameCounts.get(event.name) ?? 0
    toolNameCounts.set(event.name, current + 1)
  }
  const repeatedEntries = [...toolNameCounts.values()].filter((count) => count > 1)
  const repeatedToolCallCount = repeatedEntries.reduce((sum, value) => sum + value - 1, 0)
  const maxRepeatedToolCallNameCount = repeatedEntries.length > 0 ? Math.max(...repeatedEntries) : 0

  return ProcessSummarySchema.parse({
    eventCount: events.length,
    messageCount,
    toolCallCount: toolCalls.length,
    commandCount: commands.length,
    errorCount: errors.length,
    failedToolCallCount,
    failedCommandCount,
    timedOutCommandCount,
    adapterTimedOut: trial.result.status === 'timed_out',
    adapterExitCodeNonZero: trial.invocation.exitCode !== null && trial.invocation.exitCode !== 0,
    runtimeErrorDetected: errors.length > 0 || trial.result.status === 'failed',
    workerFailureDetected: trial.result.status !== 'completed' && trial.result.failureKind === 'harness_error',
    repeatedToolCallCount,
    maxRepeatedToolCallNameCount,
  })
}

const retainOutput = (text: string, maxOutputBytes: number): { text: string; bytes: number; truncated: boolean } => {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxOutputBytes) {
    return { text, bytes: bytes.length, truncated: false }
  }
  const truncatedText = new TextDecoder().decode(bytes.slice(0, maxOutputBytes))
  return { text: truncatedText, bytes: bytes.length, truncated: true }
}

type CommandInvocation = z.infer<typeof TrialSchema.shape.invocation>

const toInvocationEvidence = (params: {
  invocation: CommandInvocation
  includeStdout: boolean
  includeStderr: boolean
}): JsonObject => {
  const { invocation, includeStdout, includeStderr } = params
  const evidence: JsonObject = {
    command: invocation.command,
    resolvedCommand: invocation.resolvedCommand,
    exitCode: invocation.exitCode,
    signalCode: invocation.signalCode,
    timedOut: invocation.timedOut,
    durationMs: invocation.durationMs,
    startedAt: invocation.startedAt,
    completedAt: invocation.completedAt,
    stdinBytes: invocation.stdinBytes,
    stdinSha256: invocation.stdinSha256,
    stdoutBytes: invocation.stdoutBytes,
    stderrBytes: invocation.stderrBytes,
    stdoutTruncated: invocation.stdoutTruncated,
    stderrTruncated: invocation.stderrTruncated,
  }
  if (includeStdout) {
    evidence.stdout = invocation.stdout ?? ''
  }
  if (includeStderr) {
    evidence.stderr = invocation.stderr ?? ''
  }
  return evidence
}

const runCommand = async (params: {
  commandSpec: z.infer<typeof RunEvalInputSchema.shape.adapter>
  stdinJson: string
  cwd?: string
}): Promise<{ invocation: CommandInvocation; stdout: string; stderr: string; timedOut: boolean }> => {
  const timeoutMs = params.commandSpec.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxOutputBytes = params.commandSpec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const command = params.commandSpec.command
  const resolvedCommand = resolveCommand(command)
  const executable = command[0]
  const spawnCommand = executable !== undefined && looksLikePath(executable) ? resolvedCommand : command
  const proc = Bun.spawn(spawnCommand, {
    stdin: new TextEncoder().encode(params.stdinJson),
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: params.cwd ?? process.cwd(),
  })

  let timedOut = false
  const timeoutHandle = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, timeoutMs)

  const [stdoutRaw, stderrRaw, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timeoutHandle))

  const stdoutData = retainOutput(stdoutRaw, maxOutputBytes)
  const stderrData = retainOutput(stderrRaw, maxOutputBytes)
  const completedAt = new Date().toISOString()
  const invocation = TrialSchema.shape.invocation.parse({
    command,
    resolvedCommand,
    exitCode: timedOut ? null : exitCode,
    signalCode: null,
    timedOut,
    durationMs: Date.now() - startedMs,
    startedAt,
    completedAt,
    stdinBytes: new TextEncoder().encode(params.stdinJson).length,
    stdinSha256: sha256(params.stdinJson),
    stdoutBytes: stdoutData.bytes,
    stderrBytes: stderrData.bytes,
    stdoutTruncated: stdoutData.truncated,
    stderrTruncated: stderrData.truncated,
    stdout: stdoutData.text,
    stderr: stderrData.text,
  })

  return { invocation, stdout: stdoutRaw, stderr: stderrRaw, timedOut }
}

const buildFailureResult = (
  status: 'failed' | 'timed_out' | 'cancelled',
  error: string,
  failureKind:
    | 'adapter_exit_nonzero'
    | 'adapter_invalid_json'
    | 'adapter_invalid_result'
    | 'adapter_timed_out'
    | 'adapter_spawn_failed'
    | 'harness_error',
): z.infer<typeof AdapterOutputSchema.shape.result> => ({
  status,
  message: error,
  error,
  failureKind,
})

const executeAdapter = async (params: {
  adapter: RunEvalInput['adapter']
  adapterInput: z.infer<typeof AdapterInputSchema>
}): Promise<{
  result: z.infer<typeof AdapterOutputSchema>
  invocation: CommandInvocation
}> => {
  try {
    const stdinJson = JSON.stringify(params.adapterInput)
    const commandRun = await runCommand({ commandSpec: params.adapter, stdinJson })
    const { invocation } = commandRun
    if (commandRun.timedOut) {
      const failedResult = AdapterOutputSchema.parse({
        result: buildFailureResult('timed_out', 'Adapter timed out.', 'adapter_timed_out'),
        trajectory: [],
      })
      return {
        result: failedResult,
        invocation: { ...invocation, stdout: invocation.stdout, stderr: invocation.stderr },
      }
    }

    if (invocation.exitCode !== null && invocation.exitCode !== 0) {
      const failedResult = AdapterOutputSchema.parse({
        result: buildFailureResult(
          'failed',
          `Adapter exited with code ${invocation.exitCode}.`,
          'adapter_exit_nonzero',
        ),
        trajectory: [],
      })
      return {
        result: failedResult,
        invocation: { ...invocation, stdout: invocation.stdout, stderr: invocation.stderr },
      }
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(commandRun.stdout)
    } catch {
      const failedResult = AdapterOutputSchema.parse({
        result: buildFailureResult('failed', 'Adapter stdout was not valid JSON.', 'adapter_invalid_json'),
        trajectory: [],
      })
      return {
        result: failedResult,
        invocation: { ...invocation, stdout: invocation.stdout, stderr: invocation.stderr },
      }
    }

    const parsed = AdapterOutputSchema.safeParse(parsedJson)
    if (!parsed.success) {
      const failedResult = AdapterOutputSchema.parse({
        result: buildFailureResult('failed', 'Adapter JSON output did not match schema.', 'adapter_invalid_result'),
        trajectory: [],
      })
      return {
        result: failedResult,
        invocation: { ...invocation, stdout: invocation.stdout, stderr: invocation.stderr },
      }
    }

    const invocationForSuccess: CommandInvocation = {
      ...invocation,
      stdout: undefined,
      stderr: invocation.stderr,
    }

    return { result: parsed.data, invocation: invocationForSuccess }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fallbackInvocation = TrialSchema.shape.invocation.parse({
      command: params.adapter.command,
      resolvedCommand: resolveCommand(params.adapter.command),
      exitCode: null,
      signalCode: null,
      timedOut: false,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      stdinBytes: 0,
      stdinSha256: sha256(''),
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      stderr: message,
    })
    return {
      result: AdapterOutputSchema.parse({
        result: buildFailureResult('failed', `Failed to spawn adapter: ${message}`, 'adapter_spawn_failed'),
        trajectory: [],
      }),
      invocation: fallbackInvocation,
    }
  }
}

const createRowFromTrial = (params: {
  runId: string
  label: string | null
  taskId: string
  trialIndex: number
  trialId: string
  trial: Trial
  rowMetadata?: JsonObject
}): TrialRow => {
  const processSummary = computeProcessSummary(params.trial)
  return TrialResultRowSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: 'trial_result',
    harness: {
      name: '@plaited/agent-eval-harness',
      version: packageJson.version,
    },
    runId: params.runId,
    label: params.label,
    taskId: params.taskId,
    trialIndex: params.trialIndex,
    trialId: params.trialId,
    createdAt: params.trial.invocation.startedAt,
    completedAt: params.trial.invocation.completedAt,
    trial: params.trial,
    process: processSummary,
    graderResults: [],
    pass: null,
    score: null,
    reasoning: null,
    metadata: params.rowMetadata,
  })
}

export const runEvalTrials = async (input: RunEvalInput): Promise<void> => {
  const loadedTasks = await loadTasks(input.tasksPath)
  const runId = input.runId ?? generateRunId(input.label ?? inferLabel(input.adapter.command))
  const label = input.label ?? inferLabel(input.adapter.command)
  const topLevelCwd = resolve(process.cwd(), input.cwd ?? process.cwd())
  const allTrials = loadedTasks.flatMap((entry) =>
    Array.from({ length: input.k }, (_, trialIndex) => {
      const taskCwd = entry.task.cwd
      const resolvedTrialCwd =
        taskCwd === undefined ? topLevelCwd : taskCwd.startsWith('/') ? taskCwd : resolve(topLevelCwd, taskCwd)
      const trialId = createTrialId({ runId, taskId: entry.task.id, trialIndex })
      return {
        taskSourcePath: input.tasksPath,
        taskResolvedPath: entry.resolvedPath,
        line: entry.line,
        task: entry.task,
        trialIndex,
        trialId,
        trialCwd: resolvedTrialCwd,
      }
    }),
  )

  let nextIndex = 0
  let completed = 0
  let stdoutChain = Promise.resolve()
  const total = allTrials.length

  const runOne = async (): Promise<void> => {
    while (nextIndex < allTrials.length) {
      const trialRef = allTrials[nextIndex]
      nextIndex += 1
      if (trialRef === undefined) {
        continue
      }

      const normalizedTask = {
        ...trialRef.task,
        source: {
          path: trialRef.taskSourcePath,
          resolvedPath: trialRef.taskResolvedPath,
          line: trialRef.line,
        },
      }
      const adapterInput = AdapterInputSchema.parse({
        runId,
        label,
        task: trialRef.task,
        trialId: trialRef.trialId,
        trialIndex: trialRef.trialIndex,
        cwd: trialRef.trialCwd,
        config: input.adapter.config,
      })
      const adapterRun = await executeAdapter({ adapter: input.adapter, adapterInput })
      const trial = TrialSchema.parse({
        id: trialRef.trialId,
        cwd: trialRef.trialCwd,
        task: normalizedTask,
        result: adapterRun.result.result,
        trajectory: adapterRun.result.trajectory,
        invocation: adapterRun.invocation,
        metadata: adapterRun.result.metadata,
      })
      const row = createRowFromTrial({
        runId,
        label,
        taskId: trialRef.task.id,
        trialIndex: trialRef.trialIndex,
        trialId: trialRef.trialId,
        trial,
        rowMetadata: input.metadata,
      })

      stdoutChain = stdoutChain.then(async () => {
        process.stdout.write(`${JSON.stringify(row)}\n`)
      })
      await stdoutChain

      completed += 1
      if (!input.quiet) {
        process.stderr.write(`Completed ${completed}/${total}\n`)
      }
    }
  }

  const workerCount = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY)
  await Promise.all(Array.from({ length: Math.min(workerCount, total || 1) }, () => runOne()))
}

const loadTrialRowsFromPathOrStdin = async (trialsPath: string | undefined): Promise<TrialRow[]> => {
  const rows = trialsPath === undefined ? await readRowsFromStdin() : await loadJsonl(trialsPath)
  const parsedRows: TrialRow[] = []
  for (const row of rows) {
    const parsed = TrialResultRowSchema.safeParse(row.value)
    if (!parsed.success) {
      throw new CliError(`Invalid trial row at line ${row.line}: ${z.prettifyError(parsed.error)}`, 2)
    }
    parsedRows.push(parsed.data)
  }
  return parsedRows
}

const runProcessGrader = (
  row: TrialRow,
  grader: z.infer<typeof GradeEvalInputSchema.shape.graders.element>,
): GraderResult => {
  const options = grader.type === 'process' ? (grader.options ?? {}) : {}
  const reasons: string[] = []
  let pass = true
  if ((options.failOnNonCompletedStatus ?? true) && row.trial.result.status !== 'completed') {
    pass = false
    reasons.push(`status=${row.trial.result.status}`)
  }
  if ((options.failOnErrorEvents ?? true) && row.process.errorCount > 0) {
    pass = false
    reasons.push('error events detected')
  }
  if (
    (options.failOnFailedOrTimedOutCommands ?? true) &&
    row.process.failedCommandCount + row.process.timedOutCommandCount > 0
  ) {
    pass = false
    reasons.push('failed/timed_out command events detected')
  }
  if ((options.failOnFailedToolCalls ?? true) && row.process.failedToolCallCount > 0) {
    pass = false
    reasons.push('failed tool_call events detected')
  }
  if (options.maxToolCalls !== undefined && row.process.toolCallCount > options.maxToolCalls) {
    pass = false
    reasons.push(`tool calls exceed max (${options.maxToolCalls})`)
  }
  if (options.maxCommands !== undefined && row.process.commandCount > options.maxCommands) {
    pass = false
    reasons.push(`commands exceed max (${options.maxCommands})`)
  }
  if (
    options.maxRepeatedToolCallNameCount !== undefined &&
    row.process.maxRepeatedToolCallNameCount > options.maxRepeatedToolCallNameCount
  ) {
    pass = false
    reasons.push(`repeated tool calls exceed max (${options.maxRepeatedToolCallNameCount})`)
  }
  return GraderResultSchema.parse({
    id: grader.id,
    type: 'process',
    required: grader.required ?? true,
    weight: grader.weight ?? 1,
    skipped: false,
    pass,
    score: pass ? 1 : 0,
    reasoning: pass ? 'Process checks passed.' : reasons.join('; '),
    metadata: grader.metadata,
  })
}

const runJsonGrader = (grader: z.infer<typeof GradeEvalInputSchema.shape.graders.element>): GraderResult => {
  if (grader.type !== 'json') {
    throw new Error('Expected json grader')
  }
  return GraderResultSchema.parse({
    id: grader.id,
    type: 'json',
    required: grader.required ?? true,
    weight: grader.weight ?? 1,
    skipped: false,
    pass: grader.result.pass,
    score: grader.result.score,
    reasoning: grader.result.reasoning ?? null,
    outcome: grader.result.outcome,
    metadata: grader.metadata ?? grader.result.metadata,
  })
}

const runCommandGrader = async (params: {
  grader: Extract<z.infer<typeof GradeEvalInputSchema.shape.graders.element>, { type: 'command' }>
  row: TrialRow
  previousResults: GraderResult[]
  cwd: string
}): Promise<GraderResult> => {
  const graderInput = GraderInputSchema.parse({
    row: params.row,
    trial: params.row.trial,
    process: params.row.process,
    previousResults: params.previousResults,
    cwd: params.cwd,
    config: params.grader.options.config,
  })

  const stdinJson = JSON.stringify(graderInput)

  const base = {
    id: params.grader.id,
    type: 'command' as const,
    required: params.grader.required ?? true,
    weight: params.grader.weight ?? 1,
    skipped: false,
    metadata: params.grader.metadata,
  }

  let commandRun: Awaited<ReturnType<typeof runCommand>>
  try {
    commandRun = await runCommand({
      commandSpec: params.grader.options,
      stdinJson,
      cwd: params.cwd,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const invocation = TrialSchema.shape.invocation.parse({
      command: params.grader.options.command,
      resolvedCommand: resolveCommand(params.grader.options.command),
      exitCode: null,
      signalCode: null,
      timedOut: false,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      stdinBytes: new TextEncoder().encode(stdinJson).length,
      stdinSha256: sha256(stdinJson),
      stdoutBytes: 0,
      stderrBytes: new TextEncoder().encode(message).length,
      stdoutTruncated: false,
      stderrTruncated: false,
      stderr: message,
      stdout: '',
    })
    return GraderResultSchema.parse({
      ...base,
      pass: false,
      score: 0,
      reasoning: 'Command grader spawn failed.',
      outcome: {
        invocation: toInvocationEvidence({
          invocation,
          includeStdout: true,
          includeStderr: true,
        }),
      },
    })
  }

  if (commandRun.timedOut) {
    return GraderResultSchema.parse({
      ...base,
      pass: false,
      score: 0,
      reasoning: 'Command grader timed out.',
      outcome: {
        invocation: toInvocationEvidence({
          invocation: commandRun.invocation,
          includeStdout: true,
          includeStderr: true,
        }),
      },
    })
  }

  if (params.grader.options.output === 'grader_json') {
    if (commandRun.invocation.exitCode !== 0) {
      return GraderResultSchema.parse({
        ...base,
        pass: false,
        score: 0,
        reasoning: `grader_json command exited non-zero (${commandRun.invocation.exitCode}).`,
        outcome: {
          invocation: toInvocationEvidence({
            invocation: commandRun.invocation,
            includeStdout: true,
            includeStderr: true,
          }),
        },
      })
    }

    try {
      const parsed = GraderOutputSchema.parse(JSON.parse(commandRun.stdout))
      return GraderResultSchema.parse({
        ...base,
        pass: parsed.pass,
        score: parsed.score,
        reasoning: parsed.reasoning ?? null,
        outcome: {
          ...(parsed.outcome ?? {}),
          invocation: toInvocationEvidence({
            invocation: commandRun.invocation,
            includeStdout: false,
            includeStderr: true,
          }),
        },
        metadata: parsed.metadata ?? params.grader.metadata,
      })
    } catch (error) {
      return GraderResultSchema.parse({
        ...base,
        pass: false,
        score: 0,
        reasoning: `Invalid grader_json output: ${error instanceof Error ? error.message : String(error)}`,
        outcome: {
          invocation: toInvocationEvidence({
            invocation: commandRun.invocation,
            includeStdout: true,
            includeStderr: true,
          }),
        },
      })
    }
  }

  const pass = commandRun.invocation.exitCode === 0
  return GraderResultSchema.parse({
    ...base,
    pass,
    score: pass ? 1 : 0,
    reasoning: pass ? 'Command grader exit code 0.' : `Command grader exit code ${commandRun.invocation.exitCode}.`,
    outcome: {
      invocation: toInvocationEvidence({
        invocation: commandRun.invocation,
        includeStdout: true,
        includeStderr: true,
      }),
    },
  })
}

const computeOverall = (row: TrialRow): Pick<TrialRow, 'pass' | 'score' | 'reasoning'> => {
  if (row.trial.result.status !== 'completed') {
    return {
      pass: false,
      score: 0,
      reasoning: `Trial status '${row.trial.result.status}' forces overall pass=false and score=0.`,
    }
  }

  const executed = row.graderResults.filter((result) => !result.skipped)
  const required = executed.filter((result) => result.required)
  const requiredPass = required.every((result) => result.pass === true)
  const weighted = executed.filter((result) => result.score !== null)

  if (weighted.length === 0) {
    return {
      pass: requiredPass,
      score: 0,
      reasoning: requiredPass ? 'No scored graders executed.' : 'At least one required grader failed.',
    }
  }

  const weightedSum = weighted.reduce((sum, result) => sum + (result.score ?? 0) * result.weight, 0)
  const weightTotal = weighted.reduce((sum, result) => sum + result.weight, 0)
  const score = weightTotal === 0 ? 0 : weightedSum / weightTotal
  return {
    pass: requiredPass,
    score,
    reasoning: requiredPass ? 'All required graders passed.' : 'At least one required grader failed.',
  }
}

export const gradeEvalRows = async (input: GradeEvalInput): Promise<void> => {
  const rows = await loadTrialRowsFromPathOrStdin(input.trialsPath)
  let completed = 0
  let nextIndex = 0
  let stdoutChain = Promise.resolve()
  const total = rows.length

  const worker = async (): Promise<void> => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex]
      nextIndex += 1
      if (row === undefined) {
        continue
      }

      const processSummary = computeProcessSummary(row.trial)
      const normalized: TrialRow = {
        ...row,
        process: processSummary,
        graderResults: [],
        pass: null,
        score: null,
        reasoning: null,
      }
      for (const grader of input.graders) {
        const shouldRun = grader.when === 'completed' ? normalized.trial.result.status === 'completed' : true
        if (!shouldRun) {
          normalized.graderResults.push(
            GraderResultSchema.parse({
              id: grader.id,
              type: grader.type,
              required: grader.required ?? true,
              weight: grader.weight ?? 1,
              skipped: true,
              pass: null,
              score: null,
              reasoning: `Skipped because when='completed' and trial status is '${normalized.trial.result.status}'.`,
              metadata: grader.metadata,
            }),
          )
          continue
        }

        if (grader.type === 'process') {
          normalized.graderResults.push(runProcessGrader(normalized, grader))
          continue
        }
        if (grader.type === 'json') {
          normalized.graderResults.push(runJsonGrader(grader))
          continue
        }

        const cwd = input.cwdOverride === undefined ? normalized.trial.cwd : resolve(process.cwd(), input.cwdOverride)
        const result = await runCommandGrader({
          grader,
          row: normalized,
          previousResults: normalized.graderResults,
          cwd,
        })
        normalized.graderResults.push(result)
      }

      const overall = computeOverall(normalized)
      normalized.pass = overall.pass
      normalized.score = overall.score
      normalized.reasoning = overall.reasoning

      const validated = TrialResultRowSchema.parse(normalized)
      stdoutChain = stdoutChain.then(async () => {
        process.stdout.write(`${JSON.stringify(validated)}\n`)
      })
      await stdoutChain

      completed += 1
      if (!input.quiet) {
        process.stderr.write(`Completed ${completed}/${total}\n`)
      }
    }
  }

  const concurrency = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY)
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length || 1) }, () => worker()))
}

const requireGradedRows = (rows: TrialRow[], pathLabel: string): TrialRow[] => {
  for (const row of rows) {
    if (row.pass === null || row.score === null) {
      throw new CliError(`compare mode requires graded rows (${pathLabel}).`, 2)
    }
  }
  return rows
}

const resolveDuplicates = (rows: TrialRow[], policy: CompareEvalInput['duplicatePolicy'], side: string): TrialRow[] => {
  const map = new Map<string, TrialRow[]>()
  for (const row of rows) {
    const key = `${row.runId}:${row.taskId}:${row.trialIndex}`
    const list = map.get(key) ?? []
    list.push(row)
    map.set(key, list)
  }

  const resolved: TrialRow[] = []
  for (const [key, entries] of map.entries()) {
    if (entries.length === 1) {
      resolved.push(entries[0] as TrialRow)
      continue
    }
    if (policy === 'error') {
      throw new CliError(`Duplicate row identity '${key}' found in ${side}.`, 2)
    }
    if (policy === 'count') {
      resolved.push(...entries)
      continue
    }
    resolved.push(policy === 'first' ? (entries[0] as TrialRow) : (entries[entries.length - 1] as TrialRow))
  }
  return stableSort(resolved, (row) => `${row.taskId}:${row.trialIndex}:${row.trialId}`)
}

const calculateExactPassAtK = (params: { n: number; c: number; k: number }): number | null => {
  if (params.n < params.k) {
    return null
  }
  const combination = (n: number, r: number): number => {
    if (r < 0 || r > n) return 0
    if (r === 0 || r === n) return 1
    let numerator = 1
    let denominator = 1
    for (let i = 1; i <= r; i += 1) {
      numerator *= n - (r - i)
      denominator *= i
    }
    return numerator / denominator
  }
  return 1 - combination(params.n - params.c, params.k) / combination(params.n, params.k)
}

const summarizeRows = (rows: TrialRow[], k: number): JsonObject => {
  const passCount = rows.filter((row) => row.pass === true).length
  const scoreValues = rows.map((row) => row.score ?? 0)
  const avgScore =
    scoreValues.length === 0 ? 0 : scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
  const taskGroups = new Map<string, TrialRow[]>()
  for (const row of rows) {
    const list = taskGroups.get(row.taskId) ?? []
    list.push(row)
    taskGroups.set(row.taskId, list)
  }
  const taskMetrics = [...taskGroups.entries()].map(([taskId, taskRows]) => {
    const n = taskRows.length
    const c = taskRows.filter((row) => row.pass === true).length
    return { taskId, exactPassAtK: calculateExactPassAtK({ n, c, k }), passAllK: c === n, n, c }
  })

  const durations = rows.map((row) => row.trial.invocation.durationMs)
  const completedDurations = rows
    .filter((row) => row.trial.result.status === 'completed')
    .map((row) => row.trial.invocation.durationMs)
  const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
    return sorted[index] ?? 0
  }
  const summarizeDuration = (values: number[]): JsonObject => {
    if (values.length === 0) {
      return { avg: 0, median: 0, p95: 0, min: 0, max: 0, count: 0 }
    }
    const sorted = [...values].sort((a, b) => a - b)
    const sum = sorted.reduce((acc, value) => acc + value, 0)
    return {
      avg: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p95: percentile(sorted, 95),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      count: sorted.length,
    }
  }

  return {
    rowCount: rows.length,
    passCount,
    passRate: rows.length === 0 ? 0 : passCount / rows.length,
    averageScore: avgScore,
    exactPassAtKByTask: taskMetrics,
    durationAll: summarizeDuration(durations),
    durationCompleted: summarizeDuration(completedDurations),
  }
}

const bootstrapConfidenceInterval = (values: number[], samples = 1000): [number, number] => {
  if (values.length === 0) {
    return [0, 0]
  }
  if (values.length === 1) {
    const value = values[0] ?? 0
    return [value, value]
  }

  const means: number[] = []
  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    const picked: number[] = []
    for (let index = 0; index < values.length; index += 1) {
      const pick = values[Math.floor(Math.random() * values.length)] ?? 0
      picked.push(pick)
    }
    const mean = picked.reduce((sum, value) => sum + value, 0) / picked.length
    means.push(mean)
  }
  means.sort((a, b) => a - b)
  const lowerIndex = Math.floor(0.025 * means.length)
  const upperIndex = Math.floor(0.975 * means.length)
  return [means[lowerIndex] ?? 0, means[upperIndex] ?? 0]
}

export const compareEvalRuns = async (input: CompareEvalInput): Promise<JsonObject> => {
  const baselineRows = requireGradedRows(
    (await loadTrialRowsFromPathOrStdin(input.baselinePath)).map((row) => TrialResultRowSchema.parse(row)),
    'baseline',
  )
  const challengerRows = requireGradedRows(
    (await loadTrialRowsFromPathOrStdin(input.challengerPath)).map((row) => TrialResultRowSchema.parse(row)),
    'challenger',
  )
  const baseline = resolveDuplicates(baselineRows, input.duplicatePolicy, 'baseline')
  const challenger = resolveDuplicates(challengerRows, input.duplicatePolicy, 'challenger')

  const baselineByTask = new Map<string, TrialRow[]>()
  for (const row of baseline) {
    const list = baselineByTask.get(row.taskId) ?? []
    list.push(row)
    baselineByTask.set(row.taskId, list)
  }
  const challengerByTask = new Map<string, TrialRow[]>()
  for (const row of challenger) {
    const list = challengerByTask.get(row.taskId) ?? []
    list.push(row)
    challengerByTask.set(row.taskId, list)
  }
  const taskIds = new Set([...baselineByTask.keys(), ...challengerByTask.keys()])
  const comparableTaskIds = [...taskIds].filter((taskId) => baselineByTask.has(taskId) && challengerByTask.has(taskId))
  const baselineOnly = [...taskIds].filter((taskId) => baselineByTask.has(taskId) && !challengerByTask.has(taskId))
  const challengerOnly = [...taskIds].filter((taskId) => !baselineByTask.has(taskId) && challengerByTask.has(taskId))

  const graderSet = (rows: TrialRow[]): string[] => [
    ...new Set(rows.flatMap((row) => row.graderResults.map((result) => result.id))),
  ]
  const baselineGraders = graderSet(baseline)
  const challengerGraders = graderSet(challenger)
  const graderSetsMatch =
    baselineGraders.length === challengerGraders.length && baselineGraders.every((id) => challengerGraders.includes(id))

  if (input.strictGraders && !graderSetsMatch) {
    throw new CliError('Grader id sets differ between baseline and challenger with strictGraders=true.', 2)
  }

  const perTask = comparableTaskIds.map((taskId) => {
    const baselineRowsForTask = baselineByTask.get(taskId) ?? []
    const challengerRowsForTask = challengerByTask.get(taskId) ?? []
    const baselinePassRate =
      baselineRowsForTask.length === 0
        ? 0
        : baselineRowsForTask.filter((row) => row.pass === true).length / baselineRowsForTask.length
    const challengerPassRate =
      challengerRowsForTask.length === 0
        ? 0
        : challengerRowsForTask.filter((row) => row.pass === true).length / challengerRowsForTask.length
    return {
      taskId,
      baselinePassRate,
      challengerPassRate,
      winner:
        challengerPassRate > baselinePassRate
          ? 'challenger'
          : baselinePassRate > challengerPassRate
            ? 'baseline'
            : 'tie',
    }
  })

  const passRateDeltas = perTask.map((item) => item.challengerPassRate - item.baselinePassRate)
  const scoreDeltaRows = comparableTaskIds.map((taskId) => {
    const baselineRowsForTask = baselineByTask.get(taskId) ?? []
    const challengerRowsForTask = challengerByTask.get(taskId) ?? []
    const baselineScore =
      baselineRowsForTask.length === 0
        ? 0
        : baselineRowsForTask.reduce((sum, row) => sum + (row.score ?? 0), 0) / baselineRowsForTask.length
    const challengerScore =
      challengerRowsForTask.length === 0
        ? 0
        : challengerRowsForTask.reduce((sum, row) => sum + (row.score ?? 0), 0) / challengerRowsForTask.length
    return challengerScore - baselineScore
  })
  const passRateDeltaMean =
    passRateDeltas.length === 0 ? 0 : passRateDeltas.reduce((sum, value) => sum + value, 0) / passRateDeltas.length
  const scoreDeltaMean =
    scoreDeltaRows.length === 0 ? 0 : scoreDeltaRows.reduce((sum, value) => sum + value, 0) / scoreDeltaRows.length

  const output = {
    mode: 'compare',
    baseline: {
      label: input.baselineLabel ?? sanitizeLabelPart(baseline[0]?.label ?? 'baseline'),
      ...summarizeRows(baseline, input.k),
      graderIds: baselineGraders,
    },
    challenger: {
      label: input.challengerLabel ?? sanitizeLabelPart(challenger[0]?.label ?? 'challenger'),
      ...summarizeRows(challenger, input.k),
      graderIds: challengerGraders,
    },
    comparable: {
      taskCount: comparableTaskIds.length,
      baselineOnlyTaskIds: baselineOnly,
      challengerOnlyTaskIds: challengerOnly,
      perTask,
      statistics: {
        passRateDelta: passRateDeltaMean,
        passRateDeltaCI95: bootstrapConfidenceInterval(passRateDeltas),
        scoreDelta: scoreDeltaMean,
        scoreDeltaCI95: bootstrapConfidenceInterval(scoreDeltaRows),
      },
    },
    warnings: graderSetsMatch ? [] : ['Grader id sets differ between baseline and challenger.'],
  } satisfies JsonObject

  return output
}

const simpleSeededRandom = (seedInput: string): (() => number) => {
  let seed = Number.parseInt(sha256(seedInput).slice(0, 8), 16)
  return () => {
    seed = (seed * 1664525 + 1013904223) % 0x100000000
    return seed / 0x100000000
  }
}

const selectDiagnosticTrajectory = (trajectory: TrajectoryEvent[], maxEvents: number): TrajectoryEvent[] => {
  if (trajectory.length <= maxEvents) {
    return trajectory
  }
  const selectedIndices = new Set<number>([0, trajectory.length - 1])
  for (const [index, event] of trajectory.entries()) {
    if (event.type === 'error') selectedIndices.add(index)
    if (event.type === 'tool_call' && event.status === 'failed') selectedIndices.add(index)
    if (event.type === 'command' && (event.status === 'failed' || event.status === 'timed_out')) {
      selectedIndices.add(index)
    }
  }
  if (selectedIndices.size < maxEvents) {
    const step = Math.max(1, Math.floor(trajectory.length / maxEvents))
    for (let index = step; index < trajectory.length && selectedIndices.size < maxEvents; index += step) {
      selectedIndices.add(index)
    }
  }
  return [...selectedIndices]
    .sort((a, b) => a - b)
    .slice(0, maxEvents)
    .map((index) => trajectory[index])
    .filter((value): value is TrajectoryEvent => value !== undefined)
}

export const calibrateEvalRun = async (input: CalibrateEvalInput): Promise<JsonObject> => {
  const rowsWithLine = input.trialsPath === undefined ? await readRowsFromStdin() : await loadJsonl(input.trialsPath)
  const rows = rowsWithLine.map((row) => {
    const parsed = TrialResultRowSchema.safeParse(row.value)
    if (!parsed.success) {
      throw new CliError(`Invalid trial row at line ${row.line}: ${z.prettifyError(parsed.error)}`, 2)
    }
    if (parsed.data.graderResults.length === 0 || parsed.data.pass === null || parsed.data.score === null) {
      throw new CliError(
        'calibrate mode requires graded rows with non-null pass/score and at least one grader result.',
        2,
      )
    }
    return { line: row.line, row: parsed.data }
  })

  const focusRows = rows.filter(({ row }) => {
    if (input.focus === 'required_failures') {
      return row.graderResults.some((result) => result.required && result.pass === false)
    }
    if (input.focus === 'all_failures') {
      return row.pass === false
    }
    return true
  })

  const passRows = focusRows.filter(({ row }) => row.pass === true)
  const failRows = focusRows.filter(({ row }) => row.pass === false)
  const seedValue = String(
    input.seed ?? `${input.trialsPath ?? 'stdin'}:${input.focus}:${input.sample}:${input.graderId ?? 'overall'}`,
  )
  const rng = simpleSeededRandom(seedValue)
  const shuffle = <T>(items: T[]): T[] => [...items].sort(() => rng() - 0.5)
  const stratified =
    input.focus === 'all'
      ? [
          ...shuffle(passRows).slice(0, Math.ceil(input.sample / 2)),
          ...shuffle(failRows).slice(0, Math.floor(input.sample / 2)),
        ]
      : shuffle(focusRows).slice(0, input.sample)
  const chosen = shuffle(stratified).slice(0, input.sample)

  const warnings: string[] = []
  if (input.sample > focusRows.length) {
    warnings.push(`Requested sample=${input.sample} but only ${focusRows.length} candidates were available.`)
  }

  const samples = chosen.map(({ row, line }) => {
    const focusedGrader =
      input.graderId === undefined ? null : (row.graderResults.find((result) => result.id === input.graderId) ?? null)
    const reviewTarget: JsonObject =
      input.graderId === undefined
        ? { kind: 'overall', decision: row.pass === true }
        : { kind: 'grader', graderId: input.graderId, decision: focusedGrader?.pass === true }
    const trajectory =
      input.trajectoryMode === 'none'
        ? []
        : input.trajectoryMode === 'full'
          ? row.trial.trajectory
          : selectDiagnosticTrajectory(row.trial.trajectory, input.maxEventsPerSample)

    return {
      source: {
        path: input.trialsPath ?? null,
        line,
        runId: row.runId,
        taskId: row.taskId,
        trialIndex: row.trialIndex,
        trialId: row.trialId,
      },
      reviewTarget,
      trial: {
        task: { prompts: row.trial.task.prompts },
        result: row.trial.result,
      },
      process: row.process,
      graderResults: row.graderResults,
      focusedGraderResult: focusedGrader,
      trajectory,
      finalMessage: row.trial.result.message ?? null,
      invocation: row.trial.invocation,
    }
  })

  return {
    mode: 'calibrate',
    source: {
      path: input.trialsPath ?? null,
      totalRows: rows.length,
    },
    focus: input.focus,
    reviewProtocol:
      'For each sample, verify whether the decision target is correct. Use needs_human when evidence is insufficient.',
    reviewResponseContract: {
      type: 'object',
      required: ['label', 'confidence', 'reasoning'],
      labels: ['correct_accept', 'incorrect_accept', 'correct_reject', 'incorrect_reject', 'ambiguous', 'needs_human'],
      needsHumanRule: 'needsHumanReason is required when label=needs_human',
    },
    samples,
    warnings,
  } satisfies JsonObject
}

const parseSchemaTarget = (args: string[]): SchemaTarget | null => {
  const schemaIndex = args.indexOf('--schema')
  if (schemaIndex === -1) {
    return null
  }
  const target = args[schemaIndex + 1]
  if (target === undefined) {
    console.error('Missing schema target.')
    process.exit(2)
  }
  if (!SCHEMA_TARGETS.includes(target as SchemaTarget)) {
    console.error(`Invalid schema target '${target}'.`)
    process.exit(2)
  }
  return target as SchemaTarget
}

const schemaForTarget = (target: SchemaTarget): z.ZodType => {
  switch (target) {
    case 'input':
      return EvalInputSchema
    case 'output':
      return EvalOutputSchema
    case 'run-input':
      return RunEvalInputSchema
    case 'grade-input':
      return GradeEvalInputSchema
    case 'compare-input':
      return CompareEvalInputSchema
    case 'calibrate-input':
      return CalibrateEvalInputSchema
    case 'trial-row':
      return TrialResultRowSchema
    case 'task':
      return TaskSchema
    case 'adapter-input':
      return AdapterInputSchema
    case 'adapter-output':
      return AdapterOutputSchema
    case 'grader-input':
      return GraderInputSchema
    case 'grader-output':
      return GraderOutputSchema
  }
}

const emitSchema = (target: SchemaTarget): void => {
  const schema = schemaForTarget(target)
  console.log(JSON.stringify(z.toJSONSchema(schema), null, 2))
}

const createDryRunSummary = async (input: z.infer<typeof EvalInputSchema>): Promise<JsonObject> => {
  if (input.mode === 'run') {
    const tasks = await loadTasks(input.tasksPath)
    const executable = input.adapter.command[0]
    if (executable !== undefined && looksLikePath(executable)) {
      const resolvedExecutable = resolve(process.cwd(), executable)
      const exists = await Bun.file(resolvedExecutable).exists()
      if (!exists) {
        throw new CliError(`Adapter command path does not exist: ${executable}`, 2)
      }
    }
    return {
      tasksPath: input.tasksPath,
      taskCount: tasks.length,
      runId: input.runId ?? generateRunId(input.label ?? inferLabel(input.adapter.command)),
      label: input.label ?? inferLabel(input.adapter.command),
      cwd: resolve(process.cwd(), input.cwd ?? process.cwd()),
      command: input.adapter.command,
      resolvedCommand: resolveCommand(input.adapter.command),
      k: input.k,
      concurrency: input.concurrency,
    }
  }
  if (input.mode === 'grade') {
    if (input.trialsPath !== undefined) {
      await loadJsonl(input.trialsPath)
    }
    return {
      source: input.trialsPath ?? 'stdin',
      concurrency: input.concurrency,
      graderCount: input.graders.length,
      cwdOverride: input.cwdOverride ?? null,
    }
  }
  if (input.mode === 'compare') {
    return {
      baselinePath: input.baselinePath,
      challengerPath: input.challengerPath,
      k: input.k,
      duplicatePolicy: input.duplicatePolicy,
      strictGraders: input.strictGraders,
    }
  }
  return {
    source: input.trialsPath ?? 'stdin',
    focus: input.focus,
    sample: input.sample,
    graderId: input.graderId ?? null,
  }
}

export const runEval = async (input: z.infer<typeof EvalInputSchema>): Promise<void> => {
  if (input.mode === 'run') {
    await runEvalTrials(input)
    return
  }
  if (input.mode === 'grade') {
    await gradeEvalRows(input)
    return
  }
  if (input.mode === 'compare') {
    const result = await compareEvalRuns(input)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  const result = await calibrateEvalRun(input)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const evalCli = async (args: string[]): Promise<void> => {
  const helpRequested = args.includes('--help') || args.includes('-h')
  if (helpRequested) {
    console.error("Usage: agent-eval-harness eval '<json>' [--dry-run] [--human] [--schema <target>]")
    process.exit(0)
  }

  const schemaTarget = parseSchemaTarget(args)
  if (schemaTarget !== null) {
    emitSchema(schemaTarget)
    process.exit(0)
  }

  const dryRun = args.includes('--dry-run')
  const human = args.includes('--human')
  const filteredArgs = args.filter((arg, idx) => {
    if (arg === '--dry-run' || arg === '--human') {
      return false
    }
    const previous = args[idx - 1]
    if (previous === '--schema') {
      return false
    }
    return arg !== '--schema'
  })

  let rawInput: unknown
  try {
    rawInput = await readJsonInput(filteredArgs)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(2)
  }

  const parsed = EvalInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    console.error(JSON.stringify(parsed.error.issues, null, 2))
    process.exit(2)
  }

  if (human && (parsed.data.mode === 'run' || parsed.data.mode === 'grade')) {
    console.error('--human is not supported for streaming modes run/grade.')
    process.exit(2)
  }

  if (dryRun) {
    try {
      const summary = await createDryRunSummary(parsed.data)
      const response = DryRunOutputSchema.parse({
        mode: 'dry_run',
        commandMode: parsed.data.mode,
        summary,
      })
      console.log(JSON.stringify(response, null, 2))
      return
    } catch (error) {
      if (error instanceof CliError) {
        console.error(error.message)
        process.exit(error.exitCode)
      }
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  try {
    if (human && parsed.data.mode === 'compare') {
      const report = await compareEvalRuns(parsed.data)
      const baseline = report.baseline as JsonObject
      const challenger = report.challenger as JsonObject
      const comparable = report.comparable as JsonObject
      const lines = [
        `Baseline: ${String(baseline.label ?? 'baseline')} passRate=${Number(baseline.passRate ?? 0).toFixed(3)} score=${Number(baseline.averageScore ?? 0).toFixed(3)}`,
        `Challenger: ${String(challenger.label ?? 'challenger')} passRate=${Number(challenger.passRate ?? 0).toFixed(3)} score=${Number(challenger.averageScore ?? 0).toFixed(3)}`,
        `Comparable tasks: ${String(comparable.taskCount ?? 0)}`,
      ]
      process.stdout.write(`${lines.join('\n')}\n`)
      return
    }

    await runEval(parsed.data)
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message)
      process.exit(error.exitCode)
    }
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
