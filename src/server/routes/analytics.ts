import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getTimelineEntries, getTokenAnalytics, listProfiles } from '../lib/db'
import { agentManager } from '../lib/agent-manager'

const analytics = new Hono()

/**
 * GET /api/analytics/timeline
 * Cross-agent interleaved log entries. Supports SSE streaming.
 * Query params: stream=true, afterId, limit, types (csv), profiles (csv)
 */
analytics.get('/timeline', async (c) => {
  const stream = c.req.query('stream') === 'true'
  const afterId = c.req.query('afterId') ? parseInt(c.req.query('afterId')!) : undefined
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 200
  const types = c.req.query('types')?.split(',').filter(Boolean)
  const profileIds = c.req.query('profiles')?.split(',').filter(Boolean)

  if (!stream) {
    const entries = getTimelineEntries({ afterId, limit, types, profileIds })
    return c.json(entries)
  }

  // SSE stream: sends recent history, then live entries from all agents
  return streamSSE(c, async (sseStream) => {
    // Send recent history
    const recent = getTimelineEntries({ limit: 100, types, profileIds })
    for (const entry of recent) {
      await sseStream.writeSSE({ data: JSON.stringify(entry) })
    }

    let closed = false
    const handlers = new Map<string, (entry: unknown) => void>()

    const subscribe = () => {
      // Subscribe to all active agents
      const agents = agentManager.getAllAgents()
      for (const [id, agent] of agents) {
        if (profileIds && !profileIds.includes(id)) continue
        if (handlers.has(id)) continue
        const handler = (entry: unknown) => {
          if (closed) return
          const e = entry as { type?: string }
          if (types && e.type && !types.includes(e.type)) return
          sseStream.writeSSE({ data: JSON.stringify(entry) }).catch(() => { closed = true })
        }
        agent.events.on('log', handler)
        handlers.set(id, handler)
      }
    }

    subscribe()

    // Re-check for new agents periodically
    const interval = setInterval(() => {
      if (closed) { clearInterval(interval); return }
      subscribe()
    }, 3000)

    const heartbeat = setInterval(() => {
      if (closed) { clearInterval(heartbeat); return }
      sseStream.writeSSE({ data: '', comment: 'heartbeat' }).catch(() => { closed = true })
    }, 30000)

    const abortPromise = new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        for (const [id, handler] of handlers) {
          agentManager.getAgent(id)?.events.removeListener('log', handler)
        }
        resolve()
      })
    })

    await abortPromise
  })
})

/**
 * GET /api/analytics/tokens
 * Token usage and cost analytics aggregated from llm_call logs.
 * Query params: profileId, since (ISO date)
 */
analytics.get('/tokens', (c) => {
  const profileId = c.req.query('profileId') || undefined
  const since = c.req.query('since') || undefined
  const data = getTokenAnalytics({ profileId, since })
  return c.json(data)
})

/**
 * GET /api/analytics/financial
 * Financial summary per profile: wallet + storage credits parsed from game state and memory.
 */
analytics.get('/financial', (c) => {
  const profiles = listProfiles()
  const result: {
    profiles: Array<{
      id: string
      name: string
      wallet: number
      storage: number
      total: number
      cargo: Array<{ item: string; quantity: number }>
    }>
    fleetTotal: number
    fleetCargo: Record<string, number>
  } = { profiles: [], fleetTotal: 0, fleetCargo: {} }

  for (const profile of profiles) {
    const agent = agentManager.getAgent(profile.id)
    const gameState = agent?.gameState as Record<string, unknown> | null | undefined
    const player = (gameState?.player ?? {}) as Record<string, unknown>
    const wallet = typeof player.credits === 'number' ? player.credits : 0

    // Parse storage from memory
    const storage = parseStorageCreditsFromMemory(profile.memory || '')

    // Extract cargo items from game state
    const cargo: Array<{ item: string; quantity: number }> = []
    const rawCargo = (gameState?.cargo ?? gameState?.ship && (gameState.ship as Record<string, unknown>)?.cargo) as Array<Record<string, unknown>> | undefined
    if (Array.isArray(rawCargo)) {
      for (const c of rawCargo) {
        const item = String(c.item_id || c.name || '')
        const qty = Number(c.quantity ?? 1)
        if (item) {
          cargo.push({ item, quantity: qty })
          result.fleetCargo[item] = (result.fleetCargo[item] || 0) + qty
        }
      }
    }

    result.profiles.push({
      id: profile.id,
      name: profile.name,
      wallet,
      storage,
      total: wallet + storage,
      cargo,
    })
    result.fleetTotal += wallet + storage
  }

  return c.json(result)
})

