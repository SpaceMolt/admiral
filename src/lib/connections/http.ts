import type { GameConnection, LoginResult, RegisterResult, CommandResult, NotificationHandler } from './interface'
import { USER_AGENT } from './interface'

const MAX_RECONNECT_ATTEMPTS = 6
const RECONNECT_BASE_DELAY = 5_000

interface ApiSession {
  id: string
  playerId?: string
  createdAt: string
  expiresAt: string
}

export class HttpConnection implements GameConnection {
  readonly mode = 'http' as const
  private baseUrl: string
  private session: ApiSession | null = null
  private credentials: { username: string; password: string } | null = null
  private notificationHandlers: NotificationHandler[] = []
  private connected = false

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/api/v1'
  }

  async connect(): Promise<void> {
    await this.ensureSession()
    this.connected = true
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

    // Emit notifications
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
          headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
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
    const url = `${this.baseUrl}/${command}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }
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
      return data as CommandResult
    } catch {
      return { error: { code: 'http_error', message: `HTTP ${resp.status}` } }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
