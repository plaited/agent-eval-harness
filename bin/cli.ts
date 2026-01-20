#!/usr/bin/env bun

/**
 * ACP Harness CLI - Agent evaluation toolkit.
 *
 * @remarks
 * Router for harness commands. Thin wrapper that delegates to command modules.
 *
 * Commands:
 * - capture: Core trajectory capture
 * - trials: Multi-run pass@k/pass^k analysis
 * - summarize: Derive compact views from results
 * - calibrate: Sample failures for grader review
 * - validate-refs: Check reference solutions
 * - balance: Analyze test set coverage
 * - schemas: Export JSON schemas for non-TS users
 * - adapter:scaffold: Scaffold new ACP adapter project
 * - adapter:check: Validate adapter ACP compliance
 */

import { adapterCheck } from '../src/adapter-check.ts'
import { adapterScaffold } from '../src/adapter-scaffold.ts'
import { balance } from '../src/balance.ts'
import { calibrate } from '../src/calibrate.ts'
import { capture } from '../src/capture.ts'
import { schemasCli } from '../src/schemas-cli.ts'
import { summarize } from '../src/summarize.ts'
import { trials } from '../src/trials.ts'
import { validateRefs } from '../src/validate-refs.ts'

const [command, ...args] = Bun.argv.slice(2)

const printHelp = () => {
  // biome-ignore lint/suspicious/noConsole: CLI help output
  console.log(`
acp-harness - CLI tool for agent evaluation

Commands:
  capture          Capture trajectories from ACP agent
  trials           Run prompts multiple times for pass@k/pass^k metrics
  summarize        Derive compact views from results
  calibrate        Sample failures for grader review
  validate-refs    Check reference solutions against grader
  balance          Analyze test set coverage
  schemas          Export JSON schemas for non-TypeScript users
  adapter:scaffold Scaffold a new ACP adapter project
  adapter:check    Validate adapter ACP compliance

Run 'acp-harness <command> --help' for command-specific help.

Examples:
  # Basic capture
  acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl

  # With grader
  acp-harness capture prompts.jsonl bunx claude-code-acp --grader ./grader.ts -o results.jsonl

  # Multi-run trials
  acp-harness trials prompts.jsonl bunx claude-code-acp -k 5 --grader ./grader.ts -o trials.jsonl

  # Derive summary view
  acp-harness summarize results.jsonl -o summary.jsonl

  # Export schemas
  acp-harness schemas --json -o schemas.json

  # Scaffold new adapter
  acp-harness adapter:scaffold my-agent -o ./adapters/my-agent

  # Validate adapter compliance
  acp-harness adapter:check bun ./my-adapter/src/main.ts

Documentation: https://github.com/plaited/acp-harness
`)
}

const main = async () => {
  switch (command) {
    case 'capture':
      await capture(args)
      break

    case 'trials':
      await trials(args)
      break

    case 'summarize':
      await summarize(args)
      break

    case 'calibrate':
      await calibrate(args)
      break

    case 'validate-refs':
      await validateRefs(args)
      break

    case 'balance':
      await balance(args)
      break

    case 'schemas':
      await schemasCli(args)
      break

    case 'adapter:scaffold':
      await adapterScaffold(args)
      break

    case 'adapter:check':
      await adapterCheck(args)
      break

    case '-h':
    case '--help':
    case undefined:
      printHelp()
      break

    case '-v':
    case '--version': {
      const { version } = await import('../package.json')
      // biome-ignore lint/suspicious/noConsole: CLI version output
      console.log(version)
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      console.error("Run 'acp-harness --help' for usage")
      process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
