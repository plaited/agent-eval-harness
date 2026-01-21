/**
 * Session manager for headless CLI agents.
 *
 * @remarks
 * Manages the lifecycle of CLI agent sessions including:
 * - Process spawning and tracking
 * - Stream mode (persistent process) vs iterative mode (new process per turn)
 * - Output parsing and ACP update emission
 * - Session state management
 *
 * @packageDocumentation
 */

import type { Subprocess } from 'bun'
import type { HeadlessAdapterConfig } from './headless.schemas.ts'
import { createHistoryBuilder, type HistoryBuilder } from './headless-history-builder.ts'
import { createOutputParser, type OutputParser, type ParsedUpdate } from './headless-output-parser.ts'

// ============================================================================
// Types
// ============================================================================

/** Session state */
export type Session = {
  /** Unique session identifier */
  id: string
  /** Working directory for this session */
  cwd: string
  /** Subprocess (stream mode only) */
  process?: Subprocess
  /** History builder (iterative mode only) */
  history?: HistoryBuilder
  /** Session ID from CLI (for resume, stream mode) */
  cliSessionId?: string
  /** Whether the session is active */
  active: boolean
  /** Turn count for this session */
  turnCount: number
}

/** Update callback for emitting ACP session updates */
export type UpdateCallback = (update: ParsedUpdate) => void

/** Prompt result with final output */
export type PromptResult = {
  /** Final output content */
  output: string
  /** All updates collected during the prompt */
  updates: ParsedUpdate[]
  /** Session ID from CLI (if available) */
  cliSessionId?: string
}

/** Session manager configuration */
export type SessionManagerConfig = {
  /** Headless adapter configuration */
  schema: HeadlessAdapterConfig
  /** Default timeout for operations in ms */
  timeout?: number
}

// ============================================================================
// Session Manager Factory
// ============================================================================

/**
 * Creates a session manager for headless CLI agents.
 *
 * @remarks
 * The session manager is the core orchestrator for CLI agent interaction:
 *
 * **Stream mode:**
 * - Spawns one process per session
 * - Keeps process alive across turns
 * - Uses stdin/stdout for communication
 * - Supports session resume via CLI flags
 *
 * **Iterative mode:**
 * - Spawns a new process per turn
 * - Accumulates history in prompts
 * - No persistent process state
 *
 * @param config - Session manager configuration
 * @returns Session manager with create, prompt, and cancel methods
 */
