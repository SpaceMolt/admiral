import { getProvider, upsertProvider } from './db'

const LOCALHOST = '127.0.0.1'

interface DetectResult {
  id: string
  status: 'valid' | 'unreachable'
  baseUrl: string
}

const DEFAULT_URLS: Record<string, string> = {
  ollama: `http://${LOCALHOST}:11434`,
  lmstudio: `http://${LOCALHOST}:1234`,
}

/**
 * Detect local LLM providers (Ollama, LM Studio).
 * Accepts optional custom URLs to override defaults (e.g. when running in a VM).
 */
export async function detectLocalProviders(customUrls?: Record<string, string>): Promise<DetectResult[]> {
  const results: DetectResult[] = []

  // Check Ollama
  const ollamaUrl = customUrls?.ollama || getProvider('ollama')?.base_url?.replace(/\/v1\/?$/, '') || DEFAULT_URLS.ollama
  try {
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (resp.ok) {
      const existing = getProvider('ollama')
      const baseUrl = `${ollamaUrl}/v1`
      upsertProvider('ollama', existing?.api_key || '', baseUrl, 'valid')
      results.push({ id: 'ollama', status: 'valid', baseUrl })
    } else {
      results.push({ id: 'ollama', status: 'unreachable', baseUrl: `${ollamaUrl}/v1` })
    }
  } catch {
    results.push({ id: 'ollama', status: 'unreachable', baseUrl: `${ollamaUrl}/v1` })
  }

  // Check LM Studio
  const lmStudioUrl = customUrls?.lmstudio || getProvider('lmstudio')?.base_url?.replace(/\/v1\/?$/, '') || DEFAULT_URLS.lmstudio
  try {
    const resp = await fetch(`${lmStudioUrl}/v1/models`, { signal: AbortSignal.timeout(3000) })
    if (resp.ok) {
      const existing = getProvider('lmstudio')
      const baseUrl = `${lmStudioUrl}/v1`
      upsertProvider('lmstudio', existing?.api_key || '', baseUrl, 'valid')
      results.push({ id: 'lmstudio', status: 'valid', baseUrl })
    } else {
      results.push({ id: 'lmstudio', status: 'unreachable', baseUrl: `${lmStudioUrl}/v1` })
    }
  } catch {
    results.push({ id: 'lmstudio', status: 'unreachable', baseUrl: `${lmStudioUrl}/v1` })
  }

  return results
}

/**
 * Validate a cloud API key by making a lightweight API call.
 */
export async function validateApiKey(provider: string, apiKey: string): Promise<boolean> {
  try {
    switch (provider) {
      case 'anthropic': {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          signal: AbortSignal.timeout(10000),
        })
        // 200 or 400 (bad request) both mean the key is valid
        return resp.status !== 401 && resp.status !== 403
      }
      case 'openai': {
        const resp = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        return resp.ok
      }
      case 'groq': {
        const resp = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        return resp.ok
      }
      case 'openrouter': {
        const resp = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        return resp.ok
      }
      case 'minimax': {
        const resp = await fetch('https://api.minimax.io/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'MiniMax-M2.5-highspeed',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          signal: AbortSignal.timeout(10000),
        })
        return resp.status !== 401 && resp.status !== 403
      }
      default:
        // For unknown providers, assume valid if non-empty
        return apiKey.length > 0
    }
  } catch {
    return false
  }
}
