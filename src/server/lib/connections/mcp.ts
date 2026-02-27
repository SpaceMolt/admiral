import type { GameConnection, LoginResult, RegisterResult, CommandResult, NotificationHandler } from './interface'
import { USER_AGENT } from './interface'

export class McpConnection implements GameConnection {
  readonly mode = 'mcp' as const
  private baseUrl: string
  private sessionId: string | null = null
  private notificationHandlers: NotificationHandler[] = []
  private connected = false
  private jsonRpcId = 0

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/mcp'
  }

  async connect(): Promise<void> {
    // Send initialize request
    const resp = await this.sendJsonRpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'admiral', version: '0.2.0' },
    })

    if (!resp.result) {
      throw new Error('MCP initialize failed: ' + JSON.stringify(resp.error))
    }

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {})
    this.connected = true
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const resp = await this.callTool('login', { username, password })
    if (resp.error) {
      return { success: false, error: resp.error.message }
    }
    const result = this.parseToolResult(resp.result)
    return {
      success: true,
      player_id: result?.player_id as string | undefined,
    }
  }

  async register(username: string, empire: string, code?: string): Promise<RegisterResult> {
    const args: Record<string, unknown> = { username, empire }
    if (code) args.registration_code = code
    const resp = await this.callTool('register', args)
    if (resp.error) {
      return { success: false, error: resp.error.message }
    }
    const result = this.parseToolResult(resp.result)
    return {
      success: true,
      username: result?.username as string,
      password: result?.password as string,
      player_id: result?.player_id as string,
      empire: result?.empire as string,
    }
  }

  async execute(command: string, args?: Record<string, unknown>): Promise<CommandResult> {
    const resp = await this.callTool(command, args || {})
    if (resp.error) {
      return { error: { code: resp.error.code?.toString() || 'mcp_error', message: resp.error.message || 'Unknown error' } }
    }

    const result = this.parseToolResult(resp.result)

    // Poll notifications
    try {
      const notifResp = await this.callTool('get_notifications', {})
      const notifResult = this.parseToolResult(notifResp.result)
      if (notifResult?.notifications && Array.isArray(notifResult.notifications)) {
        for (const n of notifResult.notifications) {
          for (const handler of this.notificationHandlers) {
            handler(n)
          }
        }
        return { result, notifications: notifResult.notifications }
      }
    } catch {
      // Notification polling is best-effort
    }

    return { result }
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandlers.push(handler)
  }

  async disconnect(): Promise<void> {
    this.sessionId = null
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<{
    result?: unknown
    error?: { code?: number; message: string }
  }> {
    return this.sendJsonRpc('tools/call', { name, arguments: args })
  }

  private async sendJsonRpc(method: string, params: unknown): Promise<{
    result?: unknown
    error?: { code?: number; message: string }
  }> {
    const id = ++this.jsonRpcId
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'User-Agent': USER_AGENT,
    }
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId
    }

    const resp = await fetch(this.baseUrl, { method: 'POST', headers, body })

    // Capture session ID from response headers
    const sid = resp.headers.get('Mcp-Session-Id')
    if (sid) this.sessionId = sid

    const contentType = resp.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream')) {
      // Parse SSE response
      const text = await resp.text()
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.id === id) return data
          } catch {
            // continue parsing
          }
        }
      }
      return { error: { message: 'No matching response in SSE stream' } }
    }

    return await resp.json()
  }

  private async sendNotification(method: string, params: unknown): Promise<void> {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params })
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId

    await fetch(this.baseUrl, { method: 'POST', headers, body })
  }

  private parseToolResult(result: unknown): Record<string, unknown> | null {
    if (!result) return null
    // MCP tool results come as { content: [{ type: "text", text: "..." }] }
    const r = result as Record<string, unknown>
    if (r.content && Array.isArray(r.content)) {
      for (const block of r.content) {
        const b = block as Record<string, unknown>
        if (b.type === 'text' && typeof b.text === 'string') {
          try {
            return JSON.parse(b.text)
          } catch {
            return { text: b.text }
          }
        }
      }
    }
    return r
  }
}
