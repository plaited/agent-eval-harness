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
| Full trajectory capture (thoughts, tools, plans) | Pass/fail determination |
| Structured JSONL output | LLM-as-judge prompts |
| Reproducible execution environment | CI integration, golden file comparison |

**Use this when:**
- Capturing trajectories for downstream evaluation
- Generating training data (SFT/DPO) with full context
- Building regression test fixtures for agent behavior
- Comparing agent responses across configurations

## Installation

```bash
# Run without installing (recommended for CI)
bunx @plaited/acp-harness prompts.jsonl -o results.jsonl

# Or install globally for repeated use
bun add -g @plaited/acp-harness
acp-harness prompts.jsonl -o results.jsonl

# Or add as project dependency
bun add @plaited/acp-harness
```

**Note:** Examples below use `acp-harness` (the command available after global install). Replace with `bunx @plaited/acp-harness` if not installed globally.

## Capture Workflow

```mermaid
flowchart LR
    Prompts["prompts.jsonl"] --> Harness["acp-harness"]
    Agent["ACP Agent"] --> Harness
    Harness -->|"JSONL"| Output["trajectories"]
    Output --> Scoring["Your scoring logic"]
    Scoring --> Decision["Informed choices"]
```

The harness is a **capture layer** - it executes prompts and records trajectories. Scoring happens in your codebase.

| Use Case | Harness Captures | You Build |
|----------|------------------|-----------|
| **Agent comparison** | Same prompts → multiple agents → trajectories | Scoring pipeline (Braintrust, custom) |
| **Tool comparison** | Trajectory with tool/skill attribution | Diff analysis, preference data |
| **Training data** | Structured I/O with tool calls, plans, thoughts | SFT/DPO formatting |
| **Regression testing** | Deterministic prompt → trajectory capture | Golden file comparison, CI assertions |

### Example: Comparing Built-in vs Skill

```bash
# Run same prompt with built-in tool
acp-harness prompts.jsonl \
  --cmd "bunx claude-code-acp" \
  -o results-builtin.jsonl

# Run same prompt with custom skill installed
acp-harness prompts.jsonl \
  --cmd "bunx claude-code-acp" \
  --cwd /project/with/typescript-lsp-skill \
  -o results-skill.jsonl

# Compare trajectories - which used better tools? faster? more accurate?
diff <(jq '.toolCalls' results-builtin.jsonl) <(jq '.toolCalls' results-skill.jsonl)
```

## Execution Environment

**Recommendation:** Run the harness in Docker containers for consistent, isolated execution.

```bash
# Build and run with Docker Compose
docker compose -f docker-compose.acp.yml run --rm acp-harness

# Or build directly
docker build -f Dockerfile.acp -t acp-harness .
docker run --rm -e ANTHROPIC_API_KEY acp-harness
```

Docker provides:
- Consistent environment across local and CI
- Filesystem isolation without app-level sandboxing
- Reproducible results for training data generation

See [assets/](assets/) for example container configurations:
- `Dockerfile.acp` - Base container with Bun and git
- `docker-compose.acp.yml` - Compose file with volume mounts for results

## Non-Goals

This harness is optimized for TypeScript/JavaScript projects using Bun. It is **not** designed for:

