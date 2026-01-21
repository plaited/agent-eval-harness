---
name: acp-harness
description: CLI tool for capturing agent trajectories. Execute prompts against ACP-compatible agents, capture full trajectories (tools, thoughts, plans), and output structured JSONL for downstream scoring.
compatibility: Bun >= 1.2.9
---

# ACP Harness

## Purpose

CLI tool for capturing trajectories from ACP-compatible agents, optimized for TypeScript/JavaScript projects using Bun.

**The harness captures. You score.**

| Harness Provides | You Provide |
|------------------|-------------|
| Prompt execution against ACP agents | Scoring logic (Braintrust, custom scripts) |
| Full trajectory capture (thoughts, tools, plans) | Pass/fail determination via graders |
| Structured JSONL output | LLM-as-judge prompts |
| Reproducible execution environment | CI integration, golden file comparison |

**Use this when:**
- Capturing trajectories for downstream evaluation
- Generating training data (SFT/DPO) with full context
- Building regression test fixtures for agent behavior
- Comparing agent responses across configurations

## Installation

```bash
# Run without installing (recommended)
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl

# Or install as project dependency
bun add @plaited/acp-harness
```

## Core Principle: Capture Once, Derive Many Views

```mermaid
flowchart LR
    Prompts["prompts.jsonl"] --> Capture["capture/trials"]
    Agent["ACP Agent"] --> Capture
    Capture --> Results["results.jsonl (full trajectory)"]
    Results --> Summarize["summarize"]
    Results --> Calibrate["calibrate"]
    Results --> Custom["(your tools)"]
    Summarize --> Views["summary.jsonl / .md"]
    Calibrate --> Report["calibration.md"]
    Custom --> Pipeline["any scoring platform"]
```

**Single output format:** Full trajectory JSONL (always)
**No `--format` flag:** Derive views with separate commands
**Schema exports:** Zod schemas + JSON Schema for any tooling

## Commands

| Command | Input | Output | Purpose |
|---------|-------|--------|---------|
| `capture` | prompts.jsonl + agent | results.jsonl | Trajectory capture (full) |
| `trials` | prompts.jsonl + agent | trials.jsonl | Multi-run + optional metrics |
| `summarize` | results.jsonl | summary.jsonl or .md | Derive compact views |
| `calibrate` | results.jsonl | calibration.md | Sample failures for review |
| `validate-refs` | prompts.jsonl | validation.jsonl | Check reference solutions |
| `balance` | prompts.jsonl | balance.json | Analyze test set coverage |
| `schemas` | (none) | JSON Schema | Export schemas for non-TS users |

All commands support optional `--grader ./grader.ts` for scoring.

## Capture Command

### Basic Usage

```bash
bunx @plaited/acp-harness capture <prompts.jsonl> <command> [args...] [options]
```

### Arguments

| Argument/Flag | Description | Default |
|------|-------------|---------|
| `prompts.jsonl` | Input file with prompts to execute | Required |
| `command [args]` | ACP agent command (e.g., `bunx claude-code-acp`) | Required |
| `-o, --output` | Output file/path | stdout |
| `-c, --cwd` | Working directory for agent (agents auto-discover MCP configs from here) | current |
| `-t, --timeout` | Request timeout in ms | `60000` |
| `--progress` | Show progress to stderr | false |
| `--append` | Append to output file | false |
| `-g, --grader` | Path to grader module | none |

### Examples

```bash
# Basic capture
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp -o results.jsonl

# Using a local adapter script
bunx @plaited/acp-harness capture prompts.jsonl bun ./my-adapter.ts -o results.jsonl

# With grader (adds score to each result)
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp --grader ./grader.ts -o results.jsonl
```

## Trials Command

Run each prompt multiple times for pass@k/pass^k analysis.

```bash
# Capture only (no grader)
bunx @plaited/acp-harness trials prompts.jsonl bunx claude-code-acp -k 5 -o trials.jsonl

# With grader (computes pass@k, pass^k)
bunx @plaited/acp-harness trials prompts.jsonl bunx claude-code-acp -k 5 --grader ./grader.ts -o trials.jsonl
```

### Output

Without grader:
```jsonl
{"id":"search-001","input":"Find the CEO","k":5,"trials":[{"trialNum":1,"output":"...","trajectory":[...],"duration":1234},...]}
```

