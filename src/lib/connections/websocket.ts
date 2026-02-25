import type { GameConnection, LoginResult, RegisterResult, CommandResult, NotificationHandler } from './interface'
import { USER_AGENT } from './interface'
import WebSocket from 'ws'

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000
const COMMAND_TIMEOUT = 30_000

/**
 * Message types that are direct responses to client commands.
 * Everything else is a server-push notification.
 */
const RESPONSE_TYPES = new Set([
  'ok',           // Generic success (queries + mutation acks)
  'error',        // Generic error
  'logged_in',    // Response to 'login'
  'registered',   // Response to 'register' (followed by 'logged_in' as notification)
  'version_info', // Response to 'get_version'
])

export class WebSocketConnection implements GameConnection {
  readonly mode = 'websocket' as const
  private wsUrl: string
  private ws: WebSocket | null = null
  private notificationHandlers: NotificationHandler[] = []
  private connected = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private credentials: { username: string; password: string } | null = null

  // Sequential FIFO queue: server processes commands in order with no request IDs
  private pendingQueue: Array<{
    resolve: (value: CommandResult) => void
    timer: ReturnType<typeof setTimeout>
    command: string
  }> = []

  constructor(serverUrl: string) {
    const base = serverUrl.replace(/\/$/, '')
    this.wsUrl = base.replace(/^http/, 'ws') + '/ws'
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl, { headers: { 'User-Agent': USER_AGENT } })

        this.ws.onopen = () => {
          this.connected = true
          this.reconnectAttempt = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          const raw = String(event.data)
          const lines = raw.split('\n').filter(l => l.trim())
          for (const line of lines) {
            try {
              const msg = JSON.parse(line)
              this.handleMessage(msg)
            } catch {
              // Ignore unparseable
            }
          }
        }

        this.ws.onclose = () => {
          this.connected = false
          this.rejectAllPending('Connection closed')
          this.scheduleReconnect()
        }

        this.ws.onerror = (err) => {
          if (!this.connected) {
            reject(new Error(`WebSocket connection failed: ${err.message}`))
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  async login(username: string, password: string): Promise<LoginResult> {
    this.credentials = { username, password }
    const resp = await this.sendCommand('login', { username, password })
    if (resp.error) {
      return { success: false, error: resp.error.message }
    }
    const result = resp.result as Record<string, unknown> | undefined
    // logged_in payload has player.id, not a top-level player_id
    const player = result?.player as Record<string, unknown> | undefined
    return {
      success: true,
      player_id: (player?.id as string) || (result?.player_id as string | undefined),
    }
  }

  async register(username: string, empire: string, code?: string): Promise<RegisterResult> {
    const args: Record<string, unknown> = { username, empire }
    if (code) args.registration_code = code
    const resp = await this.sendCommand('register', args)
    if (resp.error) {
      return { success: false, error: resp.error.message }
    }
    const result = resp.result as Record<string, unknown> | undefined
    if (result?.password) {
      this.credentials = {
        username: (result.username as string) || username,
        password: result.password as string,
      }
    }
    return {
      success: true,
      username: (result?.username as string) || username,
      password: result?.password as string,
      player_id: result?.player_id as string,
      empire: (result?.empire as string) || empire,
    }
  }

  async execute(command: string, args?: Record<string, unknown>): Promise<CommandResult> {
    return this.sendCommand(command, args)
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandlers.push(handler)
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.rejectAllPending('Disconnecting')
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private async sendCommand(command: string, args?: Record<string, unknown>): Promise<CommandResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { error: { code: 'not_connected', message: 'WebSocket not connected' } }
    }

    // Server protocol: { type: "command_name", payload: { ... } } — no request ID
    const msg = { type: command, payload: args || {} }

    return new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.pendingQueue.findIndex(p => p.timer === timer)
        if (idx !== -1) this.pendingQueue.splice(idx, 1)
        resolve({ error: { code: 'timeout', message: `Command ${command} timed out` } })
      }, COMMAND_TIMEOUT)

      this.pendingQueue.push({ resolve, timer, command })
      this.ws!.send(JSON.stringify(msg))
    })
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string
    const payload = (msg.payload || {}) as Record<string, unknown>

    // If this is a response type and we have a pending command, resolve it
    if (RESPONSE_TYPES.has(type) && this.pendingQueue.length > 0) {
      const pending = this.pendingQueue.shift()!
      clearTimeout(pending.timer)

      if (type === 'error') {
        pending.resolve({
          error: {
            code: (payload.code as string) || 'server_error',
            message: (payload.message as string) || 'Unknown error',
          },
        })
      } else {
        pending.resolve({ result: payload })
      }
      return
    }

    // Server-push notification (welcome, tick, state_update, action_result, etc.)
    for (const handler of this.notificationHandlers) {
      handler(msg)
    }
  }

  private rejectAllPending(reason: string): void {
    for (const pending of this.pendingQueue) {
      clearTimeout(pending.timer)
      pending.resolve({ error: { code: 'disconnected', message: reason } })
    }
    this.pendingQueue = []
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_DELAY
    )
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect()
        // Re-authenticate after reconnect
        if (this.credentials) {
          await this.sendCommand('login', {
            username: this.credentials.username,
            password: this.credentials.password,
          })
        }
      } catch {
        // onclose will fire and schedule next reconnect
      }
    }, delay)
  }
}
