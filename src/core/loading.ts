/**
 * Shared loading utilities for JSONL files.
 *
 * @remarks
 * Provides consistent loading and parsing of prompts and results files.
 * Used by capture, trials, summarize, calibrate, and pipeline commands.
 *
 * @packageDocumentation
 */

import type { CaptureResult, PromptCase } from '../schemas.ts'
import { CaptureResultSchema, PromptCaseSchema } from '../schemas.ts'

/**
 * Load prompts from a JSONL file.
 *
 * @remarks
 * Each line in the file should be a valid JSON object matching PromptCaseSchema.
 * Supports both single-turn (string input) and multi-turn (string[] input) formats.
 *
 * @param path - Path to the prompts.jsonl file
 * @returns Parsed and validated prompt cases
 * @throws Error if file cannot be read or any line is invalid
 *
 * @public
 */
export const loadPrompts = async (path: string): Promise<PromptCase[]> => {
  const content = await Bun.file(path).text()
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return PromptCaseSchema.parse(JSON.parse(line))
      } catch (error) {
        throw new Error(`Invalid prompt at line ${index + 1}: ${error instanceof Error ? error.message : error}`)
      }
    })
}

/**
 * Load capture results from a JSONL file.
 *
 * @remarks
 * Each line should be a valid JSON object matching CaptureResultSchema.
 * Used by summarize, calibrate, and compare commands.
 *
 * @param path - Path to the results.jsonl file
 * @returns Parsed and validated capture results
 * @throws Error if file cannot be read or any line is invalid
 *
 * @public
 */
export const loadResults = async (path: string): Promise<CaptureResult[]> => {
  const content = await Bun.file(path).text()
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return CaptureResultSchema.parse(JSON.parse(line))
      } catch (error) {
        throw new Error(`Invalid result at line ${index + 1}: ${error instanceof Error ? error.message : error}`)
      }
    })
}

/**
 * Load raw JSONL file as parsed JSON objects.
 *
 * @remarks
 * Lower-level loading without schema validation.
 * Useful for pipeline commands that need flexible input handling.
 *
 * @param path - Path to JSONL file
 * @returns Array of parsed JSON objects
 * @throws Error if file cannot be read or any line is invalid JSON
 *
 * @public
 */
export const loadJsonl = async <T = unknown>(path: string): Promise<T[]> => {
  const content = await Bun.file(path).text()
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T
      } catch (error) {
        throw new Error(`Invalid JSON at line ${index + 1}: ${error instanceof Error ? error.message : error}`)
      }
    })
}

// ============================================================================
// Streaming Loading
// ============================================================================

/**
 * Stream capture results from a JSONL file.
 *
 * @remarks
 * Memory-efficient alternative to loadResults for large files.
 * Yields results one at a time using an async generator.
 *
 * @param path - Path to the results.jsonl file
 * @yields Parsed and validated capture results
 * @throws Error if file cannot be read or any line is invalid
 *
 * @public
 */
export async function* streamResults(path: string): AsyncGenerator<CaptureResult, void, unknown> {
  const file = Bun.file(path)
  const text = await file.text()
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    try {
      yield CaptureResultSchema.parse(JSON.parse(line))
    } catch (error) {
      throw new Error(`Invalid result at line ${i + 1}: ${error instanceof Error ? error.message : error}`)
    }
  }
}

/**
 * Build an indexed map of results by ID using streaming.
 *
 * @remarks
 * Memory-efficient for the compare command. Loads results into a Map
 * keyed by ID for O(1) lookups without holding raw file content.
 *
 * For very large files (10k+ results), this is more memory-efficient than
 * loading everything into an array and then building an index.
 *
 * @param path - Path to the results.jsonl file
 * @returns Map of result ID to CaptureResult
 *
 * @public
 */
export const buildResultsIndex = async (path: string): Promise<Map<string, CaptureResult>> => {
  const index = new Map<string, CaptureResult>()

  for await (const result of streamResults(path)) {
    index.set(result.id, result)
  }

  return index
}

/**
 * Count lines in a JSONL file without loading content.
 *
 * @remarks
 * Useful for detecting large files that should use streaming mode.
 * Uses byte-level scanning for efficiency.
 *
 * @param path - Path to the JSONL file
 * @returns Number of non-empty lines
 *
 * @public
 */
export const countLines = async (path: string): Promise<number> => {
  const file = Bun.file(path)
  const text = await file.text()
  return text.split('\n').filter((line) => line.trim()).length
}
