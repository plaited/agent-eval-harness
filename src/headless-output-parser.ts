/**
 * Generic output parser for headless CLI agents.
 *
 * @remarks
 * Uses schema-defined mappings to convert CLI JSON output into ACP session updates.
 * Supports JSONPath-like expressions for matching and extraction.
 *
 * @packageDocumentation
 */

import type { HeadlessAdapterConfig, OutputEventMapping } from './headless.schemas.ts'

// ============================================================================
// Types
// ============================================================================

/** ACP session update types */
export type SessionUpdateType = 'thought' | 'tool_call' | 'message' | 'plan'

/** Parsed session update from CLI output */
export type ParsedUpdate = {
  type: SessionUpdateType
  content?: string
  title?: string
  status?: string
  raw: unknown
}

/** Result extraction from CLI output */
export type ParsedResult = {
  isResult: true
  content: string
  raw: unknown
}

/** Not a result */
export type NotResult = {
  isResult: false
}

/** Parse result for final output */
export type ResultParseResult = ParsedResult | NotResult

// ============================================================================
// JSONPath Implementation
// ============================================================================

/**
 * Extracts a value from an object using a simple JSONPath expression.
 *
 * @remarks
 * Supports:
 * - `$.field` - Root field access
 * - `$.nested.field` - Nested field access
 * - `'literal'` - Literal string values (single quotes)
 *
 * @param obj - Object to extract from
 * @param path - JSONPath expression
 * @returns Extracted value or undefined
 */
export const jsonPath = (obj: unknown, path: string): unknown => {
  // Handle literal strings (e.g., "'pending'")
  if (path.startsWith("'") && path.endsWith("'")) {
    return path.slice(1, -1)
  }

  // Handle JSONPath expressions (e.g., "$.type", "$.message.text")
  if (!path.startsWith('$.')) {
    return undefined
  }

  const parts = path.slice(2).split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (typeof current !== 'object') {
      return undefined
    }

    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Extracts a string value from an object using JSONPath.
 *
 * @param obj - Object to extract from
 * @param path - JSONPath expression
 * @returns String value or undefined
 */
export const jsonPathString = (obj: unknown, path: string): string | undefined => {
  const value = jsonPath(obj, path)
  if (value === undefined || value === null) {
    return undefined
  }
  return String(value)
}

// ============================================================================
// Output Parser Factory
// ============================================================================

/**
 * Creates an output parser from adapter configuration.
 *
 * @remarks
 * The parser uses the schema's outputEvents mappings to:
 * 1. Match incoming JSON lines against patterns
 * 2. Extract content using JSONPath expressions
 * 3. Emit ACP session update objects
 *
 * @param config - Headless adapter configuration
 * @returns Parser function for individual lines
 */
export const createOutputParser = (config: HeadlessAdapterConfig) => {
  const { outputEvents, result } = config

  /**
   * Parses a single JSON line from CLI output.
   *
   * @param line - JSON string from CLI stdout
   * @returns Parsed update or null if no mapping matches
   */
  const parseLine = (line: string): ParsedUpdate | null => {
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      // Not valid JSON, skip
      return null
    }

    // Try each mapping until one matches
    for (const mapping of outputEvents) {
      const matchValue = jsonPath(event, mapping.match.path)
      // Support wildcard "*" to match any non-null value
      if (mapping.match.value === '*') {
        if (matchValue !== undefined && matchValue !== null) {
          return createUpdate(event, mapping)
        }
      } else if (matchValue === mapping.match.value) {
        return createUpdate(event, mapping)
      }
    }

    return null
  }

  /**
   * Creates a ParsedUpdate from a matched event.
   */
  const createUpdate = (event: unknown, mapping: OutputEventMapping): ParsedUpdate => {
    const update: ParsedUpdate = {
      type: mapping.emitAs,
      raw: event,
    }

    if (mapping.extract) {
      if (mapping.extract.content) {
        update.content = jsonPathString(event, mapping.extract.content)
      }
      if (mapping.extract.title) {
        update.title = jsonPathString(event, mapping.extract.title)
      }
      if (mapping.extract.status) {
        update.status = jsonPathString(event, mapping.extract.status)
      }
    }

    return update
  }

  /**
   * Checks if a JSON line represents the final result.
   *
   * @param line - JSON string from CLI stdout
   * @returns Result extraction or indication that it's not a result
   */
  const parseResult = (line: string): ResultParseResult => {
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      return { isResult: false }
    }

    const matchValue = jsonPath(event, result.matchPath)
    // Support wildcard "*" to match any non-null value
    const matches =
      result.matchValue === '*' ? matchValue !== undefined && matchValue !== null : matchValue === result.matchValue

    if (matches) {
      const content = jsonPathString(event, result.contentPath)
      return {
        isResult: true,
        content: content ?? '',
        raw: event,
      }
    }

    return { isResult: false }
  }

  return {
    parseLine,
    parseResult,
  }
}

/** Output parser type */
export type OutputParser = ReturnType<typeof createOutputParser>
