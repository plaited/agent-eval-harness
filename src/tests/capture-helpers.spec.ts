import { describe, expect, test } from 'bun:test'
import type { SessionNotification } from '@agentclientprotocol/sdk'
import {
  detectTrajectoryRichness,
  extractContent,
  extractFilePath,
  extractOutput,
  extractTokenCounts,
  extractTrajectory,
  hasToolErrors,
  headTailPreview,
  loadPrompts,
} from '../capture.ts'
import type { TrajectoryStep } from '../schemas.ts'

// ============================================================================
// loadPrompts
// ============================================================================

describe('loadPrompts', () => {
  test('parses valid JSONL file with string input', async () => {
    // Create a temporary test file
    const testPath = '/tmp/test-prompts-valid.jsonl'
    await Bun.write(
      testPath,
      `{"id": "test-1", "input": "What is 2+2?"}
{"id": "test-2", "input": "Hello world", "hint": "greeting"}`,
    )

    const prompts = await loadPrompts(testPath)

    expect(prompts).toHaveLength(2)
    expect(prompts[0]?.id).toBe('test-1')
    expect(prompts[0]?.input).toBe('What is 2+2?')
    expect(prompts[1]?.id).toBe('test-2')
    expect(prompts[1]?.hint).toBe('greeting')
  })

  test('parses multi-turn input (string array)', async () => {
    const testPath = '/tmp/test-prompts-multiturn.jsonl'
    await Bun.write(testPath, `{"id": "test-1", "input": ["Hello", "How are you?", "Goodbye"], "hint": "farewell"}`)

    const prompts = await loadPrompts(testPath)

    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.id).toBe('test-1')
    expect(Array.isArray(prompts[0]?.input)).toBe(true)
    expect(prompts[0]?.input).toEqual(['Hello', 'How are you?', 'Goodbye'])
    expect(prompts[0]?.hint).toBe('farewell')
  })

  test('parses prompts with metadata', async () => {
    const testPath = '/tmp/test-prompts-metadata.jsonl'
    await Bun.write(
      testPath,
      `{"id": "test-1", "input": "Test", "metadata": {"category": "math", "difficulty": "easy"}}`,
    )

    const prompts = await loadPrompts(testPath)

    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.metadata?.category).toBe('math')
    expect(prompts[0]?.metadata?.difficulty).toBe('easy')
  })

  test('throws on invalid JSON at specific line', async () => {
    const testPath = '/tmp/test-prompts-invalid.jsonl'
    await Bun.write(
      testPath,
      `{"id": "test-1", "input": "Valid"}
{invalid json here}
{"id": "test-3", "input": "Also valid"}`,
    )

    await expect(loadPrompts(testPath)).rejects.toThrow('Invalid prompt at line 2')
  })

  test('throws on missing required fields', async () => {
    const testPath = '/tmp/test-prompts-missing.jsonl'
    await Bun.write(testPath, `{"id": "test-1"}`)

    await expect(loadPrompts(testPath)).rejects.toThrow('Invalid prompt at line 1')
  })

  test('handles empty lines gracefully', async () => {
    const testPath = '/tmp/test-prompts-empty-lines.jsonl'
    await Bun.write(
      testPath,
      `{"id": "test-1", "input": "First"}

{"id": "test-2", "input": "Second"}
`,
    )

    const prompts = await loadPrompts(testPath)
    expect(prompts).toHaveLength(2)
  })
})

// ============================================================================
// extractTrajectory
// ============================================================================

