import type { GameConnection, LoginResult, RegisterResult, CommandResult, NotificationHandler } from './interface'

const MAX_RECONNECT_ATTEMPTS = 6
const RECONNECT_BASE_DELAY = 5_000

interface ApiSession {
  id: string
  playerId?: string
  createdAt: string
  expiresAt: string
}

/**
 * HTTP API v2 connection. Uses consolidated REST endpoints at /api/v2/{tool}/{action}.
 * Same session management as v1 but with grouped command structure.
 */
export class HttpV2Connection implements GameConnection {
  readonly mode = 'http_v2' as const
  private baseUrl: string
  private session: ApiSession | null = null
  private credentials: { username: string; password: string } | null = null
  private notificationHandlers: NotificationHandler[] = []
  private connected = false
  // Maps command name (v1 or v2) → URL path segment after /api/v2/
  private commandRouteMap: Map<string, string> = new Map()

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/api/v2'
  }

  async connect(): Promise<void> {
    await this.fetchToolMapping()
    await this.ensureSession()
    this.connected = true
  }

  private async fetchToolMapping(): Promise<void> {
    try {
      const resp = await fetch(`${this.baseUrl}/openapi.json`, { signal: AbortSignal.timeout(10000) })
      if (!resp.ok) return
      const spec = await resp.json()
      const allPaths = Object.keys(spec.paths || {})
      const toolPrefixes = new Set<string>()

      for (const p of allPaths) {
        const seg = p.replace('/api/v2/', '')
        const parts = seg.split('/')
        const op = (spec.paths[p]?.post ?? {}) as Record<string, unknown>
        const operationId = op.operationId as string | undefined

        if (parts.length === 2) {
          const [tool, action] = parts
          toolPrefixes.add(tool)
          const route = `${tool}/${action}`
          // v1-style short name (action) → route
          if (!this.commandRouteMap.has(action)) {
            this.commandRouteMap.set(action, route)
          }
          // v2 operationId → route
          if (operationId) {
            this.commandRouteMap.set(operationId, route)
          }
        } else if (parts.length === 1 && seg !== 'session' && seg !== 'notifications') {
          // 1-part path: tool IS the command (e.g. spacemolt_catalog)
          this.commandRouteMap.set(seg, seg)
          if (operationId && operationId !== seg) {
            this.commandRouteMap.set(operationId, seg)
          }
        }
      }

      // For 1-part command paths, derive v1 short names by stripping known tool prefixes
      for (const p of allPaths) {
        const seg = p.replace('/api/v2/', '')
        if (seg.split('/').length !== 1 || seg === 'session' || seg === 'notifications') continue
        // Try stripping each known tool prefix + underscore (longest first)
        const sortedPrefixes = [...toolPrefixes].sort((a, b) => b.length - a.length)
        for (const prefix of sortedPrefixes) {
          if (seg.startsWith(prefix + '_') && seg.length > prefix.length + 1) {
            const shortName = seg.slice(prefix.length + 1)
            if (!this.commandRouteMap.has(shortName)) {
              this.commandRouteMap.set(shortName, seg)
            }
            break
          }
        }
      }
    } catch {
      // Fall back to no mapping — commands will be sent flat (may fail)
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    this.credentials = { username, password }
    const resp = await this.execute('login', { username, password })
    if (resp.error) {
      return { success: false, error: resp.error.message }
    }
    const result = resp.result as Record<string, unknown> | undefined
    return {
      success: true,
      player_id: result?.player_id as string | undefined,
      session: result as Record<string, unknown> | undefined,
    }
  }

  async register(username: string, empire: string, code?: string): Promise<RegisterResult> {
    const args: Record<string, unknown> = { username, empire }
    if (code) args.registration_code = code
    const resp = await this.execute('register', args)
    if (resp.error) {
      return { success: false, error: resp.error.message }
    }
    const result = resp.result as Record<string, unknown> | undefined
    if (result) {
      this.credentials = {
        username: (result.username as string) || username,
        password: result.password as string,
      }
    }
    return {
      success: true,
      username: result?.username as string,
      password: result?.password as string,
      player_id: result?.player_id as string,
      empire: result?.empire as string,
    }
  }

  async execute(command: string, args?: Record<string, unknown>): Promise<CommandResult> {
    try {
      await this.ensureSession()
    } catch {
      return { error: { code: 'connection_failed', message: 'Could not connect to server' } }
    }

    let resp: CommandResult
    try {
      resp = await this.doRequest(command, args)
    } catch {
      this.session = null
      try {
        await this.ensureSession()
        resp = await this.doRequest(command, args)
      } catch {
        return { error: { code: 'connection_failed', message: 'Could not reconnect to server' } }
      }
    }

    if (resp.error) {
      const code = resp.error.code
      if (code === 'rate_limited') {
        const secs = resp.error.wait_seconds || 10
        await sleep(Math.ceil(secs * 1000))
        return this.execute(command, args)
      }
      if (code === 'session_invalid' || code === 'session_expired' || code === 'not_authenticated') {
        this.session = null
        await this.ensureSession()
        return this.doRequest(command, args)
      }
    }

    if (resp.notifications && Array.isArray(resp.notifications)) {
      for (const n of resp.notifications) {
        for (const handler of this.notificationHandlers) {
          handler(n)
        }
      }
    }

    return resp
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandlers.push(handler)
  }

  async disconnect(): Promise<void> {
    this.session = null
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private async ensureSession(): Promise<void> {
    if (this.session && !this.isSessionExpiring()) return

    let lastError: Error | null = null
    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      try {
        const resp = await fetch(`${this.baseUrl}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!resp.ok) throw new Error(`Failed to create session: ${resp.status}`)

        const data = await resp.json()
        if (data.session) {
          this.session = data.session
        } else {
          throw new Error('No session in response')
        }

        if (this.credentials) {
          await this.doRequest('login', {
            username: this.credentials.username,
            password: this.credentials.password,
          })
        }
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
    throw lastError || new Error('Failed to connect to server')
  }

  private isSessionExpiring(): boolean {
    if (!this.session) return true
    const expiresAt = new Date(this.session.expiresAt).getTime()
    return expiresAt - Date.now() < 60_000
  }

  private async doRequest(command: string, payload?: Record<string, unknown>): Promise<CommandResult> {
    // v2 uses POST /api/v2/{route} where route is tool/action or a standalone tool
    const route = this.commandRouteMap.get(command)
    const url = route ? `${this.baseUrl}/${route}` : `${this.baseUrl}/${command}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.session) headers['X-Session-Id'] = this.session.id

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    })

    if (resp.status === 401) {
      return { error: { code: 'session_invalid', message: 'Unauthorized' } }
    }

    try {
      const data = await resp.json()
      if (data.session) this.session = data.session
      // v2 returns { result: <text>, structuredContent: <JSON> }
      // Normalize: prefer structuredContent as `result` for programmatic consumers
      if (data.structuredContent !== undefined && data.structuredContent !== null) {
        data.result = data.structuredContent
      }
      return data as CommandResult
    } catch {
      return { error: { code: 'http_error', message: `HTTP ${resp.status}` } }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
