# @plaited/acp-harness

[![npm version](https://img.shields.io/npm/v/@plaited/acp-harness.svg)](https://www.npmjs.com/package/@plaited/acp-harness)
[![CI](https://github.com/plaited/acp-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/plaited/acp-harness/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

CLI tool for capturing agent trajectories from ACP-compatible agents. Execute prompts, capture full trajectories (tools, thoughts, plans), and output structured JSONL for downstream scoring.

## Quick Start

```bash
# Run without installing
bunx @plaited/acp-harness prompts.jsonl -o results.jsonl

# Or install globally
bun add -g @plaited/acp-harness
acp-harness prompts.jsonl -o results.jsonl
```

**Prerequisite:** Install an ACP adapter and set your API key:

```bash
npm install -g @zed-industries/claude-code-acp
export ANTHROPIC_API_KEY=sk-...
```

## Usage

```bash
acp-harness <prompts.jsonl> [options]

Options:
  --cmd, --command  ACP agent command (default: "claude-code-acp")
  -o, --output      Output file (default: stdout)
  -c, --cwd         Working directory for agent
  -t, --timeout     Request timeout in ms (default: 60000)
  -f, --format      Output format: summary, judge (default: summary)
  --progress        Show progress to stderr
  --append          Append to output file
  --mcp-server      MCP server config JSON (repeatable)
  -h, --help        Show help
```

## Input Format

```jsonl
{"id":"test-001","input":"Create a primary button","expected":"should contain <button>","metadata":{"category":"ui"}}
{"id":"test-002","input":"Fix the TypeScript error","metadata":{"category":"bugfix"}}
```

## Output

The harness captures trajectories and outputs structured JSONL. **You provide the scoring logic.**

```bash
# Capture trajectories
acp-harness prompts.jsonl -o results.jsonl

# Score with your tools
cat results.jsonl | jq 'select(.status == "failed")'
cat results.jsonl | your-scoring-script.ts
```

## Plugin

This package includes an **acp-harness skill** for AI coding agents with complete documentation:

- CLI usage and examples
- Output format schemas
- Integration patterns (Braintrust, jq, custom scorers)

**Install via Claude Code:**

```bash
/plugin marketplace add plaited/marketplace
```

## Development

```bash
bun install          # Install dependencies
bun run check        # Type check + lint + format
bun test             # Run unit tests
```

## Requirements

- **Runtime:** Bun >= 1.2.9
- **ACP Adapter:** `@zed-industries/claude-code-acp` or compatible
- **API Key:** `ANTHROPIC_API_KEY` environment variable

## License

ISC © [Plaited Labs](https://github.com/plaited)
