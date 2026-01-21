# @plaited/acp-harness

[![npm version](https://img.shields.io/npm/v/@plaited/acp-harness.svg)](https://www.npmjs.com/package/@plaited/acp-harness)
[![CI](https://github.com/plaited/acp-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/plaited/acp-harness/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

CLI tool for capturing agent trajectories from ACP-compatible agents. Execute prompts, capture full trajectories (tools, thoughts, plans), and output structured JSONL for downstream scoring. Available as both a CLI tool and as installable skills for AI coding agents.

## CLI Tool

Use these tools directly via the CLI without installation:

```bash
# Using built-in headless adapter (recommended - no extra install needed)
export ANTHROPIC_API_KEY=sk-...
bunx @plaited/acp-harness capture prompts.jsonl \
  bunx @plaited/acp-harness headless --schema ./schemas/claude-headless.json \
  -o results.jsonl

# Or with an external ACP adapter
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl
```

**Prerequisite:** Set your API key. The `headless` command works with any CLI agent that supports JSON output - no adapter installation required:

```bash
export ANTHROPIC_API_KEY=sk-...   # For Claude
export GEMINI_API_KEY=...         # For Gemini
```

Pre-built schemas are available in `.claude/skills/acp-adapters/schemas/` for Claude and Gemini.

### Commands

| Command | Description |
|---------|-------------|
| `capture <prompts> <cmd>` | Trajectory capture (full JSONL) |
| `trials <prompts> <cmd>` | Multi-run with pass@k metrics |
| `summarize <results>` | Derive compact views from results |
| `calibrate <results>` | Sample failures for review |
| `validate-refs <prompts>` | Check reference solutions |
| `balance <prompts>` | Analyze test set coverage |
| `schemas [name]` | Export JSON schemas |
| `headless --schema <path>` | Schema-driven adapter for any CLI agent |
| `adapter:check <cmd>` | Validate adapter ACP compliance |

### Examples

```bash
# Capture trajectories using headless adapter (recommended)
bunx @plaited/acp-harness capture prompts.jsonl \
  bunx @plaited/acp-harness headless --schema ./schemas/claude-headless.json \
  -o results.jsonl

# Run trials for pass@k analysis
bunx @plaited/acp-harness trials prompts.jsonl \
  bunx @plaited/acp-harness headless --schema ./schemas/claude-headless.json \
  -k 5 --grader ./grader.ts

# Summarize results
bunx @plaited/acp-harness summarize results.jsonl -o summary.jsonl

# Export schemas
bunx @plaited/acp-harness schemas CaptureResult --json

# Validate adapter compliance
bunx @plaited/acp-harness adapter:check \
  bunx @plaited/acp-harness headless --schema ./schemas/claude-headless.json
```

## Skills for AI Agents

**Install skills** for use with AI coding agents:

```bash
curl -fsSL https://raw.githubusercontent.com/plaited/skills-installer/main/install.sh | bash -s -- --agent <agent-name> --project acp-harness
```

Replace `<agent-name>` with your agent: `claude`, `cursor`, `copilot`, `opencode`, `amp`, `goose`, `factory`

**Update skills:**

```bash
curl -fsSL https://raw.githubusercontent.com/plaited/skills-installer/main/install.sh | bash -s -- update --agent <agent-name> --project acp-harness
```

### Available Skills

#### ACP Harness

CLI tool for capturing agent trajectories, optimized for TypeScript/JavaScript projects using Bun.

**Commands:**

| Command | Description |
|---------|-------------|
| `capture` | Execute prompts and capture full trajectories |
| `trials` | Multi-run trials with pass@k/pass^k metrics |
| `summarize` | Derive compact views from trajectory results |
| `calibrate` | Sample failures for grader calibration |
| `validate-refs` | Validate reference solutions against graders |
| `balance` | Analyze test set coverage distribution |
| `schemas` | Export Zod schemas as JSON Schema |

**Use cases:**
- Capturing trajectories for downstream evaluation (Braintrust, custom scorers)
- Generating training data (SFT/DPO) with full context
- Building regression test fixtures for agent behavior
- Comparing agent responses across configurations

#### ACP Adapters

Discover, create, and validate ACP adapters for agent integration.

**Commands:**

| Command | Description |
|---------|-------------|
| `headless` | Schema-driven adapter for any CLI agent |
| `adapter:scaffold` | Generate new adapter project with handlers |
| `adapter:check` | Validate ACP protocol compliance |

**Use cases:**
- Wrapping headless CLI agents with schema-driven adapter
- Finding existing adapters for your agent
- Building custom ACP adapters from scratch
- Validating adapter implementations

## Input Format

```jsonl
{"id":"test-001","input":"Create a primary button","hint":"should contain <button>","metadata":{"category":"ui"}}
{"id":"test-002","input":["Create a component","Now add tests"],"metadata":{"category":"multi-turn"}}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `input` | Yes | Single prompt (string) or conversation turns (string[]) |
| `hint` | No | Grader context - what to look for |
| `reference` | No | Reference solution (for validate-refs) |
| `metadata` | No | Tags, category, difficulty for filtering |

## Output Format

The harness outputs full trajectory JSONL (`CaptureResult` schema):

```jsonl
{
  "id": "test-001",
  "input": "Create a primary button",
  "output": "Here's a button component...",
  "hint": "should contain <button>",
  "trajectory": [...],
  "metadata": {"category": "ui", "agent": "bunx claude-code-acp", "trajectoryRichness": "full", "turnCount": 1},
  "timing": {"start": 1234567890, "end": 1234567900, "sessionCreation": 234, "total": 10},
  "toolErrors": false,
  "score": {"pass": true, "score": 1.0, "reasoning": "Contains hint"}
}
```

Key fields:
- `toolErrors`: Boolean indicating if any tool calls failed
- `score`: Grader result (only if `--grader` provided)
- `trajectory`: Full execution trace (thoughts, messages, tool calls, plans)
- `metadata.trajectoryRichness`: `"full"` | `"messages-only"` | `"minimal"`
- `timing.sessionCreation`: Time to initialize session (ms)
- `timing.total`: End-to-end duration (ms)

## Graders

Graders score agent outputs. The harness supports two types:

### TypeScript/JavaScript Graders

Export a `grade` function:

```typescript
import type { Grader } from '@plaited/acp-harness/schemas'

export const grade: Grader = async ({ input, output, hint, trajectory }) => {
  const pass = output.toLowerCase().includes(hint?.toLowerCase() ?? '')
  return {
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: pass ? 'Contains hint content' : 'Missing hint content'
  }
}
```

```bash
acp-harness capture prompts.jsonl bunx claude-code-acp --grader ./grader.ts
```

### Polyglot Graders (Python, etc.)

Any executable script using stdin/stdout JSON protocol:

```python
#!/usr/bin/env python3
import json
import sys

data = json.load(sys.stdin)
output = data["output"].lower()
hint = (data.get("hint") or "").lower()

pass_result = hint in output if hint else True
print(json.dumps({
    "pass": pass_result,
    "score": 1.0 if pass_result else 0.0,
    "reasoning": "Contains hint" if pass_result else "Missing hint"
}))
```

```bash
chmod +x grader.py
acp-harness capture prompts.jsonl bunx claude-code-acp --grader ./grader.py
```

**Protocol:**
- Input (stdin): `{"input": "...", "output": "...", "hint": "...", "trajectory": [...]}`
- Output (stdout): `{"pass": true, "score": 1.0, "reasoning": "..."}`

## Downstream Integration

```bash
# Filter failures
cat results.jsonl | jq 'select(.score.pass == false)'

# Extract tool usage patterns
cat results.jsonl | jq '.trajectory[] | select(.type == "tool_call") | .name'

# Use with your scoring pipeline
cat results.jsonl | your-scoring-script.ts
```

## Development

```bash
bun install          # Install dependencies
bun run check        # Type check + lint + format
bun test             # Run unit tests

# Run integration tests in Docker (requires API keys)
ANTHROPIC_API_KEY=sk-... docker compose -f docker-compose.test.yml run --rm acp-test
```

## Requirements

- **Runtime:** Bun >= 1.2.9
- **ACP Adapter:** Built-in `headless` command (recommended) or external adapter
- **API Key:** `ANTHROPIC_API_KEY` for Claude, `GEMINI_API_KEY` for Gemini

## License

ISC © [Plaited Labs](https://github.com/plaited)
