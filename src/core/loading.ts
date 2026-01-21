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
