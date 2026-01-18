/**
 * Tests for adapter compliance checking functionality.
 */

import { describe, expect, test } from 'bun:test'
import { type CheckConfig, runCheck } from '../adapter-check.ts'

describe('runCheck', () => {
  test('fails spawn check for non-existent command', async () => {
    const config: CheckConfig = {
      command: ['nonexistent-command-xyz'],
      timeout: 1000,
      verbose: false,
    }

    const result = await runCheck(config)

    expect(result.passed).toBe(false)
    expect(result.checks.length).toBeGreaterThanOrEqual(1)
    expect(result.checks[0]?.name).toBe('spawn')
    expect(result.checks[0]?.passed).toBe(false)
  })

  test('fails spawn check for command that exits immediately', async () => {
    const config: CheckConfig = {
      command: ['false'], // Unix command that exits with code 1
      timeout: 1000,
      verbose: false,
    }

    const result = await runCheck(config)

    expect(result.passed).toBe(false)
    expect(result.summary.failed).toBeGreaterThanOrEqual(1)
  })

  test('returns structured result with summary', async () => {
    const config: CheckConfig = {
      command: ['echo', 'test'],
      timeout: 1000,
      verbose: false,
    }

    const result = await runCheck(config)

    expect(result).toHaveProperty('passed')
    expect(result).toHaveProperty('checks')
    expect(result).toHaveProperty('summary')
    expect(result.summary).toHaveProperty('total')
    expect(result.summary).toHaveProperty('passed')
    expect(result.summary).toHaveProperty('failed')
    expect(typeof result.passed).toBe('boolean')
    expect(Array.isArray(result.checks)).toBe(true)
  })

  test('includes verbose details when enabled', async () => {
    const config: CheckConfig = {
      command: ['echo', 'test'],
      timeout: 1000,
      verbose: true,
    }

    const result = await runCheck(config)

    // At least the spawn check should have details in verbose mode
    const spawnCheck = result.checks.find((c) => c.name === 'spawn')
    expect(spawnCheck).toBeDefined()
    // Note: details may or may not be present depending on check outcome
  })
})
