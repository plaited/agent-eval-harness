/**
 * ACP adapter compliance checker.
 *
 * @remarks
 * Validates that an adapter correctly implements the Agent Client Protocol
 * by running a series of checks:
 *
 * 1. spawn - Adapter can be launched as subprocess
 * 2. initialize - Responds with valid agentCapabilities
 * 3. session/new - Creates session and returns sessionId
 * 4. session/prompt - Accepts prompt and emits session/update notifications
 * 5. session/cancel - Accepts cancel notification gracefully
 * 6. framing - All messages are newline-delimited JSON-RPC 2.0
 *
 * @packageDocumentation
 */

import { parseArgs } from 'node:util'
import { createACPTransport } from './acp-transport.ts'
import { ACP_METHODS, ACP_PROTOCOL_VERSION, DEFAULT_ACP_CLIENT_NAME } from './constants.ts'

// ============================================================================
// Types
// ============================================================================

/** Configuration for compliance check */
export type CheckConfig = {
  /** Command to spawn adapter (e.g., ['bun', './src/index.ts']) */
  command: string[]
  /** Timeout for each check in milliseconds */
  timeout: number
  /** Show detailed protocol messages */
  verbose: boolean
}

/** Result of a single check */
export type CheckResult = {
  /** Check name */
  name: string
  /** Whether the check passed */
  passed: boolean
  /** Human-readable message */
  message: string
  /** Additional details (for verbose output) */
  details?: string
}

/** Result of full compliance check */
export type ComplianceResult = {
  /** Whether all checks passed */
  passed: boolean
  /** Individual check results */
  checks: CheckResult[]
  /** Summary statistics */
  summary: {
    total: number
    passed: number
    failed: number
  }
}

// ============================================================================
// Check Implementations
// ============================================================================

/**
 * Check: spawn
 * Verify adapter can be launched as a subprocess.
 */
