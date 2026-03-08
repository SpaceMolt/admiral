import { Type, StringEnum } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'
import type { GameConnection } from './connections/interface'
import { updateProfile, createFleetOrder, getFleetOrders, updateFleetOrder, listProfiles } from './db'
import { FleetIntelCollector } from './fleet-intel'
import { agentManager } from './agent-manager'

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
    name: 'read_memory',
    description: 'Read your persistent memory - accumulated knowledge, routes, market intel, storage inventories, lessons learned, strategic plans. Persists across all sessions.',
    parameters: Type.Object({}),
  },
  {
    name: 'update_memory',
    description: 'Update your persistent memory. Save important discoveries, routes, market intel, storage inventories, combat data, lessons. Replaces entire memory - include everything you want to keep.',
    parameters: Type.Object({
      content: Type.String({ description: 'Full memory content (replaces existing). Use markdown.' }),
    }),
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
  {
    name: 'fleet_order',
    description: 'Send an order to another fleet agent. Use this to delegate tasks like delivery, crafting, or buying. The target agent will see the order in their next turn.',
    parameters: Type.Object({
      target_agent: Type.String({ description: 'Name of the target agent (e.g. "Bob Comet", "CyberSapper")' }),
      type: StringEnum(['deliver', 'buy', 'sell', 'craft', 'travel', 'mine', 'custom'], {
        description: 'Order type',
      }),
      description: Type.String({ description: 'What the target should do. Be specific: item, quantity, destination.' }),
      params: Type.Optional(Type.String({ description: 'JSON params (item_id, quantity, destination, etc.)' })),
    }),
  },
  {
    name: 'read_fleet_orders',
    description: 'Read orders assigned to you by other fleet agents, and orders you have issued. Update order status when completing tasks.',
    parameters: Type.Object({
      action: StringEnum(['inbox', 'sent', 'accept', 'complete', 'reject'], {
        description: 'inbox = orders for you, sent = orders you issued, accept/complete/reject = update order status',
      }),
      order_id: Type.Optional(Type.String({ description: 'Order ID (required for accept/complete/reject)' })),
      progress: Type.Optional(Type.String({ description: 'Progress note when accepting or completing' })),
    }),
  },
]

const LOCAL_TOOLS = new Set(['save_credentials', 'update_todo', 'read_todo', 'update_memory', 'read_memory', 'status_log', 'fleet_order', 'read_fleet_orders'])

const MAX_RESULT_CHARS = 4000

export type LogFn = (type: string, summary: string, detail?: string) => void

interface ToolContext {
  connection: GameConnection
  profileId: string
  profileName: string
  log: LogFn
  todo: string
  memory: string
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

  try {
    const resp = await ctx.connection.execute(command, commandArgs && Object.keys(commandArgs).length > 0 ? commandArgs : undefined)

    if (resp.error) {
      const errMsg = `Error: [${resp.error.code}] ${resp.error.message}`
      ctx.log('tool_result', errMsg)
      return errMsg
    }

    const result = formatToolResult(command, resp.result, resp.notifications)
    ctx.log('tool_result', truncate(result, 200), result)

    // Passively collect fleet intel from game results
    try {
      FleetIntelCollector.processCommandResult(command, resp.result, ctx.profileName)
      if (resp.notifications) FleetIntelCollector.processNotifications(resp.notifications, ctx.profileName)
    } catch { /* never break game execution */ }

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
    case 'update_memory': {
      ctx.memory = String(args.content)
      updateProfile(ctx.profileId, { memory: ctx.memory })
      ctx.log('system', 'Memory updated')
      return 'Memory updated.'
    }
    case 'read_memory': {
      return ctx.memory || '(empty memory)'
    }
    case 'status_log': {
      ctx.log('system', `[${args.category}] ${args.message}`)
      return 'Logged.'
    }
    case 'fleet_order': {
      const targetName = String(args.target_agent)
      const profiles = listProfiles()
      const target = profiles.find(p => p.name.toLowerCase() === targetName.toLowerCase())
      if (!target) return `Error: No agent named "${targetName}". Available: ${profiles.map(p => p.name).join(', ')}`

      const orderId = crypto.randomUUID()
      createFleetOrder({
        id: orderId,
        from_profile_id: ctx.profileId,
        to_profile_id: target.id,
        type: String(args.type),
        description: String(args.description),
        params: args.params ? String(args.params) : null,
      })

      // Nudge the target agent if they're running
      const orderMsg = `Fleet order from ${ctx.profileName}: [${args.type}] ${args.description}`
      agentManager.nudge(target.id, `## Fleet Order Received\n${orderMsg}\nUse read_fleet_orders(action="inbox") to see details and accept/complete orders.`)

      ctx.log('system', `Fleet order sent to ${target.name}: [${args.type}] ${args.description}`)
      return `Order sent to ${target.name} (id: ${orderId.slice(0, 8)}). They will be notified.`
    }
    case 'read_fleet_orders': {
      const action = String(args.action)
      const profiles = listProfiles()
      const nameOf = (id: string) => profiles.find(p => p.id === id)?.name || id.slice(0, 8)

      if (action === 'inbox') {
        const orders = getFleetOrders({ toProfileId: ctx.profileId })
        if (orders.length === 0) return 'No orders in your inbox.'
        return orders.map(o =>
          `[${o.id.slice(0, 8)}] ${o.status.toUpperCase()} | From: ${nameOf(o.from_profile_id)} | Type: ${o.type}\n  ${o.description}${o.progress ? `\n  Progress: ${o.progress}` : ''}`
        ).join('\n\n')
      }
      if (action === 'sent') {
        const orders = getFleetOrders({ fromProfileId: ctx.profileId })
        if (orders.length === 0) return 'No orders sent.'
        return orders.map(o =>
          `[${o.id.slice(0, 8)}] ${o.status.toUpperCase()} | To: ${nameOf(o.to_profile_id)} | Type: ${o.type}\n  ${o.description}${o.progress ? `\n  Progress: ${o.progress}` : ''}`
        ).join('\n\n')
      }
      if (['accept', 'complete', 'reject'].includes(action)) {
        const orderId = String(args.order_id || '')
        if (!orderId) return 'Error: order_id is required'
        // Support short IDs
        const allOrders = getFleetOrders({ toProfileId: ctx.profileId })
        const order = allOrders.find(o => o.id === orderId || o.id.startsWith(orderId))
        if (!order) return `Error: Order "${orderId}" not found in your inbox.`

        const newStatus = action === 'accept' ? 'accepted' : action === 'complete' ? 'completed' : 'rejected'
        updateFleetOrder(order.id, { status: newStatus, progress: args.progress ? String(args.progress) : undefined })

        // Notify the sender
        const statusMsg = `Order [${order.id.slice(0, 8)}] ${newStatus} by ${ctx.profileName}${args.progress ? `: ${args.progress}` : ''}`
        agentManager.nudge(order.from_profile_id, `## Fleet Order Update\n${statusMsg}`)

        ctx.log('system', `Fleet order ${order.id.slice(0, 8)} → ${newStatus}`)
        return `Order ${order.id.slice(0, 8)} marked as ${newStatus}.`
      }
      return `Error: Unknown action "${action}". Use inbox, sent, accept, complete, or reject.`
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
