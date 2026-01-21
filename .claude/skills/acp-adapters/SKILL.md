---
name: acp-adapters
description: Discover, create, and validate ACP adapters for agent integration. Includes scaffolding tools and compliance testing for the Agent Client Protocol.
compatibility: Bun >= 1.2.9
---

# ACP Adapters

## Purpose

Schema-driven adapter for headless CLI agents. **No code required** - just define a JSON schema describing how to interact with the CLI.

| Use Case | Tool |
|----------|------|
| Wrap headless CLI agent | `headless` command |
| Verify implementation | `adapter:check` command |
| Create new schemas | [Schema Creation Guide](references/schema-creation-guide.md) |

## Quick Start

1. **Check if a schema exists** in [schemas/](schemas/)
2. **Run the adapter:**
   ```bash
   ANTHROPIC_API_KEY=... bunx @plaited/acp-harness headless --schema .claude/skills/acp-adapters/schemas/claude-headless.json
   ```
3. **Validate compliance:**
   ```bash
   bunx @plaited/acp-harness adapter:check bunx @plaited/acp-harness headless --schema ./my-schema.json
   ```

## CLI Commands

### headless

Schema-driven ACP adapter for ANY headless CLI agent.

```bash
bunx @plaited/acp-harness headless --schema <path>
```

**Options:**
| Flag | Description | Required |
|------|-------------|----------|
| `-s, --schema` | Path to adapter schema (JSON) | Yes |

**Schema Format:**

```json
{
  "version": 1,
  "name": "my-agent",
  "command": ["my-agent-cli"],
  "sessionMode": "stream",
  "prompt": { "flag": "-p" },
  "output": { "flag": "--output-format", "value": "stream-json" },
  "autoApprove": ["--allow-all"],
  "outputEvents": [
    {
      "match": { "path": "$.type", "value": "message" },
      "emitAs": "message",
      "extract": { "content": "$.text" }
    }
  ],
  "result": {
    "matchPath": "$.type",
    "matchValue": "result",
    "contentPath": "$.content"
  }
}
```

**Session Modes:**

| Mode | Description | Use When |
|------|-------------|----------|
| `stream` | Keep process alive, multi-turn via stdin | CLI supports session resume |
| `iterative` | New process per turn, accumulate history | CLI is stateless |

---

### adapter:check

Validate that an adapter implements the ACP protocol correctly.

```bash
bunx @plaited/acp-harness adapter:check <command> [args...]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `--timeout` | Timeout for each check in ms | `5000` |
| `--verbose` | Show detailed protocol messages | false |

**Checks Performed:**

| Check | Description |
|-------|-------------|
| `spawn` | Adapter can be launched as subprocess |
| `initialize` | Responds to initialize with valid `agentCapabilities` |
| `session/new` | Creates session and returns `sessionId` |
| `session/prompt` | Accepts prompt and emits `session/update` notifications |
| `session/cancel` | Accepts cancel notification gracefully |
| `framing` | All messages are newline-delimited JSON-RPC 2.0 |

## Pre-built Schemas

Tested schemas are available in [schemas/](schemas/):

| Schema | Agent | Mode | Auth Env Var | Status |
|--------|-------|------|--------------|--------|
| `claude-headless.json` | Claude Code | stream | `ANTHROPIC_API_KEY` | Tested |
| `gemini-headless.json` | Gemini CLI | iterative | `GEMINI_API_KEY` | Tested |

**Usage:**
```bash
# Claude Code
ANTHROPIC_API_KEY=... bunx @plaited/acp-harness headless --schema .claude/skills/acp-adapters/schemas/claude-headless.json

# Gemini CLI
GEMINI_API_KEY=... bunx @plaited/acp-harness headless --schema .claude/skills/acp-adapters/schemas/gemini-headless.json
```

## Agents with Headless CLI Support

> **7 of 8 agents compatible.** The headless adapter requires JSON streaming output from the CLI.

| Agent | JSON Output Flag | Prompt Flag | CLI Documentation |
|-------|------------------|-------------|-------------------|
| Amp | `--stream-json` | `-x` | [ampcode.com/manual#cli](https://ampcode.com/manual#cli) |
| Codex | `--json` | positional | [developers.openai.com/codex/cli](https://developers.openai.com/codex/cli/) |
| Cursor | `--output-format stream-json --print` | `-p` | [cursor.com/docs/cli/reference/output-format](https://cursor.com/docs/cli/reference/output-format) |
| Droid | `-o stream-json` | positional | [docs.factory.ai/cli/droid-exec/overview](https://docs.factory.ai/cli/droid-exec/overview) |
| Goose | `--output-format stream-json` | `-t` | [block.github.io/goose/.../goose-cli-commands](https://block.github.io/goose/docs/guides/goose-cli-commands/) |
| Letta | `--output-format stream-json` | `-p` | [docs.letta.com/letta-code/cli-reference](https://docs.letta.com/letta-code/cli-reference/) |
| OpenCode | `--format json` | positional | [opencode.ai/docs/cli](https://opencode.ai/docs/cli/) |

**Not yet compatible:** [Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli) (no JSON output)

## Creating a Schema

1. Explore the CLI's `--help` to identify prompt, output, and auto-approve flags
2. Capture sample JSON output from the CLI
3. Map JSONPath patterns to ACP events
4. Create schema file based on an existing template
5. Test with `headless` command
6. Validate with `adapter:check`

See [Schema Creation Guide](references/schema-creation-guide.md) for the complete workflow.

## Troubleshooting

### Common Issues

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Timeout on prompt | JSONPath not matching | Capture raw CLI output, verify paths |
| "Request timed out" | Result event not detected | Check `result.matchPath/matchValue` |
| Empty responses | Content extraction failing | Verify array indexing (`[0]`) in paths |
| CLI hangs silently | `stdin: 'pipe'` without writing | Use `stdin: 'ignore'` when prompt is in args |

> **Important:** Some CLIs (notably Claude Code) hang when spawned with `stdin: 'pipe'` but nothing is written. If the prompt is passed via command-line flag (e.g., `-p "text"`), use `stdin: 'ignore'` instead.

### Quick Debug Steps

1. **Verify CLI works standalone:**
   ```bash
   <agent> -p "Say hello" --output-format stream-json --verbose 2>&1 | head -10
   ```

2. **Test headless adapter directly:**
   ```bash
   printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}\n' | \
     bunx @plaited/acp-harness headless --schema ./my-schema.json
   ```

3. **Run adapter:check for diagnostics:**
   ```bash
   bunx @plaited/acp-harness adapter:check \
     bunx @plaited/acp-harness headless --schema ./my-schema.json --verbose
   ```

## External Resources

- **ACP-Compatible Agents**: [agentclientprotocol.com/overview/agents](https://agentclientprotocol.com/overview/agents)
- **AgentSkills Spec**: [agentskills.io](https://agentskills.io)
- **ACP Protocol Docs**: Use the MCP server for protocol questions:
  ```json
  {
    "mcpServers": {
      "agent-client-protocol-docs": {
        "type": "http",
        "url": "https://agentclientprotocol.com/mcp"
      }
    }
  }
  ```

## Related

- **[acp-harness skill](../acp-harness/SKILL.md)** - Running evaluations against adapters
- **[@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk)** - ACP SDK with TypeScript types
