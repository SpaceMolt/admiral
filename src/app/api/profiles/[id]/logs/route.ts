import { agentManager } from '@/lib/agent-manager'
import { getLogEntries } from '@/lib/db'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const stream = url.searchParams.get('stream') === 'true'

  if (!stream) {
    // Return recent log entries as JSON
    const entries = getLogEntries(id, undefined, 200)
    return new Response(JSON.stringify(entries.reverse()), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // SSE stream
  const encoder = new TextEncoder()
  let closed = false

  const readable = new ReadableStream({
    start(controller) {
      // Send recent history first
      const recent = getLogEntries(id, undefined, 50)
      for (const entry of recent.reverse()) {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
      }

      // Subscribe to live events
      let currentAgent = agentManager.getAgent(id)
      const handler = (entry: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
        } catch {
          closed = true
        }
      }

      if (currentAgent) {
        currentAgent.events.on('log', handler)
      }

      // Poll for agent reconnections (new Agent instance for same profile)
      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval)
          return
        }
        const latestAgent = agentManager.getAgent(id)
        if (latestAgent && latestAgent !== currentAgent) {
          // Remove handler from old agent
          if (currentAgent) {
            currentAgent.events.removeListener('log', handler)
          }
          currentAgent = latestAgent
          currentAgent.events.on('log', handler)
        }
      }, 2000)

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat)
          return
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          closed = true
          clearInterval(heartbeat)
        }
      }, 15000)

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        if (currentAgent) currentAgent.events.removeListener('log', handler)
      })
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
