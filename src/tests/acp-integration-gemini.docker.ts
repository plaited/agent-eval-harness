/**
 * ACP Client Integration Tests - Gemini CLI Adapter
 *
 * @remarks
 * These tests verify the ACP client works against Gemini CLI
 * via the `gemini --experimental-acp` adapter.
 *
 * **Run in Docker only** for consistent environment:
 * ```bash
 * GEMINI_API_KEY=... bun test ./src/tests/acp-integration-gemini.docker.ts
 * ```
 *
 * Prerequisites:
 * 1. Docker installed
 * 2. API key: `GEMINI_API_KEY` environment variable
 *
 * These tests make real API calls and consume credits.
 *
 * MCP servers are auto-discovered from project root via:
 * - `.gemini/settings.json` - Gemini MCP server configuration
 */

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { type ACPClient, createACPClient } from '../acp-client.ts'
import { createPrompt, summarizeResponse } from '../acp-helpers.ts'

// Long timeout for real agent interactions (2 minutes)
setDefaultTimeout(120000)

// Use project root as cwd - agents discover MCP servers from config files
const PROJECT_ROOT = process.cwd()

// Gemini CLI accepts both GOOGLE_API_KEY and GEMINI_API_KEY
// Use either one if available
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
const API_KEY = GOOGLE_API_KEY || GEMINI_API_KEY

// Skip all tests if no API key is available
const describeWithApiKey = API_KEY ? describe : describe.skip

describeWithApiKey('ACP Client Integration - Gemini', () => {
  let client: ACPClient

  beforeAll(async () => {
    // Gemini CLI accepts both GOOGLE_API_KEY and GEMINI_API_KEY
    // Pass both to ensure the CLI finds the key regardless of which it checks first
    client = createACPClient({
      command: ['bunx', '@google/gemini-cli', '--experimental-acp'],
      timeout: 120000, // 2 min timeout for initialization
      env: {
        // Pass both variants - Gemini CLI should pick up whichever it prefers
        GOOGLE_API_KEY: API_KEY,
        GEMINI_API_KEY: API_KEY,
      },
    })

    await client.connect()
  })

  afterAll(async () => {
    await client?.disconnect()
  })

  test('connects and initializes', () => {
    expect(client.isConnected()).toBe(true)

    const initResult = client.getInitializeResult()
    expect(initResult).toBeDefined()
    expect(initResult?.protocolVersion).toBeDefined()
  })

  test('reports agent capabilities', () => {
    const capabilities = client.getCapabilities()
    expect(capabilities).toBeDefined()
  })

  test('creates session with project cwd', async () => {
    // Session uses project root - agent discovers MCP servers from .gemini/settings.json
    const session = await client.createSession({
      cwd: PROJECT_ROOT,
    })

    expect(session).toBeDefined()
    expect(session.id).toBeDefined()
    expect(typeof session.id).toBe('string')
  })

  test('sends prompt and receives response', async () => {
    const session = await client.createSession({
      cwd: PROJECT_ROOT,
    })

    // Simple prompt that doesn't require tools
    const { result, updates } = await client.promptSync(
      session.id,
      createPrompt('What is 2 + 2? Reply with just the number.'),
    )

    expect(result).toBeDefined()
    expect(updates).toBeInstanceOf(Array)

    // Summarize and verify response structure
    const summary = summarizeResponse(updates)
    expect(summary.text).toBeDefined()
    expect(summary.text.length).toBeGreaterThan(0)
    // Should contain "4" somewhere in the response
    expect(summary.text).toMatch(/4/)
  })

  test('streaming prompt yields updates', async () => {
    const session = await client.createSession({
      cwd: PROJECT_ROOT,
    })

    const events: string[] = []

    for await (const event of client.prompt(session.id, createPrompt('Say "hello" and nothing else.'))) {
      events.push(event.type)
      if (event.type === 'complete') {
        expect(event.result).toBeDefined()
      }
    }

    expect(events).toContain('complete')
  })

  test('uses MCP server from project config', async () => {
    // This test verifies that Gemini discovers MCP servers from .gemini/settings.json
    // The agent-client-protocol MCP server is configured at project root
    const session = await client.createSession({
      cwd: PROJECT_ROOT,
    })

    // Query the agent-client-protocol MCP server (configured in .gemini/settings.json)
    const { updates } = await client.promptSync(
      session.id,
      createPrompt(
        'Use the agent-client-protocol MCP server to search for information about ACP. ' +
          'What is the Agent Client Protocol and what problem does it solve?',
      ),
    )

    const summary = summarizeResponse(updates)

    // Response should contain ACP-related information
    expect(summary.text.length).toBeGreaterThan(0)
    // Should mention protocol/agent-related concepts
    expect(summary.text.toLowerCase()).toMatch(/agent|protocol|client|json-rpc|stdio/)
  })
})
