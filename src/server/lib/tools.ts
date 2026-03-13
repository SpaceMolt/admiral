import { Type, StringEnum } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { GameConnection } from './connections/interface'
import { updateProfile } from './db'

// --- Tool Definitions ---

export const allTools: Tool[] = [
  {
    name: 'game',
    description: 'Execute a SpaceMolt game command. See the system prompt for available commands.',
    parameters: Type.Object({
      command: Type.String({ description: 'The game command name (e.g. mine, travel, get_status)' }),
      args: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'Command arguments as key-value pairs' })),
    }),
  },
  {
    name: 'save_credentials',
    description: 'Save your login credentials locally. Do this IMMEDIATELY after registering!',
    parameters: Type.Object({
      username: Type.String({ description: 'Your username' }),
      password: Type.String({ description: 'Your password (256-bit hex)' }),
      empire: Type.String({ description: 'Your empire' }),
      player_id: Type.String({ description: 'Your player ID' }),
    }),
  },
  {
    name: 'update_todo',
    description: 'Update your local TODO list to track goals and progress.',
    parameters: Type.Object({
      content: Type.String({ description: 'Full TODO list content (replaces existing)' }),
    }),
  },
  {
    name: 'read_todo',
    description: 'Read your current TODO list.',
    parameters: Type.Object({}),
  },
  {
    name: 'status_log',
    description: 'Log a status message visible to the human watching.',
    parameters: Type.Object({
      category: StringEnum(['mining', 'travel', 'combat', 'trade', 'chat', 'info', 'craft', 'faction', 'mission', 'setup'], {
        description: 'Message category',
      }),
      message: Type.String({ description: 'Status message' }),
    }),
  },
]

const LOCAL_TOOLS = new Set(['save_credentials', 'update_todo', 'read_todo', 'status_log'])

const MAX_RESULT_CHARS = 4000

// Cooldown tracking for action commands to prevent spam loops (e.g. mine → "Action pending" → mine → ...)
// Maps profileId → last action command timestamp
const actionCooldowns = new Map<string, number>()
const ACTION_COOLDOWN_MS = 8000  // 8 seconds between action commands within a turn

// Commands that are free queries (no tick cost) — exempt from cooldown
const QUERY_COMMANDS = new Set([
  'get_status', 'get_ship', 'get_cargo', 'get_system', 'get_poi', 'get_base',
  'get_map', 'get_skills', 'get_nearby', 'get_wrecks', 'get_trades',
  'get_missions', 'get_active_missions', 'get_notifications', 'get_chat_history',
  'get_battle_status', 'get_commands', 'get_guide', 'get_version', 'get_notes',
  'get_insurance_quote', 'get_action_log', 'view_market', 'view_orders',
  'view_storage', 'view_faction_storage', 'view_completed_mission',
  'estimate_purchase', 'analyze_market', 'find_route', 'search_systems',
  'scan', 'help', 'catalog', 'browse_ships', 'commission_quote', 'commission_status',
  'completed_missions', 'read_note', 'get_notes', 'captains_log_list', 'captains_log_get',
  'faction_info', 'faction_list', 'faction_get_invites', 'faction_rooms',
  'faction_visit_room', 'faction_intel_status', 'faction_query_intel',
  'faction_query_trade_intel', 'faction_trade_intel_status', 'faction_list_missions',
  'forum_list', 'forum_get_thread', 'claim_insurance',
])

export type LogFn = (type: string, summary: string, detail?: string) => void

