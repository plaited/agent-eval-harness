# AGENTS.md

Agent guidance for this repository.

## Overview

CLI tool capturing agent trajectories from headless CLI agents. Executes prompts, captures tools/thoughts/plans, outputs JSONL for evaluation.

## Capabilities

- **Multi-turn**: `input: string | string[]` executes sequentially in same session
- **Isolation**: Fresh session per JSONL entry
- **Parallelization**: `-j N` runs N prompts concurrently via worker pool
- **Workspace isolation**: `--workspace-dir` creates per-prompt directories
- **MCP auto-discovery**: No explicit `--mcp-server` flag needed
- **Headless adapter**: Schema-driven JSON wrapper for any CLI agent

## Structure

```
src/
├── harness/        # Core capture engine
├── headless/       # Headless adapter implementation
├── pipeline/       # Unix-style pipeline commands
└── schemas/        # Zod schemas + types

.claude/skills/     # AI agent skills
├── agent-eval-harness/
└── headless-adapters/
```

## Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Setup (requires bun >= v1.2.9) |
| `bun run check` | Type/lint/format check |
| `bun run check:write` | Auto-fix lint/format |
| `bun test` | Unit tests |

**Docker integration tests:**
```bash
ANTHROPIC_API_KEY=sk-... GEMINI_API_KEY=... \
  docker compose -f docker-compose.test.yml run --rm test
```

## Quick Start

```bash
export ANTHROPIC_API_KEY=sk-...
bunx @plaited/agent-eval-harness capture prompts.jsonl \
  --schema .claude/skills/headless-adapters/schemas/claude-headless.json \
  -o results.jsonl
```

## Skills

| Skill | Commands | Use Case |
|-------|----------|----------|
| **agent-eval-harness** | `capture`, `trials`, `summarize`, `calibrate`, `validate-refs`, `balance`, `schemas`, `run`, `extract`, `grade`, `format`, `compare` | Trajectory capture, training data, regression tests, A/B comparison |
| **headless-adapters** | `headless` | Find/create/validate adapter schemas |

**Install:** `curl -fsSL https://raw.githubusercontent.com/plaited/skills-installer/main/install.sh \| bash -s -- --agent <claude\|cursor\|copilot\|opencode\|amp\|goose\|factory> --project agent-eval-harness`

## Constraints

- **Bun required**: >= v1.2.9
- **ES2024**: Uses `Promise.withResolvers()` and modern APIs

## Verification

**Before commit:**
- `bun run check` passes
- `bun test` passes (unit tests)
- No `--no-verify` on git commits

**Skill validation:**
```bash
bunx @plaited/development-skills validate-skill .claude/skills/<name>
```

## Workflow

1. **Plan first**: Use TodoWrite for multi-step tasks
2. **Read before edit**: Verify current code before proposing changes
3. **Verify incrementally**: Run checks after each change
4. **No over-engineering**: Only requested changes

Development rules in `.plaited/rules/` - reference via @.plaited/rules/[name].md in CLAUDE.md

## Learnings

*Dated entries from actual issues encountered will appear here*
