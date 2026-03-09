import { getModel, getModels, getProviders } from '@mariozechner/pi-ai'
import type { Model, KnownProvider } from '@mariozechner/pi-ai'
import { getProvider } from './db'
import { getClaudeMaxToken } from './claude-max-auth'

const LOCALHOST = '127.0.0.1'

interface ParsedModel {
  provider: string
  modelId: string
}

function parseModelString(modelStr: string): ParsedModel {
  const slashIdx = modelStr.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(`Invalid model string "${modelStr}". Expected: provider/model-id`)
  }
  return {
    provider: modelStr.slice(0, slashIdx),
    modelId: modelStr.slice(slashIdx + 1),
  }
}

const CUSTOM_BASE_URLS: Record<string, string> = {
  ollama: `http://${LOCALHOST}:11434/v1`,
  lmstudio: `http://${LOCALHOST}:1234/v1`,
  vllm: `http://${LOCALHOST}:8000/v1`,
  minimax: 'https://api.minimax.io/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
}

/**
 * Resolve a model string like "anthropic/claude-sonnet-4-20250514" to a pi-ai Model.
 * Reads API keys from the providers DB table instead of environment variables.
 * For "claude-max" provider, resolves as Anthropic model with OAuth token from Claude Code.
 */
export async function resolveModel(modelStr: string): Promise<{ model: Model<any>; apiKey?: string }> {
  const { provider, modelId: rawModelId } = parseModelString(modelStr)

  // Claude MAX: resolve as Anthropic model with OAuth token
  if (provider === 'claude-max') {
    const apiKey = await getClaudeMaxToken()
    const anthropicModels = getModels('anthropic' as KnownProvider)

    // Try exact match in Anthropic registry
    try {
      const model = getModel('anthropic' as KnownProvider, rawModelId as never)
      if (model) return { model, apiKey }
    } catch {
      // Fall through
    }

    // Fallback: create model from first Anthropic model as template
    if (anthropicModels.length > 0) {
      const base = anthropicModels[0]
      const model: Model<any> = { ...base, id: rawModelId, name: rawModelId }
      return { model, apiKey }
    }

    throw new Error('No Anthropic models found in registry for claude-max provider')
  }

  const modelId = provider === 'openrouter' && !rawModelId.includes('/')
    ? `openrouter/${rawModelId}`
    : rawModelId

  // Try built-in registry first
  const knownProviders = getProviders()
  if (knownProviders.includes(provider as KnownProvider)) {
    const apiKey = getApiKeyFromDb(provider)

    try {
      const model = getModel(provider as KnownProvider, modelId as never)
      if (model) return { model, apiKey }
    } catch {
      // Fall through
    }

    const providerModels = getModels(provider as KnownProvider)
    if (providerModels.length > 0) {
      const base = providerModels[0]
      const model: Model<any> = { ...base, id: modelId, name: modelId }
      return { model, apiKey }
    }
  }

  // Custom/local provider
  let baseUrl = CUSTOM_BASE_URLS[provider]
  let apiKey: string

  if (baseUrl) {
    // Check if we have a custom base URL or API key in DB
    const dbProvider = getProvider(provider)
    if (dbProvider?.base_url) baseUrl = dbProvider.base_url
    apiKey = dbProvider?.api_key || 'local'
  } else {
    const dbProvider = getProvider(provider)
    if (dbProvider?.base_url) {
      baseUrl = dbProvider.base_url
      apiKey = dbProvider.api_key || 'local'
    } else {
      throw new Error(`Unknown provider "${provider}". Configure it in Admiral settings.`)
    }
  }

  const groqModels = getModels('groq')
  if (groqModels.length === 0) {
    throw new Error('No built-in groq models found for custom model template')
  }
  const base = groqModels[0]
  const model: Model<any> = {
    ...base,
    id: modelId,
    name: modelId,
    provider: provider,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  }

  return { model, apiKey }
}

function getApiKeyFromDb(provider: string): string | undefined {
  const dbProvider = getProvider(provider)
  return dbProvider?.api_key || undefined
}

/**
 * Resolve a fresh API key for a provider.
 * For claude-max, this re-fetches the OAuth token (auto-refreshing if expired).
 * For other providers, reads from DB. Lightweight enough to call every turn.
 */
export async function resolveApiKey(provider: string): Promise<string | undefined> {
  if (provider === 'claude-max') {
    return await getClaudeMaxToken()
  }
  return getApiKeyFromDb(provider)
}
