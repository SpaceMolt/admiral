export interface Provider {
  id: string
  api_key: string
  base_url: string
  status: 'valid' | 'invalid' | 'unknown' | 'unreachable'
}

export interface Profile {
  id: string
  name: string
  username: string | null
  password: string | null
  empire: string
  player_id: string | null
  provider: string | null
  model: string | null
  directive: string
  connection_mode: 'http' | 'websocket' | 'mcp'
  server_url: string
  autoconnect: boolean
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface LogEntry {
  id: number
  profile_id: string
  timestamp: string
  type: LogType
  summary: string
  detail: string | null
}

export type LogType =
  | 'connection'
  | 'error'
  | 'llm_thought'
  | 'tool_call'
  | 'tool_result'
  | 'server_message'
  | 'notification'
  | 'system'

export interface AgentStatus {
  profileId: string
  connected: boolean
  mode: 'llm' | 'manual'
  playerData?: Record<string, unknown>
}
