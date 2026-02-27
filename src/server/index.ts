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
