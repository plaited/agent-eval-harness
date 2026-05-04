import * as z from 'zod'
import {
  DEFAULT_CALIBRATE_LOG_BYTES,
  DEFAULT_CONCURRENCY,
  DEFAULT_K,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  SCHEMA_VERSION,
} from './eval.constants.ts'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
)
export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), JsonValueSchema)

export const CommandSpecSchema = z
  .object({
    command: z.array(z.string().min(1)).min(1).describe('Command argv array. First element is executable.'),
    timeoutMs: z.number().int().positive().optional().default(DEFAULT_TIMEOUT_MS),
    maxOutputBytes: z.number().int().positive().optional().default(DEFAULT_MAX_OUTPUT_BYTES),
    config: JsonObjectSchema.optional(),
  })
  .strict()
  .describe('Harness command invocation spec.')

export const TaskSchema = z
  .object({
    id: z.string().trim().min(1).describe('Stable task id. Unique within one tasks JSONL file.'),
    prompts: z.array(z.string().min(1)).min(1).describe('Prompt turns in order.'),
    cwd: z.string().min(1).optional().describe('Optional trial cwd, absolute or relative to run cwd.'),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()
  .describe('Task row consumed by run mode from tasks JSONL.')

const BaseAdapterFailureKindSchema = z.enum([
  'adapter_exit_nonzero',
  'adapter_invalid_json',
  'adapter_invalid_result',
  'adapter_timed_out',
  'adapter_spawn_failed',
  'harness_error',
])

export const MessageEventSchema = z
  .object({
    type: z.literal('message'),
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string(),
    timestamp: z.string().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const ToolCallEventSchema = z
  .object({
    type: z.literal('tool_call'),
    name: z.string().min(1),
    status: z.enum(['started', 'completed', 'failed']),
    input: JsonValueSchema.optional(),
    output: JsonValueSchema.optional(),
    timestamp: z.string().optional(),
    durationMs: z.number().nonnegative().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const CommandEventSchema = z
  .object({
    type: z.literal('command'),
    command: z.array(z.string()).min(1),
    cwd: z.string().optional(),
    status: z.enum(['started', 'completed', 'failed', 'timed_out']),
    exitCode: z.number().nullable().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    timestamp: z.string().optional(),
    durationMs: z.number().nonnegative().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const ErrorEventSchema = z
  .object({
    type: z.literal('error'),
    message: z.string().min(1),
    timestamp: z.string().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const TrajectoryEventSchema = z.discriminatedUnion('type', [
  MessageEventSchema,
  ToolCallEventSchema,
  CommandEventSchema,
  ErrorEventSchema,
])

export const AdapterInputSchema = z
  .object({
    runId: z.string().min(1),
    label: z.string().nullable(),
    task: TaskSchema,
    trialId: z.string().min(1),
    trialIndex: z.number().int().nonnegative(),
    cwd: z.string().min(1),
    config: JsonObjectSchema.optional(),
  })
  .strict()
  .describe('JSON contract sent to adapter stdin.')

export const CompletedTrialResultPayloadSchema = z
  .object({
    status: z.literal('completed'),
    message: z.string().min(1),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const FailedTrialResultPayloadSchema = z
  .object({
    status: z.enum(['failed', 'timed_out', 'cancelled']),
    message: z.string().optional(),
    error: z.string().min(1),
    failureKind: BaseAdapterFailureKindSchema,
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const TrialResultPayloadSchema = z.discriminatedUnion('status', [
  CompletedTrialResultPayloadSchema,
  FailedTrialResultPayloadSchema,
])

export const AdapterOutputSchema = z
  .object({
    result: TrialResultPayloadSchema,
    trajectory: z.array(TrajectoryEventSchema),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()
  .describe('JSON contract emitted by adapter stdout.')

export const CommandInvocationSchema = z
  .object({
    command: z.array(z.string()).min(1),
    resolvedCommand: z.array(z.string()).min(1),
    exitCode: z.number().nullable(),
    signalCode: z.union([z.string(), z.number()]).nullable(),
    timedOut: z.boolean(),
    durationMs: z.number().nonnegative(),
    startedAt: z.string(),
    completedAt: z.string(),
    stdinBytes: z.number().int().nonnegative(),
    stdinSha256: z.string(),
    stdoutBytes: z.number().int().nonnegative(),
    stderrBytes: z.number().int().nonnegative(),
    stdoutTruncated: z.boolean(),
    stderrTruncated: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
  })
  .strict()

export const NormalizedTaskSchema = TaskSchema.extend({
  source: z
    .object({
      path: z.string().min(1),
      resolvedPath: z.string().min(1),
      line: z.number().int().positive(),
    })
    .strict(),
}).strict()

export const TrialSchema = z
  .object({
    id: z.string().min(1),
    cwd: z.string().min(1),
    task: NormalizedTaskSchema,
    result: TrialResultPayloadSchema,
    trajectory: z.array(TrajectoryEventSchema),
    invocation: CommandInvocationSchema,
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const ProcessSummarySchema = z
  .object({
    eventCount: z.number().int().nonnegative(),
    messageCount: z.number().int().nonnegative(),
    toolCallCount: z.number().int().nonnegative(),
    commandCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    failedToolCallCount: z.number().int().nonnegative(),
    failedCommandCount: z.number().int().nonnegative(),
    timedOutCommandCount: z.number().int().nonnegative(),
    adapterTimedOut: z.boolean(),
    adapterExitCodeNonZero: z.boolean(),
    runtimeErrorDetected: z.boolean(),
    workerFailureDetected: z.boolean(),
    repeatedToolCallCount: z.number().int().nonnegative(),
    maxRepeatedToolCallNameCount: z.number().int().nonnegative(),
  })
  .strict()

export const GraderResultSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['process', 'command', 'json']),
    required: z.boolean(),
    weight: z.number().positive(),
    skipped: z.boolean(),
    pass: z.boolean().nullable(),
    score: z.number().min(0).max(1).nullable(),
    reasoning: z.string().nullable(),
    outcome: JsonObjectSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()

export const TrialResultRowSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    type: z.literal('trial_result'),
    harness: z
      .object({
        name: z.literal('@plaited/agent-eval-harness'),
        version: z.string().min(1),
      })
      .strict(),
    runId: z.string().min(1),
    label: z.string().nullable(),
    taskId: z.string().min(1),
    trialIndex: z.number().int().nonnegative(),
    trialId: z.string().min(1),
    createdAt: z.string(),
    completedAt: z.string(),
    trial: TrialSchema,
    process: ProcessSummarySchema,
    graderResults: z.array(GraderResultSchema),
    pass: z.boolean().nullable(),
    score: z.number().min(0).max(1).nullable(),
    reasoning: z.string().nullable(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()
  .describe('One trial result row. run/grade stream exactly one row per line.')

export const GraderInputSchema = z
  .object({
    row: TrialResultRowSchema,
    trial: TrialSchema,
    process: ProcessSummarySchema,
    previousResults: z.array(GraderResultSchema),
    cwd: z.string().min(1),
    config: JsonObjectSchema.optional(),
  })
  .strict()
  .describe('JSON contract sent to command graders on stdin.')

export const GraderOutputSchema = z
  .object({
    pass: z.boolean(),
    score: z.number().min(0).max(1),
    reasoning: z.string().optional(),
    outcome: JsonObjectSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict()
  .describe('JSON contract expected from command grader stdout in grader_json mode.')

export const ProcessGraderDefinitionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('process'),
    required: z.boolean().optional().default(true),
    weight: z.number().positive().optional().default(1),
    when: z.enum(['always', 'completed']).optional().default('always'),
    metadata: JsonObjectSchema.optional(),
    options: z
      .object({
        failOnNonCompletedStatus: z.boolean().optional(),
        failOnErrorEvents: z.boolean().optional(),
        failOnFailedOrTimedOutCommands: z.boolean().optional(),
        failOnFailedToolCalls: z.boolean().optional(),
        maxToolCalls: z.number().int().nonnegative().optional(),
        maxCommands: z.number().int().nonnegative().optional(),
        maxRepeatedToolCallNameCount: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const CommandGraderDefinitionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('command'),
    required: z.boolean().optional().default(true),
    weight: z.number().positive().optional().default(1),
    when: z.enum(['always', 'completed']).optional().default('always'),
    metadata: JsonObjectSchema.optional(),
    options: CommandSpecSchema.extend({
      output: z.enum(['exit_code', 'grader_json']).optional().default('exit_code'),
    }).strict(),
  })
  .strict()

export const JsonGraderDefinitionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('json'),
    required: z.boolean().optional().default(true),
    weight: z.number().positive().optional().default(1),
    when: z.enum(['always', 'completed']).optional().default('always'),
    metadata: JsonObjectSchema.optional(),
    result: GraderOutputSchema,
  })
  .strict()

export const GraderDefinitionSchema = z.discriminatedUnion('type', [
  ProcessGraderDefinitionSchema,
  CommandGraderDefinitionSchema,
  JsonGraderDefinitionSchema,
])

export const RunEvalInputSchema = z
  .object({
    mode: z.literal('run'),
    tasksPath: z.string().min(1),
    adapter: CommandSpecSchema,
    k: z.number().int().positive().optional().default(DEFAULT_K),
    concurrency: z.number().int().positive().optional().default(DEFAULT_CONCURRENCY),
    cwd: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
    metadata: JsonObjectSchema.optional(),
    quiet: z.boolean().optional().default(false),
  })
  .strict()

export const GradeEvalInputSchema = z
  .object({
    mode: z.literal('grade'),
    trialsPath: z.string().min(1).optional(),
    graders: z.array(GraderDefinitionSchema).min(1),
    concurrency: z.number().int().positive().optional().default(DEFAULT_CONCURRENCY),
    cwdOverride: z.string().min(1).optional(),
    quiet: z.boolean().optional().default(false),
  })
  .strict()

export const CompareEvalInputSchema = z
  .object({
    mode: z.literal('compare'),
    baselinePath: z.string().min(1),
    challengerPath: z.string().min(1),
    baselineLabel: z.string().min(1).optional(),
    challengerLabel: z.string().min(1).optional(),
    k: z.number().int().positive().optional().default(DEFAULT_K),
    duplicatePolicy: z.enum(['error', 'first', 'last', 'count']).optional().default('error'),
    strictGraders: z.boolean().optional().default(false),
  })
  .strict()

export const CalibrateEvalInputSchema = z
  .object({
    mode: z.literal('calibrate'),
    trialsPath: z.string().min(1).optional(),
    focus: z.enum(['all', 'required_failures', 'all_failures']).optional().default('all'),
    sample: z.number().int().positive().optional().default(20),
    seed: z.union([z.string(), z.number()]).optional(),
    graderId: z.string().min(1).optional(),
    trajectoryMode: z.enum(['diagnostic', 'full', 'none']).optional().default('diagnostic'),
    maxEventsPerSample: z.number().int().positive().optional().default(12),
    includeLogs: z.boolean().optional().default(false),
    logBytes: z.number().int().positive().optional().default(DEFAULT_CALIBRATE_LOG_BYTES),
  })
  .strict()

export const EvalInputSchema = z.discriminatedUnion('mode', [
  RunEvalInputSchema,
  GradeEvalInputSchema,
  CompareEvalInputSchema,
  CalibrateEvalInputSchema,
])

export const DryRunOutputSchema = z
  .object({
    mode: z.literal('dry_run'),
    commandMode: z.enum(['run', 'grade', 'compare', 'calibrate']),
    summary: JsonObjectSchema,
  })
  .strict()

export const CompareEvalOutputSchema = z
  .object({
    mode: z.literal('compare'),
    baseline: JsonObjectSchema,
    challenger: JsonObjectSchema,
    comparable: JsonObjectSchema,
    warnings: z.array(z.string()),
  })
  .strict()

export const CalibrateEvalOutputSchema = z
  .object({
    mode: z.literal('calibrate'),
    source: z.object({ path: z.string().nullable(), totalRows: z.number().int().nonnegative() }).strict(),
    focus: z.enum(['all', 'required_failures', 'all_failures']),
    reviewProtocol: z.string(),
    reviewResponseContract: JsonObjectSchema,
    samples: z.array(JsonObjectSchema),
    warnings: z.array(z.string()),
  })
  .strict()

export const EvalOutputSchema = z
  .object({
    streamingModes: z
      .array(z.enum(['run', 'grade']))
      .describe('Streaming modes emit one compact trial_result JSON object per stdout line (JSONL).'),
    boundedModes: z
      .array(z.enum(['compare', 'calibrate', 'dry_run']))
      .describe('Bounded modes emit one JSON object to stdout.'),
    trialRowSchema: z.literal('Use --schema trial-row for streaming row shape.'),
  })
  .strict()
  .describe('Top-level output contract guidance for eval modes.')

export const EvalBoundedOutputSchema = z.union([DryRunOutputSchema, CompareEvalOutputSchema, CalibrateEvalOutputSchema])

export const SCHEMA_TARGETS = [
  'input',
  'output',
  'run-input',
  'grade-input',
  'compare-input',
  'calibrate-input',
  'trial-row',
  'task',
  'adapter-input',
  'adapter-output',
  'grader-input',
  'grader-output',
] as const

export type SchemaTarget = (typeof SCHEMA_TARGETS)[number]
