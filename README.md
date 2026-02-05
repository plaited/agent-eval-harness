# @plaited/agent-eval-harness

[![npm version](https://img.shields.io/npm/v/@plaited/agent-eval-harness.svg)](https://www.npmjs.com/package/@plaited/agent-eval-harness)
[![CI](https://github.com/plaited/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/plaited/agent-eval-harness/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

CLI tool for capturing agent trajectories from headless CLI agents. Execute prompts, capture full trajectories (tools, thoughts, plans), and output structured JSONL for downstream scoring. Available as both a CLI tool and as installable skills for AI coding agents.

## CLI Tool

Use these tools directly via the CLI without installation:

```bash
# Using built-in headless adapter (recommended - no extra install needed)
export ANTHROPIC_API_KEY=sk-...
bunx @plaited/agent-eval-harness capture prompts.jsonl \
  --schema ./schemas/claude-headless.json \
  -o results.jsonl
```

**Prerequisite:** Set your API key. The harness works with any CLI agent that supports JSON output - just provide a schema describing how to interact with it:

```bash
export ANTHROPIC_API_KEY=sk-...   # For Claude
export GEMINI_API_KEY=...         # For Gemini
```

Pre-built schemas are available in `.plaited/skills/headless-adapters/schemas/` for Claude and Gemini.

### Core Commands

| Command | Description |
|---------|-------------|
| `capture <prompts> --schema <path>` | Trajectory capture (full JSONL) |
| `trials <prompts> --schema <path>` | Multi-run with pass@k metrics |
| `summarize <results>` | Derive compact views from results |
| `calibrate <results>` | Sample failures for review |
| `validate-refs <prompts>` | Check reference solutions |
| `balance <prompts>` | Analyze test set coverage |
| `schemas [name]` | Export JSON schemas |
| `headless --schema <path>` | Schema-driven adapter for any CLI agent |

### Pipeline Commands (Unix-style)

| Command | Description |
|---------|-------------|
| `run <prompts> --schema <path>` | Execute prompts, output raw results |
| `extract <raw> --schema <path>` | Parse raw output into trajectories |
| `grade <results> --grader <path>` | Apply grader to extracted results |
| `format <results> --style <style>` | Convert to markdown, csv, or jsonl |
| `compare <run1> <run2>...` | Compare runs (aggregate report) |

### Examples

```bash
# Capture trajectories using headless adapter (recommended)
bunx @plaited/agent-eval-harness capture prompts.jsonl \
  --schema ./schemas/claude-headless.json \
  -o results.jsonl

# Parallel capture (4x faster with 4 workers)
bunx @plaited/agent-eval-harness capture prompts.jsonl \
  --schema ./schemas/claude-headless.json \
  -j 4 -o results.jsonl

# Run trials for pass@k analysis with debug mode
bunx @plaited/agent-eval-harness trials prompts.jsonl \
  --schema ./schemas/claude-headless.json \
  -k 5 --grader ./grader.ts --debug

# Parallel trials (4 prompts running trials concurrently)
bunx @plaited/agent-eval-harness trials prompts.jsonl \
  --schema ./schemas/claude-headless.json \
  -k 5 -j 4 --workspace-dir ./workspaces -o trials.jsonl

# Summarize results
bunx @plaited/agent-eval-harness summarize results.jsonl -o summary.jsonl

# Export schemas
bunx @plaited/agent-eval-harness schemas CaptureResult --json

# Pipeline workflow (Unix-style composition)
cat prompts.jsonl | \
  bunx @plaited/agent-eval-harness run -s ./schemas/claude-headless.json | \
  bunx @plaited/agent-eval-harness extract -s ./schemas/claude-headless.json | \
  bunx @plaited/agent-eval-harness grade -g ./grader.ts | \
  bunx @plaited/agent-eval-harness format -f markdown > report.md

# Compare runs (built-in strategies: weighted, statistical, custom)
bunx @plaited/agent-eval-harness compare run1.jsonl run2.jsonl -o comparison.json

# Compare trials for pass@k reliability analysis (auto-detects format)
bunx @plaited/agent-eval-harness compare trials1.jsonl trials2.jsonl -o comparison.json
```

## Skills for AI Agents

**Install skills** for use with AI coding agents:

```bash
curl -fsSL https://raw.githubusercontent.com/plaited/skills-installer/main/install.sh | bash -s -- --agents <agent-name> --project agent-eval-harness
```

Replace `<agent-name>` with your agent: `claude`, `cursor`, `copilot`, `opencode`, `amp`, `goose`, `factory`

### Available Skills

#### Agent Eval Harness

CLI tool for capturing agent trajectories, optimized for TypeScript/JavaScript projects using Bun.

**Core Commands:**

| Command | Description |
|---------|-------------|
| `capture` | Execute prompts and capture full trajectories |
| `trials` | Multi-run trials with pass@k/pass^k metrics |
| `summarize` | Derive compact views from trajectory results |
| `calibrate` | Sample failures for grader calibration |
| `validate-refs` | Validate reference solutions against graders |
| `balance` | Analyze test set coverage distribution |
| `schemas` | Export Zod schemas as JSON Schema |

**Pipeline Commands (Unix-style):**

| Command | Description |
|---------|-------------|
| `run` | Execute prompts, output raw results |
| `extract` | Parse raw output into trajectories |
| `grade` | Apply grader to extracted results |
| `format` | Convert to markdown, csv, or jsonl |
| `compare` | Compare runs (aggregate report) |

**Use cases:**
- Capturing trajectories for downstream evaluation (Braintrust, custom scorers)
- Generating training data (SFT/DPO) with full context
- Building regression test fixtures for agent behavior
- Comparing agent responses across configurations

#### Headless Adapters

Schema-driven adapters for headless CLI agent integration.

**Commands:**

| Command | Description |
|---------|-------------|
| `headless` | Schema-driven adapter for any CLI agent |

**Use cases:**
- Wrapping headless CLI agents with schema-driven adapter
- Finding existing adapters for your agent
- Creating new schemas for CLI agents

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
| `timeout` | No | Override default timeout for this prompt (ms) |

## Output Format

The harness outputs full trajectory JSONL (`CaptureResult` schema):

```jsonl
{
  "id": "test-001",
  "input": "Create a primary button",
  "output": "Here's a button component...",
  "hint": "should contain <button>",
  "trajectory": [...],
  "metadata": {"category": "ui", "trajectoryRichness": "full", "turnCount": 1},
  "timing": {"start": 1234567890, "end": 1234567900, "total": 10},
  "toolErrors": false,
  "exitInfo": {"exitCode": 0},
  "score": {"pass": true, "score": 1.0, "reasoning": "Contains hint"}
}
```

Key fields:
- `toolErrors`: Boolean indicating if any tool calls failed
- `score`: Grader result (only if `--grader` provided)
- `trajectory`: Full execution trace (thoughts, messages, tool calls, plans)
- `metadata.trajectoryRichness`: `"full"` | `"messages-only"` | `"minimal"`
- `exitInfo`: Process exit information (`exitCode`, `signal`, `timedOut`)
- `timing.total`: End-to-end duration (ms)

## Graders

Graders score agent outputs. The harness supports two types and two grading approaches:

### Git-Based Outcome Grading (Recommended for Coding Agents)

**Grade outcomes, not paths.** Use git to detect actual environmental changes:

```typescript
import type { Grader } from '@plaited/agent-eval-harness/schemas'
import { resolve } from 'node:path'

export const grade: Grader = async ({ output, hint, cwd }) => {
  // Validate cwd to prevent command injection
  const isValidPath = (path: string): boolean => {
    const dangerousChars = /[;&|`$(){}[\]<>'"\\]/
    if (dangerousChars.test(path)) return false
    if (path.includes('..') || path.startsWith('-')) return false
    return true
  }

  if (!cwd || !isValidPath(cwd)) {
    return { 
      pass: false, 
      score: 0, 
      reasoning: 'Invalid working directory path' 
    }
  }
  
  const safeCwd = resolve(cwd)
  
  // Detect file changes using git
  const status = await Bun.$`git -C ${safeCwd} status --porcelain`.text()
  const filesCreated = status
    .split('\n')
    .filter(line => line.startsWith('??'))
    .map(line => line.slice(3).trim())
  
  // Run tests to verify outcome
  const testResult = await Bun.$`cd ${safeCwd} && bun test`.nothrow()
  const testsPassed = testResult.exitCode === 0
  
  return {
    pass: filesCreated.length > 0 && testsPassed,
    score: testsPassed ? 1.0 : 0.0,
    reasoning: `Files created: ${filesCreated.join(', ')}. Tests: ${testsPassed ? 'pass' : 'fail'}`,
    outcome: {  // Optional: structured data for analysis
      filesCreated,
      testsPassed,
      type: 'file_creation_with_tests'
    }
  }
}
```

**Benefits:**
- Detects actual file changes, test results, build success
- Works universally in any git repo, any language
- Returns structured `outcome` data for downstream analysis
- Zero configuration required

### Output-Based Grading (General Purpose)

For non-coding tasks or when git is unavailable:

```typescript
import type { Grader } from '@plaited/agent-eval-harness/schemas'

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
agent-eval-harness capture prompts.jsonl --schema ./claude.json --grader ./grader.ts
```

### Polyglot Graders (Python, etc.)

Any executable script using stdin/stdout JSON protocol:

```python
#!/usr/bin/env python3
import json
import sys
import subprocess
import re
import os

data = json.load(sys.stdin)
output = data["output"].lower()
hint = (data.get("hint") or "").lower()
cwd = data.get("cwd")

# Validate cwd to prevent command injection
def is_valid_path(path):
    if not path:
        return False
    # Reject shell metacharacters
    if re.search(r'[;&|`$(){}\[\]<>\'"\\]', path):
        return False
    # Reject directory traversal and option injection
    if '..' in path or path.startswith('-'):
        return False
    return True

# Git-based grading if cwd is provided
if cwd:
    if not is_valid_path(cwd):
        print(json.dumps({
            "pass": False,
            "score": 0.0,
            "reasoning": "Invalid working directory path"
        }))
        sys.exit(0)
    
    safe_cwd = os.path.abspath(cwd)
    
    try:
        result = subprocess.run(
            ["git", "-C", safe_cwd, "status", "--porcelain"],
            capture_output=True, text=True, check=True
        )
        files_created = [
            line[3:].strip() 
            for line in result.stdout.split('\n') 
            if line.startswith('??')
        ]
        has_changes = len(files_created) > 0
        print(json.dumps({
            "pass": has_changes,
            "score": 1.0 if has_changes else 0.0,
            "reasoning": f"Files created: {', '.join(files_created)}",
            "outcome": {"filesCreated": files_created, "type": "git_check"}
        }))
        sys.exit(0)
    except subprocess.CalledProcessError:
        # Fall back to output-based grading
        pass

# Output-based grading fallback
pass_result = hint in output if hint else True
print(json.dumps({
    "pass": pass_result,
    "score": 1.0 if pass_result else 0.0,
    "reasoning": "Contains hint" if pass_result else "Missing hint"
}))
```

```bash
chmod +x grader.py
agent-eval-harness capture prompts.jsonl --schema ./claude.json --grader ./grader.py
```

**Protocol:**
- Input (stdin): `{"input": "...", "output": "...", "hint": "...", "trajectory": [...], "cwd": "/path/to/dir"}`
- Output (stdout): `{"pass": true, "score": 1.0, "reasoning": "...", "outcome": {...}}`
- `cwd` and `outcome` are optional fields

## Downstream Integration

The harness outputs standard JSONL. When graders return the optional `outcome` field, it's merged onto results for powerful downstream analysis:

```bash
# Filter failures
cat results.jsonl | jq 'select(.score.pass == false)'

# Extract tool usage patterns
cat results.jsonl | jq '.trajectory[] | select(.type == "tool_call") | .name'

# Analyze outcomes from git-based graders
cat results.jsonl | jq 'select(.outcome.type == "test_execution")'
cat results.jsonl | jq -s 'map(select(.outcome.testsPassed)) | length'
cat results.jsonl | jq 'select(.outcome.touchedCriticalFiles == true)'

# Use with your scoring pipeline
cat results.jsonl | your-scoring-script.ts
```

### Outcome Field

Git-based graders can return structured `outcome` data:

```jsonl
{
  "id": "fix-tests",
  "input": "Fix the failing authentication tests",
  "output": "I fixed the auth tests by...",
  "score": {"pass": true, "score": 1.0, "reasoning": "Tests pass"},
  "outcome": {
    "testsPassed": true,
    "filesModified": ["src/auth.ts", "src/auth.spec.ts"],
    "exitCode": 0,
    "type": "test_execution"
  }
}
```

This enables rich analysis across evaluations without re-parsing trajectories.

## Development

```bash
bun install               # Install dependencies
bun run check             # Type check + lint + format
bun test                  # Run unit tests
bun run test:integration  # Run integration tests (requires API keys)

# Alternative: Run integration tests in Docker
ANTHROPIC_API_KEY=sk-... GEMINI_API_KEY=... \
  docker compose -f docker-compose.test.yml run --rm test
```

## Requirements

- **Runtime:** Bun >= 1.2.9
- **Schema:** JSON schema describing CLI agent interaction (see `.plaited/skills/headless-adapters/schemas/`)
- **API Key:** `ANTHROPIC_API_KEY` for Claude, `GEMINI_API_KEY` for Gemini

## License

ISC © [Plaited Labs](https://github.com/plaited)
