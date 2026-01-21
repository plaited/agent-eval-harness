/**
 * Unit tests for headless ACP adapter factory.
 *
 * @remarks
 * Tests cover:
 * - Schema validation with Zod
 * - JSONPath extraction
 * - Output parsing with event mappings
 * - History building for iterative mode
 */

import { describe, expect, test } from 'bun:test'
import { HeadlessAdapterSchema, parseHeadlessConfig, safeParseHeadlessConfig } from '../headless.schemas.ts'
import { createHistoryBuilder } from '../headless-history-builder.ts'
import { createOutputParser, jsonPath, jsonPathString } from '../headless-output-parser.ts'

// ============================================================================
// Test Fixtures
// ============================================================================

const validClaudeSchema = {
  version: 1,
  name: 'claude-headless',
  command: ['claude'],
  sessionMode: 'stream',
  prompt: { flag: '-p' },
  output: { flag: '--output-format', value: 'stream-json' },
  autoApprove: ['--dangerously-skip-permissions'],
  resume: { flag: '--resume', sessionIdPath: '$.session_id' },
  outputEvents: [
    {
      match: { path: '$.type', value: 'assistant' },
      emitAs: 'message',
      extract: { content: '$.message.text' },
    },
    {
      match: { path: '$.type', value: 'tool_use' },
      emitAs: 'tool_call',
      extract: { title: '$.name', status: "'pending'" },
    },
  ],
  result: {
    matchPath: '$.type',
    matchValue: 'result',
    contentPath: '$.result',
  },
}