describe('extractTrajectory', () => {
  const baseTime = 0

  test('extracts thoughts from agent_thought_chunk notifications', () => {
    const notifications: SessionNotification[] = [
      {
        sessionId: 's1',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: 'Let me think about this...' },
        },
      },
    ]

    const trajectory = extractTrajectory(notifications, baseTime)

    expect(trajectory).toHaveLength(1)
    expect(trajectory[0]?.type).toBe('thought')
    // Type narrowing after explicit assertion
    const step = trajectory[0]!
    expect(step.type === 'thought' && step.content).toBe('Let me think about this...')
  })

  test('extracts messages from agent_message_chunk notifications', () => {
    const notifications: SessionNotification[] = [
      {
        sessionId: 's1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Here is my answer.' },
        },
      },
    ]

    const trajectory = extractTrajectory(notifications, baseTime)

    expect(trajectory).toHaveLength(1)
    expect(trajectory[0]?.type).toBe('message')
    // Type narrowing after explicit assertion
    const step = trajectory[0]!
    expect(step.type === 'message' && step.content).toBe('Here is my answer.')
  })

  test('extracts tool calls with initial pending status', () => {
    const notifications: SessionNotification[] = [
      {
        sessionId: 's1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 't1',
          title: 'Read',
          status: 'pending',
          rawInput: '{"file_path": "/test.ts"}',
        },
      },
    ]

    const trajectory = extractTrajectory(notifications, baseTime)

    expect(trajectory).toHaveLength(1)
    expect(trajectory[0]?.type).toBe('tool_call')
    // Type narrowing after explicit assertion
    const step = trajectory[0]!
    expect(step.type === 'tool_call' && step.name).toBe('Read')
    expect(step.type === 'tool_call' && step.status).toBe('pending')
    expect(step.type === 'tool_call' && step.input).toBe('{"file_path": "/test.ts"}')
  })

  test('updates tool call status on subsequent notifications', () => {
    const notifications: SessionNotification[] = [
      {
        sessionId: 's1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 't1',
          title: 'Read',
          status: 'pending',
        },
      },
      {
        sessionId: 's1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 't1',
          title: 'Read',
          status: 'completed',
          rawOutput: 'file contents here',
        },
      },
    ]

    const trajectory = extractTrajectory(notifications, baseTime)

    // Should still be 1 entry, just updated
    expect(trajectory).toHaveLength(1)
    expect(trajectory[0]?.type).toBe('tool_call')
    // Type narrowing after explicit assertion
    const step = trajectory[0]!
    expect(step.type === 'tool_call' && step.status).toBe('completed')
    expect(step.type === 'tool_call' && step.output).toBe('file contents here')
  })

  test('tracks multiple independent tool calls', () => {
    const notifications: SessionNotification[] = [
      {
        sessionId: 's1',
        update: { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Read', status: 'completed' },
      },
      {
        sessionId: 's1',
        update: { sessionUpdate: 'tool_call', toolCallId: 't2', title: 'Write', status: 'completed' },
      },
    ]

    const trajectory = extractTrajectory(notifications, baseTime)

    expect(trajectory).toHaveLength(2)
    expect(trajectory[0]?.type).toBe('tool_call')
    expect(trajectory[1]?.type).toBe('tool_call')
    // Type narrowing after explicit assertions
    const step0 = trajectory[0]!
    const step1 = trajectory[1]!
    expect(step0.type === 'tool_call' && step0.name).toBe('Read')
    expect(step1.type === 'tool_call' && step1.name).toBe('Write')
  })

  test('extracts plan entries', () => {
    const notifications: SessionNotification[] = [
      {
        sessionId: 's1',
        update: {
          sessionUpdate: 'plan',
          entries: [
            { content: 'Step 1', status: 'completed', priority: 'high' },
            { content: 'Step 2', status: 'in_progress', priority: 'medium' },
          ],
        },
      },
    ]

    const trajectory = extractTrajectory(notifications, baseTime)

    expect(trajectory).toHaveLength(1)
    expect(trajectory[0]?.type).toBe('plan')
    // Type narrowing after explicit assertion
    const step = trajectory[0]!
    expect(step.type === 'plan' && step.entries).toHaveLength(2)
  })

  test('handles empty notifications', () => {
    const trajectory = extractTrajectory([], baseTime)
    expect(trajectory).toEqual([])
  })

  test('assigns timestamps relative to start time', () => {
    // Mock Date.now to control timestamps
    const originalNow = Date.now
    try {
      let currentTime = 1000

      Date.now = () => currentTime

      const notifications: SessionNotification[] = [
        {
          sessionId: 's1',
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'First' } },
        },
      ]

      const startTime = 1000
      currentTime = 1500 // 500ms later

      const trajectory = extractTrajectory(notifications, startTime)

      expect(trajectory[0]?.timestamp).toBe(500)
    } finally {
      Date.now = originalNow
    }
  })

  test('calculates tool call duration correctly', () => {
    const originalNow = Date.now
    try {
      let currentTime = 1000

      Date.now = () => currentTime

      const startTime = 1000

      // Simulate time passing between notifications
      // First notification at t=100 (currentTime = 1100)
      // Second notification at t=600 (currentTime = 1600)
      const notifications: SessionNotification[] = []

      currentTime = 1100 // First call at 100ms relative to start
      notifications.push({
        sessionId: 's1',
        update: { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Bash', status: 'pending' },
      })

      currentTime = 1600 // Second call at 600ms relative to start
      notifications.push({
        sessionId: 's1',
        update: { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Bash', status: 'completed' },
      })

      // Now process all notifications in one call
      // But the issue is extractTrajectory calls Date.now() for each notification
      // so we need to mock it to return different values for each call

      let callCount = 0
      const times = [1100, 1600]
      Date.now = () => times[callCount++] ?? 1600

      const trajectory = extractTrajectory(notifications, startTime)

      expect(trajectory[0]?.type).toBe('tool_call')
      // Type narrowing after explicit assertion - Duration should be 500ms (600 - 100)
      const step = trajectory[0]!
      expect(step.type === 'tool_call' && step.duration).toBe(500)
    } finally {
      Date.now = originalNow
    }
  })

  test('ignores non-text content in thought chunks', () => {
    const notifications: SessionNotification[] = [
      {
        sessionId: 's1',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          // Image content should be skipped
          content: { type: 'image', data: 'base64', mimeType: 'image/png' },
        },
      },
    ]

    const trajectory = extractTrajectory(notifications, baseTime)
    expect(trajectory).toHaveLength(0)
  })
})

