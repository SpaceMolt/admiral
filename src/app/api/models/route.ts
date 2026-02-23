import { NextResponse } from 'next/server'
import { getModels, getProviders } from '@mariozechner/pi-ai'
import type { KnownProvider } from '@mariozechner/pi-ai'
import { getProvider } from '@/lib/db'

const PROVIDER_API_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  minimax: 'https://api.minimax.io/v1/models',
}

const LOCAL_DEFAULTS: Record<string, string> = {
  ollama: 'http://127.0.0.1:11434',
  lmstudio: 'http://127.0.0.1:1234',
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const providerId = url.searchParams.get('provider')

  if (!providerId) {
    return NextResponse.json({ error: 'Missing provider parameter' }, { status: 400 })
  }

  try {
    const models = await fetchModelsForProvider(providerId)
    return NextResponse.json({ models })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ models: [], error: msg })
  }
}

async function fetchModelsForProvider(providerId: string): Promise<string[]> {
  const dbProvider = getProvider(providerId)

  // Try fetching from live API for providers with endpoints
  if (providerId === 'ollama') {
    return fetchOllamaModels(dbProvider?.base_url)
  }

  if (providerId === 'lmstudio') {
    return fetchOpenAICompatModels(
      dbProvider?.base_url || `${LOCAL_DEFAULTS.lmstudio}/v1/models`,
      undefined
    )
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
    if (live.length > 0) return live
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

async function fetchOllamaModels(baseUrl?: string): Promise<string[]> {
  const base = baseUrl?.replace(/\/v1\/?$/, '') || LOCAL_DEFAULTS.ollama
  try {
    const resp = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return []
    const data = await resp.json()
    const models = data.models as { name: string }[] | undefined
    return (models || []).map(m => m.name).sort()
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
    const models = data.data as { id: string }[] | undefined
    return (models || []).map(m => m.id).sort()
  } catch {
    return []
  }
}
