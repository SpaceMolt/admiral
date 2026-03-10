import { Hono } from 'hono'
import { fetchGameCommands, type GameCommandInfo } from '../lib/schema'

const commands = new Hono()

const cache = new Map<string, { cmds: GameCommandInfo[]; time: number }>()
const CACHE_TTL = 5 * 60 * 1000

commands.get('/', async (c) => {
  const serverUrl = c.req.query('server_url') || 'https://game.spacemolt.com'
  const apiVersion = c.req.query('api_version') === 'v2' ? 'v2' : 'v1'
  const apiBase = serverUrl.replace(/\/$/, '') + `/api/${apiVersion}`
  const cacheKey = `${apiBase}`
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.time < CACHE_TTL) return c.json(cached.cmds)
  const cmds = await fetchGameCommands(apiBase)
  if (cmds.length > 0) cache.set(cacheKey, { cmds, time: now })
  return c.json(cmds)
})

export default commands
