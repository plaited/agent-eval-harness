# @plaited/acp

[![npm version](https://img.shields.io/npm/v/@plaited/acp.svg)](https://www.npmjs.com/package/@plaited/acp)
[![CI](https://github.com/plaited/acp-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/plaited/acp-harness/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Unified ACP client and evaluation harness for TypeScript/Bun projects. Connect to ACP-compatible agents programmatically, capture full trajectories (tools, thoughts, plans), and pipe to downstream analysis tools.

## Features

- **Headless ACP Client** - Programmatic access to Claude Code, Cursor, OpenCode, and other ACP agents
- **Trajectory Capture** - Full tool calls, thoughts, plans with timing metadata
- **Evaluation Harness** - Run prompt batches against agents with JSONL I/O
- **Two-Tier Output** - Summary format for metrics, judge format for LLM-as-judge evaluation
- **MCP Integration** - Connect MCP servers to agent sessions

## Installation

```bash
bun add @plaited/acp
# or
npm install @plaited/acp
```

**Prerequisite:** Install an ACP adapter for your agent:

```bash
# Claude Code ACP adapter
npm install -g @zed-industries/claude-code-acp
```

## Quick Start

### Programmatic Usage

```typescript
import { createACPClient, createPrompt, summarizeResponse } from '@plaited/acp'

const client = createACPClient({
  command: ['claude-code-acp'],
  cwd: '/path/to/project',
})

await client.connect()
const session = await client.createSession()

const { updates } = await client.promptSync(
  session.id,
  createPrompt('Create a function that validates email addresses')
)

const summary = summarizeResponse(updates)
console.log({
  output: summary.text,
  toolsUsed: summary.completedToolCalls.map(t => t.title),
  hasErrors: summary.hasErrors,
})

await client.disconnect()
```

### CLI Harness

Run prompts from a JSONL file:

```bash
# Create prompts file
echo '{"id":"test-1","input":"Create a hello world function"}' > prompts.jsonl

# Run evaluation
ANTHROPIC_API_KEY=sk-... bun .claude/skills/acp-harness/scripts/run-harness.ts \
  prompts.jsonl -o results.jsonl
```

## API Reference

### createACPClient(config)

Creates a headless ACP client.

```typescript
const client = createACPClient({
  command: ['claude-code-acp'],  // ACP agent command
  cwd: '/project/path',          // Working directory
  timeout: 60000,                // Request timeout (ms)
  env: { CUSTOM_VAR: 'value' },  // Environment variables
})
```

### Client Methods

| Method | Description |
|--------|-------------|
| `connect()` | Establish connection to agent |
| `createSession(params?)` | Create new session with optional MCP servers |
| `promptSync(sessionId, content)` | Send prompt, wait for complete response |
| `prompt(sessionId, content)` | AsyncGenerator for streaming updates |
| `disconnect()` | Close connection |
| `setModel(sessionId, modelId)` | Set model for session (experimental) |

### Helper Functions

```typescript
import {
  // Content builders
  createPrompt,
  createTextContent,
  createImageContent,
  createPromptWithFiles,

  // Response analysis
  summarizeResponse,
  extractToolCalls,
  extractPlan,
  hasToolCallErrors,
  getPlanProgress,
} from '@plaited/acp'
```

## Harness CLI

### Usage

```bash
bun scripts/run-harness.ts <prompts.jsonl> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-a, --agent` | ACP agent command | `claude-code-acp` |
| `-o, --output` | Output file path | stdout |
| `-c, --cwd` | Working directory | current |
| `-t, --timeout` | Request timeout (ms) | `60000` |
| `-f, --format` | `summary` or `judge` | `summary` |
| `--progress` | Show progress to stderr | false |
| `--mcp-server` | MCP server config JSON | none |

### Input Format

```jsonl
{"id":"test-001","input":"Create a button component","expected":"should export Button","metadata":{"category":"ui"}}
{"id":"test-002","input":"Fix the TypeScript error in utils.ts","metadata":{"difficulty":"easy"}}
```

### Output Formats

**Summary** (default) - Minimal JSONL for metrics:

```jsonl
{"id":"test-001","input":"...","output":"...","toolCalls":["Write"],"status":"passed","duration":1234}
```

**Judge** - Two files for LLM-as-judge evaluation:

```bash
bun scripts/run-harness.ts prompts.jsonl --format judge -o results
# Creates: results.md + results.full.jsonl
```

- `results.md` - Human-readable with step IDs and code previews
- `results.full.jsonl` - Complete trajectories for programmatic analysis

## Docker Execution

For consistent, isolated evaluation runs:

```bash
# Using Docker Compose
ANTHROPIC_API_KEY=sk-... docker compose -f docker-compose.test.yml run --rm docker-integration

# Or build directly
docker build -f Dockerfile.test -t acp-harness .
docker run --rm -e ANTHROPIC_API_KEY acp-harness
```

## MCP Server Integration

Connect MCP servers to agent sessions:

```typescript
const session = await client.createSession({
  mcpServers: [
    { type: 'stdio', name: 'fs', command: ['mcp-filesystem', '/data'] },
    { type: 'http', name: 'api', url: 'http://localhost:3000' },
  ],
})
```

Or via CLI:

```bash
bun scripts/run-harness.ts prompts.jsonl \
  --mcp-server '{"type":"stdio","name":"fs","command":["mcp-filesystem","/data"]}'
```

## Use Cases

| Use Case | Harness Provides | You Build |
|----------|------------------|-----------|
| **Cross-agent comparison** | Same prompts → multiple agents → trajectories | Scoring pipeline |
| **Skill evaluation** | Trajectory with tool attribution | Diff analysis |
| **Training data** | Structured I/O with full context | SFT/DPO formatting |
| **Regression testing** | Deterministic prompt → trajectory capture | CI integration |

## Claude Code Plugin

Install the ACP harness skill for AI coding agents:

```bash
curl -sSL https://raw.githubusercontent.com/plaited/acp-harness/main/scripts/install-acp.sh | bash
```

Supports: Claude Code, Cursor, OpenCode, Amp, Goose, Factory

## Development

This repository includes a bundled skill that provides AI coding agents with deep context about the ACP client API, evaluation patterns, and output formats.

### AI-Assisted Development

When working on this codebase with Claude Code (or other compatible agents), the `acp-harness` skill is automatically activated. It provides:

- **Client API reference** - `createACPClient` configuration, methods, and helpers
- **Output format schemas** - Summary and judge format specifications
- **LLM-as-judge templates** - Evaluation prompt templates for scoring trajectories
- **Downstream integration patterns** - Braintrust, jq, and custom scorer examples

The skill lives in `.claude/skills/acp-harness/` and is auto-discovered when you open the project.

### Setup

```bash
# Install dependencies
bun install

# Run checks (type check + lint + format)
bun run check

# Run tests
bun test

# Auto-fix lint and format issues
bun run check:write
```

### Docker Integration Tests

Integration tests require an API key and run in Docker:

```bash
ANTHROPIC_API_KEY=sk-... bun run test:docker
```

## Requirements

- **Runtime:** Bun >= 1.2.9
- **ACP Adapter:** `@zed-industries/claude-code-acp` or compatible
- **API Key:** `ANTHROPIC_API_KEY` environment variable

## License

ISC © [Plaited Labs](https://github.com/plaited)
