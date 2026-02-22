import { getModel, getModels, getProviders } from '@mariozechner/pi-ai'
import type { Model, KnownProvider } from '@mariozechner/pi-ai'
import { getProvider } from './db'

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
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  vllm: 'http://localhost:8000/v1',
}

/**
 * Resolve a model string like "anthropic/claude-sonnet-4-20250514" to a pi-ai Model.
 * Reads API keys from the providers DB table instead of environment variables.
 */
export function resolveModel(modelStr: string): { model: Model<any>; apiKey?: string } {
  const { provider, modelId: rawModelId } = parseModelString(modelStr)

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
    // Check if we have a custom base URL in DB
    const dbProvider = getProvider(provider)
    if (dbProvider?.base_url) baseUrl = dbProvider.base_url
    apiKey = 'local'
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
