# Admiral Bun+Hono Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite admiral from Next.js to Bun+Hono, shipping as a single executable binary via `bun build --compile`.

**Architecture:** Hono API server serves React SPA (built with Vite). In dev mode, Hono proxies non-API requests to Vite dev server for HMR. In production, the SPA is served from a `dist/` directory alongside the binary. SQLite via `bun:sqlite` replaces `better-sqlite3`.

**Tech Stack:** Bun, Hono, Vite, React 19, React Router, bun:sqlite, Tailwind CSS 4, @tanstack/react-virtual, pi-ai, lucide-react

---

### Task 1: Scaffold new project structure and package.json

**Files:**
- Create: `src/server/index.ts` (entry point stub)
- Create: `src/frontend/index.html`
- Create: `src/frontend/vite.config.ts`
- Create: `src/frontend/tsconfig.json`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Delete: `next.config.ts`
- Delete: `next-env.d.ts` (if exists)
- Delete: `Dockerfile`

**Step 1: Update package.json**

Replace the entire `package.json` with:

```json
{
  "name": "@spacemolt/admiral",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "dev": "bun run src/server/index.ts",
    "dev:frontend": "cd src/frontend && bunx vite dev --port 5173",
    "build": "bun run scripts/build.ts",
    "start": "./admiral"
  },
  "dependencies": {
    "@mariozechner/pi-ai": "latest",
    "@tanstack/react-virtual": "^3.13.18",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "driver.js": "^1.4.0",
    "hono": "^4",
    "lucide-react": "^0.575.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router": "^7",
    "tailwind-merge": "^3.5.0",
    "ws": "^8.19.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.2.0",
    "@tailwindcss/vite": "^4.2.0",
    "@types/node": "^25.3.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@types/ws": "^8.18.1",
    "@vitejs/plugin-react": "^4",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.2.0",
    "typescript": "^5.9.3",
    "vite": "^6"
  }
}
```

Removed: `next`, `nuqs`, `better-sqlite3`, `@types/better-sqlite3`, `next/font/google`.
Added: `hono`, `react-router`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`.

**Step 2: Update root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@server/*": ["./src/server/*"],
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": ["src/server/**/*.ts", "src/shared/**/*.ts"],
  "exclude": ["node_modules", "src/frontend"]
}
```

**Step 3: Create `src/frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Step 4: Create `src/frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3030',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

**Step 5: Create `src/frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admiral - SpaceMolt Agent Manager</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <script>
    // Theme initialization (before page renders to prevent flash)
    try {
      const theme = localStorage.getItem('admiral-theme')
      if (theme === 'light') document.documentElement.classList.remove('dark')
    } catch {}
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 6: Create `src/server/index.ts` (stub)**

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()
app.use('*', cors())

app.get('/api/health', (c) => c.json({ ok: true }))

const port = parseInt(process.env.PORT || '3030')
console.log(`Admiral listening on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
```

**Step 7: Delete Next.js artifacts**

Delete: `next.config.ts`, `next-env.d.ts` (if exists), `Dockerfile`, `postcss.config.js`, `components.json`.

**Step 8: Install dependencies and verify**

Run: `bun install`
Expected: Clean install, no errors.

Run: `bun run src/server/index.ts &` then `curl http://localhost:3030/api/health`
Expected: `{"ok":true}`

**Step 9: Commit**

```bash
git add -A && git commit -m "feat: scaffold Bun+Hono project structure, remove Next.js"
```

---

### Task 2: Port database layer (better-sqlite3 -> bun:sqlite)

**Files:**
- Create: `src/server/lib/db.ts`
- Create: `src/shared/types.ts`

**Step 1: Create shared types**

Create `src/shared/types.ts` -- copy the existing `src/types.ts` exactly:

