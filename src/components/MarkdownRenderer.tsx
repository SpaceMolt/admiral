'use client'

/**
 * Lightweight markdown renderer for LLM output.
 * Handles: headings, bold, italic, inline code, fenced code blocks, lists, links, paragraphs.
 */

interface Props {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: Props) {
  const blocks = parseBlocks(content)

  return (
    <div className={`markdown-content space-y-2 text-xs leading-relaxed ${className || ''}`}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}

type BlockType =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string }
  | { type: 'hr' }

function parseBlocks(text: string): BlockType[] {
  const blocks: BlockType[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      i++
      continue
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip closing ```
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') })
      continue
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    // Ordered list
    if (/^[\s]*\d+[.)]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[\s]*\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+[.)]\s/, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    // Paragraph (collect consecutive non-blank lines)
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^#{1,6}\s/) && !lines[i].trim().startsWith('```') && !/^[\s]*[-*+]\s/.test(lines[i]) && !/^[\s]*\d+[.)]\s/.test(lines[i]) && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim())) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n') })
    }
  }

  return blocks
}

function Block({ block }: { block: BlockType }) {
  switch (block.type) {
    case 'hr':
      return <hr className="border-border" />
    case 'heading': {
      const sizes: Record<number, string> = {
        1: 'text-sm font-semibold text-foreground',
        2: 'text-xs font-semibold text-foreground',
        3: 'text-xs font-medium text-foreground',
        4: 'text-xs font-medium text-muted-foreground',
        5: 'text-[11px] font-medium text-muted-foreground',
        6: 'text-[11px] text-muted-foreground',
      }
      return <div className={sizes[block.level] || sizes[3]}><InlineText text={block.text} /></div>
    }
    case 'code':
      return (
        <pre className="bg-background border border-border px-3 py-2 text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words">
          <code>{block.text}</code>
        </pre>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag className={`${block.ordered ? 'list-decimal' : 'list-disc'} pl-4 space-y-0.5 text-foreground/80`}>
          {block.items.map((item, i) => (
            <li key={i}><InlineText text={item} /></li>
          ))}
        </Tag>
      )
    }
    case 'paragraph':
      return <p className="text-foreground/80"><InlineText text={block.text} /></p>
  }
}

function InlineText({ text }: { text: string }) {
  // Parse inline markdown: bold, italic, code, links
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Inline code
    let match = remaining.match(/^`([^`]+)`/)
    if (match) {
      parts.push(<code key={key++} className="bg-background border border-border px-1 py-px text-[hsl(var(--smui-orange))]">{match[1]}</code>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Bold
    match = remaining.match(/^\*\*(.+?)\*\*/)
    if (match) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{match[1]}</strong>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Italic
    match = remaining.match(/^\*(.+?)\*/)
    if (match) {
      parts.push(<em key={key++} className="italic text-foreground/90">{match[1]}</em>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Link
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (match) {
      parts.push(<a key={key++} href={match[2]} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">{match[1]}</a>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Plain text (up to next special char)
    const nextSpecial = remaining.search(/[`*\[]/)
    if (nextSpecial === -1) {
      parts.push(remaining)
      break
    } else if (nextSpecial === 0) {
      // Couldn't match a pattern - consume one char
      parts.push(remaining[0])
      remaining = remaining.slice(1)
    } else {
      parts.push(remaining.slice(0, nextSpecial))
      remaining = remaining.slice(nextSpecial)
    }
  }

  return <>{parts}</>
}
