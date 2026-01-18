/**
 * ACP adapter project scaffolding.
 *
 * @remarks
 * Generates boilerplate for new ACP adapter projects with proper structure,
 * TypeScript configuration, and example handlers.
 *
 * Supports TypeScript and Python adapters.
 *
 * @packageDocumentation
 */

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

// ============================================================================
// Types
// ============================================================================

/** Configuration for scaffold generation */
export type ScaffoldConfig = {
  /** Adapter name (used for package name and directory) */
  name: string
  /** Output directory path */
  outputDir: string
  /** Language: 'ts' or 'python' */
  lang: 'ts' | 'python'
  /** Generate minimal boilerplate only */
  minimal: boolean
}

/** Result of scaffold operation */
export type ScaffoldResult = {
  /** Output directory path */
  outputDir: string
  /** List of created files */
  files: string[]
  /** Language used */
  lang: 'ts' | 'python'
}

// ============================================================================
// TypeScript Templates
// ============================================================================

const tsPackageJson = (name: string): string => `{
  "name": "${name}-acp",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "${name}-acp": "./src/index.ts"
  },
  "scripts": {
    "start": "bun run src/index.ts",
    "check": "bunx @plaited/acp-harness adapter:check bun ./src/index.ts"
  },
  "dependencies": {
    "@agentclientprotocol/sdk": "^0.0.1"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
`

const tsTsConfig = (): string => `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src"]
}
`

const tsIndexFile = (name: string): string => `#!/usr/bin/env bun
/**
 * ${name} ACP adapter entry point.
 *
 * This adapter translates between the Agent Client Protocol and
 * your agent's native API.
 */

import { createInterface } from 'node:readline'
import { handleInitialize } from './handlers/initialize.ts'
import { handleSessionNew, handleSessionLoad } from './handlers/session-new.ts'
import { handleSessionPrompt } from './handlers/session-prompt.ts'
import { handleSessionCancel } from './handlers/session-cancel.ts'
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './types.ts'

// Method handlers
const methodHandlers: Record<string, (params: unknown) => Promise<unknown>> = {
  initialize: handleInitialize,
  'session/new': handleSessionNew,
  'session/load': handleSessionLoad,
  'session/prompt': handleSessionPrompt,
}

// Notification handlers (no response expected)
const notificationHandlers: Record<string, (params: unknown) => Promise<void>> = {
  'session/cancel': handleSessionCancel,
}

/**
 * Send a JSON-RPC message to stdout.
 */
export const sendMessage = (message: JsonRpcResponse | JsonRpcNotification): void => {
  // biome-ignore lint/suspicious/noConsole: Protocol output
  console.log(JSON.stringify(message))
}

/**
 * Send a session update notification.
 */
export const sendSessionUpdate = (sessionId: string, update: unknown): void => {
  sendMessage({
    jsonrpc: '2.0',
    method: 'session/update',
    params: { sessionId, update },
  })
}

/**
 * Process incoming JSON-RPC message.
 */
const processMessage = async (line: string): Promise<void> => {
  let request: JsonRpcRequest | JsonRpcNotification

  try {
    request = JSON.parse(line)
  } catch {
    sendMessage({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
    return
  }

  // Check if it's a notification (no id)
  const isNotification = !('id' in request)

  if (isNotification) {
    const handler = notificationHandlers[request.method]
    if (handler) {
      await handler(request.params)
    }
    // No response for notifications
    return
  }

  // It's a request - send response
  const reqWithId = request as JsonRpcRequest
  const handler = methodHandlers[reqWithId.method]

  if (!handler) {
    sendMessage({
      jsonrpc: '2.0',
      id: reqWithId.id,
      error: { code: -32601, message: \`Method not found: \${reqWithId.method}\` },
    })
    return
  }

  try {
    const result = await handler(reqWithId.params)
    sendMessage({
      jsonrpc: '2.0',
      id: reqWithId.id,
      result,
    })
  } catch (error) {
    sendMessage({
      jsonrpc: '2.0',
      id: reqWithId.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    })
  }
}

// Main loop: read lines from stdin
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
})

rl.on('line', processMessage)

// Handle clean shutdown
process.on('SIGTERM', () => {
  rl.close()
  process.exit(0)
})
`

