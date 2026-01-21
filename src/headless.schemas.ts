/**
 * Zod schemas for headless ACP adapter configuration.
 *
 * @remarks
 * These schemas define how to interact with ANY headless CLI agent via a
 * schema-driven approach. No hardcoded agent-specific logic - the schema
 * defines everything: command, flags, output parsing rules.
 *
 * @packageDocumentation
 */

import { z } from 'zod'

// ============================================================================
// Output Event Mapping Schema
// ============================================================================

/**
 * Schema for matching CLI output to ACP update types.
 *
 * @remarks
 * Uses JSONPath-like patterns to match events in CLI JSON output
 * and map them to ACP session update types.
 */
export const OutputEventMatchSchema = z.object({
  /** JSONPath to match event type in CLI output (e.g., "$.type") */
  path: z.string(),
  /** Value to match at the path (e.g., "tool_use") */
  value: z.string(),
})

/** Output event match type */
export type OutputEventMatch = z.infer<typeof OutputEventMatchSchema>

/**
 * Schema for extracting content from matched events.
 *
 * @remarks
 * Paths can be:
 * - JSONPath expressions (e.g., "$.message.text")
 * - Literal strings in single quotes (e.g., "'pending'")
 */
export const OutputEventExtractSchema = z.object({
  /** JSONPath to extract main content */
  content: z.string().optional(),
  /** JSONPath to extract title (for tool calls) */
  title: z.string().optional(),
  /** JSONPath to extract status (or literal like "'pending'") */
  status: z.string().optional(),
})

/** Output event extract type */
export type OutputEventExtract = z.infer<typeof OutputEventExtractSchema>

/**
 * Schema for mapping CLI output events to ACP update types.
 *
 * @remarks
 * Each mapping specifies:
 * 1. How to match events (match.path + match.value)
 * 2. What ACP update type to emit (emitAs)
 * 3. What content to extract (extract)
 */
export const OutputEventMappingSchema = z.object({
  /** Matching criteria for CLI output */
  match: OutputEventMatchSchema,
  /** ACP session update type to emit */
  emitAs: z.enum(['thought', 'tool_call', 'message', 'plan']),
  /** Content extraction configuration */
  extract: OutputEventExtractSchema.optional(),
})

/** Output event mapping type */
export type OutputEventMapping = z.infer<typeof OutputEventMappingSchema>

// ============================================================================
// Prompt Configuration Schema
// ============================================================================

/**
 * Schema for how to pass prompts to the CLI.
 */
export const PromptConfigSchema = z.object({
  /** Flag to pass prompt (e.g., "-p", "--prompt"). Omit for stdin. */
  flag: z.string().optional(),
  /** Format for stdin input in stream mode */
  stdinFormat: z.enum(['text', 'json']).optional(),
})

/** Prompt configuration type */
export type PromptConfig = z.infer<typeof PromptConfigSchema>

// ============================================================================
// Output Configuration Schema
// ============================================================================

/**
 * Schema for output format configuration.
 */
export const OutputConfigSchema = z.object({
  /** Flag for output format (e.g., "--output-format") */
  flag: z.string(),
  /** Value for output format (e.g., "stream-json") */
  value: z.string(),
})

/** Output configuration type */
export type OutputConfig = z.infer<typeof OutputConfigSchema>

// ============================================================================
// Resume Configuration Schema
// ============================================================================

/**
 * Schema for session resume support (stream mode).
 */
export const ResumeConfigSchema = z.object({
  /** Flag to resume session (e.g., "--resume") */
  flag: z.string(),
  /** JSONPath to extract session ID from output */
  sessionIdPath: z.string(),
})

/** Resume configuration type */
export type ResumeConfig = z.infer<typeof ResumeConfigSchema>

// ============================================================================
// Result Configuration Schema
// ============================================================================

/**
 * Schema for final result extraction.
 */
export const ResultConfigSchema = z.object({
  /** JSONPath to match result type (e.g., "$.type") */
  matchPath: z.string(),
  /** Value indicating final result (e.g., "result") */
  matchValue: z.string(),
  /** JSONPath to extract result content */
  contentPath: z.string(),
})

/** Result configuration type */
export type ResultConfig = z.infer<typeof ResultConfigSchema>

// ============================================================================
// Main Adapter Schema
// ============================================================================

/**
 * Schema for headless ACP adapter configuration.
 *
 * @remarks
 * This schema defines everything needed to interact with a headless CLI agent:
 * - Command and flags to spawn
 * - How to pass prompts
 * - How to parse output
 * - Session handling mode
 *
 * Example (Claude):
 * ```json
 * {
 *   "version": 1,
 *   "name": "claude-headless",
 *   "command": ["claude"],
 *   "sessionMode": "stream",
 *   "prompt": { "flag": "-p" },
 *   "output": { "flag": "--output-format", "value": "stream-json" },
 *   "outputEvents": [...]
 * }
 * ```
 */
export const HeadlessAdapterSchema = z.object({
  /** Schema version for forward compatibility */
  version: z.literal(1),

  /** Human-readable adapter name */
  name: z.string(),

  /** Base command to spawn (e.g., ["claude"], ["gemini"]) */
  command: z.array(z.string()),

  /**
   * Session mode determines how multi-turn conversations work:
   * - 'stream': Keep process alive, multi-turn via stdin
   * - 'iterative': New process per turn, accumulate context in prompt
   */
  sessionMode: z.enum(['stream', 'iterative']),

  /** How to pass the prompt */
  prompt: PromptConfigSchema,

  /** Output format configuration */
  output: OutputConfigSchema,

  /** Flags for auto-approval in headless mode (e.g., ["--allowedTools", "*"]) */
  autoApprove: z.array(z.string()).optional(),

  /** Session resume support (stream mode only) */
  resume: ResumeConfigSchema.optional(),

  /** Working directory flag (if CLI needs explicit --cwd) */
  cwdFlag: z.string().optional(),

  /** Output event mappings - how to parse CLI output into ACP updates */
  outputEvents: z.array(OutputEventMappingSchema),

  /** Final result extraction configuration */
  result: ResultConfigSchema,

  /** Template for formatting conversation history (iterative mode only) */
  historyTemplate: z.string().optional(),
})

/** Headless adapter configuration type */
export type HeadlessAdapterConfig = z.infer<typeof HeadlessAdapterSchema>

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates and parses a headless adapter configuration.
 *
 * @param config - Raw configuration object (e.g., from JSON file)
 * @returns Validated HeadlessAdapterConfig
 * @throws ZodError if validation fails
 */
export const parseHeadlessConfig = (config: unknown): HeadlessAdapterConfig => {
  return HeadlessAdapterSchema.parse(config)
}

/**
 * Safely validates a headless adapter configuration.
 *
 * @param config - Raw configuration object
 * @returns Result with success/failure and data or error
 */
export const safeParseHeadlessConfig = (config: unknown) => {
  return HeadlessAdapterSchema.safeParse(config)
}
