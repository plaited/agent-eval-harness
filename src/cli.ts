#!/usr/bin/env bun
import { evalCli } from './eval.ts'

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'eval':
    await evalCli(args)
    break
  default:
    console.error(`Unknown command: ${command}`)
    console.error('Available commands: eval')
    process.exit(1)
    break
}