const tsTypesFile = (): string => `/**
 * TypeScript types for JSON-RPC 2.0 protocol.
 */

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

export type JsonRpcNotification = {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export type JsonRpcSuccessResponse = {
  jsonrpc: '2.0'
  id: string | number
  result: unknown
}

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  error: {
    code: number
    message: string
    data?: unknown
  }
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; mediaType: string; data: string } }
`

const tsInitializeHandler = (name: string): string => `/**
 * Initialize handler - protocol handshake.
 */

type InitializeParams = {
  protocolVersion: number
  clientInfo: { name: string; version: string }
  clientCapabilities: Record<string, unknown>
}

type InitializeResult = {
  protocolVersion: number
  agentInfo: { name: string; version: string }
  agentCapabilities: {
    loadSession?: boolean
    promptCapabilities?: {
      image?: boolean
    }
  }
}

export const handleInitialize = async (params: unknown): Promise<InitializeResult> => {
  const { protocolVersion } = params as InitializeParams

  if (protocolVersion !== 1) {
    throw new Error(\`Unsupported protocol version: \${protocolVersion}\`)
  }

  return {
    protocolVersion: 1,
    agentInfo: {
      name: '${name}',
      version: '1.0.0',
    },
    agentCapabilities: {
      loadSession: false,
      promptCapabilities: {
        image: false,
      },
    },
  }
}
`

const tsSessionNewHandler = (): string => `/**
 * Session handlers - create and load sessions.
 */

import { sessionManager } from '../session-manager.ts'

type SessionNewParams = {
  cwd: string
  mcpServers?: unknown[]
}

type SessionNewResult = {
  sessionId: string
}

export const handleSessionNew = async (params: unknown): Promise<SessionNewResult> => {
  const { cwd, mcpServers = [] } = params as SessionNewParams

  const sessionId = sessionManager.createSession({
    cwd,
    mcpServers,
  })

  return { sessionId }
}

type SessionLoadParams = {
  sessionId: string
}

export const handleSessionLoad = async (params: unknown): Promise<SessionNewResult> => {
  const { sessionId } = params as SessionLoadParams

  const session = sessionManager.getSession(sessionId)
  if (!session) {
    throw new Error(\`Session not found: \${sessionId}\`)
  }

  return { sessionId }
}
`

const tsSessionPromptHandler = (): string => `/**
 * Session prompt handler - process prompts and emit updates.
 */

import { sessionManager } from '../session-manager.ts'
import { sendSessionUpdate } from '../index.ts'
import type { ContentBlock } from '../types.ts'

type PromptParams = {
  sessionId: string
  prompt: ContentBlock[]
}

type PromptResult = {
  content: ContentBlock[]
}

export const handleSessionPrompt = async (params: unknown): Promise<PromptResult> => {
  const { sessionId, prompt } = params as PromptParams

  const session = sessionManager.getSession(sessionId)
  if (!session) {
    throw new Error(\`Session not found: \${sessionId}\`)
  }

  // Extract text from content blocks
  const promptText = prompt
    .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
    .map((block) => block.text)
    .join('\\n')

  // Emit thinking update
  sendSessionUpdate(sessionId, {
    sessionUpdate: 'agent_thought_chunk',
    content: { type: 'text', text: 'Processing your request...' },
  })

  // TODO: Replace with your agent's actual API call
  const response = await processWithYourAgent(promptText, session.cwd)

  // Emit message update
  sendSessionUpdate(sessionId, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: response },
  })

  return {
    content: [{ type: 'text', text: response }],
  }
}

/**
 * Replace this with your actual agent API call.
 */
const processWithYourAgent = async (prompt: string, _cwd: string): Promise<string> => {
  // Example echo implementation - replace with real agent call
  return \`Echo: \${prompt}\`
}
`

const tsSessionCancelHandler = (): string => `/**
 * Session cancel handler - cancel ongoing prompts.
 */

type CancelParams = {
  sessionId: string
}

// Track active requests for cancellation
const activeRequests = new Map<string, AbortController>()

export const handleSessionCancel = async (params: unknown): Promise<void> => {
  const { sessionId } = params as CancelParams

  const controller = activeRequests.get(sessionId)
  if (controller) {
    controller.abort()
    activeRequests.delete(sessionId)
  }
}

/**
 * Register an active request for cancellation support.
 */
export const registerActiveRequest = (
  sessionId: string,
  controller: AbortController
): void => {
  activeRequests.set(sessionId, controller)
}

/**
 * Unregister an active request after completion.
 */
export const unregisterActiveRequest = (sessionId: string): void => {
  activeRequests.delete(sessionId)
}
`