/**
 * GET /api/analytics/roi
 * Per-agent ROI: game credits earned vs API dollars spent.
 * Uses token cost data + current financial snapshot.
 */
analytics.get('/roi', (c) => {
  const profiles = listProfiles()
  const tokenData = getTokenAnalytics({})
  const result: {
    profiles: Array<{
      id: string
      name: string
      totalCredits: number
      apiCost: number
      creditsPerDollar: number
    }>
    fleetTotalCredits: number
    fleetApiCost: number
    fleetCreditsPerDollar: number
  } = { profiles: [], fleetTotalCredits: 0, fleetApiCost: 0, fleetCreditsPerDollar: 0 }

  for (const profile of profiles) {
    const agent = agentManager.getAgent(profile.id)
    const gameState = agent?.gameState as Record<string, unknown> | null | undefined
    const player = (gameState?.player ?? {}) as Record<string, unknown>
    const wallet = typeof player.credits === 'number' ? player.credits : 0
    const storage = parseStorageCreditsFromMemory(profile.memory || '')
    const totalCredits = wallet + storage

    const tokenStats = tokenData.byProfile[profile.id]
    const apiCost = tokenStats?.cost ?? 0

    result.profiles.push({
      id: profile.id,
      name: profile.name,
      totalCredits,
      apiCost,
      creditsPerDollar: apiCost > 0 ? Math.round(totalCredits / apiCost) : 0,
    })
    result.fleetTotalCredits += totalCredits
    result.fleetApiCost += apiCost
  }

  result.fleetCreditsPerDollar = result.fleetApiCost > 0
    ? Math.round(result.fleetTotalCredits / result.fleetApiCost)
    : 0

  return c.json(result)
})

/**
 * Reuse the same storage credit parser from the frontend.
 * Extracts total station storage credits from an agent's memory text.
 */
function parseStorageCreditsFromMemory(memory: string): number {
  const lines = memory.split('\n')
  let summaryFound = false
  let summaryTotal = 0
  let individualTotal = 0
  let sectionType: 'summary' | 'individual' | 'none' = 'none'

  for (const line of lines) {
    if (/^#{2,3}\s/.test(line)) {
      const heading = line.replace(/^#+\s*/, '').trim().toLowerCase()
      if (/^credits\b/i.test(heading) || /storage\s+credits/i.test(heading)) {
        sectionType = 'summary'
        summaryFound = true
      } else if (/storage/i.test(heading) && !/market|palladium|resource|sales log/i.test(heading)) {
        sectionType = 'individual'
      } else {
        sectionType = 'none'
      }
      continue
    }

    if (sectionType === 'none') continue
    const trimmed = line.trim()
    if (!trimmed || trimmed === '|---|---|') continue

    const credits = extractCredits(trimmed)
    if (credits > 0) {
      if (sectionType === 'summary') summaryTotal += credits
      else individualTotal += credits
    }
  }

  return summaryFound ? summaryTotal : individualTotal
}

function extractCredits(trimmed: string): number {
  // Table row: | Name | Number |
  if (trimmed.startsWith('|')) {
    const cells = trimmed.split('|').filter(c => c.trim())
    if (cells.length !== 2) return 0
    const val = cells[1].trim().replace(/[,cr$\s]/g, '')
    const n = parseInt(val)
    return isNaN(n) ? 0 : n
  }
  // "- **Station:** 577,067cr" or "- Credits: 1,268,440" etc.
  const match = trimmed.match(/(?:credits?|storage)[:\s]*[*]*\s*([\d,]+)/i)
    || trimmed.match(/\*\*[^*]+\*\*[:\s]*([\d,]+)\s*(?:cr|credits?)?/i)
    || trimmed.match(/([\d,]+)\s*(?:cr|credits)\b/i)
  if (match) {
    const n = parseInt(match[1].replace(/,/g, ''))
    return isNaN(n) ? 0 : n
  }
  return 0
}

export default analytics