// ============================================================================
// extractOutput
// ============================================================================

describe('extractOutput', () => {
  test('joins message contents with newlines', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'message', content: 'First line', timestamp: 0 },
      { type: 'message', content: 'Second line', timestamp: 100 },
    ]

    expect(extractOutput(trajectory)).toBe('First line\nSecond line')
  })

  test('filters out non-message steps', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'thought', content: 'Thinking...', timestamp: 0 },
      { type: 'message', content: 'Answer', timestamp: 100 },
      { type: 'tool_call', name: 'Read', status: 'completed', timestamp: 200 },
      { type: 'message', content: 'Done', timestamp: 300 },
    ]

    expect(extractOutput(trajectory)).toBe('Answer\nDone')
  })

  test('returns empty string for empty trajectory', () => {
    expect(extractOutput([])).toBe('')
  })

  test('returns empty string when no messages', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'thought', content: 'Just thinking', timestamp: 0 },
      { type: 'tool_call', name: 'Read', status: 'completed', timestamp: 100 },
    ]

    expect(extractOutput(trajectory)).toBe('')
  })

  test('handles single message', () => {
    const trajectory: TrajectoryStep[] = [{ type: 'message', content: 'Only message', timestamp: 0 }]

    expect(extractOutput(trajectory)).toBe('Only message')
  })
})

// ============================================================================
// hasToolErrors
// ============================================================================

describe('hasToolErrors', () => {
  test('returns false when no tool calls', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'thought', content: 'Thinking', timestamp: 0 },
      { type: 'message', content: 'Done', timestamp: 100 },
    ]

    expect(hasToolErrors(trajectory)).toBe(false)
  })

  test('returns false when all tool calls succeeded', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'tool_call', name: 'Read', status: 'completed', timestamp: 0 },
      { type: 'tool_call', name: 'Write', status: 'completed', timestamp: 100 },
    ]

    expect(hasToolErrors(trajectory)).toBe(false)
  })

  test('returns true when any tool call failed', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'tool_call', name: 'Read', status: 'completed', timestamp: 0 },
      { type: 'tool_call', name: 'Write', status: 'failed', timestamp: 100 },
      { type: 'tool_call', name: 'Bash', status: 'completed', timestamp: 200 },
    ]

    expect(hasToolErrors(trajectory)).toBe(true)
  })

  test('returns false for empty trajectory', () => {
    expect(hasToolErrors([])).toBe(false)
  })

  test('returns true when only tool call failed', () => {
    const trajectory: TrajectoryStep[] = [{ type: 'tool_call', name: 'Bash', status: 'failed', timestamp: 0 }]

    expect(hasToolErrors(trajectory)).toBe(true)
  })
})