const tsSessionManager = (): string => `/**
 * Session manager - tracks active conversation sessions.
 */

import { randomUUID } from 'node:crypto'

type Session = {
  id: string
  cwd: string
  mcpServers: unknown[]
  createdAt: Date
}

class SessionManager {
  #sessions = new Map<string, Session>()

  createSession(params: { cwd: string; mcpServers: unknown[] }): string {
    const id = \`sess_\${randomUUID().slice(0, 8)}\`
    this.#sessions.set(id, {
      id,
      cwd: params.cwd,
      mcpServers: params.mcpServers,
      createdAt: new Date(),
    })
    return id
  }

  getSession(id: string): Session | undefined {
    return this.#sessions.get(id)
  }

  deleteSession(id: string): boolean {
    return this.#sessions.delete(id)
  }

  listSessions(): Session[] {
    return Array.from(this.#sessions.values())
  }
}

export const sessionManager = new SessionManager()
`

const tsReadme = (name: string): string => `# ${name} ACP Adapter

ACP (Agent Client Protocol) adapter for ${name}.

## Quick Start

\`\`\`bash
# Install dependencies
bun install

# Run the adapter
bun run start

# Or run directly
bun run src/index.ts
\`\`\`

## Verify Compliance

\`\`\`bash
# Run compliance checker
bun run check

# Or manually
bunx @plaited/acp-harness adapter:check bun ./src/index.ts
\`\`\`

## Test with Harness

\`\`\`bash
# Create test prompts
echo '{"id":"test-1","input":"Hello"}' > prompts.jsonl

# Run capture
bunx @plaited/acp-harness capture prompts.jsonl bun ./src/index.ts -o results.jsonl

# View results
cat results.jsonl | jq .
\`\`\`

## Implementation

Replace the placeholder in \`src/handlers/session-prompt.ts\`:

\`\`\`typescript
const processWithYourAgent = async (prompt: string, cwd: string): Promise<string> => {
  // Call your agent's API here
  const response = await yourAgentClient.chat(prompt)
  return response.text
}
\`\`\`

## Protocol Reference

See the [ACP Specification](https://agentclientprotocol.org) for protocol details.
`

// ============================================================================
// Python Templates
// ============================================================================

