import { Hono } from 'hono'
import { listProviders, upsertProvider } from '../lib/db'
import { validateApiKey, detectLocalProviders } from '../lib/providers'

const providers = new Hono()

providers.get('/', (c) => c.json(listProviders()))

providers.put('/', async (c) => {
  const { id, api_key, base_url } = await c.req.json()
  if (!id) return c.json({ error: 'Missing provider id' }, 400)

  let status = 'unknown'
  if ((id === 'custom' || id === 'ollama' || id === 'lmstudio') && base_url) {
    try {
      const modelsUrl = id === 'ollama'
        ? base_url.replace(/\/v1\/?$/, '') + '/api/tags'
        : base_url.replace(/\/+$/, '') + '/models'
      const headers: Record<string, string> = {}
      if (api_key) headers['Authorization'] = `Bearer ${api_key}`
      const resp = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(5000) })
      status = resp.ok ? 'valid' : 'unreachable'
    } catch { status = 'unreachable' }
  } else if (api_key) {
    status = (await validateApiKey(id, api_key)) ? 'valid' : 'invalid'
  }

  upsertProvider(id, api_key || '', base_url || '', status)
  return c.json({ id, status })
})

providers.post('/detect', async (c) => {
  let customUrls: Record<string, string> = {}
  try { const body = await c.req.json(); customUrls = body?.urls || {} } catch {}
  return c.json(await detectLocalProviders(customUrls))
})

export default providers
