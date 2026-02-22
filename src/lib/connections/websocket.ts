import type { GameConnection, LoginResult, RegisterResult, CommandResult, NotificationHandler } from './interface'
import WebSocket from 'ws'

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000

export class WebSocketConnection implements GameConnection {
  readonly mode = 'websocket' as const
  private wsUrl: string
  private ws: WebSocket | null = null
  private notificationHandlers: NotificationHandler[] = []
  private connected = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pendingRequests = new Map<string, {
    resolve: (value: CommandResult) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private requestId = 0

  constructor(serverUrl: string) {
    const base = serverUrl.replace(/\/$/, '')
    this.wsUrl = base.replace(/^http/, 'ws') + '/ws'
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl)

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
    const resp = await this.sendCommand('login', { username, password })
    if (resp.error) {
      return { success: false, error: resp.error.message }
    }
    const result = resp.result as Record<string, unknown> | undefined
    return {
      success: true,
      player_id: result?.player_id as string | undefined,
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
    return {
      success: true,
      username: result?.username as string,
      password: result?.password as string,
      player_id: result?.player_id as string,
      empire: result?.empire as string,
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

    const id = String(++this.requestId)
    const msg = { type: command, id, payload: args || {} }

    return new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        resolve({ error: { code: 'timeout', message: `Command ${command} timed out` } })
      }, 30_000)

      this.pendingRequests.set(id, { resolve, timer })
      this.ws!.send(JSON.stringify(msg))
    })
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Response to a pending request
    const id = msg.id as string | undefined
    if (id && this.pendingRequests.has(id)) {
      const pending = this.pendingRequests.get(id)!
      this.pendingRequests.delete(id)
      clearTimeout(pending.timer)

      const result: CommandResult = {}
      if (msg.error) {
        result.error = msg.error as CommandResult['error']
      } else {
        result.result = msg.result ?? msg.payload
      }
      if (msg.notifications) {
        result.notifications = msg.notifications as unknown[]
      }

      // Emit notifications from response
      if (result.notifications) {
        for (const n of result.notifications) {
          for (const handler of this.notificationHandlers) {
            handler(n)
          }
        }
      }

      pending.resolve(result)
      return
    }

    // Push notification (no matching request id)
    for (const handler of this.notificationHandlers) {
      handler(msg)
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.resolve({ error: { code: 'disconnected', message: reason } })
    }
    this.pendingRequests.clear()
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
      } catch {
        // onclose will fire and schedule next reconnect
      }
    }, delay)
  }
}