```typescript
export interface Provider {
  id: string
  api_key: string
  base_url: string
  status: 'valid' | 'invalid' | 'unknown' | 'unreachable'
}

export interface Profile {
  id: string
  name: string
  username: string | null
  password: string | null
  empire: string
  player_id: string | null
  provider: string | null
  model: string | null
  directive: string
  todo: string
  context_budget: number | null
  connection_mode: 'http' | 'http_v2' | 'websocket' | 'mcp' | 'mcp_v2'
  server_url: string
  autoconnect: boolean
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface LogEntry {
  id: number
  profile_id: string
  timestamp: string
  type: LogType
  summary: string
  detail: string | null
}

export type LogType =
  | 'connection'
  | 'error'
  | 'llm_call'
  | 'llm_thought'
  | 'tool_call'
  | 'tool_result'
  | 'server_message'
  | 'notification'
  | 'system'

export interface AgentStatus {
  profileId: string
  connected: boolean
  mode: 'llm' | 'manual'
  playerData?: Record<string, unknown>
}
```

**Step 2: Port db.ts to bun:sqlite**

Create `src/server/lib/db.ts`. Key API changes from `better-sqlite3`:
- `import Database from 'better-sqlite3'` -> `import { Database } from 'bun:sqlite'`
- `db.prepare(sql).run(...)` -> `db.query(sql).run(...)`
- `db.prepare(sql).get(...)` -> `db.query(sql).get(...)`
- `db.prepare(sql).all(...)` -> `db.query(sql).all(...)`
- `db.pragma('journal_mode = WAL')` -> `db.exec('PRAGMA journal_mode = WAL')`
- `db.pragma('foreign_keys = ON')` -> `db.exec('PRAGMA foreign_keys = ON')`
- `db.pragma('table_info(profiles)')` -> `db.query("PRAGMA table_info(profiles)").all()`
- `result.lastInsertRowid` stays the same (bun:sqlite also returns this)
- Remove the `globalThis.__admiralDb` HMR hack -- just use a module-level `let db: Database | null = null`

The full ported file should maintain all the same exports: `getDb()`, `listProviders()`, `getProvider()`, `upsertProvider()`, `listProfiles()`, `getProfile()`, `createProfile()`, `updateProfile()`, `deleteProfile()`, `addLogEntry()`, `getLogEntries()`, `clearLogs()`, `getPreference()`, `setPreference()`, `getAllPreferences()`.

Import types from `@shared/types` instead of `@/types`.

**Step 3: Verify db.ts compiles**

