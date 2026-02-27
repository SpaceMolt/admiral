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

    // Heartbeat - must be well under the Bun.serve idleTimeout (120s)
    const heartbeat = setInterval(() => {
      if (closed) { clearInterval(heartbeat); return }
      stream.writeSSE({ data: '', comment: 'heartbeat' }).catch(() => { closed = true })
    }, 30000)

    // Keep the stream open until client disconnects
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
