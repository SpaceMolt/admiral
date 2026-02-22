import type { Context, Message } from '@mariozechner/pi-ai'
import type { GameConnection, CommandResult } from './connections/interface'
import type { LogFn } from './tools'
import type { Profile } from '@/types'
import { HttpConnection } from './connections/http'
import { WebSocketConnection } from './connections/websocket'
import { McpConnection } from './connections/mcp'
import { resolveModel } from './model'
import { fetchGameCommands, formatCommandList } from './schema'
import { allTools } from './tools'
import { runAgentTurn, type CompactionState } from './loop'
import { addLogEntry, getProfile, updateProfile, getPreference } from './db'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'

const TURN_INTERVAL = 2000
const PROMPT_PATH = path.join(process.cwd(), 'prompt.md')

let _promptMd: string | null = null
function getPromptMd(): string {
  if (_promptMd) return _promptMd
  try {
    _promptMd = fs.readFileSync(PROMPT_PATH, 'utf-8')
  } catch {
    _promptMd = '(No prompt.md found)'
  }
  return _promptMd
}

export class Agent {
  readonly profileId: string
  readonly events = new EventEmitter()
  private connection: GameConnection | null = null
  private running = false
  private abortController: AbortController | null = null
  constructor(profileId: string) {
    this.profileId = profileId
  }

  get isConnected(): boolean {
    return this.connection?.isConnected() ?? false
  }

  get isRunning(): boolean {
    return this.running
  }

  private log: LogFn = (type, summary, detail?) => {
    const id = addLogEntry(this.profileId, type, summary, detail)
    this.events.emit('log', { id, profile_id: this.profileId, type, summary, detail, timestamp: new Date().toISOString() })
  }