interface ToolContext {
  connection: GameConnection
  profileId: string
  log: LogFn
  todo: string
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  reason?: string,
): Promise<string> {
  if (LOCAL_TOOLS.has(name)) {
    ctx.log('tool_call', `${name}(${formatArgs(args)})`)
    return executeLocalTool(name, args, ctx)
  }

  let command: string
  let commandArgs: Record<string, unknown> | undefined
  if (name === 'game') {
    command = String(args.command || '')
    commandArgs = args.args as Record<string, unknown> | undefined
    if (!command) return 'Error: missing \'command\' argument'
  } else {
    command = name
    commandArgs = Object.keys(args).length > 0 ? args : undefined
  }

  const fmtArgs = commandArgs ? formatArgs(commandArgs) : ''
  ctx.log('tool_call', `game(${command}${fmtArgs ? ', ' + fmtArgs : ''})`)

  // Cooldown check for action commands to prevent spam loops
  // Strip MCP v2 prefix (e.g. "spacemolt_get_system" → "get_system") for lookup
  const bareCommand = command.replace(/^spacemolt_/, '')
  const isQuery = QUERY_COMMANDS.has(command) || QUERY_COMMANDS.has(bareCommand)
  if (!isQuery) {
    const lastAction = actionCooldowns.get(ctx.profileId) ?? 0
    const elapsed = Date.now() - lastAction
    if (elapsed < ACTION_COOLDOWN_MS) {
      const waitSec = Math.ceil((ACTION_COOLDOWN_MS - elapsed) / 1000)
      ctx.log('tool_result', `Cooldown: ${command} blocked (${waitSec}s remaining)`)
      return `⏳ ACTION BLOCKED — cooldown active (${waitSec}s remaining). Game actions cost 1 tick (~10s). You just performed an action. Use query commands (get_status, get_cargo, view_market, read_todo, etc.) while waiting, or STOP calling tools and end your turn.`
    }
    actionCooldowns.set(ctx.profileId, Date.now())
  }

  try {
    const resp = await ctx.connection.execute(command, commandArgs && Object.keys(commandArgs).length > 0 ? commandArgs : undefined)

    if (resp.error) {
      const errMsg = `Error: [${resp.error.code}] ${resp.error.message}`
      ctx.log('tool_result', errMsg)
      return errMsg
    }

    // MCP v2 returns structuredContent (JSON) separately from result (text summary).
    // Prefer structuredContent for the LLM — it has the actual data.
    const resultData = resp.structuredContent ?? resp.result
    const result = formatToolResult(command, resultData, resp.notifications)
    ctx.log('tool_result', truncate(result, 200), result)

    // Detect "action pending" responses and append a strong stop signal
    const resultLower = result.toLowerCase()
    if (resultLower.includes('action pending') || resultLower.includes('resolves next tick') || resultLower.includes('already pending')) {
      ctx.log('tool_result', `Action pending detected for ${command} — cooldown enforced`)
      return truncateResult(result + '\n\n⚠️ STOP — Your action is QUEUED and will resolve on the next game tick (~10 seconds). Do NOT call this command again. Either use query commands (get_status, get_cargo, read_todo, view_market) to check on things, or end your turn and wait.')
    }

    return truncateResult(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errMsg = `Error executing ${command}: ${msg}`
    ctx.log('error', errMsg)
    return errMsg
  }
}

function executeLocalTool(name: string, args: Record<string, unknown>, ctx: ToolContext): string {
  switch (name) {
    case 'save_credentials': {
      const creds = {
        username: String(args.username),
        password: String(args.password),
        empire: String(args.empire),
        player_id: String(args.player_id),
      }
      updateProfile(ctx.profileId, {
        username: creds.username,
        password: creds.password,
        empire: creds.empire,
        player_id: creds.player_id,
      })
      ctx.log('system', `Credentials saved for ${creds.username}`)
      return `Credentials saved successfully for ${creds.username}.`
    }
    case 'update_todo': {
      ctx.todo = String(args.content)
      updateProfile(ctx.profileId, { todo: ctx.todo })
      ctx.log('system', 'TODO list updated')
      return 'TODO list updated.'
    }
    case 'read_todo': {
      return ctx.todo || '(empty TODO list)'
    }
    case 'status_log': {
      ctx.log('system', `[${args.category}] ${args.message}`)
      return 'Logged.'
    }
    default:
      return `Unknown local tool: ${name}`
  }
}

function truncateResult(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text
  return text.slice(0, MAX_RESULT_CHARS) + '\n\n... (truncated)'
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 3) + '...'
}

