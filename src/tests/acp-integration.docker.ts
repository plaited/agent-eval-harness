/**
 * ACP Client Integration Tests
 *
 * @remarks
 * These tests verify the ACP client works against real Claude Code
 * via the `claude-code-acp` adapter.
 *
 * **Run in Docker only** for consistent environment:
 * ```bash
 * ANTHROPIC_API_KEY=sk-... bun run test:docker
 * ```
 *
 * Prerequisites:
 * 1. Docker installed
 * 2. API key: `ANTHROPIC_API_KEY` environment variable
 *
 * These tests make real API calls and consume credits.
 *
 * MCP servers are auto-discovered from project root via:
 * - `.mcp.json` - MCP server configuration
 * - `.claude/settings.json` - Claude settings with `enableAllProjectMcpServers`
 */

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { type ACPClient, createACPClient } from '../acp-client.ts'
import { createPrompt, summarizeResponse } from '../acp-helpers.ts'

// Long timeout for real agent interactions (2 minutes)
setDefaultTimeout(120000)

// Use project root as cwd - agents discover MCP servers from config files
const PROJECT_ROOT = process.cwd()

// Use haiku for all tests to reduce costs
const TEST_MODEL = 'claude-haiku-4-5-20251001'

// Get API key from environment
const API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

// Skip all tests if no API key is available
const describeWithApiKey = API_KEY ? describe : describe.skip

describeWithApiKey('ACP Client Integration', () => {
  let client: ACPClient

  beforeAll(async () => {
    // cc-acp adapter expects ANTHROPIC_API_KEY
    client = createACPClient({
      command: ['bunx', 'claude-code-acp'],
      timeout: 120000, // 2 min timeout for initialization
      env: {
        ANTHROPIC_API_KEY: API_KEY,
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
    // Session uses project root - agent discovers MCP servers from .mcp.json
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

    // Use haiku for faster/cheaper test runs
    await client.setModel(session.id, TEST_MODEL)

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
  })

  test('streaming prompt yields updates', async () => {
    const session = await client.createSession({
      cwd: PROJECT_ROOT,
    })

    // Use haiku for faster/cheaper test runs
    await client.setModel(session.id, TEST_MODEL)

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
    // This test verifies that Claude discovers MCP servers from .mcp.json
    // The bun-docs MCP server is configured at project root
    const session = await client.createSession({
      cwd: PROJECT_ROOT,
    })

    // Use haiku for faster/cheaper test runs
    await client.setModel(session.id, TEST_MODEL)

    // Query the bun-docs MCP server (configured in .mcp.json)
    const { updates } = await client.promptSync(
      session.id,
      createPrompt(
        'Use the bun-docs MCP server to search for information about Bun.serve(). ' +
          'What are the key options for creating an HTTP server with Bun?',
      ),
    )

    const summary = summarizeResponse(updates)

    // Response should contain Bun server-related information
    expect(summary.text.length).toBeGreaterThan(0)
    // Should mention server/HTTP-related concepts from Bun docs
    expect(summary.text.toLowerCase()).toMatch(/serve|server|http|port|fetch|handler/)
  })
})
