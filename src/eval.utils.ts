import { createHash, randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import type { JsonObject } from './eval.schemas.ts'

export const readJsonInput = async (args: string[]): Promise<unknown> => {
  const positional = args.find((arg) => !arg.startsWith('--'))
  if (positional !== undefined) {
    return JSON.parse(positional)
  }

  if (!process.stdin.isTTY) {
    const stdin = (await Bun.stdin.text()).trim()
    if (stdin.length > 0) {
      return JSON.parse(stdin)
    }
  }

  throw new Error('Missing JSON input')
}

export const looksLikePath = (value: string): boolean =>
  value.startsWith('./') || value.startsWith('../') || value.startsWith('/')

export const resolveCommand = (command: string[]): string[] => {
  const [executable, ...rest] = command
  if (executable === undefined) {
    return command
  }

  if (looksLikePath(executable)) {
    return [resolve(process.cwd(), executable), ...rest]
  }

  const resolved = Bun.which(executable) ?? executable
  return [resolved, ...rest]
}

export const sanitizeLabelPart = (value: string): string => {
  const trimmed = value.trim().toLowerCase()
  let output = ''

  for (const char of trimmed) {
    const isAlphaNumeric = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')
    if (isAlphaNumeric || char === '.' || char === '_' || char === '-') {
      output += char
      continue
    }

    const previous = output.at(-1)
    if (previous !== '-') {
      output += '-'
    }
  }

  let start = 0
  while (start < output.length && output[start] === '-') {
    start += 1
  }

  let end = output.length
  while (end > start && output[end - 1] === '-') {
    end -= 1
  }

  return output.slice(start, end).slice(0, 48)
}

export const inferLabel = (command: string[]): string => {
  const first = command[0]
  if (first === undefined || first.length === 0) {
    return 'run'
  }
  return sanitizeLabelPart(basename(first)) || 'run'
}

export const generateRunId = (label: string | undefined): string => {
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '')
  const stem = sanitizeLabelPart(label ?? 'run') || 'run'
  const suffix = randomUUID().slice(0, 8)
  return `${stem}-${timestamp}-${suffix}`
}

export const createTrialId = (params: { runId: string; taskId: string; trialIndex: number }): string => {
  const digest = createHash('sha256').update(params.taskId).digest('hex').slice(0, 10)
  const taskPart = sanitizeLabelPart(params.taskId) || 'task'
  return `${params.runId}-${taskPart}-${digest}-${params.trialIndex}`
}

export const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex')

export const stableSort = <T>(items: T[], selector: (item: T) => string): T[] =>
  [...items].sort((a, b) => selector(a).localeCompare(selector(b)))

export const toJsonObject = (value: unknown): JsonObject => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject
  }
  return {}
}
