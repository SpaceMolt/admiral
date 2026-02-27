import { Hono } from 'hono'
import { getModels, getProviders } from '@mariozechner/pi-ai'
import type { KnownProvider } from '@mariozechner/pi-ai'
import { getProvider } from '../lib/db'

const LOCALHOST = '127.0.0.1'

const PROVIDER_API_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  minimax: 'https://api.minimax.io/v1/models',
}

const LOCAL_DEFAULTS: Record<string, string> = {
  ollama: `http://${LOCALHOST}:11434`,
  lmstudio: `http://${LOCALHOST}:1234`,
}

const models = new Hono()

models.get('/', async (c) => {
  const providerId = c.req.query('provider')
  if (!providerId) return c.json({ error: 'Missing provider parameter' }, 400)

  try {
    const modelList = await fetchModelsForProvider(providerId)
    return c.json({ models: modelList })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ models: [], error: msg })
  }
})

async function fetchModelsForProvider(providerId: string): Promise<string[]> {
  const dbProvider = getProvider(providerId)

  // Try fetching from live API for providers with endpoints
  if (providerId === 'ollama') {
    return fetchOllamaModels(dbProvider?.base_url)
  }

  if (providerId === 'lmstudio') {
    const base = dbProvider?.base_url?.replace(/\/+$/, '') || `${LOCAL_DEFAULTS.lmstudio}/v1`
    const modelsUrl = base.endsWith('/models') ? base : base + '/models'
    return fetchOpenAICompatModels(modelsUrl, undefined)
  }

  // Custom provider - try to fetch from configured base_url
  if (providerId === 'custom' && dbProvider?.base_url) {
    const modelsUrl = dbProvider.base_url.replace(/\/+$/, '') + (dbProvider.base_url.includes('/models') ? '' : '/models')
    return fetchOpenAICompatModels(modelsUrl, dbProvider.api_key || undefined)
  }

  // Cloud providers with OpenAI-compatible /v1/models
  const apiUrl = PROVIDER_API_URLS[providerId]
  if (apiUrl && dbProvider?.api_key) {
    const live = await fetchOpenAICompatModels(apiUrl, dbProvider.api_key)
    if (live.length > 0) {
      if (providerId === 'openrouter') return pinOpenRouterModels(live)
      return live
    }
  }

  // Anthropic doesn't have a models list endpoint - use pi-ai registry
  // Also fallback for any provider without live API results
  const knownProviders = getProviders()
  if (knownProviders.includes(providerId as KnownProvider)) {
    const piModels = getModels(providerId as KnownProvider)
    return piModels.map(m => m.id).sort()
  }

  return []
}

const OPENROUTER_PINNED = [
  'openrouter/auto',
  'openrouter/free',
]

function pinOpenRouterModels(models: string[]): string[] {
  const pinned = OPENROUTER_PINNED.filter(m => models.includes(m))
  const rest = models.filter(m => !OPENROUTER_PINNED.includes(m))
  return [...pinned, ...rest]
}

async function fetchOllamaModels(baseUrl?: string): Promise<string[]> {
  const base = baseUrl?.replace(/\/v1\/?$/, '') || LOCAL_DEFAULTS.ollama
  try {
    const resp = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return []
    const data = await resp.json()
    const modelList = data.models as { name: string }[] | undefined
    return (modelList || []).map(m => m.name).sort()
  } catch {
    return []
  }
}

async function fetchOpenAICompatModels(apiUrl: string, apiKey?: string): Promise<string[]> {
  try {
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const resp = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return []
    const data = await resp.json()
    const modelList = data.data as { id: string }[] | undefined
    return (modelList || []).map(m => m.id).sort()
  } catch {
    return []
  }
}

export default models
