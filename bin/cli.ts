#!/usr/bin/env bun

/**
 * Agent Eval Harness CLI - Agent evaluation toolkit.
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
 * - headless: Schema-driven adapter for any headless CLI agent
 */

import { balance } from '../src/commands/balance.ts'
import { calibrate } from '../src/commands/calibrate.ts'
import { capture } from '../src/commands/capture.ts'
import { summarize } from '../src/commands/summarize.ts'
import { trials } from '../src/commands/trials.ts'
import { validateRefs } from '../src/commands/validate-refs.ts'
import { headless } from '../src/headless.ts'
import { compare, extract, format, grade, run } from '../src/pipeline.ts'
import { schemasCli } from '../src/schemas/schemas-cli.ts'

const [command, ...args] = Bun.argv.slice(2)

const printHelp = () => {
  // biome-ignore lint/suspicious/noConsole: CLI help output
  console.log(`
agent-eval-harness - CLI tool for agent evaluation

Commands:
  capture          Capture trajectories from CLI agents
  trials           Run prompts multiple times for pass@k/pass^k metrics
  summarize        Derive compact views from results
  calibrate        Sample failures for grader review
  validate-refs    Check reference solutions against grader
  balance          Analyze test set coverage
  schemas          Export JSON schemas for non-TypeScript users
  headless         Schema-driven adapter for any headless CLI agent

Pipeline Commands (Unix-style composable):
  run              Execute prompts and output raw results
  extract          Parse raw output into trajectories
  grade            Apply grader to extracted results
  format           Convert results to different output formats
  compare          Compare multiple runs of the same prompts

Run 'agent-eval-harness <command> --help' for command-specific help.

Examples:
  # Basic capture with schema
  agent-eval-harness capture prompts.jsonl --schema claude.json -o results.jsonl

  # With grader
  agent-eval-harness capture prompts.jsonl -s claude.json --grader ./grader.ts -o results.jsonl

  # Multi-run trials
  agent-eval-harness trials prompts.jsonl -s claude.json -k 5 --grader ./grader.ts -o trials.jsonl

  # Derive summary view
  agent-eval-harness summarize results.jsonl -o summary.jsonl

  # Pipeline workflow
  cat prompts.jsonl | \\
    agent-eval-harness run -s claude.json | \\
    agent-eval-harness extract -s claude.json | \\
    agent-eval-harness grade -g ./grader.ts | \\
    agent-eval-harness format -f markdown > report.md

  # Compare multiple runs
  agent-eval-harness compare run1.jsonl run2.jsonl -g ./compare-grader.ts

Documentation: https://github.com/plaited/agent-eval-harness
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

    case 'headless':
      await headless(args)
      break

    // Pipeline commands
    case 'run':
      await run(args)
      break

    case 'extract':
      await extract(args)
      break

    case 'grade':
      await grade(args)
      break

    case 'format':
      await format(args)
      break

    case 'compare':
      await compare(args)
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
      console.error("Run 'agent-eval-harness --help' for usage")
      process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
