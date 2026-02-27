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
