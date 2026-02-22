'use client'

/**
 * Syntax highlighter for structured data, supporting JSON and YAML display.
 * Tokenizes and wraps each token in a colored span matching the SMUI theme.
 */

export type DisplayFormat = 'json' | 'yaml'

interface Props {
  json: string
  format?: DisplayFormat
  className?: string
}

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'brace' | 'bracket' | 'colon' | 'comma' | 'whitespace' | 'text'

interface Token {
  type: TokenType
  value: string
}

const TOKEN_COLORS: Record<TokenType, string> = {
  key: 'hsl(var(--primary))',
  string: 'hsl(var(--smui-green))',
  number: 'hsl(var(--smui-orange))',
  boolean: 'hsl(var(--smui-purple))',
  null: 'hsl(var(--border))',
  brace: 'hsl(var(--muted-foreground))',
  bracket: 'hsl(var(--muted-foreground))',
  colon: 'hsl(var(--border))',
  comma: 'hsl(var(--border))',
  whitespace: 'transparent',
  text: 'hsl(var(--muted-foreground))',
}

// ─── JSON tokenizer ─────────────────────────────────────

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      let ws = ''
      while (i < input.length && (input[i] === ' ' || input[i] === '\t' || input[i] === '\n' || input[i] === '\r')) {
        ws += input[i]
        i++
      }
      tokens.push({ type: 'whitespace', value: ws })
      continue
    }

    if (ch === '{' || ch === '}') {
      tokens.push({ type: 'brace', value: ch })
      i++
      continue
    }

    if (ch === '[' || ch === ']') {
      tokens.push({ type: 'bracket', value: ch })
      i++
      continue
    }

    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':' })
      i++
      continue
    }

    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' })
      i++
      continue
    }

    if (ch === '"') {
      let str = '"'
      i++
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          str += input[i] + input[i + 1]
          i += 2
        } else {
          str += input[i]
          i++
        }
      }
      if (i < input.length) {
        str += '"'
        i++
      }

      let lookAhead = i
      while (lookAhead < input.length && (input[lookAhead] === ' ' || input[lookAhead] === '\t' || input[lookAhead] === '\n' || input[lookAhead] === '\r')) {
        lookAhead++
      }
      const isKey = lookAhead < input.length && input[lookAhead] === ':'

      tokens.push({ type: isKey ? 'key' : 'string', value: str })
      continue
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let num = ''
      while (i < input.length && /[0-9eE.+\-]/.test(input[i])) {
        num += input[i]
        i++
      }
      tokens.push({ type: 'number', value: num })
      continue
    }

    if (input.slice(i, i + 4) === 'true') {
      tokens.push({ type: 'boolean', value: 'true' })
      i += 4
      continue
    }
    if (input.slice(i, i + 5) === 'false') {
      tokens.push({ type: 'boolean', value: 'false' })
      i += 5
      continue
    }
    if (input.slice(i, i + 4) === 'null') {
      tokens.push({ type: 'null', value: 'null' })
      i += 4
      continue
    }

    tokens.push({ type: 'text', value: ch })
    i++
  }

  return tokens
}

// ─── YAML tokenizer ─────────────────────────────────────

function tokenizeYaml(input: string): Token[] {
  const tokens: Token[] = []
  const lines = input.split('\n')

  for (let li = 0; li < lines.length; li++) {
    if (li > 0) tokens.push({ type: 'whitespace', value: '\n' })
    const line = lines[li]

    // Leading whitespace
    const indent = line.match(/^(\s*)/)?.[1] || ''
    if (indent) tokens.push({ type: 'whitespace', value: indent })
    const rest = line.slice(indent.length)

    // List item marker
    if (rest.startsWith('- ')) {
      tokens.push({ type: 'text', value: '- ' })
      tokenizeYamlValue(rest.slice(2), tokens)
      continue
    }

    // Key: value line
    const colonIdx = rest.indexOf(': ')
    if (colonIdx >= 0) {
      tokens.push({ type: 'key', value: rest.slice(0, colonIdx) })
      tokens.push({ type: 'colon', value: ': ' })
      tokenizeYamlValue(rest.slice(colonIdx + 2), tokens)
      continue
    }

    // Bare key with trailing colon (object header)
    if (rest.endsWith(':')) {
      tokens.push({ type: 'key', value: rest.slice(0, -1) })
      tokens.push({ type: 'colon', value: ':' })
      continue
    }

    // Plain value line
    if (rest) tokenizeYamlValue(rest, tokens)
  }

  return tokens
}

function tokenizeYamlValue(val: string, tokens: Token[]): void {
  if (val === 'true' || val === 'false') {
    tokens.push({ type: 'boolean', value: val })
  } else if (val === 'null' || val === '~') {
    tokens.push({ type: 'null', value: val })
  } else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val)) {
    tokens.push({ type: 'number', value: val })
  } else if (val.startsWith('"') || val.startsWith("'")) {
    tokens.push({ type: 'string', value: val })
  } else {
    tokens.push({ type: 'string', value: val })
  }
}

// ─── JSON to YAML converter ─────────────────────────────

function jsonToYaml(value: unknown, indent: number = 0): string {
  const prefix = '  '.repeat(indent)

  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    // Needs quoting if it contains special chars or looks like a number/bool/null
    if (value === '' || value === 'true' || value === 'false' || value === 'null' || value === '~' ||
        /^[\d.eE+-]/.test(value) || /[:#\[\]{}&*!|>',@`]/.test(value) || value.includes('\n')) {
      return JSON.stringify(value)
    }
    return value
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const lines: string[] = []
    for (const item of value) {
      const rendered = jsonToYaml(item, indent + 1)
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        // Object items: first key on same line as dash
        const objLines = rendered.split('\n')
        lines.push(`${prefix}- ${objLines[0].trimStart()}`)
        for (let i = 1; i < objLines.length; i++) {
          lines.push(`${prefix}  ${objLines[i].trimStart()}`)
        }
      } else {
        lines.push(`${prefix}- ${rendered}`)
      }
    }
    return lines.join('\n')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const lines: string[] = []
    for (const [k, v] of entries) {
      if (typeof v === 'object' && v !== null) {
        lines.push(`${prefix}${k}:`)
        lines.push(jsonToYaml(v, indent + 1))
      } else {
        lines.push(`${prefix}${k}: ${jsonToYaml(v, indent + 1)}`)
      }
    }
    return lines.join('\n')
  }

  return String(value)
}

// ─── Formatting helpers ─────────────────────────────────

function tryFormatJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

function tryFormatYaml(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return jsonToYaml(parsed)
  } catch {
    return raw
  }
}

// ─── Component ──────────────────────────────────────────

export function JsonHighlight({ json, format = 'json', className }: Props) {
  const isYaml = format === 'yaml'
  const formatted = isYaml ? tryFormatYaml(json) : tryFormatJson(json)
  const tokens = isYaml ? tokenizeYaml(formatted) : tokenize(formatted)

  return (
    <pre className={className} style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <code>
        {tokens.map((token, i) => (
          <span key={i} style={{ color: TOKEN_COLORS[token.type] }}>
            {token.value}
          </span>
        ))}
      </code>
    </pre>
  )
}
