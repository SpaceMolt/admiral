# Admiral: Bun + Hono Single Binary Rewrite

**Date:** 2026-02-27
**Status:** Approved
**Goal:** Replace Next.js with Bun + Hono to ship admiral as a single executable binary via `bun build --compile`, matching how commander/ is shipped.

## Context

Admiral is a web-based agent manager (~8K lines, 48 TS files) currently built with Next.js 16 and deployed via Docker. The goal is to eliminate the Docker dependency and ship a single binary that humans can download and run.

Commander already uses `bun build --compile` to produce single binaries. Admiral should follow the same pattern.

## Decisions

- **Framework:** Hono (API server) + Vite (React SPA build)
- **Runtime:** Bun (compile to single binary)
- **Database:** `bun:sqlite` (replaces `better-sqlite3`, zero native deps)
- **Frontend:** Keep existing React components as a SPA (no SSR needed)
- **Routing:** React Router for client-side routing
- **Realtime:** Keep SSE for log streaming (server -> browser)
- **Dev mode:** Hono proxies to Vite dev server for hot reload

## Architecture

```
admiral/
├── src/
│   ├── server/                    # Hono backend (compiles to binary)
│   │   ├── index.ts               # Entry: Hono app + static serving + dev proxy
│   │   ├── routes/
│   │   │   ├── profiles.ts        # /api/profiles/* (CRUD + connect/command/nudge)
│   │   │   ├── providers.ts       # /api/providers/* (CRUD + detect)
│   │   │   ├── models.ts          # /api/models
│   │   │   ├── commands.ts        # /api/commands
│   │   │   ├── preferences.ts     # /api/preferences
│   │   │   └── logs.ts            # /api/profiles/:id/logs (SSE streaming)
│   │   ├── lib/
│   │   │   ├── db.ts              # bun:sqlite database layer
│   │   │   ├── agent.ts           # Agent class (port from existing)
│   │   │   ├── agent-manager.ts   # Singleton manager (simplified, no HMR hack)
│   │   │   ├── loop.ts            # Agent turn execution (unchanged logic)
│   │   │   ├── tools.ts           # Tool registry (unchanged logic)
│   │   │   ├── schema.ts          # OpenAPI spec fetching (unchanged)
│   │   │   ├── model.ts           # LLM model resolution (unchanged)
│   │   │   ├── providers.ts       # Provider detection/validation (unchanged)
│   │   │   └── connections/       # All 5 connection types (unchanged)
│   │   │       ├── interface.ts
│   │   │       ├── http.ts
│   │   │       ├── http_v2.ts
│   │   │       ├── websocket.ts
│   │   │       ├── mcp.ts
│   │   │       └── mcp_v2.ts
│   │   └── static.ts              # Embedded SPA serving + SPA fallback
│   ├── frontend/                  # React SPA (Vite build)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── main.tsx           # React entry + React Router setup
│   │   │   ├── App.tsx            # Router layout
│   │   │   ├── components/        # Existing components (moved here)
│   │   │   ├── lib/               # Client-side utilities (utils.ts)
│   │   │   └── globals.css        # Existing Tailwind styles
│   │   └── public/                # Static assets (if any)
│   └── shared/
│       └── types.ts               # TypeScript types shared between server & frontend
├── scripts/
│   └── build.ts                   # Build orchestrator
├── package.json
├── tsconfig.json
├── prompt.md                      # Agent system prompt (unchanged)
└── data/
    └── admiral.db                 # SQLite database (created at runtime)
```

## API Route Mapping

All Next.js App Router handlers map 1:1 to Hono routes. The translation is mechanical:

| Pattern | Next.js | Hono |
|---|---|---|
| Response | `NextResponse.json(data)` | `c.json(data)` |
| Request body | `request.json()` | `c.req.json()` |
| URL params | `params.id` | `c.req.param('id')` |
| Query params | `request.nextUrl.searchParams` | `c.req.query()` |
| Status codes | `NextResponse.json(data, { status: 404 })` | `c.json(data, 404)` |
| SSE | Custom ReadableStream | `c.stream()` / `hono/streaming` |

## Database Migration (better-sqlite3 -> bun:sqlite)

The APIs are nearly identical. Key differences:

| better-sqlite3 | bun:sqlite |
|---|---|
| `new Database(path)` | `new Database(path)` |
| `db.prepare(sql)` | `db.query(sql)` |
| `stmt.run(...)` | `query.run(...)` |
| `stmt.get(...)` | `query.get(...)` |
| `stmt.all(...)` | `query.all(...)` |
| `db.pragma('journal_mode = WAL')` | `db.exec('PRAGMA journal_mode = WAL')` |

The schema stays identical. WAL mode stays on. Existing databases should be compatible (same SQLite format).

## Frontend Changes

Minimal changes required:

1. **Remove:** `nuqs`, `next/` imports, Next.js file-based routing
2. **Add:** React Router, Vite config
3. **Replace:** `nuqs` URL state -> React Router `useParams()`/`useSearchParams()`
4. **Move:** Components from `src/components/` to `src/frontend/src/components/`
5. **Keep:** All component logic, styling, Tailwind config, lucide-react icons

The SPA makes all API calls to `/api/*` via `fetch()` -- this is already how the frontend works, so no API client changes needed.

## Build Pipeline

```bash
# Development (hot reload)
bun run dev
# -> Starts Hono on :3030 (proxies non-API to Vite on :5173)
# -> Starts Vite dev server on :5173

# Production build
bun run build
# 1. Vite builds React SPA -> src/frontend/dist/
# 2. Bun compiles server + embedded dist/ -> ./admiral binary

# Run
./admiral
# -> Serves API + embedded SPA on :3030
```

## Dev Mode Proxy

In development, the Hono server proxies non-API requests to the Vite dev server:

```typescript
if (process.env.NODE_ENV !== 'production') {
  // Proxy non-API requests to Vite dev server for HMR
  app.all('*', async (c) => {
    const url = new URL(c.req.url);
    url.port = '5173';
    return fetch(url.toString(), { headers: c.req.raw.headers });
  });
}
```

## Static File Serving (Production)

In production, the pre-built SPA is served from the filesystem alongside the binary:

```typescript
// Serve static files from dist/
app.use('/*', serveStatic({ root: './dist' }));

// SPA fallback: serve index.html for any unmatched route
app.get('*', (c) => {
  return c.html(readFileSync('./dist/index.html', 'utf-8'));
});
```

The `dist/` directory is copied alongside the binary during build, or embedded using Bun's file embedding capabilities.

## What Stays Unchanged

- All game connection logic (5 connection types)
- Agent class and LLM loop logic
- Tool system and tool definitions
- Schema/command discovery from gameserver
- Provider detection and API key validation
- The `prompt.md` system prompt
- All React component logic and visual design
- Tailwind configuration, Nord theme, fonts
- Database schema and data format
- Port 3030

## Binary Size

Expected ~70-90MB (Bun runtime ~50MB + app code + SPA assets). Acceptable per requirements.

## Migration Path

1. Create new project structure alongside existing code
2. Port server-side code first (API routes + lib)
3. Move frontend components to Vite SPA
4. Verify all functionality matches
5. Remove Next.js, Dockerfile, old build config
6. Update README with new build/run instructions