const pythonAdapter = (name: string): string => `#!/usr/bin/env python3
"""
${name} ACP adapter.

ACP (Agent Client Protocol) adapter for ${name}.
Translates between JSON-RPC 2.0 and your agent's native API.
"""

import json
import sys
import uuid
from typing import Any, Dict, Optional

# Session storage
sessions: Dict[str, Dict[str, Any]] = {}


def create_session(cwd: str, mcp_servers: list) -> str:
    """Create a new session."""
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    sessions[session_id] = {
        "id": session_id,
        "cwd": cwd,
        "mcp_servers": mcp_servers,
    }
    return session_id


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get session by ID."""
    return sessions.get(session_id)


def send_message(message: Dict[str, Any]) -> None:
    """Send JSON-RPC message to stdout."""
    print(json.dumps(message), flush=True)


def send_session_update(session_id: str, update: Dict[str, Any]) -> None:
    """Send session update notification."""
    send_message({
        "jsonrpc": "2.0",
        "method": "session/update",
        "params": {"sessionId": session_id, "update": update},
    })


def handle_initialize(params: Dict[str, Any]) -> Dict[str, Any]:
    """Handle initialize request."""
    protocol_version = params.get("protocolVersion", 0)
    if protocol_version != 1:
        raise ValueError(f"Unsupported protocol version: {protocol_version}")

    return {
        "protocolVersion": 1,
        "agentInfo": {"name": "${name}", "version": "1.0.0"},
        "agentCapabilities": {
            "loadSession": False,
            "promptCapabilities": {"image": False},
        },
    }


def handle_session_new(params: Dict[str, Any]) -> Dict[str, Any]:
    """Handle session/new request."""
    cwd = params.get("cwd", ".")
    mcp_servers = params.get("mcpServers", [])
    session_id = create_session(cwd, mcp_servers)
    return {"sessionId": session_id}


def handle_session_prompt(params: Dict[str, Any]) -> Dict[str, Any]:
    """Handle session/prompt request."""
    session_id = params["sessionId"]
    session = get_session(session_id)
    if not session:
        raise ValueError(f"Session not found: {session_id}")

    # Extract text from prompt blocks
    prompt_text = " ".join(
        block["text"]
        for block in params.get("prompt", [])
        if block.get("type") == "text"
    )

    # Send thinking update
    send_session_update(session_id, {
        "sessionUpdate": "agent_thought_chunk",
        "content": {"type": "text", "text": "Processing your request..."},
    })

    # TODO: Replace with your agent's actual API call
    response = process_with_your_agent(prompt_text, session["cwd"])

    # Send message update
    send_session_update(session_id, {
        "sessionUpdate": "agent_message_chunk",
        "content": {"type": "text", "text": response},
    })

    return {"content": [{"type": "text", "text": response}]}


def process_with_your_agent(prompt: str, cwd: str) -> str:
    """Replace with your actual agent API call."""
    return f"Echo: {prompt}"


# Method handlers
METHOD_HANDLERS = {
    "initialize": handle_initialize,
    "session/new": handle_session_new,
    "session/prompt": handle_session_prompt,
}


def process_message(line: str) -> None:
    """Process incoming JSON-RPC message."""
    try:
        request = json.loads(line)
    except json.JSONDecodeError:
        send_message({
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32700, "message": "Parse error"},
        })
        return

    # Check if notification (no id)
    if "id" not in request:
        # Handle notification silently
        return

    method = request.get("method", "")
    handler = METHOD_HANDLERS.get(method)

    if not handler:
        send_message({
            "jsonrpc": "2.0",
            "id": request["id"],
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        })
        return

    try:
        result = handler(request.get("params", {}))
        send_message({
            "jsonrpc": "2.0",
            "id": request["id"],
            "result": result,
        })
    except Exception as e:
        send_message({
            "jsonrpc": "2.0",
            "id": request["id"],
            "error": {"code": -32603, "message": str(e)},
        })


def main() -> None:
    """Main loop: read lines from stdin."""
    for line in sys.stdin:
        line = line.strip()
        if line:
            process_message(line)


if __name__ == "__main__":
    main()
`

const pythonReadme = (name: string): string => `# ${name} ACP Adapter

ACP (Agent Client Protocol) adapter for ${name} (Python).

## Quick Start

\`\`\`bash
# Make executable
chmod +x adapter.py

# Run the adapter
python adapter.py
\`\`\`

## Verify Compliance

\`\`\`bash
bunx @plaited/acp-harness adapter:check python ./adapter.py
\`\`\`

## Test with Harness

\`\`\`bash
# Create test prompts
echo '{"id":"test-1","input":"Hello"}' > prompts.jsonl

# Run capture
bunx @plaited/acp-harness capture prompts.jsonl python ./adapter.py -o results.jsonl

# View results
cat results.jsonl | jq .
\`\`\`

## Implementation

Replace the placeholder in \`adapter.py\`:

\`\`\`python
def process_with_your_agent(prompt: str, cwd: str) -> str:
    # Call your agent's API here
    response = your_agent_client.chat(prompt)
    return response.text
\`\`\`

## Protocol Reference

See the [ACP Specification](https://agentclientprotocol.org) for protocol details.
`

// ============================================================================
// Scaffold Implementation
// ============================================================================

/**
 * Generate TypeScript adapter project.
 */
