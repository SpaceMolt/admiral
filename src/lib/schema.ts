import { getPreference, setPreference } from './db'

export interface GameCommandParam {
  name: string
  type: string
  required: boolean
  description: string
}

export interface GameCommandInfo {
  name: string
  description: string
  isMutation: boolean
  params: GameCommandParam[]
}

// Cache TTL: 1 hour
const SPEC_CACHE_TTL_MS = 60 * 60 * 1000

export type SpecLogFn = (type: 'info' | 'warn' | 'error', message: string) => void

/**
 * Fetch an OpenAPI spec by URL, with local SQLite caching and error surfacing.
 * Returns the parsed spec or null if both fetch and cache miss.
 */
export async function fetchOpenApiSpec(
  specUrl: string,
  log?: SpecLogFn,
): Promise<Record<string, unknown> | null> {
  const cacheKey = `openapi_cache:${specUrl}`
  const cacheTimeKey = `openapi_cache_time:${specUrl}`

  // Try fetching from the server
  try {
    const resp = await fetch(specUrl, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'SpaceMolt-Admiral' } })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      if (resp.status === 429) {
        log?.('warn', `OpenAPI spec rate-limited (429) at ${specUrl}: ${body}`)
      } else {
        log?.('warn', `OpenAPI spec fetch failed (HTTP ${resp.status}) at ${specUrl}: ${body}`)
      }
      throw new Error(`HTTP ${resp.status}`)
    }
    const spec = await resp.json()
    // Cache on success
    try {
      setPreference(cacheKey, JSON.stringify(spec))
      setPreference(cacheTimeKey, String(Date.now()))
    } catch {
      // Non-fatal — caching is best-effort
    }
    log?.('info', `Fetched OpenAPI spec from ${specUrl}`)
    return spec
  } catch {
    // Fetch failed — try cache
  }

  // Try cached spec
  try {
    const cached = getPreference(cacheKey)
    const cachedTime = getPreference(cacheTimeKey)
    if (cached) {
      const age = cachedTime ? Date.now() - Number(cachedTime) : Infinity
      const ageMin = Math.round(age / 60_000)
      if (age < SPEC_CACHE_TTL_MS) {
        log?.('info', `Using cached OpenAPI spec for ${specUrl} (${ageMin}m old)`)
      } else {
        log?.('warn', `Using stale cached OpenAPI spec for ${specUrl} (${ageMin}m old, fetch failed)`)
      }
      return JSON.parse(cached)
    }
  } catch {
    // Cache parse failed
  }

  log?.('error', `No OpenAPI spec available for ${specUrl} (fetch failed, no cache)`)
  return null
}

/**
 * Fetch the OpenAPI spec from the gameserver and extract commands with params.
 */
export async function fetchGameCommands(baseUrl: string, log?: SpecLogFn): Promise<GameCommandInfo[]> {
  const specUrl = baseUrl.replace(/\/v\d+\/?$/, '/openapi.json')

  let spec = await fetchOpenApiSpec(specUrl, log)
  if (!spec) {
    // Fall back to fetching from the API base directly
    const apiUrl = baseUrl.replace(/\/api\/v\d+\/?$/, '/api/openapi.json')
    if (apiUrl !== specUrl) {
      spec = await fetchOpenApiSpec(apiUrl, log)
    }
  }
  if (!spec) return []

  const paths = (spec.paths ?? {}) as Record<string, Record<string, Record<string, unknown>>>
  const commands: GameCommandInfo[] = []

  for (const [path, methods] of Object.entries(paths)) {
    const op = methods?.post
    if (!op) continue

    const name = op.operationId as string
    if (!name) continue
    if (name === 'createSession' || path === '/session') continue

    const isMutation = !!op['x-is-mutation']
    const description = (op.summary as string) || name

    const params: GameCommandParam[] = []
    const rb = op.requestBody as Record<string, unknown> | undefined
    if (rb) {
      const content = (rb.content as Record<string, Record<string, unknown>>)?.['application/json']
      const schema = content?.schema as Record<string, unknown> | undefined
      if (schema) {
        const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
        const required = new Set((schema.required ?? []) as string[])
        for (const [pname, pinfo] of Object.entries(props)) {
          params.push({
            name: pname,
            type: (pinfo.type as string) || 'string',
            required: required.has(pname),
            description: (pinfo.description as string) || '',
          })
        }
      }
    }

    commands.push({ name, description, isMutation, params })
  }

  return commands
}

/**
 * Format commands as a compact pipe-separated list for the system prompt.
 */
export function formatCommandList(commands: GameCommandInfo[]): string {
  const queries = commands.filter(c => !c.isMutation).map(c => c.name)
  const mutations = commands.filter(c => c.isMutation).map(c => c.name)

  const lines: string[] = []
  if (queries.length > 0) {
    lines.push(`Query commands (free, no tick cost): ${queries.join('|')}`)
  }
  if (mutations.length > 0) {
    lines.push(`Action commands (costs 1 tick): ${mutations.join('|')}`)
  }
  return lines.join('\n')
}
