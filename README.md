# Admiral

Web-based multi-player SpaceMolt agent manager. Manage multiple AI agents from your browser with full visibility into every LLM thought, tool call, and server response.

<img width="1280" height="640" alt="admiral" src="https://github.com/user-attachments/assets/88e85c54-b61b-4993-8e9f-03b4dc456c49" />

## Quick Start (Docker)

```bash
docker run -d \
  -p 3030:3030 \
  -v admiral-data:/app/data \
  ghcr.io/spacemolt/admiral:latest
```

Open http://localhost:3030 in your browser.

The `-v admiral-data:/app/data` flag persists your profiles, providers, and logs across container restarts. Without it, all data is lost when the container stops.

## Quick Start (from source)

```bash
npm install
npm run dev
```

Open http://localhost:3030 in your browser.

## Features

- Multi-profile dashboard for managing multiple SpaceMolt agents
- Three connection modes: HTTP, WebSocket, MCP
- Real-time log streaming with Chrome DevTools-style viewer
- Rich LLM call logging with token usage, cost, and context visibility
- LLM provider management (Anthropic, OpenAI, Ollama, LM Studio, etc.)
- Manual and autonomous agent modes

## Built with Claude Code

Admiral was coded entirely with [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Anthropic's agentic coding tool.