const scaffoldTypeScript = async (config: ScaffoldConfig): Promise<string[]> => {
  const { name, outputDir, minimal } = config
  const files: string[] = []

  // Create directories
  await Bun.write(join(outputDir, 'src', 'handlers', '.gitkeep'), '')

  // Core files
  await Bun.write(join(outputDir, 'package.json'), tsPackageJson(name))
  files.push('package.json')

  await Bun.write(join(outputDir, 'tsconfig.json'), tsTsConfig())
  files.push('tsconfig.json')

  await Bun.write(join(outputDir, 'src', 'index.ts'), tsIndexFile(name))
  files.push('src/index.ts')

  await Bun.write(join(outputDir, 'src', 'types.ts'), tsTypesFile())
  files.push('src/types.ts')

  await Bun.write(join(outputDir, 'src', 'session-manager.ts'), tsSessionManager())
  files.push('src/session-manager.ts')

  // Handler files
  await Bun.write(join(outputDir, 'src', 'handlers', 'initialize.ts'), tsInitializeHandler(name))
  files.push('src/handlers/initialize.ts')

  await Bun.write(join(outputDir, 'src', 'handlers', 'session-new.ts'), tsSessionNewHandler())
  files.push('src/handlers/session-new.ts')

  await Bun.write(join(outputDir, 'src', 'handlers', 'session-prompt.ts'), tsSessionPromptHandler())
  files.push('src/handlers/session-prompt.ts')

  await Bun.write(join(outputDir, 'src', 'handlers', 'session-cancel.ts'), tsSessionCancelHandler())
  files.push('src/handlers/session-cancel.ts')

  // README (unless minimal)
  if (!minimal) {
    await Bun.write(join(outputDir, 'README.md'), tsReadme(name))
    files.push('README.md')
  }

  return files
}

/**
 * Generate Python adapter project.
 */
const scaffoldPython = async (config: ScaffoldConfig): Promise<string[]> => {
  const { name, outputDir, minimal } = config
  const files: string[] = []

  await Bun.write(join(outputDir, 'adapter.py'), pythonAdapter(name))
  files.push('adapter.py')

  if (!minimal) {
    await Bun.write(join(outputDir, 'README.md'), pythonReadme(name))
    files.push('README.md')
  }

  return files
}

/**
 * Run adapter scaffolding with configuration object.
 *
 * @param config - Scaffold configuration
 * @returns Scaffold result with created files
 */
export const runScaffold = async (config: ScaffoldConfig): Promise<ScaffoldResult> => {
  const { outputDir, lang } = config

  // Create output directory
  await Bun.write(join(outputDir, '.gitkeep'), '')

  const files = lang === 'python' ? await scaffoldPython(config) : await scaffoldTypeScript(config)

  return {
    outputDir,
    files,
    lang,
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Adapter scaffold command CLI handler.
 *
 * @param args - Command line arguments (after 'adapter:scaffold')
 */
export const adapterScaffold = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
      lang: { type: 'string', default: 'ts' },
      minimal: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    // biome-ignore lint/suspicious/noConsole: CLI help output
    console.log(`
Usage: acp-harness adapter:scaffold [name] [options]

Arguments:
  name              Adapter name (used for package name)

Options:
  -o, --output      Output directory (default: ./<name>-acp)
  --lang            Language: ts or python (default: ts)
  --minimal         Generate minimal boilerplate only
  -h, --help        Show this help message

Examples:
  # Scaffold TypeScript adapter
  acp-harness adapter:scaffold my-agent

  # Scaffold Python adapter
  acp-harness adapter:scaffold my-agent --lang python

  # Scaffold to specific directory
  acp-harness adapter:scaffold my-agent -o ./adapters/my-agent
`)
    return
  }

  const name = positionals[0]
  if (!name) {
    console.error('Error: adapter name is required')
    console.error('Example: acp-harness adapter:scaffold my-agent')
    process.exit(1)
  }

  const lang = values.lang === 'python' ? 'python' : 'ts'
  const outputDir = values.output ?? `./${name}-acp`

  // Check if directory already exists
  const dirExists = await stat(outputDir).catch(() => null)
  if (dirExists) {
    console.error(`Error: directory already exists: ${outputDir}`)
    process.exit(1)
  }

  const result = await runScaffold({
    name,
    outputDir,
    lang,
    minimal: values.minimal ?? false,
  })

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`
Scaffolded ${result.lang === 'ts' ? 'TypeScript' : 'Python'} adapter: ${name}

Created files:
${result.files.map((f) => `  ${result.outputDir}/${f}`).join('\n')}

Next steps:
  cd ${result.outputDir}
${result.lang === 'ts' ? '  bun install' : '  chmod +x adapter.py'}
${result.lang === 'ts' ? '  bun run start' : '  python adapter.py'}

Verify compliance:
  acp-harness adapter:check ${result.lang === 'ts' ? 'bun ./src/index.ts' : 'python ./adapter.py'}
`)
}
