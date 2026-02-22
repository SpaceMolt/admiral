'use client'

import { useState, useRef, useCallback } from 'react'
import { Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface HistoryEntry {
  command: string
  args: string
}

const MAX_HISTORY = 50

function getHistory(profileId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(`admiral-cmd-history-${profileId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function pushHistory(profileId: string, entry: HistoryEntry) {
  const history = getHistory(profileId)
  // Avoid consecutive duplicates
  const last = history[history.length - 1]
  if (last && last.command === entry.command && last.args === entry.args) return
  history.push(entry)
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
  try {
    localStorage.setItem(`admiral-cmd-history-${profileId}`, JSON.stringify(history))
  } catch {
    // ignore quota errors
  }
}

interface Props {
  profileId: string
  onSend: (command: string, args?: Record<string, unknown>) => void
  disabled: boolean
}

export function CommandPanel({ profileId, onSend, disabled }: Props) {
  const [command, setCommand] = useState('')
  const [argsStr, setArgsStr] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const commandRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!command.trim()) return

    let args: Record<string, unknown> | undefined
    if (argsStr.trim()) {
      try {
        args = JSON.parse(argsStr.trim())
      } catch {
        // Try simple key=value parsing
        args = {}
        for (const part of argsStr.split(',')) {
          const [k, ...v] = part.split('=')
          if (k && v.length) {
            const val = v.join('=').trim()
            try { args[k.trim()] = JSON.parse(val) } catch { args[k.trim()] = val }
          }
        }
      }
    }

    pushHistory(profileId, { command: command.trim(), args: argsStr.trim() })
    onSend(command.trim(), args)
    // Don't clear fields -- keep them for easy re-send
    setHistoryIndex(-1)
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

    e.preventDefault()
    const history = getHistory(profileId)
    if (history.length === 0) return

    let newIndex: number
    if (e.key === 'ArrowUp') {
      if (historyIndex === -1) {
        newIndex = history.length - 1
      } else {
        newIndex = Math.max(0, historyIndex - 1)
      }
    } else {
      if (historyIndex === -1) return
      newIndex = historyIndex + 1
      if (newIndex >= history.length) {
        // Past the end -- restore to empty/current
        setHistoryIndex(-1)
        return
      }
    }

    setHistoryIndex(newIndex)
    const entry = history[newIndex]
    setCommand(entry.command)
    setArgsStr(entry.args)
  }, [profileId, historyIndex])

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-2 bg-card border-b border-border/30">
      <span className="font-jetbrains text-[10px] text-muted-foreground/40 uppercase tracking-wider shrink-0">Cmd</span>
      <Input
        ref={commandRef}
        value={command}
        onChange={e => { setCommand(e.target.value); setHistoryIndex(-1) }}
        onKeyDown={handleKeyDown}
        placeholder="get_status"
        disabled={disabled}
        className="flex-[2] min-w-0 h-7 text-xs"
      />
      <span className="font-jetbrains text-[10px] text-muted-foreground/40 uppercase tracking-wider shrink-0">Args</span>
      <Input
        value={argsStr}
        onChange={e => { setArgsStr(e.target.value); setHistoryIndex(-1) }}
        onKeyDown={handleKeyDown}
        placeholder='{"key": "value"}'
        disabled={disabled}
        className="flex-[3] min-w-0 h-7 text-xs"
      />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled || !command.trim()}
        className="gap-1.5 font-jetbrains text-muted-foreground hover:text-primary shrink-0"
      >
        <Send size={12} />
        Send
      </Button>
    </form>
  )
}