const validGeminiSchema = {
  version: 1,
  name: 'gemini-headless',
  command: ['gemini'],
  sessionMode: 'iterative',
  prompt: { flag: '--prompt' },
  output: { flag: '--output-format', value: 'json' },
  outputEvents: [
    {
      match: { path: '$.type', value: 'message' },
      emitAs: 'message',
      extract: { content: '$.content' },
    },
  ],
  result: {
    matchPath: '$.type',
    matchValue: 'result',
    contentPath: '$.response',
  },
  historyTemplate: 'User: {{input}}\nAssistant: {{output}}',
}

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('HeadlessAdapterSchema', () => {
  describe('valid schemas', () => {
    test('validates Claude headless schema', () => {
      const result = HeadlessAdapterSchema.safeParse(validClaudeSchema)
      expect(result.success).toBe(true)
    })

    test('validates Gemini headless schema', () => {
      const result = HeadlessAdapterSchema.safeParse(validGeminiSchema)
      expect(result.success).toBe(true)
    })
  })

  describe('validates schema files from disk', () => {
    const schemasDir = '.claude/skills/acp-adapters/schemas'

    test('validates claude-headless.json from disk', async () => {
      const content = await Bun.file(`${schemasDir}/claude-headless.json`).json()
      const result = HeadlessAdapterSchema.safeParse(content)
      expect(result.success).toBe(true)
    })

    test('validates gemini-headless.json from disk', async () => {
      const content = await Bun.file(`${schemasDir}/gemini-headless.json`).json()
      const result = HeadlessAdapterSchema.safeParse(content)
      expect(result.success).toBe(true)
    })
  })

  describe('minimal valid schema', () => {
    test('validates minimal required fields', () => {
      const minimal = {
        version: 1,
        name: 'minimal',
        command: ['agent'],
        sessionMode: 'iterative',
        prompt: {},
        output: { flag: '--format', value: 'json' },
        outputEvents: [],
        result: { matchPath: '$.type', matchValue: 'done', contentPath: '$.text' },
      }
      const result = HeadlessAdapterSchema.safeParse(minimal)
      expect(result.success).toBe(true)
    })
  })

  describe('invalid schemas', () => {
    test('rejects missing version', () => {
      const invalid = { ...validClaudeSchema, version: undefined }
      const result = HeadlessAdapterSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    test('rejects wrong version', () => {
      const invalid = { ...validClaudeSchema, version: 2 }
      const result = HeadlessAdapterSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    test('rejects invalid sessionMode', () => {
      const invalid = { ...validClaudeSchema, sessionMode: 'batch' }
      const result = HeadlessAdapterSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    test('rejects missing command', () => {
      const invalid = { ...validClaudeSchema, command: undefined }
      const result = HeadlessAdapterSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })

    test('rejects invalid emitAs type', () => {
      const invalid = {
        ...validClaudeSchema,
        outputEvents: [
          {
            match: { path: '$.type', value: 'x' },
            emitAs: 'invalid_type',
          },
        ],
      }
      const result = HeadlessAdapterSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })

  describe('parseHeadlessConfig', () => {
    test('returns parsed config for valid input', () => {
      const config = parseHeadlessConfig(validClaudeSchema)
      expect(config.name).toBe('claude-headless')
      expect(config.command).toEqual(['claude'])
      expect(config.sessionMode).toBe('stream')
    })

    test('throws for invalid input', () => {
      expect(() => parseHeadlessConfig({ version: 2 })).toThrow()
    })
  })

  describe('safeParseHeadlessConfig', () => {
    test('returns success for valid input', () => {
      const result = safeParseHeadlessConfig(validClaudeSchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('claude-headless')
      }
    })

    test('returns failure for invalid input', () => {
      const result = safeParseHeadlessConfig({ version: 2 })
      expect(result.success).toBe(false)
    })
  })
})

// ============================================================================
// JSONPath Tests
// ============================================================================

describe('jsonPath', () => {
  const testObj = {
    type: 'message',
    message: {
      text: 'Hello world',
      nested: { value: 42 },
    },
    array: [1, 2, 3],
  }

  describe('basic extraction', () => {
    test('extracts root field', () => {
      expect(jsonPath(testObj, '$.type')).toBe('message')
    })

    test('extracts nested field', () => {
      expect(jsonPath(testObj, '$.message.text')).toBe('Hello world')
    })

    test('extracts deeply nested field', () => {
      expect(jsonPath(testObj, '$.message.nested.value')).toBe(42)
    })

    test('returns undefined for non-existent path', () => {
      expect(jsonPath(testObj, '$.missing')).toBeUndefined()
    })

    test('returns undefined for non-existent nested path', () => {
      expect(jsonPath(testObj, '$.message.missing.deep')).toBeUndefined()
    })
  })

  describe('literal strings', () => {
    test('returns literal string value', () => {
      expect(jsonPath(testObj, "'pending'")).toBe('pending')
    })

    test('returns empty literal string', () => {
      expect(jsonPath(testObj, "''")).toBe('')
    })

    test('returns literal with spaces', () => {
      expect(jsonPath(testObj, "'hello world'")).toBe('hello world')
    })
  })

  describe('edge cases', () => {
    test('handles null input', () => {
      expect(jsonPath(null, '$.type')).toBeUndefined()
    })

    test('handles undefined input', () => {
      expect(jsonPath(undefined, '$.type')).toBeUndefined()
    })

    test('handles non-object input', () => {
      expect(jsonPath('string', '$.type')).toBeUndefined()
    })

    test('handles invalid path format', () => {
      expect(jsonPath(testObj, 'type')).toBeUndefined()
    })
  })
})

describe('jsonPathString', () => {
  test('extracts string value', () => {
    expect(jsonPathString({ text: 'hello' }, '$.text')).toBe('hello')
  })

  test('converts number to string', () => {
    expect(jsonPathString({ num: 42 }, '$.num')).toBe('42')
  })

  test('returns undefined for missing path', () => {
    expect(jsonPathString({ x: 1 }, '$.y')).toBeUndefined()
  })

  test('returns undefined for null value', () => {
    expect(jsonPathString({ x: null }, '$.x')).toBeUndefined()
  })
})

// ============================================================================
// Output Parser Tests
// ============================================================================

describe('createOutputParser', () => {
  const config = parseHeadlessConfig(validClaudeSchema)
  const parser = createOutputParser(config)

  describe('parseLine', () => {
    test('maps assistant type to message', () => {
      const line = JSON.stringify({ type: 'assistant', message: { text: 'Hello' } })
      const result = parser.parseLine(line)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('message')
      expect(result?.content).toBe('Hello')
    })

    test('maps tool_use type to tool_call', () => {
      const line = JSON.stringify({ type: 'tool_use', name: 'Read' })
      const result = parser.parseLine(line)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('tool_call')
      expect(result?.title).toBe('Read')
      expect(result?.status).toBe('pending')
    })

    test('returns null for unmapped event types', () => {
      const line = JSON.stringify({ type: 'unknown', data: 'test' })
      const result = parser.parseLine(line)
      expect(result).toBeNull()
    })

    test('returns null for invalid JSON', () => {
      const result = parser.parseLine('not valid json')
      expect(result).toBeNull()
    })

    test('returns null for empty line', () => {
      const result = parser.parseLine('')
      expect(result).toBeNull()
    })

    test('preserves raw event in result', () => {
      const event = { type: 'assistant', message: { text: 'Hi' } }
      const line = JSON.stringify(event)
      const result = parser.parseLine(line)
      expect(result?.raw).toEqual(event)
    })
  })

  describe('parseResult', () => {
    test('detects result event', () => {
      const line = JSON.stringify({ type: 'result', result: 'Final answer' })
      const result = parser.parseResult(line)
      expect(result.isResult).toBe(true)
      if (result.isResult) {
        expect(result.content).toBe('Final answer')
      }
    })

    test('returns not-result for non-result events', () => {
      const line = JSON.stringify({ type: 'assistant', message: { text: 'Hi' } })
      const result = parser.parseResult(line)
      expect(result.isResult).toBe(false)
    })

    test('returns not-result for invalid JSON', () => {
      const result = parser.parseResult('invalid')
      expect(result.isResult).toBe(false)
    })

    test('handles missing content path', () => {
      const line = JSON.stringify({ type: 'result' })
      const result = parser.parseResult(line)
      expect(result.isResult).toBe(true)
      if (result.isResult) {
        expect(result.content).toBe('')
      }
    })
  })
})

// ============================================================================
// History Builder Tests
// ============================================================================

describe('createHistoryBuilder', () => {
  describe('basic operations', () => {
    test('starts with empty history', () => {
      const builder = createHistoryBuilder()
      expect(builder.getLength()).toBe(0)
      expect(builder.getHistory()).toEqual([])
    })

    test('adds turns to history', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('Hello', 'Hi there')
      expect(builder.getLength()).toBe(1)
      expect(builder.getHistory()).toEqual([{ input: 'Hello', output: 'Hi there' }])
    })

    test('accumulates multiple turns', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('Hello', 'Hi')
      builder.addTurn('How are you?', 'Fine')
      expect(builder.getLength()).toBe(2)
    })

    test('clears history', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('Hello', 'Hi')
      builder.clear()
      expect(builder.getLength()).toBe(0)
    })
  })

  describe('formatHistory', () => {
    test('uses default template', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('Hello', 'Hi there')
      const formatted = builder.formatHistory()
      expect(formatted).toBe('User: Hello\nAssistant: Hi there')
    })

    test('uses custom template', () => {
      const builder = createHistoryBuilder({
        template: 'Q: {{input}}\nA: {{output}}',
      })
      builder.addTurn('Question', 'Answer')
      const formatted = builder.formatHistory()
      expect(formatted).toBe('Q: Question\nA: Answer')
    })

    test('separates multiple turns with double newline', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('First', 'One')
      builder.addTurn('Second', 'Two')
      const formatted = builder.formatHistory()
      expect(formatted).toBe('User: First\nAssistant: One\n\nUser: Second\nAssistant: Two')
    })

    test('returns empty string for no history', () => {
      const builder = createHistoryBuilder()
      expect(builder.formatHistory()).toBe('')
    })
  })

  describe('buildPrompt', () => {
    test('returns just input for first turn', () => {
      const builder = createHistoryBuilder()
      const prompt = builder.buildPrompt('Hello')
      expect(prompt).toBe('Hello')
    })

    test('includes history for subsequent turns', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('Hello', 'Hi')
      const prompt = builder.buildPrompt('Next question')
      expect(prompt).toContain('User: Hello')
      expect(prompt).toContain('Assistant: Hi')
      expect(prompt).toContain('User: Next question')
    })

    test('builds complete context with multiple turns', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('One', 'Reply one')
      builder.addTurn('Two', 'Reply two')
      const prompt = builder.buildPrompt('Three')
      expect(prompt).toContain('User: One')
      expect(prompt).toContain('User: Two')
      expect(prompt).toContain('User: Three')
    })
  })

  describe('getHistory returns copy', () => {
    test('modifying returned array does not affect internal state', () => {
      const builder = createHistoryBuilder()
      builder.addTurn('Hello', 'Hi')
      const history = builder.getHistory()
      history.push({ input: 'Fake', output: 'Fake' })
      expect(builder.getLength()).toBe(1)
    })
  })
})
