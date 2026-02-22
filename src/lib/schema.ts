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

/**
 * Fetch the OpenAPI spec from the gameserver and extract commands with params.
 */
export async function fetchGameCommands(baseUrl: string): Promise<GameCommandInfo[]> {
  const specUrl = baseUrl.replace(/\/v\d+\/?$/, '/openapi.json')

  let spec: Record<string, unknown>
  try {
    const resp = await fetch(specUrl)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    spec = await resp.json()
  } catch {
    // Fall back to fetching from the API base directly
    try {
      const apiUrl = baseUrl.replace(/\/api\/v\d+\/?$/, '/api/openapi.json')
      const resp = await fetch(apiUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      spec = await resp.json()
    } catch {
      return []
    }
  }

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