  async connect(): Promise<void> {
    const profile = getProfile(this.profileId)
    if (!profile) throw new Error('Profile not found')

    this.log('connection', `Connecting via ${profile.connection_mode}...`)

    this.connection = createConnection(profile)

    try {
      await this.connection.connect()
      this.log('connection', `Connected via ${profile.connection_mode}`)
    } catch (err) {
      this.log('error', `Connection failed: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }

    // Set up notification handler
    this.connection.onNotification((n) => {
      this.log('notification', formatNotificationSummary(n), JSON.stringify(n, null, 2))
    })

    // Login if credentials exist
    if (profile.username && profile.password) {
      this.log('connection', `Logging in as ${profile.username}...`)
      const result = await this.connection.login(profile.username, profile.password)
      if (result.success) {
        this.log('connection', `Logged in as ${profile.username}`)
      } else {
        this.log('error', `Login failed: ${result.error}`)
      }
    }
  }

  async startLLMLoop(): Promise<void> {
    const profile = getProfile(this.profileId)
    if (!profile) throw new Error('Profile not found')
    if (!profile.provider || !profile.model) throw new Error('No LLM provider/model configured')
    if (!this.connection) throw new Error('Not connected')

    this.running = true
    this.abortController = new AbortController()

    this.log('system', `Starting LLM loop with ${profile.provider}/${profile.model}`)

    const { model, apiKey } = resolveModel(`${profile.provider}/${profile.model}`)

    // Fetch game commands
    const serverUrl = profile.server_url.replace(/\/$/, '')
    const commands = await fetchGameCommands(`${serverUrl}/api/v1`)
    const commandList = formatCommandList(commands)
    this.log('system', `Loaded ${commands.length} game commands`)

    // Build initial context
    const systemPrompt = buildSystemPrompt(profile, commandList)
    const context: Context = {
      systemPrompt,
      messages: [{
        role: 'user' as const,
        content: `Begin your mission: ${profile.directive || 'Play the game. Mine ore, sell it, and grow stronger.'}`,
        timestamp: Date.now(),
      }],
      tools: allTools,
    }

    const compaction: CompactionState = { summary: '' }
    const todo = { value: profile.todo || '' }

    while (this.running && !this.abortController.signal.aborted) {
      try {
        await runAgentTurn(
          model, context, this.connection, this.profileId,
          this.log, todo,
          { signal: this.abortController.signal, apiKey },
          compaction,
        )
      } catch (err) {
        if (this.abortController.signal.aborted) break
        this.log('error', `Turn error: ${err instanceof Error ? err.message : String(err)}`)
      }

      if (!this.running) break
      await sleep(TURN_INTERVAL)

      // Poll for events between turns
      let pendingEvents = ''
      try {
        const pollResp = await this.connection.execute('get_status')
        if (pollResp.notifications && Array.isArray(pollResp.notifications) && pollResp.notifications.length > 0) {
          pendingEvents = pollResp.notifications
            .map(n => {
              const s = formatNotificationSummary(n)
              return `  > ${s}`
            })
            .join('\n')
        }
      } catch {
        // Best-effort
      }

      const nudgeParts: string[] = []
      if (pendingEvents) nudgeParts.push('## Events Since Last Action\n' + pendingEvents + '\n')
      nudgeParts.push('Continue your mission.')

      context.messages.push({
        role: 'user' as const,
        content: nudgeParts.join('\n'),
        timestamp: Date.now(),
      })

      // Refresh system prompt with latest credentials
      const freshProfile = getProfile(this.profileId)
      if (freshProfile) {
        context.systemPrompt = buildSystemPrompt(freshProfile, commandList)
      }
    }

    this.running = false
    this.log('system', 'Agent loop stopped')
  }

  async executeCommand(command: string, args?: Record<string, unknown>): Promise<CommandResult> {
    if (!this.connection) {
      return { error: { code: 'not_connected', message: 'Not connected' } }
    }

    this.log('tool_call', `manual: ${command}(${args ? JSON.stringify(args) : ''})`)
    const result = await this.connection.execute(command, args)

    if (result.error) {
      this.log('tool_result', `Error: ${result.error.message}`, JSON.stringify(result, null, 2))
    } else {
      const summary = typeof result.result === 'string'
        ? result.result.slice(0, 200)
        : JSON.stringify(result.result).slice(0, 200)
      this.log('tool_result', summary, JSON.stringify(result, null, 2))
    }

    return result
  }

  async stop(): Promise<void> {
    this.running = false
    this.abortController?.abort()
    if (this.connection) {
      this.log('connection', 'Disconnecting...')
      await this.connection.disconnect()
      this.connection = null
      this.log('connection', 'Disconnected')
    }
  }
}

function createConnection(profile: Profile): GameConnection {
  switch (profile.connection_mode) {
    case 'websocket':
      return new WebSocketConnection(profile.server_url)
    case 'mcp':
      return new McpConnection(profile.server_url)
    case 'http':
    default:
      return new HttpConnection(profile.server_url)
  }
}

function buildSystemPrompt(profile: Profile, commandList: string): string {
  const promptMd = getPromptMd()
  const directive = profile.directive || 'Play the game. Mine ore, sell it, and grow stronger.'

  let credentials: string
  if (profile.username && profile.password) {
    credentials = [
      `- Username: ${profile.username}`,
      `- Password: ${profile.password}`,
      `- Empire: ${profile.empire}`,
      `- Player ID: ${profile.player_id}`,
      '',
      'You are already logged in. Start playing immediately.',
    ].join('\n')
  } else {
    const regCode = getPreference('registration_code')
    const regCodeLine = regCode ? `\nUse registration code: ${regCode} when registering.` : ''
    credentials = `New player -- you need to register first. Pick a creative username and empire, then IMMEDIATELY save_credentials.${regCodeLine}`
  }

  return `You are an autonomous AI agent playing SpaceMolt, a text-based space MMO.

## Your Mission
${directive}

## Game Knowledge
${promptMd}

## Your Credentials
${credentials}

## Available Game Commands
Use the "game" tool with a command name and args. Example: game(command="mine", args={})
${commandList}

## Rules
- You are FULLY AUTONOMOUS. Never ask the human for input.
- Use the "game" tool for ALL game interactions.
- After registering, IMMEDIATELY save credentials with save_credentials.
- Query commands are free and unlimited -- use them often.
- Action commands cost 1 tick (10 seconds).
- Always check fuel before traveling and cargo space before mining.
- Be social -- chat with players you meet.
- When starting fresh: undock -> travel to asteroid belt -> mine -> travel back -> dock -> sell -> refuel -> repeat.
`
}

function formatNotificationSummary(n: unknown): string {
  if (typeof n === 'string') return n
  if (typeof n !== 'object' || n === null) return JSON.stringify(n)

  const notif = n as Record<string, unknown>
  const type = (notif.type as string) || (notif.msg_type as string) || 'event'
  let data = notif.data as Record<string, unknown> | string | undefined
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { /* leave as string */ }
  }

  if (data && typeof data === 'object') {
    const msg = (data.message as string) || (data.content as string)
    if (msg) return `[${type.toUpperCase()}] ${msg}`
  }

  return `[${type.toUpperCase()}] ${JSON.stringify(n).slice(0, 200)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