- **Python projects** - Use [SWE-bench](https://github.com/SWE-bench/SWE-bench), [Braintrust Python SDK](https://www.braintrust.dev/)
- **Academic model benchmarking** - Use [EleutherAI lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)
- **IDE integrations** - Use Copilot Evaluation Harness
- **SaaS observability** - Use Braintrust, Langfuse platforms directly

## Quick Reference

| Resource | Description |
|----------|-------------|
| `bunx @plaited/acp-harness` | Execute prompts against agent, capture trajectories |
| [output-formats.md](references/output-formats.md) | JSONL schemas, format options |
| [downstream.md](references/downstream.md) | Integration patterns (Braintrust, jq, custom scorers) |

## Output Pipeline

```mermaid
flowchart LR
    Prompts["prompts.jsonl"] --> Harness["acp-harness"]
    Agent["ACP Agent"] --> Harness
    Harness --> Summary["summary.jsonl"]
    Harness --> Full["results.md + results.full.jsonl"]
    Summary --> Your["Your scoring code"]
    Full --> Your
```

1. **Prepare** - Create `prompts.jsonl` with test cases
2. **Execute** - Run harness against target agent
3. **Capture** - Trajectories streamed to output files
4. **Score** - Pipe output to your scoring logic (Braintrust, jq, LLM-as-judge)

## Harness Script

### Basic Usage

```bash
acp-harness <prompts.jsonl> --cmd <cmd> [options]
```

### Arguments

| Flag | Description | Default |
|------|-------------|---------|
| `prompts.jsonl` | Input file with prompts to execute | Required |
| `--cmd, --command` | ACP agent command (e.g., `bunx claude-code-acp`, `bun ./adapter.ts`) | `"claude-code-acp"` |
| `-o, --output` | Output file/path | stdout |
| `-c, --cwd` | Working directory for agent | current |
| `-t, --timeout` | Request timeout in ms | `60000` |
| `-f, --format` | Output format: `summary`, `judge` | `summary` |
| `--progress` | Show progress to stderr | false |
| `--append` | Append to output file | false |
| `--mcp-server` | MCP server config JSON (repeatable) | none |

### Examples

```bash
# Using the default claude-code-acp adapter
acp-harness prompts.jsonl -o results.jsonl

# Using bunx to run an adapter
acp-harness prompts.jsonl --cmd "bunx claude-code-acp" -o results.jsonl

# Using a local adapter script (great for custom adapters in same repo)
acp-harness prompts.jsonl --cmd "bun ./my-adapter.ts" -o results.jsonl

# Judge format - creates two files for downstream scoring
acp-harness prompts.jsonl --format judge -o results
# Creates: results.md (summary with step IDs) + results.full.jsonl (complete trajectory)

# With MCP server (stdio transport)
acp-harness prompts.jsonl \
  --mcp-server '{"type":"stdio","name":"fs","command":["mcp-filesystem","/data"]}'

# With MCP server (HTTP transport)
acp-harness prompts.jsonl \
  --mcp-server '{"type":"http","name":"api","url":"http://localhost:3000"}'

# Stream with progress
acp-harness prompts.jsonl --progress -o results.jsonl
```

## Input Format

Each line in `prompts.jsonl`:

```jsonl
{"id":"test-001","input":"Create a primary button","expected":"should contain <button>","metadata":{"category":"ui"}}
{"id":"test-002","input":"Write a function for form validation","metadata":{"category":"logic"}}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `input` | Yes | Prompt text for the agent |
| `expected` | No | Expected output (for downstream scoring) |
| `metadata` | No | Tags, category, difficulty for filtering |
| `timeout` | No | Override default timeout for this prompt |

## Output Formats

### Summary Format (default)

Minimal JSONL for quick metrics and analysis:

```jsonl
{"id":"test-001","input":"Create a button","output":"I created...","toolCalls":["Write"],"status":"passed","duration":1234}
```

### Judge Format (two-tier)

Creates two files optimized for downstream LLM-as-judge scoring:

**`<output>.md`** - Markdown summary with step IDs and code previews:

```markdown
## Capture Record: test-001

**Input:** Create a primary button

**Trajectory:**
1. [THOUGHT] I'll create a styled button... [->test-001-step-1]
2. [TOOL:Write] -> completed (234ms) [->test-001-step-2]
   File: src/button.tsx (847 chars)
   ```tsx
   import { css } from 'some-css-lib'

   type ButtonProps = {
     label: string

   // ... 30 lines omitted ...

   export const Button = ({ label }: ButtonProps) => (
     <button className={styles.btn}>{label}</button>
   )
   ```
3. [MESSAGE] I created the button... [->test-001-step-3]

**Output:** I created the button with primary styling.
**Metadata:** category=ui, agent=claude-code-acp
**Status:** passed
**Duration:** 1234ms

---
```

**`<output>.full.jsonl`** - Complete trajectory with step IDs for correlation:

```jsonl
{"id":"test-001","input":"...","output":"...","trajectory":[{"type":"thought","content":"...","timestamp":100,"stepId":"test-001-step-1"},{"type":"tool_call","name":"Write","status":"completed","input":{...},"output":{...},"duration":234,"stepId":"test-001-step-2"}],...}
```

**Usage patterns by judge context window:**

| Judge Model | Strategy |
|-------------|----------|
| Gemini (1M+ tokens) | Feed `results.full.jsonl` directly |
| Claude/GPT-4 (128-200k) | Use `results.full.jsonl` for most runs |
| Smaller models | Use `results.md`, retrieve specific steps by ID as needed |

## Downstream Integration

The harness outputs standard JSONL that pipes to any tool:

```bash
# Filter with jq
cat results.jsonl | jq 'select(.metadata.category == "ui")'

# Count tool usage
cat results.jsonl | jq -s 'map(.toolCalls | length) | add'

# Feed full trajectory to Gemini (large context)
cat results.full.jsonl | your-gemini-judge.ts
```

See [downstream.md](references/downstream.md) for integration patterns with Braintrust, Gemini, and custom scorers.

## Capture Targets

| Target | How to Capture |
|--------|----------------|
| **Agent capability** | Direct prompts, capture trajectory for analysis |
| **Skills** | Set `--cwd` to project with skill, capture skill-specific behavior |
| **MCP Servers** | Use `--mcp-server` flag, capture tool usage in trajectory |

### Capturing Skill Behavior

```bash
bunx @plaited/acp-harness skill-prompts.jsonl \
  --cwd /project/with/skill \
  -o results.jsonl
```

### Capturing MCP Server Usage

```bash
bunx @plaited/acp-harness mcp-prompts.jsonl \
  --mcp-server '{"type":"stdio","name":"fs","command":["mcp-filesystem"]}' \
  -o results.jsonl
```

## Related

- **[@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk)** - ACP SDK for programmatic access
- **[@zed-industries/claude-code-acp](https://www.npmjs.com/package/@zed-industries/claude-code-acp)** - Claude Code ACP adapter