// ============================================================================
// headTailPreview
// ============================================================================

describe('headTailPreview', () => {
  test('returns full content when under limit', () => {
    const content = 'line1\nline2\nline3'
    expect(headTailPreview(content, 5, 5)).toBe(content)
  })

  test('truncates with omitted count for long content', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
    const content = lines.join('\n')

    const result = headTailPreview(content, 3, 3)

    expect(result).toContain('line1')
    expect(result).toContain('line2')
    expect(result).toContain('line3')
    expect(result).toContain('line18')
    expect(result).toContain('line19')
    expect(result).toContain('line20')
    expect(result).toContain('14 lines omitted')
  })

  test('respects custom head line count', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const content = lines.join('\n')

    const result = headTailPreview(content, 2, 2)

    expect(result).toContain('line1')
    expect(result).toContain('line2')
    expect(result).not.toContain('line3')
    expect(result).toContain('6 lines omitted')
  })

  test('respects custom tail line count', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const content = lines.join('\n')

    const result = headTailPreview(content, 1, 4)

    expect(result).toContain('line1')
    expect(result).toContain('line7')
    expect(result).toContain('line10')
    expect(result).toContain('5 lines omitted')
  })

  test('handles content exactly at boundary', () => {
    const content = 'line1\nline2\nline3\nline4\nline5\nline6'
    // 6 lines, head=3, tail=3 means no truncation needed
    expect(headTailPreview(content, 3, 3)).toBe(content)
  })

  test('handles single line content', () => {
    const content = 'single line'
    expect(headTailPreview(content, 3, 3)).toBe(content)
  })

  test('handles empty content', () => {
    expect(headTailPreview('', 3, 3)).toBe('')
  })
})

// ============================================================================
// extractFilePath
// ============================================================================

describe('extractFilePath', () => {
  test('extracts file_path field', () => {
    const input = { file_path: '/path/to/file.ts' }
    expect(extractFilePath(input)).toBe('/path/to/file.ts')
  })

  test('extracts path field as fallback', () => {
    const input = { path: '/another/path.js' }
    expect(extractFilePath(input)).toBe('/another/path.js')
  })

  test('prefers file_path over path', () => {
    const input = { file_path: '/preferred.ts', path: '/fallback.ts' }
    expect(extractFilePath(input)).toBe('/preferred.ts')
  })

  test('returns undefined for invalid input', () => {
    expect(extractFilePath(null)).toBeUndefined()
    expect(extractFilePath(undefined)).toBeUndefined()
    expect(extractFilePath('string')).toBeUndefined()
    expect(extractFilePath(123)).toBeUndefined()
  })

  test('returns undefined when no path fields present', () => {
    const input = { content: 'some content' }
    expect(extractFilePath(input)).toBeUndefined()
  })

  test('handles empty object', () => {
    expect(extractFilePath({})).toBeUndefined()
  })
})

// ============================================================================
// extractContent
// ============================================================================

describe('extractContent', () => {
  test('extracts content field', () => {
    const input = { content: 'const x = 1;' }
    expect(extractContent(input)).toBe('const x = 1;')
  })

  test('extracts new_string field as fallback', () => {
    const input = { new_string: 'const y = 2;' }
    expect(extractContent(input)).toBe('const y = 2;')
  })

  test('prefers content over new_string', () => {
    const input = { content: 'preferred', new_string: 'fallback' }
    expect(extractContent(input)).toBe('preferred')
  })

  test('returns undefined for invalid input', () => {
    expect(extractContent(null)).toBeUndefined()
    expect(extractContent(undefined)).toBeUndefined()
    expect(extractContent('string')).toBeUndefined()
    expect(extractContent(123)).toBeUndefined()
  })

  test('returns undefined when no content fields present', () => {
    const input = { file_path: '/some/path.ts' }
    expect(extractContent(input)).toBeUndefined()
  })

  test('handles empty object', () => {
    expect(extractContent({})).toBeUndefined()
  })

  test('handles multiline content', () => {
    const input = { content: 'line1\nline2\nline3' }
    expect(extractContent(input)).toBe('line1\nline2\nline3')
  })
})