const REDACTED_KEYS = new Set(['password', 'token', 'secret', 'api_key'])

function formatArgs(args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue
    if (REDACTED_KEYS.has(key)) { parts.push(`${key}=XXX`); continue }
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    const t = str.length > 60 ? str.slice(0, 57) + '...' : str
    parts.push(`${key}=${t}`)
  }
  return parts.join(' ')
}

function formatToolResult(name: string, result: unknown, notifications?: unknown[]): string {
  const parts: string[] = []
  if (notifications && Array.isArray(notifications) && notifications.length > 0) {
    parts.push('Notifications:')
    for (const n of notifications) {
      const parsed = parseNotification(n)
      if (parsed) parts.push(`  > [${parsed.tag}] ${parsed.text}`)
    }
    parts.push('')
  }
  if (typeof result === 'string') {
    parts.push(result)
  } else {
    parts.push(jsonToYaml(result))
  }
  return parts.join('\n')
}

function parseNotification(n: unknown): { tag: string; text: string } | null {
  if (typeof n === 'string') return { tag: 'EVENT', text: n }
  if (typeof n !== 'object' || n === null) return null

  const notif = n as Record<string, unknown>
  const type = notif.type as string | undefined
  const msgType = notif.msg_type as string | undefined
  let data = notif.data as Record<string, unknown> | string | undefined

  if (typeof data === 'string') {
    try { data = JSON.parse(data) as Record<string, unknown> } catch { /* leave as string */ }
  }

  if (msgType === 'chat_message' && data && typeof data === 'object') {
    const channel = (data.channel as string) || '?'
    const sender = (data.sender as string) || 'Unknown'
    const content = (data.content as string) || ''
    if (sender === '[ADMIN]') return { tag: 'BROADCAST', text: content }
    if (channel === 'private') return { tag: `DM from ${sender}`, text: content }
    return { tag: `CHAT ${channel.toUpperCase()}`, text: `${sender}: ${content}` }
  }

  const tag = (type || msgType || 'EVENT').toUpperCase()
  let message: string
  if (data && typeof data === 'object') {
    message = (data.message as string) || (data.content as string) || JSON.stringify(data)
  } else if (typeof data === 'string') {
    message = data
  } else {
    message = (notif.message as string) || JSON.stringify(n)
  }
  return { tag, text: message }
}

function jsonToYaml(value: unknown, indent: number = 0): string {
  const pad = '  '.repeat(indent)

  if (value === null || value === undefined) return `${pad}~`
  if (typeof value === 'boolean') return `${pad}${value}`
  if (typeof value === 'number') return `${pad}${value}`
  if (typeof value === 'string') {
    if (
      value === '' || value === 'true' || value === 'false' ||
      value === 'null' || value === '~' ||
      value.includes('\n') || value.includes(': ') ||
      value.startsWith('{') || value.startsWith('[') ||
      value.startsWith("'") || value.startsWith('"') ||
      value.startsWith('#') || /^[\d.e+-]+$/i.test(value)
    ) {
      return `${pad}"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
    }
    return `${pad}${value}`
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`
    if (value.every(v => v === null || typeof v !== 'object')) {
      const items = value.map(v => {
        if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`
        return String(v ?? '~')
      })
      const oneLine = `${pad}[${items.join(', ')}]`
      if (oneLine.length < 120) return oneLine
    }
    const lines: string[] = []
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        lines.push(`${pad}- ${jsonToYaml(item, indent + 1).trimStart()}`)
      } else {
        lines.push(`${pad}- ${jsonToYaml(item, 0).trimStart()}`)
      }
    }
    return lines.join('\n')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return `${pad}{}`
    const lines: string[] = []
    for (const [key, val] of entries) {
      if (val !== null && typeof val === 'object') {
        lines.push(`${pad}${key}:`)
        lines.push(jsonToYaml(val, indent + 1))
      } else {
        lines.push(`${pad}${key}: ${jsonToYaml(val, 0).trimStart()}`)
      }
    }
    return lines.join('\n')
  }

  return `${pad}${String(value)}`
}