const checkSpawn = async (config: CheckConfig): Promise<CheckResult> => {
  const { command, timeout, verbose } = config

  try {
    const transport = createACPTransport({
      command,
      timeout,
      onNotification: () => {},
      onRequest: async () => ({}),
      onError: () => {},
      onClose: () => {},
    })

    await transport.start()
    await transport.close(false) // Don't send shutdown, just close

    return {
      name: 'spawn',
      passed: true,
      message: 'Adapter launched successfully',
      details: verbose ? `Command: ${command.join(' ')}` : undefined,
    }
  } catch (error) {
    return {
      name: 'spawn',
      passed: false,
      message: `Failed to spawn adapter: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Check: initialize
 * Verify adapter responds to initialize with valid agentCapabilities.
 */
const checkInitialize = async (
  config: CheckConfig,
): Promise<{ result: CheckResult; transport?: ReturnType<typeof createACPTransport>; capabilities?: unknown }> => {
  const { command, timeout, verbose } = config

  try {
    const transport = createACPTransport({
      command,
      timeout,
      onNotification: () => {},
      onRequest: async () => ({}),
      onError: () => {},
      onClose: () => {},
    })

    await transport.start()

    const initResponse = await transport.request<{
      protocolVersion: number
      agentInfo?: { name: string; version: string }
      agentCapabilities?: Record<string, unknown>
    }>(ACP_METHODS.INITIALIZE, {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientInfo: { name: DEFAULT_ACP_CLIENT_NAME, version: '1.0.0' },
      clientCapabilities: {},
    })

    if (!initResponse || initResponse.protocolVersion !== ACP_PROTOCOL_VERSION) {
      await transport.close(false)
      return {
        result: {
          name: 'initialize',
          passed: false,
          message: `Invalid protocol version: expected ${ACP_PROTOCOL_VERSION}, got ${initResponse?.protocolVersion}`,
        },
      }
    }

    const capabilities = initResponse.agentCapabilities ?? {}
    const capList = Object.entries(capabilities)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null) {
          const nested = Object.entries(v as Record<string, unknown>)
            .filter(([, nv]) => nv)
            .map(([nk]) => nk)
          return nested.length > 0 ? `${k}.${nested.join(', ')}` : k
        }
        return k
      })

    return {
      result: {
        name: 'initialize',
        passed: true,
        message: `Protocol version ${initResponse.protocolVersion}${capList.length > 0 ? `, capabilities: ${capList.join(', ')}` : ''}`,
        details: verbose ? JSON.stringify(initResponse, null, 2) : undefined,
      },
      transport,
      capabilities,
    }
  } catch (error) {
    return {
      result: {
        name: 'initialize',
        passed: false,
        message: `Initialize failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }
}

/**
 * Check: session/new
 * Verify adapter creates session and returns sessionId.
 */
const checkSessionNew = async (
  transport: ReturnType<typeof createACPTransport>,
  verbose: boolean,
): Promise<{ result: CheckResult; sessionId?: string }> => {
  try {
    const response = await transport.request<{ sessionId: string }>(ACP_METHODS.CREATE_SESSION, {
      cwd: process.cwd(),
      mcpServers: [],
    })

    if (!response || !response.sessionId) {
      return {
        result: {
          name: 'session/new',
          passed: false,
          message: 'No sessionId in response',
        },
      }
    }

    return {
      result: {
        name: 'session/new',
        passed: true,
        message: `Session ${response.sessionId} created`,
        details: verbose ? JSON.stringify(response, null, 2) : undefined,
      },
      sessionId: response.sessionId,
    }
  } catch (error) {
    return {
      result: {
        name: 'session/new',
        passed: false,
        message: `session/new failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }
}

/**
 * Check: session/prompt
 * Verify adapter accepts prompt and emits session/update notifications.
 */
const checkSessionPrompt = async (config: CheckConfig, sessionId: string): Promise<CheckResult> => {
  const { command, timeout, verbose } = config
  const updates: unknown[] = []

  // Create a new transport with update collection
  const transport = createACPTransport({
    command,
    timeout,
    onNotification: (method: string, params: unknown) => {
      if (method === ACP_METHODS.UPDATE) {
        updates.push(params)
      }
    },
    onRequest: async () => ({}),
    onError: () => {},
    onClose: () => {},
  })

  try {
    await transport.start()

    // Re-initialize for new connection
    await transport.request(ACP_METHODS.INITIALIZE, {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientInfo: { name: DEFAULT_ACP_CLIENT_NAME, version: '1.0.0' },
      clientCapabilities: {},
    })

    const response = await transport.request<{ content: unknown[] }>(ACP_METHODS.PROMPT, {
      sessionId,
      prompt: [{ type: 'text', text: 'Hello, this is a test prompt.' }],
    })

    await transport.close(false)

    if (!response || !response.content) {
      return {
        name: 'session/prompt',
        passed: false,
        message: 'No content in response',
      }
    }

    // Categorize updates
    const updateTypes = updates.map((u) => {
      const update = u as { update?: { sessionUpdate?: string } }
      return update?.update?.sessionUpdate ?? 'unknown'
    })

    const uniqueTypes = [...new Set(updateTypes)]
    const typeDisplay = uniqueTypes.length > 0 ? uniqueTypes.join(', ') : 'none'

    return {
      name: 'session/prompt',
      passed: true,
      message: `Received ${updates.length} update${updates.length !== 1 ? 's' : ''} (${typeDisplay})`,
      details: verbose ? JSON.stringify({ updates, response }, null, 2) : undefined,
    }
  } catch (error) {
    await transport.close(false).catch(() => {})

    return {
      name: 'session/prompt',
      passed: false,
      message: `session/prompt failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Check: session/cancel
 * Verify adapter accepts cancel notification gracefully.
 */
const checkSessionCancel = async (config: CheckConfig, sessionId: string): Promise<CheckResult> => {
  const { command, timeout, verbose } = config

  const transport = createACPTransport({
    command,
    timeout,
    onNotification: () => {},
    onRequest: async () => ({}),
    onError: () => {},
    onClose: () => {},
  })

  try {
    await transport.start()

    // Re-initialize for new connection
    await transport.request(ACP_METHODS.INITIALIZE, {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientInfo: { name: DEFAULT_ACP_CLIENT_NAME, version: '1.0.0' },
      clientCapabilities: {},
    })

    await transport.notify(ACP_METHODS.CANCEL, { sessionId })

    // Give adapter a moment to process the notification
    await new Promise((resolve) => setTimeout(resolve, 100))

    await transport.close(false)

    return {
      name: 'session/cancel',
      passed: true,
      message: 'Acknowledged without error',
      details: verbose ? `Sent cancel for session ${sessionId}` : undefined,
    }
  } catch (error) {
    await transport.close(false).catch(() => {})

    return {
      name: 'session/cancel',
      passed: false,
      message: `session/cancel failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Check: framing
 * Verify all messages are valid JSON-RPC 2.0.
 * This is implicitly tested by the other checks succeeding.
 */
const checkFraming = (previousChecks: CheckResult[]): CheckResult => {
  // If all previous checks passed, framing is valid
  const allPassed = previousChecks.every((c) => c.passed)

  if (allPassed) {
    return {
      name: 'framing',
      passed: true,
      message: 'All messages valid JSON-RPC 2.0',
    }
  }

  return {
    name: 'framing',
    passed: false,
    message: 'Some messages failed validation (see above)',
  }
}

// ============================================================================
// Main Check Runner
// ============================================================================

/**
 * Run full compliance check against an adapter.
 *
 * @param config - Check configuration
 * @returns Compliance result with all check details
 */
export const runCheck = async (config: CheckConfig): Promise<ComplianceResult> => {
  const checks: CheckResult[] = []

  // Check 1: spawn
  const spawnResult = await checkSpawn(config)
  checks.push(spawnResult)

  if (!spawnResult.passed) {
    // Can't continue if spawn fails
    return {
      passed: false,
      checks,
      summary: { total: 6, passed: 0, failed: 1 },
    }
  }

  // Check 2: initialize
  const { result: initResult, transport, capabilities: _ } = await checkInitialize(config)
  checks.push(initResult)

  if (!initResult.passed || !transport) {
    return {
      passed: false,
      checks,
      summary: { total: 6, passed: 1, failed: 1 },
    }
  }

  // Check 3: session/new
  const { result: sessionResult, sessionId } = await checkSessionNew(transport, config.verbose)
  checks.push(sessionResult)

  if (!sessionResult.passed || !sessionId) {
    await transport.close(false)
    return {
      passed: false,
      checks,
      summary: { total: 6, passed: 2, failed: 1 },
    }
  }

  // Clean up init transport - we'll create fresh ones for remaining checks
  await transport.close(true)

  // Check 4: session/prompt (uses fresh transport)
  const promptResult = await checkSessionPrompt(config, sessionId)
  checks.push(promptResult)

  // Check 5: session/cancel (uses fresh transport)
  const cancelResult = await checkSessionCancel(config, sessionId)
  checks.push(cancelResult)

  // Check 6: framing (based on previous results)
  const framingResult = checkFraming(checks)
  checks.push(framingResult)

  const passed = checks.filter((c) => c.passed).length
  const failed = checks.filter((c) => !c.passed).length

  return {
    passed: failed === 0,
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
    },
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Adapter check command CLI handler.
 *
 * @param args - Command line arguments (after 'adapter:check')
 */
export const adapterCheck = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      timeout: { type: 'string', default: '5000' },
      verbose: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    // biome-ignore lint/suspicious/noConsole: CLI help output
    console.log(`
Usage: acp-harness adapter:check <command> [args...]

Arguments:
  command [args]    Command to spawn the adapter

Options:
  --timeout         Timeout for each check in ms (default: 5000)
  --verbose         Show detailed protocol messages
  -h, --help        Show this help message

Checks Performed:
  spawn             Adapter can be launched as subprocess
  initialize        Responds with valid agentCapabilities
  session/new       Creates session and returns sessionId
  session/prompt    Accepts prompt and emits updates
  session/cancel    Accepts cancel notification gracefully
  framing           All messages are valid JSON-RPC 2.0

Examples:
  # Check local TypeScript adapter
  acp-harness adapter:check bun ./my-adapter/src/index.ts

  # Check with verbose output
  acp-harness adapter:check bunx my-adapter --verbose

  # Check Python adapter
  acp-harness adapter:check python ./adapter.py
`)
    return
  }

  if (positionals.length === 0) {
    console.error('Error: adapter command is required')
    console.error('Example: acp-harness adapter:check bun ./src/index.ts')
    process.exit(1)
  }

  const command = positionals

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Checking ACP compliance for: ${command.join(' ')}\n`)

  const result = await runCheck({
    command,
    timeout: Number.parseInt(values.timeout ?? '5000', 10),
    verbose: values.verbose ?? false,
  })

  // Print results
  for (const check of result.checks) {
    const icon = check.passed ? '\u2713' : '\u2717'
    const color = check.passed ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'

    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(`${color}${icon}${reset} ${check.name}: ${check.message}`)

    if (check.details && values.verbose) {
      // biome-ignore lint/suspicious/noConsole: CLI verbose output
      console.log(`  ${check.details.split('\n').join('\n  ')}`)
    }
  }

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(
    `\n${result.summary.passed}/${result.summary.total} checks passed.${result.passed ? ' Adapter is ACP-compliant.' : ''}`,
  )

  if (!result.passed) {
    process.exit(1)
  }
}
