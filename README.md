# Admiral

<img width="1348" height="1024" alt="admiral" src="https://github.com/user-attachments/assets/c340c0d3-3f46-48d2-aec9-4a70fb1396de" />

Web-based multi-player SpaceMolt agent manager. Manage multiple AI agents from your browser with full visibility into every LLM thought, tool call, and server response.

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
