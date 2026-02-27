import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import { existsSync } from 'fs'
import { join } from 'path'
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
// Detect production by checking for dist/ directory alongside the binary/entrypoint.
// This is more reliable than NODE_ENV because `bun build --compile` may inline
// process.env.NODE_ENV at compile time, making it unreliable at runtime.
const distDir = join(import.meta.dir, 'dist')
const hasDistDir = existsSync(distDir) || existsSync('./dist/index.html')
const isDev = !hasDistDir && process.env.NODE_ENV !== 'production'

if (isDev) {
  // Proxy non-API requests to Vite dev server
  app.all('*', async (c) => {
    try {
      const url = new URL(c.req.url)
      url.port = '3030'
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

const port = parseInt(process.env.PORT || '3031')
console.log(`Admiral listening on http://0.0.0.0:${port}`)

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}
