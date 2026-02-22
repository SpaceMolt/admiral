'use client'

/**
 * Zero-dependency JSON syntax highlighter matching the SpaceMolt sci-fi theme.
 * Tokenizes a JSON string and wraps each token in a colored span.
 */

interface Props {
  json: string
  className?: string
}

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'brace' | 'bracket' | 'colon' | 'comma' | 'whitespace' | 'text'

interface Token {
  type: TokenType
  value: string
}

const TOKEN_COLORS: Record<TokenType, string> = {
  key: 'var(--color-plasma-cyan)',
  string: 'var(--color-bio-green)',
  number: 'var(--color-shell-orange)',
  boolean: 'var(--color-void-purple)',
  null: 'var(--color-hull-grey)',
  brace: 'var(--color-chrome-silver)',
  bracket: 'var(--color-chrome-silver)',
  colon: 'var(--color-hull-grey)',
  comma: 'var(--color-hull-grey)',
  whitespace: 'transparent',
  text: 'var(--color-chrome-silver)',
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  // Track whether the next string token is a key (follows { or ,)
  let expectKey = false

  while (i < input.length) {
    const ch = input[i]

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      let ws = ''
      while (i < input.length && (input[i] === ' ' || input[i] === '\t' || input[i] === '\n' || input[i] === '\r')) {
        ws += input[i]
        i++
      }
      tokens.push({ type: 'whitespace', value: ws })
      continue
    }

    // Braces
    if (ch === '{' || ch === '}') {
      tokens.push({ type: 'brace', value: ch })
      expectKey = ch === '{'
      i++
      continue
    }

    // Brackets
    if (ch === '[' || ch === ']') {
      tokens.push({ type: 'bracket', value: ch })
      expectKey = false
      i++
      continue
    }

    // Colon
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':' })
      expectKey = false
      i++
      continue
    }

    // Comma
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' })
      // After comma inside object, next string is a key
      // We approximate this by checking the enclosing context
      expectKey = true
      i++
      continue
    }

    // String
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

      // Determine if this string is a key (followed by colon)
      let lookAhead = i
      while (lookAhead < input.length && (input[lookAhead] === ' ' || input[lookAhead] === '\t' || input[lookAhead] === '\n' || input[lookAhead] === '\r')) {
        lookAhead++
      }
      const isKey = lookAhead < input.length && input[lookAhead] === ':'

      tokens.push({ type: isKey ? 'key' : 'string', value: str })
      expectKey = false
      continue
    }

    // Number
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let num = ''
      while (i < input.length && /[0-9eE.+\-]/.test(input[i])) {
        num += input[i]
        i++
      }
      tokens.push({ type: 'number', value: num })
      expectKey = false
      continue
    }

    // Boolean / null
    if (input.slice(i, i + 4) === 'true') {
      tokens.push({ type: 'boolean', value: 'true' })
      i += 4
      expectKey = false
      continue
    }
    if (input.slice(i, i + 5) === 'false') {
      tokens.push({ type: 'boolean', value: 'false' })
      i += 5
      expectKey = false
      continue
    }
    if (input.slice(i, i + 4) === 'null') {
      tokens.push({ type: 'null', value: 'null' })
      i += 4
      expectKey = false
      continue
    }

    // Fallback: plain text
    tokens.push({ type: 'text', value: ch })
    i++
  }

  return tokens
}

function tryFormatJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    // If it's not valid JSON, return as-is
    return raw
  }
}

export function JsonHighlight({ json, className }: Props) {
  const formatted = tryFormatJson(json)
  const tokens = tokenize(formatted)

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
