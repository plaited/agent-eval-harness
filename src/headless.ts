/**
 * Headless ACP adapter factory - schema-driven adapter for any CLI agent.
 *
 * @remarks
 * Re-exports public API from the headless module. The headless adapter enables
 * capturing trajectories from ANY headless CLI agent by defining a schema
 * that describes how to interact with the CLI.
 *
 * **CLI Usage:**
 * ```bash
 * acp-harness headless --schema ./my-agent.json
 * ```
 *
 * **Programmatic Usage:**
 * ```typescript
 * import { parseHeadlessConfig, createSessionManager } from '@plaited/acp-harness/headless'
 *
 * const schema = parseHeadlessConfig(jsonConfig)
 * const sessions = createSessionManager({ schema })
 * ```
 *
 * @packageDocumentation
 */

// Schema definitions and parsing
export {
  HeadlessAdapterSchema,
  OutputConfigSchema,
  OutputEventExtractSchema,
  OutputEventMappingSchema,
  OutputEventMatchSchema,
  PromptConfigSchema,
  parseHeadlessConfig,
  ResultConfigSchema,
  ResumeConfigSchema,
  safeParseHeadlessConfig,
} from './headless.schemas.ts'
// Types
export type {
  HeadlessAdapterConfig,
  OutputConfig,
  OutputEventExtract,
  OutputEventMapping,
  OutputEventMatch,
  PromptConfig,
  ResultConfig,
  ResumeConfig,
} from './headless.types.ts'
// CLI entry point
export { headless } from './headless-cli.ts'
export type { HistoryBuilder, HistoryBuilderConfig, HistoryTurn } from './headless-history-builder.ts'
// History builder
export { createHistoryBuilder } from './headless-history-builder.ts'
export type {
  OutputParser,
  ParsedResult,
  ParsedUpdate,
  ResultParseResult,
  SessionUpdateType,
} from './headless-output-parser.ts'
// Output parser
export { createOutputParser, jsonPath, jsonPathString } from './headless-output-parser.ts'
export type {
  PromptResult,
  Session,
  SessionManager,
  SessionManagerConfig,
  UpdateCallback,
} from './headless-session-manager.ts'
// Session manager
export { createSessionManager } from './headless-session-manager.ts'
