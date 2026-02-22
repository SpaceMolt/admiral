import { NextResponse } from 'next/server'
import { fetchGameCommands, type GameCommandInfo } from '@/lib/schema'

let cachedCommands: GameCommandInfo[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const serverUrl = searchParams.get('server_url') || 'https://game.spacemolt.com'
  const apiBase = serverUrl.replace(/\/$/, '') + '/api/v1'

  const now = Date.now()
  if (cachedCommands && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedCommands)
  }

  const commands = await fetchGameCommands(apiBase)
  if (commands.length > 0) {
    cachedCommands = commands
    cacheTime = now
  }

  return NextResponse.json(commands)
}
