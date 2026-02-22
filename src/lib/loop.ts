import { complete } from '@mariozechner/pi-ai'
import type { Model, Context, AssistantMessage, ToolCall, Message } from '@mariozechner/pi-ai'
import type { GameConnection } from './connections/interface'
import type { LogFn } from './tools'
import { executeTool } from './tools'

const MAX_TOOL_ROUNDS = 30
const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 5000
const LLM_TIMEOUT_MS = 120_000

const CHARS_PER_TOKEN = 4
const CONTEXT_BUDGET_RATIO = 0.55
const MIN_RECENT_MESSAGES = 10
const SUMMARY_MAX_TOKENS = 1024

export interface LoopOptions {
  signal?: AbortSignal
  apiKey?: string
}

export interface CompactionState {
  summary: string
}

export async function runAgentTurn(
  model: Model<any>,
  context: Context,
  connection: GameConnection,
  profileId: string,
  log: LogFn,
  todo: { value: string },
  options?: LoopOptions,
  compaction?: CompactionState,
): Promise<void> {
  let rounds = 0

  while (rounds < MAX_TOOL_ROUNDS) {
    if (options?.signal?.aborted) return

    await compactContext(model, context, compaction, options)

    let response: AssistantMessage
    try {
      response = await completeWithRetry(model, context, log, options)
    } catch (err) {
      log('error', `LLM call failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    context.messages.push(response)

    const toolCalls = response.content.filter((c): c is ToolCall => c.type === 'toolCall')

    const textParts = response.content
      .filter((b: any) => b.type === 'text' && b.text?.trim())
      .map((b: any) => b.text.trim())
    let reasoning = textParts.join(' ')
    if (!reasoning) {
      const thinking = response.content
        .filter((b: any) => 'thinking' in b && b.thinking?.trim())
        .map((b: any) => b.thinking.trim())
        .join(' ')
      if (thinking) {
        const sentences = thinking.split(/[.!?\n]/).filter((s: string) => s.trim().length > 10)
        reasoning = sentences.slice(-3).map((s: string) => s.trim()).join('. ')
      }
    }

    if (toolCalls.length === 0) {
      if (reasoning) log('llm_thought', reasoning)
      return
    }

    const reason = reasoning
      ? reasoning.length > 180 ? reasoning.slice(0, 177) + '...' : reasoning
      : undefined

    if (reasoning) log('llm_thought', reasoning)

    const toolCtx = { connection, profileId, log, todo: todo.value }

    let showedReason = false
    for (const toolCall of toolCalls) {
      if (options?.signal?.aborted) return

      const callReason = !showedReason ? reason : undefined
      showedReason = true
      const result = await executeTool(toolCall.name, toolCall.arguments, toolCtx, callReason)

      // If update_todo changed the todo via local tool, sync back
      todo.value = toolCtx.todo

      const isError = result.startsWith('Error')
      const toolResultMessage: Message = {
        role: 'toolResult',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: 'text', text: result }],
        isError,
        timestamp: Date.now(),
      }
      context.messages.push(toolResultMessage)
    }

    rounds++
  }

  log('system', `Reached max tool rounds (${MAX_TOOL_ROUNDS}), ending turn`)
}

// ─── Context compaction ──────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function estimateMessageTokens(msg: Message): number {
  if (typeof msg.content === 'string') return estimateTokens(msg.content)
  if (Array.isArray(msg.content)) {
    let total = 0
    for (const block of msg.content) {
      if ('text' in block) total += estimateTokens((block as any).text)
      else if ('name' in block) total += estimateTokens((block as any).name + JSON.stringify((block as any).arguments))
      else if ('thinking' in block) total += estimateTokens((block as any).thinking)
    }
    return total
  }
  return 0
}

function totalMessageTokens(messages: Message[]): number {
  let total = 0
  for (const msg of messages) total += estimateMessageTokens(msg)
  return total
}

function findTurnBoundary(messages: Message[], idx: number): number {
  for (let i = idx; i < messages.length; i++) {
    if (messages[i].role === 'user') return i
  }
  for (let i = idx - 1; i >= 1; i--) {
    if (messages[i].role === 'user') return i
  }
  return idx
}

function formatMessagesForSummary(messages: Message[]): string {
  const lines: string[] = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = typeof msg.content === 'string' ? msg.content : '(complex)'
      lines.push(`[USER] ${text}`)
    } else if (msg.role === 'assistant') {
      for (const block of msg.content) {
        if ('text' in block && (block as any).text?.trim()) {
          lines.push(`[AGENT] ${(block as any).text.trim()}`)
        } else if ('name' in block) {
          const b = block as any
          const args = Object.entries((b.arguments || {}) as Record<string, unknown>)
            .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(', ')
          lines.push(`[TOOL CALL] ${b.name}(${args})`)
        }
      }
    } else if (msg.role === 'toolResult') {
      const text = Array.isArray(msg.content)
        ? msg.content.map((b: any) => b.text || '').join('')
        : ''
      const trimmed = text.length > 500 ? text.slice(0, 500) + '...' : text
      const errorTag = msg.isError ? ' [ERROR]' : ''
      lines.push(`[RESULT${errorTag}] ${msg.toolName}: ${trimmed}`)
    }
  }
  return lines.join('\n')
}

async function compactContext(
  model: Model<any>,
  context: Context,
  compaction?: CompactionState,
  options?: LoopOptions,
): Promise<void> {
  const budget = Math.floor(model.contextWindow * CONTEXT_BUDGET_RATIO)
  const currentTokens = totalMessageTokens(context.messages)

  if (currentTokens < budget) return

  const recentBudget = Math.floor(budget * 0.6)
  let recentTokens = 0
  let splitIdx = context.messages.length

  for (let i = context.messages.length - 1; i >= 1; i--) {
    const msgTokens = estimateMessageTokens(context.messages[i])
    if (recentTokens + msgTokens > recentBudget && splitIdx < context.messages.length - MIN_RECENT_MESSAGES) {
      break
    }
    recentTokens += msgTokens
    splitIdx = i
  }

  splitIdx = findTurnBoundary(context.messages, splitIdx)
  if (splitIdx <= 1) return

  const oldMessages = context.messages.slice(1, splitIdx)
  const recentMessages = context.messages.slice(splitIdx)

  let summary: string
  try {
    summary = await summarizeViaLLM(model, oldMessages, compaction?.summary, options)
  } catch {
    summary = compaction?.summary
      ? compaction.summary + '\n\n(Additional context was lost due to summarization failure.)'
      : '(Earlier session context was lost.)'
  }

  if (compaction) compaction.summary = summary

  const summaryMessage: Message = {
    role: 'user' as const,
    content: `## Session History Summary\n\n${summary}\n\n---\nNow continue your mission. Recent events follow.`,
    timestamp: Date.now(),
  }

  context.messages = [context.messages[0], summaryMessage, ...recentMessages]
}

async function summarizeViaLLM(
  model: Model<any>,
  oldMessages: Message[],
  previousSummary: string | undefined,
  options?: LoopOptions,
): Promise<string> {
  const transcript = formatMessagesForSummary(oldMessages)

  let prompt = 'Summarize this game session transcript. '
  prompt += 'Focus on: (1) what the agent was CURRENTLY DOING and what it planned to do next, '
  prompt += '(2) current location, credits, ship status, cargo, '
  prompt += '(3) active goals, key events, relationships. Be concise.\n\n'

  if (previousSummary) {
    prompt += 'Previous summary:\n' + previousSummary + '\n\n'
  }
  prompt += 'Transcript:\n' + transcript

  const summaryCtx: Context = {
    systemPrompt: 'You are a concise summarizer. Output only the summary, no preamble.',
    messages: [{ role: 'user' as const, content: prompt, timestamp: Date.now() }],
  }

  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), 30_000)
  const signal = options?.signal
    ? combineAbortSignals(options.signal, timeoutController.signal)
    : timeoutController.signal

  try {
    const resp = await complete(model, summaryCtx, {
      signal,
      apiKey: options?.apiKey,
      maxTokens: SUMMARY_MAX_TOKENS,
    })
    clearTimeout(timeout)

    const text = resp.content
      .filter((b): b is { type: 'text'; text: string } => 'text' in b)
      .map(b => b.text)
      .join('')

    if (!text.trim()) throw new Error('Empty summary')
    return text.trim()
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

// ─── LLM call with retry ────────────────────────────────────

async function completeWithRetry(
  model: Model<any>,
  context: Context,
  log: LogFn,
  options?: LoopOptions,
): Promise<AssistantMessage> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const timeoutController = new AbortController()
      const timeout = setTimeout(() => timeoutController.abort(), LLM_TIMEOUT_MS)

      const signal = options?.signal
        ? combineAbortSignals(options.signal, timeoutController.signal)
        : timeoutController.signal

      try {
        const result = await complete(model, context, {
          signal,
          apiKey: options?.apiKey,
          maxTokens: 4096,
        })
        clearTimeout(timeout)

        if (result.stopReason === 'error') {
          throw new Error(result.errorMessage || 'LLM returned an error response')
        }
        if (result.content.length === 0) {
          throw new Error('LLM returned empty response')
        }

        return result
      } catch (err) {
        clearTimeout(timeout)
        if (timeoutController.signal.aborted && !options?.signal?.aborted) {
          throw new Error(`LLM call timed out after ${LLM_TIMEOUT_MS / 1000}s`)
        }
        throw err
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (options?.signal?.aborted) throw lastError

      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
      log('error', `LLM error (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError.message}`)
      await sleep(delay)
    }
  }

  throw lastError || new Error('LLM call failed after retries')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}
