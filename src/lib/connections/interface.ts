export interface LoginResult {
  success: boolean
  error?: string
  player_id?: string
  session?: Record<string, unknown>
}

export interface RegisterResult {
  success: boolean
  error?: string
  username?: string
  password?: string
  player_id?: string
  empire?: string
}

export interface CommandResult {
  result?: unknown
  notifications?: unknown[]
  error?: { code: string; message: string; wait_seconds?: number }
}

export type NotificationHandler = (notification: unknown) => void

export interface GameConnection {
  readonly mode: 'http' | 'websocket' | 'mcp'

  connect(): Promise<void>
  login(username: string, password: string): Promise<LoginResult>
  register(username: string, empire: string, code?: string): Promise<RegisterResult>
  execute(command: string, args?: Record<string, unknown>): Promise<CommandResult>
  onNotification(handler: NotificationHandler): void
  disconnect(): Promise<void>
  isConnected(): boolean
}
