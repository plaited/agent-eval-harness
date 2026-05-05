# @plaited/agent-eval-harness

[![npm version](https://img.shields.io/npm/v/@plaited/agent-eval-harness.svg)](https://www.npmjs.com/package/@plaited/agent-eval-harness)
[![CI](https://github.com/plaited/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/plaited/agent-eval-harness/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

General-purpose eval harness for CLI agents with one entrypoint:

```bash
agent-eval-harness eval '<json>'
```

## Usage policy

- Use skills to generate and operate eval suites that call this CLI.
- Use skills to generate adapters for those suites.
- Do not hand-code eval orchestration outside the skill workflows.
- Use `skills/trial-runner`, `skills/trial-adapters`, and `skills/compare-trials` as canonical workflows.
- `.agents/skills/*` paths are compatibility symlinks to the root `skills/` directory.

## Modes

- `run`: run one adapter command over tasks JSONL and stream raw `trial_result` rows (JSONL).
- `grade`: consume raw/graded `trial_result` rows and stream normalized graded rows (JSONL).
- `compare`: compare two graded JSONL files and emit one bounded JSON report, including per-task `exactPassAtK`.
- `calibrate`: sample graded rows for review and emit one bounded JSON packet.

## Canonical pipeline

```bash
agent-eval-harness eval '{"mode":"run",...}' > raw.jsonl
agent-eval-harness eval '{"mode":"grade",...}' < raw.jsonl > graded.jsonl
agent-eval-harness eval '{"mode":"compare",...}'
agent-eval-harness eval '{"mode":"calibrate",...}'
```

## Schema discovery

```bash
agent-eval-harness eval --schema input
agent-eval-harness eval --schema output
agent-eval-harness eval --schema run-input
agent-eval-harness eval --schema grade-input
agent-eval-harness eval --schema compare-input
agent-eval-harness eval --schema calibrate-input
agent-eval-harness eval --schema trial-row
agent-eval-harness eval --schema task
agent-eval-harness eval --schema adapter-input
agent-eval-harness eval --schema adapter-output
agent-eval-harness eval --schema grader-input
agent-eval-harness eval --schema grader-output
```

## Streaming behavior

- `run` and `grade` write compact JSONL to stdout only.
- Routine progress logs go to stderr (disable with `quiet: true`).
- Trial/grader failures are encoded in rows, not treated as CLI failure.

## CLI exit codes

- `0`: successful command execution and valid output emission.
- `2`: usage/schema/input errors.
- `1`: internal/runtime harness failure.

## Development

```bash
bun install
bun run check
bun test src/
```
