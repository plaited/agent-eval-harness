# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Essential Commands

### Development Setup
```bash
# Install dependencies (requires bun >= v1.2.9)
bun install

# Type, lint, and format check (check only, no fixes)
bun run check

# Lint and format fix (auto-fix issues)
bun run check:write

# Run unit tests
bun test

# Run Docker integration tests (requires API keys)
ANTHROPIC_API_KEY=sk-... GEMINI_API_KEY=... docker compose -f docker-compose.test.yml run --rm acp-test
```

## Quick Reference

### Package Overview

`@plaited/acp-harness` is a CLI tool for capturing agent trajectories from ACP-compatible agents. It executes prompts, captures full trajectories (tools, thoughts, plans), and outputs structured JSONL for downstream scoring.

**CLI usage (with built-in headless adapter):**
```bash
# Set API key and run capture with headless adapter (recommended)
export ANTHROPIC_API_KEY=sk-...
bunx @plaited/acp-harness capture prompts.jsonl \
  bunx @plaited/acp-harness headless --schema .claude/skills/acp-adapters/schemas/claude-headless.json \
  -o results.jsonl
```

## Important Constraints

1. **Bun Required**: Development requires bun >= v1.2.9
2. **ES2024 Features**: Uses Promise.withResolvers() and other modern APIs

## Key Features

- **Multi-turn conversations**: `input: string | string[]` - execute prompts sequentially in same session
- **Session isolation**: Fresh session per JSONL entry for reproducible captures
- **MCP auto-discovery**: Agents discover MCP configs from working directory (no explicit `--mcp-server` flag)
- **Headless adapter**: Schema-driven adapter wraps any CLI agent with JSON output - no code required

## Skills

This project provides two AI agent skills in `.claude/skills/`:

### ACP Harness (`acp-harness`)

CLI tool for capturing agent trajectories from ACP-compatible agents.

**Commands:** `capture`, `trials`, `summarize`, `calibrate`, `validate-refs`, `balance`, `schemas`

**Use cases:**
- Capturing trajectories for downstream evaluation
- Generating training data (SFT/DPO) with full context
- Building regression test fixtures for agent behavior

See `.claude/skills/acp-harness/SKILL.md` for complete documentation.

### ACP Adapters (`acp-adapters`)

Discover, create, and validate ACP adapters for agent integration.

**Commands:** `headless`, `adapter:scaffold`, `adapter:check`

**Use cases:**
- Finding existing adapters for your agent
- Wrapping headless CLI agents with schema-driven adapter
- Building custom ACP adapters from scratch
- Validating adapter ACP compliance

See `.claude/skills/acp-adapters/SKILL.md` for complete documentation.

### Installing Skills

Install skills for AI coding agents:

```bash
curl -fsSL https://raw.githubusercontent.com/plaited/skills-installer/main/install.sh | bash -s -- --agent <agent-name> --project acp-harness
```

Replace `<agent-name>` with: `claude`, `cursor`, `copilot`, `opencode`, `amp`, `goose`, `factory`

<!-- PLAITED-RULES-START -->

## Rules

This project uses modular development rules stored in `.plaited/rules/`.
Each rule file covers a specific topic:

- @.plaited/rules/module-organization.md - [module-organization](.plaited/rules/module-organization.md)
- @.plaited/rules/git-workflow.md - [git-workflow](.plaited/rules/git-workflow.md)
- @.plaited/rules/github.md - [github](.plaited/rules/github.md)
- @.plaited/rules/testing.md - [testing](.plaited/rules/testing.md)
- @.plaited/rules/bun-apis.md - [bun-apis](.plaited/rules/bun-apis.md)
- @.plaited/rules/accuracy.md - [accuracy](.plaited/rules/accuracy.md)
- @.plaited/rules/code-review.md - [code-review](.plaited/rules/code-review.md)
- @.plaited/rules/documentation.md - [documentation](.plaited/rules/documentation.md)

<!-- PLAITED-RULES-END -->
