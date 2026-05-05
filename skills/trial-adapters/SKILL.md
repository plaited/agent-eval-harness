---
name: trial-adapters
description: Build command-only adapters for `eval` run mode using strict stdin/stdout JSON contracts.
license: ISC
---

# Trial Adapters

This skill is for executable adapters used by:

```bash
agent-eval-harness eval '{"mode":"run",...}'
```

## Required approach

1. Use `grill-me` to pin down:
   - target coding-agent CLI and invocation
   - docs/MCP source for real command behavior
   - approval/automation flags
   - prompt/session mechanics
   - trajectory capture strategy
   - failure mapping and safe metadata
2. If command semantics are unclear, ask the user for docs/MCP access or run `--help`/docs discovery first.
3. Use `tdd` for adapter executable contract tests.

## Adapter executable contract

- Read one `adapter-input` JSON object from stdin.
- Write exactly one `adapter-output` JSON object to stdout.
- Write logs only to stderr.
- Always include `trajectory` (can be `[]`).
- For completed status, include non-empty final `message`.

Use schema discovery as source of truth:

```bash
agent-eval-harness eval --schema adapter-input
agent-eval-harness eval --schema adapter-output
```

## Contract tests to write first

1. valid stdin -> valid stdout object
2. exactly one stdout JSON object
3. stderr-only logging
4. schema-valid `trajectory`
5. multi-prompt behavior (prompts array handling)
6. explicit failure output behavior

## Safe optional metadata examples

- model/provider name
- provider run id
- adapter name/version
- agent CLI version
- token usage
- cost estimate
- safe config summary
- suite tags

