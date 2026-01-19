# @plaited/acp-harness

[![npm version](https://img.shields.io/npm/v/@plaited/acp-harness.svg)](https://www.npmjs.com/package/@plaited/acp-harness)
[![CI](https://github.com/plaited/acp-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/plaited/acp-harness/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

CLI tool for capturing agent trajectories from ACP-compatible agents. Execute prompts, capture full trajectories (tools, thoughts, plans), and output structured JSONL for downstream scoring. Available as both a CLI tool and as installable skills for AI coding agents.

## CLI Tool

Use these tools directly via the CLI without installation:

```bash
# Run without installing
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl

# Or install globally
bun add -g @plaited/acp-harness
acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl
```

**Prerequisite:** Install an ACP adapter and set your API key:

```bash
npm install -g @anthropic-ai/claude-code-acp
export ANTHROPIC_API_KEY=sk-...
```

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
| `adapter:scaffold [name]` | Scaffold new ACP adapter project |
| `adapter:check <cmd>` | Validate adapter ACP compliance |

### Examples

```bash
# Capture trajectories
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl

# Run trials for pass@k analysis
bunx @plaited/acp-harness trials prompts.jsonl bunx claude-code-acp -k 5 --grader ./grader.ts

# Summarize results
bunx @plaited/acp-harness summarize results.jsonl -o summary.jsonl

# Export schemas
bunx @plaited/acp-harness schemas CaptureResult --json

# Scaffold a new adapter
bunx @plaited/acp-harness adapter:scaffold my-agent -o ./my-agent-acp

# Validate adapter compliance
bunx @plaited/acp-harness adapter:check bun ./my-adapter/src/main.ts
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
| `adapter:scaffold` | Generate new adapter project with handlers |
| `adapter:check` | Validate ACP protocol compliance |

**Use cases:**
- Finding existing adapters for your agent
- Building custom ACP adapters from scratch
- Validating adapter implementations

## Input Format

```jsonl
{"id":"test-001","input":"Create a primary button","expected":"should contain <button>","metadata":{"category":"ui"}}
{"id":"test-002","input":"Fix the TypeScript error","metadata":{"category":"bugfix"}}
```

## Output Format

The harness outputs full trajectory JSONL (`CaptureResult` schema):

```jsonl
{
  "id": "test-001",
  "input": "Create a primary button",
  "output": "Here's a button component...",
  "expected": "should contain <button>",
  "trajectory": [...],
  "metadata": {"category": "ui", "agent": "bunx claude-code-acp"},
  "timing": {"start": 1234567890, "end": 1234567900},
  "toolErrors": false,
  "score": {"pass": true, "score": 1.0, "reasoning": "Contains expected"}
}
```

Key fields:
- `toolErrors`: Boolean indicating if any tool calls failed
- `score`: Grader result (only if `--grader` provided)
- `trajectory`: Full execution trace (thoughts, messages, tool calls, plans)

## Graders

Graders score agent outputs. The harness supports two types:

### TypeScript/JavaScript Graders

Export a `grade` function:

```typescript
import type { Grader } from '@plaited/acp-harness/schemas'

export const grade: Grader = async ({ input, output, expected, trajectory }) => {
  const pass = output.toLowerCase().includes(expected?.toLowerCase() ?? '')
  return {
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: pass ? 'Contains expected answer' : 'Missing expected answer'
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
expected = (data.get("expected") or "").lower()

pass_result = expected in output if expected else True
print(json.dumps({
    "pass": pass_result,
    "score": 1.0 if pass_result else 0.0,
    "reasoning": "Contains expected" if pass_result else "Missing expected"
}))
```

```bash
chmod +x grader.py
acp-harness capture prompts.jsonl bunx claude-code-acp --grader ./grader.py
```

**Protocol:**
- Input (stdin): `{"input": "...", "output": "...", "expected": "...", "trajectory": [...]}`
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
```

## Requirements

- **Runtime:** Bun >= 1.2.9
- **ACP Adapter:** `@anthropic-ai/claude-code-acp` or compatible
- **API Key:** `ANTHROPIC_API_KEY` environment variable

## License

ISC © [Plaited Labs](https://github.com/plaited)
