# ACP Adapter Catalog

Curated list of ACP-compatible agents and adapters for integration.

> **Source:** [agentclientprotocol.com/overview/agents](https://agentclientprotocol.com/overview/agents)

## Zed-Maintained Adapters

External adapters maintained by Zed Industries for agents without built-in ACP support.

### Claude Code ACP

The official Claude Code adapter from Zed Industries.

| Property | Value |
|----------|-------|
| Package | `@zed-industries/claude-code-acp` |
| Repository | [github.com/zed-industries/claude-code-acp](https://github.com/zed-industries/claude-code-acp) |
| Protocol | ACP v1 |
| Language | TypeScript |
| Status | Production |

**Installation:**
```bash
bunx @zed-industries/claude-code-acp
```

**Capabilities:**
- `loadSession` - Resume existing sessions
- `promptCapabilities.image` - Image input support
- MCP server integration
- Slash commands: `/review`, `/init`, `/compact`

**Use when:**
- Evaluating Claude Code with the harness
- Building Claude-based automation
- Comparing Claude performance across prompts

**Documentation:** [NPM Package](https://www.npmjs.com/package/@zed-industries/claude-code-acp)

---

### Codex ACP

ACP adapter for OpenAI's Codex CLI.

| Property | Value |
|----------|-------|
| Package | `@zed-industries/codex-acp` |
| Repository | [github.com/zed-industries/codex-acp](https://github.com/zed-industries/codex-acp) |
| Protocol | ACP v1 |
| Language | TypeScript |
| Status | Production (v0.8.2) |

**Installation:**
```bash
npx @zed-industries/codex-acp
```

**Capabilities:**
- Context mentions and image attachments
- Tool invocations with permission prompts
- Edit review and TODO list features
- Slash commands: `/review`, `/review-branch`, `/review-commit`, `/init`, `/compact`, `/logout`
- Client MCP server integration

**Authentication:** ChatGPT subscription, `CODEX_API_KEY`, or `OPENAI_API_KEY`

**Documentation:** [GitHub](https://github.com/zed-industries/codex-acp)

---

## Agents with Built-in ACP Support

These agents have native ACP support—no external adapter needed.

### Augment Code (Auggie)

AI coding assistant with enterprise features.

| Property | Value |
|----------|-------|
| Command | `auggie --acp` |
| Documentation | [docs.augmentcode.com/cli/acp](https://docs.augmentcode.com/cli/acp) |
| Status | Production |

**Use when:** Enterprise teams needing Augment's context-aware assistance.

---

### Code Assistant

Rust-based AI coding agent with GUI and CLI interfaces.

| Property | Value |
|----------|-------|
| Command | `code-assistant --acp` |
| Repository | [github.com/stippi/code-assistant](https://github.com/stippi/code-assistant) |
| Language | Rust |
| Status | Active |

**Capabilities:**
- Multiple LLM provider support
- Real-time streaming with safety filtering
- Session compaction for long conversations
- GUI, CLI, MCP server, and ACP modes

**Use when:** Need a flexible, self-hosted coding agent.

---

### Docker cagent

Multi-agent runtime with orchestration capabilities.

| Property | Value |
|----------|-------|
| Command | `cagent` |
| Repository | [github.com/docker/cagent](https://github.com/docker/cagent) |
| Status | Production (Docker Desktop 4.49.0+) |

**Installation:**
```bash
brew install cagent
# or built into Docker Desktop
```

**Capabilities:**
- Multi-agent framework with task delegation
- MCP server support (including Docker MCP Gateway)
- RAG with multiple retrieval strategies
- YAML-based declarative configuration

**Use when:** Orchestrating multiple specialized agents.

---

### fast-agent

LLM-powered agents with native streaming and structured outputs.

| Property | Value |
|----------|-------|
| Command | `fast-agent-acp --model <model>` |
| Documentation | [fast-agent.ai/acp](https://fast-agent.ai/acp) |
| Status | Production |

**Installation:**
```bash
uvx fast-agent-acp@latest --model <model_name>
```

**Capabilities:**
- Multiple agent modes with custom display names
- Tool and workflow progress notifications
- Iterative planning with agent plan reporting
- LLM streaming cancellation
- Multimodal input (images)
- Granular permission management

**Use when:** Need quick setup with flexible model selection.

---

### Gemini CLI

Google's official Gemini CLI.

| Property | Value |
|----------|-------|
| Package | `@google/gemini-cli` |
| Repository | [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| Status | Production |

**Installation:**
```bash
npm install -g @google/gemini-cli
```

**Use when:** Evaluating Gemini models via ACP.

---

### Goose

Block's open-source AI agent.

| Property | Value |
|----------|-------|
| Command | `goose acp` |
| Documentation | [block.github.io/goose/docs/guides/acp-clients](https://block.github.io/goose/docs/guides/acp-clients) |
| Status | Production (v1.16.0+) |

**Capabilities:**
- Core agent functionality with extensions and tools
- Automatic MCP server loading from client
- Multiple concurrent conversations
- Session persistence
- Configurable provider/model via environment variables

**Use when:** Need an extensible, open-source agent.

---

### Kimi CLI

AI agent from Moonshot AI (technical preview).

| Property | Value |
|----------|-------|
| Command | `kimi acp` |
| Package | `kimi-cli` (PyPI) |
| Repository | [github.com/MoonshotAI/kimi-cli](https://github.com/MoonshotAI/kimi-cli) |
| Status | Technical Preview |

**Installation:**
```bash
pip install kimi-cli
```

**Capabilities:**
- Shell command mode
- MCP server support
- Code reading and editing
- Web search and fetching

**Use when:** Exploring Moonshot AI's capabilities.

---

### Mistral Vibe

Mistral's official CLI coding assistant.

| Property | Value |
|----------|-------|
| Command | `vibe` (with ACP-compatible client) |
| Package | `mistral-vibe` (PyPI) |
| Repository | [github.com/mistralai/mistral-vibe](https://github.com/mistralai/mistral-vibe) |
| Status | Production |

**Installation:**
```bash
curl -LsSf https://mistral.ai/vibe/install.sh | bash
# or: uv tool install mistral-vibe
```

**Capabilities:**
- File operations (read, write, patch)
- Shell command execution
- Code searching with ripgrep
- Todo list management
- MCP server integration

**Use when:** Evaluating Mistral models for coding tasks.

---

### OpenCode

Open-source AI coding agent (Claude Code alternative).

| Property | Value |
|----------|-------|
| Repository | [github.com/sst/opencode](https://github.com/sst/opencode) |
| Status | Production |

**Installation:**
```bash
curl -fsSL https://opencode.ai/install | bash
```

**Capabilities:**
- Two built-in agents: "build" (full access) and "plan" (read-only)
- LSP support out of the box
- Client/server architecture
- Provider-agnostic (Claude, OpenAI, Google, local models)

**Use when:** Need an open-source, provider-agnostic agent.

---

### OpenHands

AI agent with comprehensive IDE integration.

| Property | Value |
|----------|-------|
| Command | `openhands acp` |
| Documentation | [docs.openhands.dev/openhands/usage/run-openhands/acp](https://docs.openhands.dev/openhands/usage/run-openhands/acp) |
| Status | Production |

**Capabilities:**
- LLM-based approval mode (`--llm-approve`)
- Conversation resumption (`--resume`)
- Token streaming (`--streaming`)
- Auto-approval mode (`--always-approve`)

**Use when:** Need flexible approval workflows and session management.

---

### Qwen Code

Open-source agent optimized for Qwen3-Coder models.

| Property | Value |
|----------|-------|
| Package | `@qwen-code/qwen-code` |
| Repository | [github.com/QwenLM/qwen-code](https://github.com/QwenLM/qwen-code) |
| Status | Production |

**Installation:**
```bash
npm install -g @qwen-code/qwen-code@latest
```

**Capabilities:**
- 2,000 free requests/day with Qwen OAuth
- Plan Mode, vision support
- Built-in Skills/SubAgents
- TypeScript SDK for custom integrations

**Use when:** Evaluating Qwen models (37.5% Terminal-Bench accuracy).

---

## Other ACP-Compatible Agents

These agents are listed on [agentclientprotocol.com](https://agentclientprotocol.com/overview/agents) but may require additional research:

| Agent | Documentation |
|-------|---------------|
| AgentPool | [phil65.github.io/agentpool/advanced/acp-integration](https://phil65.github.io/agentpool/advanced/acp-integration/) |
| Blackbox AI | [docs.blackbox.ai/features/blackbox-cli](https://docs.blackbox.ai/features/blackbox-cli/introduction) |
| JetBrains Junie | [jetbrains.com/junie](https://www.jetbrains.com/junie/) *(coming soon)* |
| Minion Code | [github.com/femto/minion-code](https://github.com/femto/minion-code) |
| Pi (via pi-acp) | [github.com/svkozak/pi-acp](https://github.com/svkozak/pi-acp) |
| Stakpak | [github.com/stakpak/agent](https://github.com/stakpak/agent?tab=readme-ov-file#agent-client-protocol-acp) |
| VT Code | [github.com/vinhnx/vtcode](https://github.com/vinhnx/vtcode/blob/main/README.md#zed-ide-integration-agent-client-protocol) |

---

## Compatibility Matrix

| Agent | Protocol | MCP | Images | Streaming |
|-------|----------|-----|--------|-----------|
| claude-code-acp | v1 | Yes | Yes | Yes |
| codex-acp | v1 | Yes | Yes | Yes |
| fast-agent | v1 | Yes | Yes | Yes |
| goose | v1 | Yes | - | Yes |
| mistral-vibe | v1 | Yes | - | Yes |
| openhands | v1 | - | - | Yes |
| opencode | v1 | - | - | Yes |

### Legend

- **Protocol**: ACP protocol version supported
- **MCP**: Supports MCP server pass-through
- **Images**: Accepts image content blocks
- **Streaming**: Emits real-time `session/update` notifications

---

## Evaluating Adapters

Before choosing an adapter, consider:

### 1. Protocol Compliance

Run the compliance checker:
```bash
acp-harness adapter:check bunx <adapter-package>
# or for command-based agents:
acp-harness adapter:check <agent> acp
```

All 6 checks should pass for production use.

### 2. Feature Requirements

Match your needs to adapter capabilities:

| Need | Required Capability |
|------|---------------------|
| Resume conversations | `loadSession` |
| Use MCP tools | MCP server support |
| Send images | `promptCapabilities.image` |
| Real-time progress | Streaming updates |

### 3. Maintenance Status

Check the adapter repository for:
- Recent commits (active maintenance)
- Open issues (known problems)
- Protocol version (matches your client)

---

## Missing Your Agent?

If your agent doesn't have ACP support:

1. **Check the official list:** [agentclientprotocol.com/overview/agents](https://agentclientprotocol.com/overview/agents)

2. **Build an adapter:** See [Implementation Guide](implementation-guide.md)

3. **Request from vendor:** Many agent providers are adding ACP support

The `adapter:scaffold` command helps you get started quickly:
```bash
acp-harness adapter:scaffold my-agent
```