With grader:
```jsonl
{"id":"search-001","input":"Find the CEO","k":5,"passRate":0.8,"passAtK":0.99,"passExpK":0.33,"trials":[{"trialNum":1,"output":"...","pass":true,"score":1.0},...]}
```

## Summarize Command

Derive compact views from full trajectory results.

```bash
# Summary JSONL (for jq analysis)
bunx @plaited/acp-harness summarize results.jsonl -o summary.jsonl

# Markdown (for LLM-as-judge)
bunx @plaited/acp-harness summarize results.jsonl --markdown -o results.md
```

## Calibrate Command

Sample failures for grader review. Calibration helps you distinguish between **agent failures** (agent did wrong thing) and **grader bugs** (agent was correct, grader too strict).

```bash
# Sample failures for human review
bunx @plaited/acp-harness calibrate results.jsonl --sample 10 -o calibration.md

# Re-score with different grader to compare
bunx @plaited/acp-harness calibrate results.jsonl --grader ./loose-grader.ts --sample 10 -o comparison.md
```

See [eval-concepts.md](references/eval-concepts.md#grader-calibration) for why calibration matters.

## Validate-Refs Command

Check that reference solutions pass your grader before evaluating agents.

```bash
# Validate reference solutions
bunx @plaited/acp-harness validate-refs prompts.jsonl --grader ./grader.ts -o validation.jsonl

# Check for failures
cat validation.jsonl | jq 'select(.pass == false)'
```

### Why Use This?

If your reference solution fails your own grader:
- The task definition is ambiguous
- The grader is too strict
- The expected output is wrong

**Fix the eval before evaluating the agent.**

### Input Format

Prompts must include a `reference` field:

```jsonl
{"id":"test-001","input":"Create a button component","hint":"<button>","reference":"export const Button = () => <button>Click</button>"}
```

### Output Format

```jsonl
{"id":"test-001","input":"Create a button component","reference":"export const Button = () => <button>Click</button>","pass":true,"score":1.0,"reasoning":"Contains expected element"}
```

## Balance Command

Analyze test set coverage to ensure balanced evaluation.

```bash
# Analyze prompt distribution
bunx @plaited/acp-harness balance prompts.jsonl -o balance.json

# Pretty print
bunx @plaited/acp-harness balance prompts.jsonl | jq .
```

### Why Use This?

An eval with only "make X work" misses "don't break Y". Balance analysis shows:

- **Category distribution** (from `metadata.category`)
- **Positive/negative case ratio**
- **Coverage gaps**

### Output Format

```json
{
  "totalCases": 50,
  "categories": [
    { "name": "ui", "count": 20, "percentage": 40 },
    { "name": "logic", "count": 15, "percentage": 30 },
    { "name": "api", "count": 10, "percentage": 20 },
    { "name": "edge-case", "count": 5, "percentage": 10 }
  ],
  "underrepresented": ["edge-case"],
  "suggestions": ["Consider adding more test cases for: edge-case"]
}
```

### Balanced Eval Design

Include both positive and negative cases:

| Type | Example | Purpose |
|------|---------|---------|
| Positive | "Add a login button" | Agent should succeed |
| Negative | "Add a button without breaking tests" | Agent should not break things |
| Edge case | "Handle empty input gracefully" | Agent should be robust |

See [eval-concepts.md](references/eval-concepts.md#test-set-balance) for more on balanced test sets.

## Schemas Command

Export JSON schemas for non-TypeScript tools.

```bash
# List available schemas
bunx @plaited/acp-harness schemas

# Export all schemas as JSON
bunx @plaited/acp-harness schemas --json -o schemas.json

# Export specific schema
bunx @plaited/acp-harness schemas CaptureResult --json
bunx @plaited/acp-harness schemas TrialResult --json
bunx @plaited/acp-harness schemas GraderResult --json
```

### Available Schemas

| Schema | Description |
|--------|-------------|
| `CaptureResult` | Single capture output (id, input, output, trajectory, timing) |
| `TrialResult` | Multi-run trial output (includes passAtK, passExpK) |
| `GraderResult` | Grader return value (pass, score, reasoning) |
| `PromptInput` | Input prompt format |
| `TrajectoryStep` | Single step in trajectory array |
| `SummaryResult` | Compact summary format |

### Usage in Other Languages

Export schemas for validation in Python, Go, etc.:

```bash
# Export all schemas
bunx @plaited/acp-harness schemas --json -o schemas.json

# Use in Python with jsonschema
python -c "
import json
from jsonschema import validate

with open('schemas.json') as f:
    schemas = json.load(f)

with open('results.jsonl') as f:
    for line in f:
        result = json.loads(line)
        validate(result, schemas['CaptureResult'])
        print(f'{result[\"id\"]}: valid')
"
```

## Grader Interface

Graders provide semantic pass/fail scoring for captured trajectories. The harness supports graders written in **any language**.

### TypeScript Grader

```typescript
// my-grader.ts
import type { Grader } from '@plaited/acp-harness/schemas'

export const grade: Grader = async ({ input, output, hint, trajectory }) => {
  const pass = output.toLowerCase().includes(hint?.toLowerCase() ?? '')
  return {
    pass,
    score: pass ? 1 : 0,
    reasoning: pass ? 'Contains hint content' : 'Missing hint content'
  }
}
```

**Note:** `input` can be `string` (single turn) or `string[]` (multi-turn). The `hint` field provides grader context (renamed from `expected`).

### Python/Executable Graders

Any executable can be a grader using stdin/stdout JSON protocol:

```python
#!/usr/bin/env python3
import json, sys

data = json.load(sys.stdin)
output = data.get("output", "").lower()
hint = (data.get("hint") or "").lower()

pass_result = hint in output if hint else True
print(json.dumps({
    "pass": pass_result,
    "score": 1.0 if pass_result else 0.0,
    "reasoning": "Contains hint" if pass_result else "Missing hint"
}))
```

```bash
chmod +x ./grader.py
bunx @plaited/acp-harness capture prompts.jsonl bunx claude-code-acp --grader ./grader.py -o results.jsonl
```

See [graders.md](references/graders.md) for complete polyglot grader documentation including shell scripts and LLM-as-judge patterns.

## Input Format

Each line in `prompts.jsonl`:

```jsonl
{"id":"test-001","input":"Create a button","hint":"should contain <button>"}
{"id":"test-002","input":["Create a button","Make it blue"],"metadata":{"category":"ui"}}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `input` | Yes | Single prompt (string) or conversation turns (string[]) |
| `hint` | No | Grader context - what to look for (not strict match) |
| `reference` | No | Reference solution (for validate-refs) |
| `metadata` | No | Tags, category, difficulty for filtering |
| `timeout` | No | Override default timeout for this prompt |

**Session behavior:** Each JSONL entry = 1 fresh session
- `input: string` → 1 session, 1 prompt
- `input: string[]` → 1 session, N prompts (sequential turns)

## Output Format

Full trajectory JSONL (always):

```jsonl
{
  "id": "test-001",
  "input": "Find the CEO of Anthropic",
  "output": "The CEO of Anthropic is Dario Amodei.",
  "hint": "should mention Dario Amodei",
  "trajectory": [
    {"type": "thought", "content": "I'll search for this...", "timestamp": 100},
    {"type": "tool_call", "name": "WebSearch", "status": "completed", "input": {...}, "output": {...}, "duration": 500},
    {"type": "message", "content": "The CEO of Anthropic is Dario Amodei.", "timestamp": 700}
  ],
  "metadata": {
    "category": "search",
    "agent": "bunx claude-code-acp",
    "trajectoryRichness": "full",
    "turnCount": 1
  },
  "timing": {
    "start": 1704067200000,
    "end": 1704067201234,
    "firstResponse": 100,
    "sessionCreation": 234,
    "total": 1234,
    "inputTokens": 150,
    "outputTokens": 85
  },
  "toolErrors": false
}
```

### Output Fields

| Field | Description |
|-------|-------------|
| `input` | Original prompt (string or string[] for multi-turn) |
| `hint` | Grader context hint (if provided) |
| `metadata.trajectoryRichness` | `"full"` \| `"messages-only"` \| `"minimal"` |
| `metadata.turnCount` | Number of conversation turns (1 for string, N for array) |
| `timing.sessionCreation` | Time to create session (ms) |
| `timing.total` | Total duration (end - start) |
| `timing.inputTokens` | Input tokens consumed (if available from adapter) |
| `timing.outputTokens` | Output tokens generated (if available from adapter) |
| `toolErrors` | Whether any tool calls failed |

**Note:** `toolErrors` replaces misleading `status: 'passed'|'failed'`. Real pass/fail comes from YOUR grader.

## Schema Exports

Consumers can import Zod schemas directly:

```typescript
import { CaptureResultSchema, TrialResultSchema } from '@plaited/acp-harness/schemas'

// Validate external data
const result = CaptureResultSchema.parse(jsonData)

// Generate JSON Schema (Zod 4 native)
import { z } from 'zod'
const jsonSchema = z.toJSONSchema(CaptureResultSchema)
```

Or export JSON schemas for non-TypeScript tools:

```bash
bunx @plaited/acp-harness schemas --json -o schemas.json
bunx @plaited/acp-harness schemas CaptureResult --json
```

## Execution Environment

**Recommendation:** Run the harness in Docker containers for consistent, isolated execution.

```bash
# Run integration tests via Docker
docker compose -f docker-compose.test.yml run --rm acp-test

# Or with explicit API keys
ANTHROPIC_API_KEY=sk-... GEMINI_API_KEY=... docker compose -f docker-compose.test.yml run --rm acp-test
```

### Docker Requirements

| Requirement | Reason |
|-------------|--------|
| **Node.js 24+** | Gemini CLI uses modern JS features (optional chaining) |
| **Non-root user** | Claude CLI blocks `--dangerously-skip-permissions` as root |
| **Gemini API key** | Pass `GEMINI_API_KEY` for Gemini CLI |

See [docker-evals.md](references/docker-evals.md) for complete Docker setup guide, debugging tips, and CI integration patterns.

### Multi-turn Conversations

Use `input: string[]` to execute multi-turn conversations within a single session:

```jsonl
{"id":"context-001","input":["Remember this number: 42","What number did I ask you to remember?"],"hint":"42"}
{"id":"context-002","input":["My name is Alice","What is my name?"],"hint":"Alice"}
```

Run with the headless adapter:

```bash
# Using Claude Code via headless adapter
bunx @plaited/acp-harness capture multi-turn.jsonl \
  bunx @plaited/acp-harness headless --schema ./claude-headless.json \
  -o results.jsonl

# Using Gemini CLI via headless adapter
GEMINI_API_KEY=... bunx @plaited/acp-harness capture multi-turn.jsonl \
  bunx @plaited/acp-harness headless --schema ./gemini-headless.json \
  -o results.jsonl
```

**Key points:**
- Each JSONL entry = 1 fresh session
- `input: string[]` sends sequential turns to the **same session**
- Works with both `stream` mode (Claude) and `iterative` mode (Gemini)
- The adapter handles context preservation automatically

## Downstream Integration

The harness outputs standard JSONL that pipes to any tool:

```bash
# Filter with jq
cat results.jsonl | jq 'select(.metadata.category == "ui")'

# Count tool usage
cat results.jsonl | jq -s 'map(.trajectory | map(select(.type == "tool_call")) | length) | add'

# Summarize for quick analysis
bunx @plaited/acp-harness summarize results.jsonl -o summary.jsonl
```

See [downstream.md](references/downstream.md) for integration patterns with Braintrust, Gemini, and custom scorers.

## Quick Reference

| Resource | Description |
|----------|-------------|
| `bunx @plaited/acp-harness` | CLI help |
| [output-formats.md](references/output-formats.md) | JSONL schemas, command details |
| [downstream.md](references/downstream.md) | Integration patterns (Braintrust, jq, custom scorers) |
| [graders.md](references/graders.md) | Polyglot grader documentation (TypeScript, Python, shell) |
| [eval-concepts.md](references/eval-concepts.md) | Evaluation concepts (pass@k, pass^k, calibration) |
| [docker-evals.md](references/docker-evals.md) | Docker setup, debugging, CI integration |

## Related

- **[@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk)** - ACP SDK for programmatic access
- **[@zed-industries/claude-code-acp](https://www.npmjs.com/package/@zed-industries/claude-code-acp)** - Claude Code ACP adapter