// ============================================================================
// detectTrajectoryRichness
// ============================================================================

describe('detectTrajectoryRichness', () => {
  test('returns "full" when trajectory has thoughts', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'thought', content: 'Let me think...', timestamp: 0 },
      { type: 'message', content: 'Answer', timestamp: 100 },
    ]

    expect(detectTrajectoryRichness(trajectory)).toBe('full')
  })

  test('returns "full" when trajectory has tool calls', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'tool_call', name: 'Read', status: 'completed', timestamp: 0 },
      { type: 'message', content: 'Answer', timestamp: 100 },
    ]

    expect(detectTrajectoryRichness(trajectory)).toBe('full')
  })

  test('returns "full" when trajectory has plans', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'plan', entries: [{ content: 'Step 1', status: 'completed' }], timestamp: 0 },
      { type: 'message', content: 'Answer', timestamp: 100 },
    ]

    expect(detectTrajectoryRichness(trajectory)).toBe('full')
  })

  test('returns "messages-only" when trajectory only has messages', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'message', content: 'First', timestamp: 0 },
      { type: 'message', content: 'Second', timestamp: 100 },
    ]

    expect(detectTrajectoryRichness(trajectory)).toBe('messages-only')
  })

  test('returns "minimal" when trajectory is empty', () => {
    expect(detectTrajectoryRichness([])).toBe('minimal')
  })

  test('returns "full" when trajectory has mixed rich content', () => {
    const trajectory: TrajectoryStep[] = [
      { type: 'thought', content: 'Thinking...', timestamp: 0 },
      { type: 'tool_call', name: 'Read', status: 'completed', timestamp: 50 },
      { type: 'plan', entries: [], timestamp: 100 },
      { type: 'message', content: 'Done', timestamp: 150 },
    ]

    expect(detectTrajectoryRichness(trajectory)).toBe('full')
  })
})

// ============================================================================
// extractTokenCounts
// ============================================================================

describe('extractTokenCounts', () => {
  test('returns undefined when no usage data present', () => {
    const updates: SessionNotification[] = [
      {
        sessionId: 's1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello' } },
      },
    ]

    const result = extractTokenCounts(updates)

    expect(result.inputTokens).toBeUndefined()
    expect(result.outputTokens).toBeUndefined()
  })

  test('extracts token counts from usage field when present', () => {
    const updates: SessionNotification[] = [
      {
        sessionId: 's1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello' } },
        // @ts-expect-error - SessionNotification type doesn't include 'usage' field, but adapters like Claude Code add it at runtime
        usage: { inputTokens: 50, outputTokens: 30 },
      },
    ]

    const result = extractTokenCounts(updates)

    expect(result.inputTokens).toBe(50)
    expect(result.outputTokens).toBe(30)
  })

  test('accumulates token counts across multiple updates', () => {
    const updates: SessionNotification[] = [
      {
        sessionId: 's1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'First' } },
        // @ts-expect-error - SessionNotification type doesn't include 'usage' field, but adapters like Claude Code add it at runtime
        usage: { inputTokens: 50, outputTokens: 30 },
      },
      {
        sessionId: 's1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Second' } },
        // @ts-expect-error - SessionNotification type doesn't include 'usage' field, but adapters like Claude Code add it at runtime
        usage: { inputTokens: 25, outputTokens: 45 },
      },
    ]

    const result = extractTokenCounts(updates)

    expect(result.inputTokens).toBe(75) // 50 + 25
    expect(result.outputTokens).toBe(75) // 30 + 45
  })

  test('handles empty updates array', () => {
    const result = extractTokenCounts([])

    expect(result.inputTokens).toBeUndefined()
    expect(result.outputTokens).toBeUndefined()
  })

  test('handles partial token counts (only input or output)', () => {
    const updates: SessionNotification[] = [
      {
        sessionId: 's1',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello' } },
        // @ts-expect-error - SessionNotification type doesn't include 'usage' field, but adapters like Claude Code add it at runtime
        usage: { inputTokens: 100 },
      },
    ]

    const result = extractTokenCounts(updates)

    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBeUndefined()
  })
})
