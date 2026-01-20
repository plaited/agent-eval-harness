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

# Run Docker integration tests (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-... bun run test:docker
```

## Quick Reference

### Package Overview

`@plaited/acp-harness` is a CLI tool for capturing agent trajectories from ACP-compatible agents. It executes prompts, captures full trajectories (tools, thoughts, plans), and outputs structured JSONL for downstream scoring.

**CLI usage:**
```bash
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl
```

## Important Constraints

1. **Bun Required**: Development requires bun >= v1.2.9
2. **ES2024 Features**: Uses Promise.withResolvers() and other modern APIs

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

**Commands:** `adapter:scaffold`, `adapter:check`

**Use cases:**
- Finding existing adapters for your agent
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