export const createSessionManager = (config: SessionManagerConfig) => {
  const { schema, timeout = 60000 } = config
  const sessions = new Map<string, Session>()
  const outputParser = createOutputParser(schema)

  /**
   * Creates a new session.
   *
   * @param cwd - Working directory for the session
   * @returns Created session
   */
  const create = async (cwd: string): Promise<Session> => {
    const id = generateSessionId()

    const session: Session = {
      id,
      cwd,
      active: true,
      turnCount: 0,
    }

    // Initialize mode-specific state
    if (schema.sessionMode === 'iterative') {
      session.history = createHistoryBuilder({
        template: schema.historyTemplate,
      })
    }

    sessions.set(id, session)
    return session
  }

  /**
   * Sends a prompt to a session and collects the response.
   *
   * @param sessionId - Session ID
   * @param promptText - Prompt text to send
   * @param onUpdate - Callback for streaming updates
   * @returns Prompt result with output and updates
   */
  const prompt = async (sessionId: string, promptText: string, onUpdate?: UpdateCallback): Promise<PromptResult> => {
    const session = sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (!session.active) {
      throw new Error(`Session is not active: ${sessionId}`)
    }

    session.turnCount++

    if (schema.sessionMode === 'stream') {
      return promptStream(session, promptText, onUpdate)
    }

    return promptIterative(session, promptText, onUpdate)
  }

  /**
   * Stream mode: send prompt via stdin to persistent process.
   */
  const promptStream = async (
    session: Session,
    promptText: string,
    onUpdate?: UpdateCallback,
  ): Promise<PromptResult> => {
    // Build command for first turn or if no process exists
    if (!session.process || session.process.killed) {
      const args = buildCommand(session, promptText)

      // Choose stdin mode based on schema configuration
      const stdinMode = schema.prompt.stdin ? 'pipe' : 'ignore'

      session.process = Bun.spawn(args, {
        cwd: session.cwd,
        stdin: stdinMode,
        stdout: 'pipe',
        stderr: 'inherit',
      })

      // If using stdin, write the prompt
      if (schema.prompt.stdin && session.process) {
        writePromptToStdin(session.process, promptText)
      }
    } else {
      // Subsequent turns: spawn new process with resume flag
      const args = buildCommand(session, promptText)
      const stdinMode = schema.prompt.stdin ? 'pipe' : 'ignore'

      session.process = Bun.spawn(args, {
        cwd: session.cwd,
        stdin: stdinMode,
        stdout: 'pipe',
        stderr: 'inherit',
      })

      // If using stdin, write the prompt
      if (schema.prompt.stdin && session.process) {
        writePromptToStdin(session.process, promptText)
      }
    }

    return collectOutput(session, outputParser, onUpdate, timeout)
  }

  /**
   * Iterative mode: spawn new process per turn with history context.
   */
  const promptIterative = async (
    session: Session,
    promptText: string,
    onUpdate?: UpdateCallback,
  ): Promise<PromptResult> => {
    // Build full prompt with history
    const fullPrompt = session.history?.buildPrompt(promptText) ?? promptText

    // Build and spawn command
    const args = buildCommand(session, fullPrompt)
    const stdinMode = schema.prompt.stdin ? 'pipe' : 'ignore'

    session.process = Bun.spawn(args, {
      cwd: session.cwd,
      stdin: stdinMode,
      stdout: 'pipe',
      stderr: 'inherit',
    })

    // If using stdin, write the prompt
    if (schema.prompt.stdin && session.process) {
      writePromptToStdin(session.process, fullPrompt)
    }

    const result = await collectOutput(session, outputParser, onUpdate, timeout)

    // Store in history for next turn
    session.history?.addTurn(promptText, result.output)

    // Clean up process
    session.process = undefined

    return result
  }

  /**
   * Builds the command array for spawning the CLI.
   */
  const buildCommand = (session: Session, promptText: string): string[] => {
    const args = [...schema.command]

    // Add output format flags (only if non-empty)
    if (schema.output.flag) {
      args.push(schema.output.flag, schema.output.value)
    }

    // Add auto-approve flags
    if (schema.autoApprove) {
      args.push(...schema.autoApprove)
    }

    // Add cwd flag if specified
    if (schema.cwdFlag) {
      args.push(schema.cwdFlag, session.cwd)
    }

    // Add resume flag if available (stream mode, after first turn)
    if (schema.sessionMode === 'stream' && schema.resume && session.cliSessionId) {
      args.push(schema.resume.flag, session.cliSessionId)
    }

    // Add prompt flag and text (skip if using stdin)
    if (!schema.prompt.stdin) {
      if (schema.prompt.flag) {
        args.push(schema.prompt.flag, promptText)
      } else {
        // Positional argument (no flag)
        args.push(promptText)
      }
    }

    return args
  }

  /**
   * Cancels an active session.
   *
   * @param sessionId - Session ID to cancel
   */
  const cancel = (sessionId: string): void => {
    const session = sessions.get(sessionId)
    if (!session) return

    session.active = false

    if (session.process && !session.process.killed) {
      session.process.kill()
    }
  }

  /**
   * Gets a session by ID.
   *
   * @param sessionId - Session ID
   * @returns Session or undefined
   */
  const get = (sessionId: string): Session | undefined => {
    return sessions.get(sessionId)
  }

  /**
   * Deletes a session.
   *
   * @param sessionId - Session ID
   */
  const destroy = (sessionId: string): void => {
    cancel(sessionId)
    sessions.delete(sessionId)
  }

  return {
    create,
    prompt,
    cancel,
    get,
    destroy,
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a unique session ID.
 */
const generateSessionId = (): string => {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Writes a prompt to a process stdin stream.
 *
 * @remarks
 * Uses Bun's FileSink API to write text to the process stdin.
 * The FileSink type provides `write()` and `flush()` methods for
 * efficient stream writing without async overhead.
 *
 * Type guard ensures stdin is a FileSink (not a file descriptor number)
 * before attempting to write. This handles Bun's subprocess stdin types:
 * - `'pipe'` → FileSink with write/flush methods
 * - `'ignore'` → null (not writable)
 * - number → file descriptor (not a FileSink)
 *
 * @param process - Subprocess with stdin stream
 * @param prompt - Prompt text to write
 *
 * @internal
 */
const writePromptToStdin = (process: Subprocess, prompt: string): void => {
  if (process.stdin && typeof process.stdin !== 'number') {
    process.stdin.write(`${prompt}\n`)
    process.stdin.flush()
  }
}

/**
 * Collects output from a running process.
 *
 * @param session - Active session
 * @param parser - Output parser
 * @param onUpdate - Update callback
 * @param timeout - Timeout in ms
 * @returns Collected output and updates
 */
const collectOutput = async (
  session: Session,
  parser: OutputParser,
  onUpdate: UpdateCallback | undefined,
  timeout: number,
): Promise<PromptResult> => {
  const updates: ParsedUpdate[] = []
  let output = ''
  let cliSessionId: string | undefined

  const stdout = session.process?.stdout
  if (!stdout || typeof stdout === 'number') {
    throw new Error('No stdout available')
  }

  const reader = stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Prompt timed out after ${timeout}ms`)), timeout)
  })

  try {
    const readLoop = async () => {
      readLines: while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue

          // Parse as update first (so updates are emitted even for result lines)
          const update = parser.parseLine(line)
          if (update !== null) {
            // Handle both single updates and arrays of updates (from wildcard matches)
            const updatesToProcess = Array.isArray(update) ? update : [update]

            for (const singleUpdate of updatesToProcess) {
              updates.push(singleUpdate)
              onUpdate?.(singleUpdate)

              // Extract CLI session ID if available
              if (!cliSessionId && singleUpdate.raw && typeof singleUpdate.raw === 'object') {
                const raw = singleUpdate.raw as Record<string, unknown>
                if (typeof raw.session_id === 'string') {
                  cliSessionId = raw.session_id
                  session.cliSessionId = cliSessionId
                }
              }
            }
          }

          // Check for final result (after emitting update)
          const resultCheck = parser.parseResult(line)
          if (resultCheck.isResult) {
            output = resultCheck.content
            break readLines // Exit both loops immediately on result
          }
        }
      }
    }

    await Promise.race([readLoop(), timeoutPromise])
  } finally {
    reader.releaseLock()
  }

  return {
    output,
    updates,
    cliSessionId,
  }
}

/** Session manager type */
export type SessionManager = ReturnType<typeof createSessionManager>
