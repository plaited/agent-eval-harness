# @plaited/acp

[![npm version](https://img.shields.io/npm/v/@plaited/acp.svg)](https://www.npmjs.com/package/@plaited/acp)
[![CI](https://github.com/plaited/acp-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/plaited/acp-harness/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Unified ACP client and evaluation harness for TypeScript/Bun projects. Connect to ACP-compatible agents programmatically, capture full trajectories, and pipe to downstream analysis tools.

## Installation

```bash
bun add @plaited/acp
```

**Prerequisite:** Install an ACP adapter:

```bash
npm install -g @zed-industries/claude-code-acp
```

## Quick Start

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
console.log(summary.text, summary.completedToolCalls)

await client.disconnect()
```

## Recommended: Use the Bundled Plugin

This package includes a comprehensive **eval-harness plugin** designed for AI-assisted evaluation development. The plugin provides:

- Complete API reference for `createACPClient` and helpers
- Harness CLI usage with all options and examples
- Output format schemas (summary and judge formats)
- LLM-as-judge evaluation templates
- Downstream integration patterns (Braintrust, jq, custom scorers)
- Docker execution guidance

### Install the Plugin

**Claude Code:**

```bash
claude plugins add github:plaited/marketplace
```

Or install directly:

```bash
claude plugins add github:plaited/acp-harness/.claude
```

**Other AI coding agents:**

```bash
curl -fsSL https://raw.githubusercontent.com/plaited/marketplace/main/install.sh | bash -s -- --agent <agent-name> --plugin acp-harness

Supported agents: gemini, copilot, cursor, opencode, amp, goose, factory
```

Once installed, the plugin auto-activates when working on evaluation tasks. Ask your AI agent to help you:

- Set up evaluation prompts
- Configure the harness CLI
- Design scoring pipelines
- Integrate with Braintrust or custom analysis tools

The plugin contains everything needed to build agent evaluations - use it as your primary reference.

## Development

```bash
bun install          # Install dependencies
bun run check        # Type check + lint + format
bun test             # Run unit tests
bun run check:write  # Auto-fix issues
```

## Requirements

- **Runtime:** Bun >= 1.2.9
- **ACP Adapter:** `@zed-industries/claude-code-acp` or compatible
- **API Key:** `ANTHROPIC_API_KEY` environment variable

## License

ISC © [Plaited Labs](https://github.com/plaited)
