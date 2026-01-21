/**
 * Headless Adapter integration Tests - Claude Code
 *
 * @remarks
 * These tests verify the headless ACP adapter works correctly with Claude Code
 * using the schema-driven approach from `.claude/skills/acp-adapters/schemas/`.
 *
 * Run locally with API key:
 * ```bash
 * ANTHROPIC_API_KEY=sk-... bun test ./src/tests/acp-claude.spec.ts
 * ```
 *
 * Prerequisites:
 * 1. Claude CLI installed (`bunx @anthropic-ai/claude-code`)
 * 2. API key: `ANTHROPIC_API_KEY` environment variable
 *
 * These tests make real API calls and consume credits.
 *
 * MCP servers are auto-discovered from project root via:
 * - `.mcp.json` - MCP server configuration
 */

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { join } from 'node:path'
import { type ACPClient, createACPClient } from '../acp-client.ts'
import { createPrompt, summarizeResponse } from '../acp-helpers.ts'

// Long timeout for real agent interactions (2 minutes)
setDefaultTimeout(120000)

// Use project root as cwd - agents discover MCP servers from config files
const PROJECT_ROOT = process.cwd()

// Schema path for Claude headless adapter
const SCHEMA_PATH = join(PROJECT_ROOT, '.claude/skills/acp-adapters/schemas/claude-headless.json')

// Get API key from environment
const API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

// Skip all tests if no API key is available
const describeWithApiKey = API_KEY ? describe : describe.skip

describeWithApiKey('Headless Adapter Integration - Claude', () => {
  let client: ACPClient

  beforeAll(async () => {
    // Use headless adapter with Claude schema
    client = createACPClient({
      command: ['bun', 'src/headless-cli.ts', '--', '--schema', SCHEMA_PATH],
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

  test('connects and initializes via headless adapter', () => {
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

  test('multi-turn conversation maintains context', async () => {
    // Multi-turn: multiple prompts to same session via headless adapter
    const session = await client.createSession({
      cwd: PROJECT_ROOT,
    })

    // Turn 1: Establish context
    const { updates: turn1Updates } = await client.promptSync(
      session.id,
      createPrompt('Remember this number: 42. Just confirm you have it.'),
    )
    const turn1Summary = summarizeResponse(turn1Updates)
    expect(turn1Summary.text).toMatch(/42|forty.?two|remember/i)

    // Turn 2: Reference previous context
    const { updates: turn2Updates } = await client.promptSync(
      session.id,
      createPrompt('What number did I ask you to remember? Reply with just the number.'),
    )
    const turn2Summary = summarizeResponse(turn2Updates)
    expect(turn2Summary.text).toMatch(/42/)
  })
})