Run: `bun check src/server/lib/db.ts` (or `bun build --no-bundle src/server/lib/db.ts`)
Expected: No type errors

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: port database layer to bun:sqlite"
```

---

### Task 3: Port server-side library files

**Files:**
- Create: `src/server/lib/agent.ts`
- Create: `src/server/lib/agent-manager.ts`
- Create: `src/server/lib/loop.ts`
- Create: `src/server/lib/tools.ts`
- Create: `src/server/lib/schema.ts`
- Create: `src/server/lib/model.ts`
- Create: `src/server/lib/providers.ts`
- Create: `src/server/lib/connections/interface.ts`
- Create: `src/server/lib/connections/http.ts`
- Create: `src/server/lib/connections/http_v2.ts`
- Create: `src/server/lib/connections/websocket.ts`
- Create: `src/server/lib/connections/mcp.ts`
- Create: `src/server/lib/connections/mcp_v2.ts`

**Step 1: Port connections (unchanged logic)**

Copy all 6 connection files from `src/lib/connections/` to `src/server/lib/connections/`. These need zero changes -- they use standard `fetch()`, `WebSocket` (from `ws`), and `EventSource` which Bun supports natively.

Only change: update import paths from `@/types` to `@shared/types` and from `@/lib/...` to relative paths.

**Step 2: Port providers.ts**

Copy `src/lib/providers.ts` to `src/server/lib/providers.ts`. Only change:
- Remove `LOCALHOST` import from `@/lib/localhost`. Replace with `'127.0.0.1'` directly (no Docker detection needed for a binary).

**Step 3: Port model.ts**

Copy `src/lib/model.ts` to `src/server/lib/model.ts`. Changes:
- Update import: `@/lib/db` -> `./db`
- Update import: `@/lib/localhost` -> replace `LOCALHOST` with `'127.0.0.1'`

**Step 4: Port schema.ts**

Copy `src/lib/schema.ts` to `src/server/lib/schema.ts`. Changes:
- Update imports: `@/lib/db` -> `./db`

**Step 5: Port tools.ts**

Copy `src/lib/tools.ts` to `src/server/lib/tools.ts`. Changes:
- Update imports: `@/lib/db` -> `./db`, `@/types` -> `@shared/types`

**Step 6: Port loop.ts**

Copy `src/lib/loop.ts` to `src/server/lib/loop.ts`. Changes:
- Update imports only (relative paths)

**Step 7: Port agent.ts**

Copy `src/lib/agent.ts` to `src/server/lib/agent.ts`. Changes:
- Update imports: `@/lib/db` -> `./db`, `@/lib/connections/*` -> `./connections/*`, etc.
- `prompt.md` path: use `path.join(import.meta.dir, '../../prompt.md')` or resolve from project root. The prompt.md file will live at `prompt.md` in the project root (unchanged).
- For reading `prompt.md`: use `Bun.file(promptPath).text()` instead of `fs.readFileSync`

**Step 8: Port agent-manager.ts**

Copy `src/lib/agent-manager.ts` to `src/server/lib/agent-manager.ts`. Changes:
- Remove the `globalThis.__agentManager` HMR hack
- Simply export: `export const agentManager = new AgentManager()`
- Update imports

**Step 9: Verify all lib files compile**

Run: `bun build --no-bundle src/server/lib/agent-manager.ts`
Expected: No errors (this transitively imports everything)

**Step 10: Commit**

```bash
git add -A && git commit -m "feat: port all server-side library files to Bun"
```

---

### Task 4: Port API routes to Hono

**Files:**
- Create: `src/server/routes/profiles.ts`
- Create: `src/server/routes/providers.ts`
- Create: `src/server/routes/models.ts`
- Create: `src/server/routes/commands.ts`
- Create: `src/server/routes/preferences.ts`
- Create: `src/server/routes/logs.ts`
- Modify: `src/server/index.ts`

**Step 1: Create `src/server/routes/profiles.ts`**

Port all 5 profile-related API routes into a single Hono router:

```typescript
import { Hono } from 'hono'
import { listProfiles, getProfile, createProfile, updateProfile, deleteProfile } from '../lib/db'
import { agentManager } from '../lib/agent-manager'

const profiles = new Hono()

// GET /api/profiles
profiles.get('/', (c) => c.json(listProfiles()))

// POST /api/profiles
profiles.post('/', async (c) => {
  const body = await c.req.json()
  const { name, username, password, empire, provider, model, directive, connection_mode, server_url, context_budget } = body
  if (!name) return c.json({ error: 'Name is required' }, 400)
  try {
    const profile = createProfile({
      id: crypto.randomUUID(),
      name,
      username: username || null,
      password: password || null,
      empire: empire || '',
      player_id: null,
      provider: provider || null,
      model: model || null,
      directive: directive || '',
      todo: '',
      context_budget: context_budget ?? null,
      connection_mode: connection_mode || 'http',
      server_url: server_url || 'https://game.spacemolt.com',
      autoconnect: true,
      enabled: true,
    })
    return c.json(profile, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint')) return c.json({ error: 'A profile with that name already exists' }, 409)
    return c.json({ error: msg }, 500)
  }
})

// GET /api/profiles/:id
profiles.get('/:id', (c) => {
  const profile = getProfile(c.req.param('id'))
  if (!profile) return c.json({ error: 'Not found' }, 404)
  const status = agentManager.getStatus(c.req.param('id'))
  return c.json({ ...profile, ...status })
})

// PUT /api/profiles/:id
profiles.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const profile = updateProfile(id, body)
  if (!profile) return c.json({ error: 'Not found' }, 404)
  if (body.directive !== undefined) agentManager.restartTurn(id)
  return c.json(profile)
})

// DELETE /api/profiles/:id
profiles.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await agentManager.disconnect(id)
  deleteProfile(id)
  return c.json({ ok: true })
})

// POST /api/profiles/:id/connect
profiles.post('/:id/connect', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const action = (body as Record<string, unknown>).action as string || 'connect'
  const profile = getProfile(id)
  if (!profile) return c.json({ error: 'Profile not found' }, 404)
  try {
    if (action === 'disconnect') {
      await agentManager.disconnect(id)
      return c.json({ connected: false, running: false })
    }
    await agentManager.connect(id)
    if (action === 'connect_llm' && profile.provider && profile.provider !== 'manual' && profile.model) {
      await agentManager.startLLM(id)
    }
    return c.json(agentManager.getStatus(id))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// POST /api/profiles/:id/command
profiles.post('/:id/command', async (c) => {
  const id = c.req.param('id')
  const { command, args } = await c.req.json()
  if (!command) return c.json({ error: 'Missing command' }, 400)
  const agent = agentManager.getAgent(id)
  if (!agent || !agent.isConnected) return c.json({ error: 'Agent not connected' }, 400)
  try {
    const result = await agent.executeCommand(command, args)
    return c.json(result)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// POST /api/profiles/:id/nudge
profiles.post('/:id/nudge', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const message = (body as Record<string, unknown>).message as string
  if (!message?.trim()) return c.json({ error: 'message is required' }, 400)
  const status = agentManager.getStatus(id)
  if (!status.running) return c.json({ error: 'Agent is not running' }, 400)
  agentManager.nudge(id, message.trim())
  return c.json({ ok: true })
})

export default profiles
```

**Step 2: Create `src/server/routes/logs.ts`**

Port the SSE streaming log route:

```typescript
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getLogEntries, clearLogs } from '../lib/db'
import { agentManager } from '../lib/agent-manager'

const logs = new Hono()

// GET /api/profiles/:id/logs
logs.get('/:id/logs', async (c) => {
  const id = c.req.param('id')
  const stream = c.req.query('stream') === 'true'

  if (!stream) {
    const entries = getLogEntries(id, undefined, 200)
    return c.json(entries.reverse())
  }

  // SSE stream
  return streamSSE(c, async (stream) => {
    // Send recent history first
    const recent = getLogEntries(id, undefined, 50).reverse()
    for (const entry of recent) {
      await stream.writeSSE({ data: JSON.stringify(entry) })
    }

    let currentAgent = agentManager.getAgent(id)
    let closed = false

    const handler = (entry: unknown) => {
      if (closed) return
      stream.writeSSE({ data: JSON.stringify(entry) }).catch(() => { closed = true })
    }
    const activityHandler = (activity: string) => {
      if (closed) return
      stream.writeSSE({ event: 'activity', data: JSON.stringify({ activity }) }).catch(() => { closed = true })
    }

    if (currentAgent) {
      currentAgent.events.on('log', handler)
      currentAgent.events.on('activity', activityHandler)
    }

    // Poll for agent reconnections
    const interval = setInterval(() => {
      if (closed) { clearInterval(interval); return }
      const latestAgent = agentManager.getAgent(id)
      if (latestAgent && latestAgent !== currentAgent) {
        if (currentAgent) {
          currentAgent.events.removeListener('log', handler)
          currentAgent.events.removeListener('activity', activityHandler)
        }
        currentAgent = latestAgent
        currentAgent.events.on('log', handler)
        currentAgent.events.on('activity', activityHandler)
      }
    }, 2000)

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (closed) { clearInterval(heartbeat); return }
      stream.writeSSE({ data: '', comment: 'heartbeat' }).catch(() => { closed = true })
    }, 15000)

    // Keep the stream open until client disconnects
    // Use c.req.raw.signal to detect abort
    const abortPromise = new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        if (currentAgent) {
          currentAgent.events.removeListener('log', handler)
          currentAgent.events.removeListener('activity', activityHandler)
        }
        resolve()
      })
    })

    await abortPromise
  })
})

// DELETE /api/profiles/:id/logs
logs.delete('/:id/logs', (c) => {
  clearLogs(c.req.param('id'))
  return c.json({ ok: true })
})

export default logs
```

Note: Hono's `streamSSE` helper handles the SSE headers and encoding. The heartbeat pattern may need adjustment -- test and verify the SSE stream stays open correctly. If `streamSSE` auto-closes, use a raw `c.stream()` approach instead with manual SSE formatting.

**Step 3: Create `src/server/routes/providers.ts`**

```typescript
import { Hono } from 'hono'
import { listProviders, upsertProvider } from '../lib/db'
import { validateApiKey } from '../lib/providers'

const providers = new Hono()

providers.get('/', (c) => c.json(listProviders()))

providers.put('/', async (c) => {
  const { id, api_key, base_url } = await c.req.json()
  if (!id) return c.json({ error: 'Missing provider id' }, 400)

  let status = 'unknown'
  if ((id === 'custom' || id === 'ollama' || id === 'lmstudio') && base_url) {
    try {
      const modelsUrl = id === 'ollama'
        ? base_url.replace(/\/v1\/?$/, '') + '/api/tags'
        : base_url.replace(/\/+$/, '') + '/models'
      const headers: Record<string, string> = {}
      if (api_key) headers['Authorization'] = `Bearer ${api_key}`
      const resp = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(5000) })
      status = resp.ok ? 'valid' : 'unreachable'
    } catch { status = 'unreachable' }
  } else if (api_key) {
    status = (await validateApiKey(id, api_key)) ? 'valid' : 'invalid'
  }

  upsertProvider(id, api_key || '', base_url || '', status)
  return c.json({ id, status })
})

export default providers
```

**Step 4: Create `src/server/routes/models.ts`**

Port the models route. This is the largest route -- copy the logic from the existing `src/app/api/models/route.ts` into a Hono handler. Replace `LOCALHOST` with `'127.0.0.1'`. Replace `NextResponse.json()` with `c.json()`.

**Step 5: Create `src/server/routes/commands.ts`**

```typescript
import { Hono } from 'hono'
import { fetchGameCommands, type GameCommandInfo } from '../lib/schema'

const commands = new Hono()

let cachedCommands: GameCommandInfo[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

commands.get('/', async (c) => {
  const serverUrl = c.req.query('server_url') || 'https://game.spacemolt.com'
  const apiBase = serverUrl.replace(/\/$/, '') + '/api/v1'
  const now = Date.now()
  if (cachedCommands && now - cacheTime < CACHE_TTL) return c.json(cachedCommands)
  const cmds = await fetchGameCommands(apiBase)
  if (cmds.length > 0) { cachedCommands = cmds; cacheTime = now }
  return c.json(cmds)
})

export default commands
```

**Step 6: Create `src/server/routes/preferences.ts`**

```typescript
import { Hono } from 'hono'
import { getAllPreferences, setPreference } from '../lib/db'

const preferences = new Hono()

preferences.get('/', (c) => c.json(getAllPreferences()))

preferences.put('/', async (c) => {
  const { key, value } = await c.req.json()
  if (!key || typeof value !== 'string') return c.json({ error: 'Missing key or value' }, 400)
  setPreference(key, value)
  return c.json({ key, value })
})

export default preferences
```

**Step 7: Create detect route**

Add to `src/server/routes/providers.ts`:

```typescript
import { detectLocalProviders } from '../lib/providers'

providers.post('/detect', async (c) => {
  let customUrls: Record<string, string> = {}
  try { const body = await c.req.json(); customUrls = body?.urls || {} } catch {}
  return c.json(await detectLocalProviders(customUrls))
})
```

**Step 8: Wire all routes in `src/server/index.ts`**

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import profiles from './routes/profiles'
import logs from './routes/logs'
import providers from './routes/providers'
import models from './routes/models'
import commands from './routes/commands'
import preferences from './routes/preferences'

const app = new Hono()
app.use('*', cors())

// API routes
app.route('/api/profiles', profiles)
app.route('/api/profiles', logs)      // logs routes include /:id/logs
app.route('/api/providers', providers)
app.route('/api/models', models)
app.route('/api/commands', commands)
app.route('/api/preferences', preferences)

// Health check
app.get('/api/health', (c) => c.json({ ok: true }))

// Static file serving (production) or dev proxy
const isDev = process.env.NODE_ENV !== 'production'

if (isDev) {
  // Proxy non-API requests to Vite dev server
  app.all('*', async (c) => {
    try {
      const url = new URL(c.req.url)
      url.port = '5173'
      const resp = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
      })
      return new Response(resp.body, {
        status: resp.status,
        headers: resp.headers,
      })
    } catch {
      return c.text('Vite dev server not running. Start it with: bun run dev:frontend', 502)
    }
  })
} else {
  // Serve static files from dist/
  app.use('/*', serveStatic({ root: './dist' }))
  // SPA fallback
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

const port = parseInt(process.env.PORT || '3030')
console.log(`Admiral listening on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
```

**Step 9: Test API routes manually**

Run: `bun run src/server/index.ts`
Then test with curl:
- `curl http://localhost:3030/api/health` -> `{"ok":true}`
- `curl http://localhost:3030/api/providers` -> list of providers
- `curl http://localhost:3030/api/profiles` -> `[]`
- `curl -X POST http://localhost:3030/api/profiles -H 'Content-Type: application/json' -d '{"name":"test"}' ` -> created profile

**Step 10: Commit**

```bash
git add -A && git commit -m "feat: port all API routes to Hono"
```

---

### Task 5: Set up React SPA with Vite and React Router

**Files:**
- Create: `src/frontend/src/main.tsx`
- Create: `src/frontend/src/App.tsx`
- Move: `src/app/globals.css` -> `src/frontend/src/globals.css`
- Move: `src/lib/utils.ts` -> `src/frontend/src/lib/utils.ts`
- Move: `src/types.ts` -> `src/frontend/src/types.ts` (frontend copy)

**Step 1: Create main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

**Step 2: Create App.tsx**

```typescript
import { Routes, Route } from 'react-router'
import { Home } from './pages/Home'

export function App() {
  return (
    <Routes>
      <Route path="/*" element={<Home />} />
    </Routes>
  )
}
```

**Step 3: Move globals.css**

Copy `src/app/globals.css` to `src/frontend/src/globals.css`. Change the Tailwind import -- Tailwind v4 with Vite plugin uses:

```css
@import "tailwindcss";
```

This should work as-is since we're using the `@tailwindcss/vite` plugin. Keep all existing custom properties, theme definitions, and custom classes.

**Step 4: Move utils.ts**

Copy `src/lib/utils.ts` to `src/frontend/src/lib/utils.ts`. No changes needed.

**Step 5: Copy types.ts for frontend**

Copy `src/types.ts` to `src/frontend/src/types.ts`. No changes needed. (The frontend and server each get their own copy of the same types -- they're simple interfaces.)

**Step 6: Verify Vite builds**

Run: `cd src/frontend && bunx vite build`
Expected: Successful build producing `src/frontend/dist/`

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: set up Vite + React Router frontend scaffold"
```

---

### Task 6: Move React components to frontend SPA

**Files:**
- Move all `src/components/*.tsx` to `src/frontend/src/components/`
- Move all `src/components/ui/*.tsx` to `src/frontend/src/components/ui/`
- Create: `src/frontend/src/pages/Home.tsx` (from `src/app/page.tsx`)

**Step 1: Move UI primitives**

Copy all 7 UI files from `src/components/ui/` to `src/frontend/src/components/ui/`:
- `button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `badge.tsx`, `separator.tsx`, `select.tsx`

All of these import from `@/lib/utils` which is at the same relative path. No changes needed.

**Step 2: Move main components**

Copy all 14 component files from `src/components/` to `src/frontend/src/components/`:
- `Dashboard.tsx`, `ProfileView.tsx`, `ProfileList.tsx`, `NewProfileWizard.tsx`
- `ProviderSetup.tsx`, `CommandPanel.tsx`, `LogPane.tsx`, `SidePane.tsx`
- `PlayerStatus.tsx`, `QuickCommands.tsx`, `ModelPicker.tsx`
- `JsonHighlight.tsx`, `MarkdownRenderer.tsx`, `AdmiralTour.tsx`

**Step 3: Replace nuqs with React Router in Dashboard.tsx**

In `Dashboard.tsx`, replace:
```typescript
import { useQueryState } from 'nuqs'
// ...
const [activeProfileId, setActiveProfileId] = useQueryState('profile')
```

With:
```typescript
import { useSearchParams } from 'react-router'
// ...
const [searchParams, setSearchParams] = useSearchParams()
const activeProfileId = searchParams.get('profile')
const setActiveProfileId = (id: string | null) => {
  setSearchParams(id ? { profile: id } : {})
}
```

**Step 4: Replace nuqs with React Router in LogPane.tsx**

In `LogPane.tsx`, replace:
```typescript
import { useQueryState, parseAsInteger } from 'nuqs'
// ...
const [selectedLogId, setSelectedLogId] = useQueryState('log', parseAsInteger)
```

With:
```typescript
import { useSearchParams } from 'react-router'
// ...
const [searchParams, setSearchParams] = useSearchParams()
const selectedLogId = searchParams.get('log') ? parseInt(searchParams.get('log')!) : null
const setSelectedLogId = (id: number | null) => {
  const params = new URLSearchParams(searchParams)
  if (id !== null) { params.set('log', String(id)) } else { params.delete('log') }
  setSearchParams(params)
}
```

**Step 5: Remove `LOCALHOST` import from ProviderSetup.tsx**

In `ProviderSetup.tsx`, replace:
```typescript
import { LOCALHOST } from '@/lib/localhost'
```

With:
```typescript
const LOCALHOST = '127.0.0.1'
```

**Step 6: Remove `GameCommandInfo` import from schema**

`CommandPanel.tsx` imports `GameCommandInfo` from `@/lib/schema`. This type is only used on the frontend for the command autocomplete. Define the type locally in CommandPanel or in a shared types file:

```typescript
interface GameCommandInfo {
  name: string
  description: string
  parameters: GameCommandParam[]
  isMutation: boolean
}
interface GameCommandParam {
  name: string
  type: string
  required: boolean
  description: string
}
```

**Step 7: Create Home page**

Create `src/frontend/src/pages/Home.tsx` -- port from `src/app/page.tsx`. Remove the `'use client'` directive (Vite apps are all client-side). The logic stays identical -- it fetches `/api/providers`, `/api/profiles`, `/api/preferences` and renders `<Dashboard>` and `<ProviderSetup>`.

**Step 8: Verify frontend builds**

Run: `cd src/frontend && bunx vite build`
Expected: Successful build with no import errors.

**Step 9: Test full dev stack**

Terminal 1: `bun run src/server/index.ts`
Terminal 2: `cd src/frontend && bunx vite dev --port 5173`

Open `http://localhost:5173` in browser. The Vite dev server proxies `/api` to port 3030. The UI should load and show the Admiral dashboard.

**Step 10: Commit**

```bash
git add -A && git commit -m "feat: move all React components to Vite SPA, replace nuqs with React Router"
```

---

### Task 7: Build script and single binary compilation

**Files:**
- Create: `scripts/build.ts`

**Step 1: Create build script**

```typescript
import { execSync } from 'child_process'
import { cpSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')

console.log('Building Admiral...')

// 1. Build the React SPA with Vite
console.log('\n[1/3] Building frontend...')
execSync('bunx vite build', { cwd: join(ROOT, 'src/frontend'), stdio: 'inherit' })

// 2. Copy dist to root so it's alongside the binary
const srcDist = join(ROOT, 'src/frontend/dist')
const outDist = join(ROOT, 'dist')
if (existsSync(outDist)) execSync(`rm -rf ${outDist}`)
cpSync(srcDist, outDist, { recursive: true })
console.log('[2/3] Frontend assets copied to ./dist/')

// 3. Compile the Hono server into a single binary
console.log('[3/3] Compiling server binary...')
execSync('bun build src/server/index.ts --compile --outfile admiral', { cwd: ROOT, stdio: 'inherit' })

console.log('\nBuild complete! Run: ./admiral')
console.log('Note: the dist/ directory must be alongside the admiral binary.')
```

**Step 2: Test the build**

Run: `bun run scripts/build.ts`
Expected:
1. Vite builds frontend to `src/frontend/dist/`
2. Dist copied to `./dist/`
3. Bun compiles `./admiral` binary

Run: `PORT=3030 NODE_ENV=production ./admiral`
Open `http://localhost:3030` -- should serve the SPA from `./dist/`.

**Step 3: Verify binary works standalone**

```bash
mkdir /tmp/admiral-test
cp ./admiral /tmp/admiral-test/
cp -r ./dist /tmp/admiral-test/
cp prompt.md /tmp/admiral-test/
cd /tmp/admiral-test && ./admiral
```

Expected: Admiral starts, creates `data/admiral.db`, serves UI on port 3030.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add build script for single binary compilation"
```

---

### Task 8: Clean up old Next.js source files

**Files:**
- Delete: `src/app/` (entire directory -- Next.js pages and API routes)
- Delete: `src/lib/` (old library files, now in `src/server/lib/`)
- Delete: `src/components/` (old components, now in `src/frontend/src/components/`)
- Delete: `src/types.ts` (now in `src/shared/types.ts` and `src/frontend/src/types.ts`)
- Delete: `postcss.config.js` (Vite uses the Tailwind plugin directly)
- Delete: `components.json` (shadcn/ui config, no longer needed)
- Delete: `Dockerfile`
- Update: `README.md`
- Update: `.gitignore`

**Step 1: Delete old source directories**

```bash
rm -rf src/app src/lib src/components src/types.ts
rm -f next.config.ts next-env.d.ts postcss.config.js components.json Dockerfile
```

**Step 2: Update .gitignore**

Add:
```
dist/
admiral
*.db
data/
.next/
node_modules/
```

**Step 3: Update README.md**

Update the README to reflect new build/run instructions:

```markdown
# Admiral - SpaceMolt Agent Manager

Web-based agent fleet manager for SpaceMolt.

## Quick Start

```bash
bun install
bun run build
./admiral
```

Open http://localhost:3030

## Development

```bash
# Terminal 1: API server
bun run dev

# Terminal 2: Frontend with hot reload
bun run dev:frontend
```

Open http://localhost:5173 (Vite proxies /api to :3030)

## Build

`bun run build` produces:
- `./admiral` - single binary
- `./dist/` - frontend assets (must be alongside the binary)
```

**Step 4: Verify clean state**

Run: `bun run build` (full rebuild from clean state)
Run: `NODE_ENV=production ./admiral`
Expected: Everything works.

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: remove Next.js artifacts, update README"
```

---

### Task 9: End-to-end verification

**Step 1: Test fresh install**

```bash
rm -rf node_modules
bun install
bun run build
```
Expected: Clean install and build.

**Step 2: Test dev mode**

Terminal 1: `bun run dev`
Terminal 2: `bun run dev:frontend`
Open http://localhost:5173
Expected: Admiral UI loads, API requests proxied to :3030.

**Step 3: Test production mode**

```bash
NODE_ENV=production ./admiral
```
Open http://localhost:3030
Expected: Full UI served from embedded dist/.

**Step 4: Test core functionality**

1. Settings modal opens, can configure providers
2. Create a new agent profile
3. Profile appears in sidebar
4. Can set provider/model
5. Can connect agent (if game server reachable)
6. Logs stream in real-time via SSE
7. Can execute manual commands
8. Theme toggle works
9. URL routing works (profile ID in URL)

**Step 5: Final commit**

```bash
git add -A && git commit -m "feat: admiral v0.2.0 - Bun+Hono single binary"
```

---

## Notes for the Implementing Engineer

### Key Gotchas

1. **Hono SSE streaming**: The SSE route (Task 4 Step 2) is the trickiest part. Hono's `streamSSE` may behave differently from the raw `ReadableStream` in Next.js. Test thoroughly. If `streamSSE` auto-closes the stream, fall back to raw `new Response(new ReadableStream({...}))` with manual SSE formatting.

2. **bun:sqlite API differences**: The main difference is `db.query()` instead of `db.prepare()`. Also, `bun:sqlite` returns `BigInt` for `lastInsertRowid` -- cast with `Number()` if needed.

3. **Bun compile + static files**: `bun build --compile` does NOT embed arbitrary files. The `dist/` directory and `prompt.md` must be distributed alongside the binary. The build script copies them to the right place.

4. **WebSocket import**: The `ws` package works in Bun but Bun also has a native WebSocket. The existing `ws` import should work fine in `bun build --compile`.

5. **import.meta.dir**: In a compiled Bun binary, `import.meta.dir` resolves to the directory containing the binary. This is how the binary finds `./dist/` and `./data/`.

6. **Path aliases**: The server uses `@server/*` and `@shared/*` in tsconfig but `bun build --compile` resolves these. The frontend uses `@/*` via Vite's `resolve.alias`.

7. **Concurrent dev mode**: The two-terminal dev setup (Hono + Vite) can be simplified later with `concurrently` or a single script, but start with two terminals for clarity.
