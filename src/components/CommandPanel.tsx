'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Send, Zap, Search as SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { GameCommandInfo } from '@/lib/schema'

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

/**
 * Score a command name against a search pattern.
 * Returns score (lower = better match), or -1 if no match.
 */
function scoreCommand(pattern: string, name: string, description: string): number {
  const p = pattern.toLowerCase()
  const n = name.toLowerCase()
  const d = description.toLowerCase()

  // Exact match
  if (n === p) return -1000

  // Prefix match on name
  if (n.startsWith(p)) return -500 + p.length

  // Substring match on name (e.g. "mine" in "get_mine")
  const subIdx = n.indexOf(p)
  if (subIdx >= 0) return -300 + subIdx

  // Match after underscore segments (e.g. "status" matching "get_status")
  const segments = n.split('_')
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startsWith(p)) return -200 + i * 10
  }

  // Fuzzy match: all chars in order
  let pi = 0
  let score = 0
  let lastMatch = -1
  for (let si = 0; si < n.length && pi < p.length; si++) {
    if (n[si] === p[pi]) {
      if (lastMatch === si - 1) score -= 1
      if (si === 0 || n[si - 1] === '_') score -= 2
      lastMatch = si
      pi++
    }
    score += 1
  }
  if (pi === p.length) return score

  // Try description substring
  if (d.includes(p)) return 100

  return -1
}

interface Props {
  profileId: string
  onSend: (command: string, args?: Record<string, unknown>) => void
  disabled: boolean
  commandInputRef?: React.RefObject<HTMLInputElement | null>
  serverUrl?: string
}

export function CommandPanel({ profileId, onSend, disabled, commandInputRef, serverUrl }: Props) {
  const [command, setCommand] = useState('')
  const [argsStr, setArgsStr] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [commands, setCommands] = useState<GameCommandInfo[]>([])
  const internalRef = useRef<HTMLInputElement>(null)
  const commandRef = commandInputRef || internalRef
  const autocompleteRef = useRef<HTMLDivElement>(null)

  // Fetch commands from API
  useEffect(() => {
    const url = serverUrl || 'https://game.spacemolt.com'
    fetch(`/api/commands?server_url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) setCommands(data)
      })
      .catch(() => {})
  }, [serverUrl])

  // Fuzzy-filtered matches
  const matches = useMemo(() => {
    const q = command.trim()
    if (!q || commands.length === 0) return []

    const scored: { cmd: GameCommandInfo; score: number }[] = []
    for (const cmd of commands) {
      const s = scoreCommand(q, cmd.name, cmd.description)
      if (s >= -1000) scored.push({ cmd, score: s })
    }

    scored.sort((a, b) => a.score - b.score)
    return scored.slice(0, 12).map(s => s.cmd)
  }, [command, commands])

  // Selected command info (exact match)
  const selectedCommand = useMemo(() => {
    const q = command.trim().toLowerCase()
    return commands.find(c => c.name === q) ?? null
  }, [command, commands])

  // Close autocomplete on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  function selectCommand(cmd: GameCommandInfo) {
    setCommand(cmd.name)
    setShowAutocomplete(false)

    // Auto-fill args template with required params
    const requiredParams = cmd.params.filter(p => p.required)
    if (requiredParams.length > 0 && !argsStr.trim()) {
      const template: Record<string, string> = {}
      for (const p of requiredParams) {
        template[p.name] = ''
      }
      setArgsStr(JSON.stringify(template))
    }
  }

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
    setHistoryIndex(-1)
    setShowAutocomplete(false)
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Autocomplete navigation
    if (showAutocomplete && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, matches.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && matches.length > 0 && command.trim() !== matches[selectedIndex]?.name)) {
        e.preventDefault()
        selectCommand(matches[selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowAutocomplete(false)
        return
      }
    }

    // History navigation (only when autocomplete is closed)
    if (!showAutocomplete && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const history = getHistory(profileId)
      if (history.length === 0) return

      let newIndex: number
      if (e.key === 'ArrowUp') {
        newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
      } else {
        if (historyIndex === -1) return
        newIndex = historyIndex + 1
        if (newIndex >= history.length) {
          setHistoryIndex(-1)
          return
        }
      }

      setHistoryIndex(newIndex)
      const entry = history[newIndex]
      setCommand(entry.command)
      setArgsStr(entry.args)
    }
  }, [showAutocomplete, matches, selectedIndex, profileId, historyIndex, command])

  function handleCommandChange(value: string) {
    setCommand(value)
    setHistoryIndex(-1)
    setSelectedIndex(0)
    setShowAutocomplete(value.trim().length > 0)
  }

  // Format param info for display
  function formatParamHint(cmd: GameCommandInfo): string {
    if (cmd.params.length === 0) return 'no params'
    return cmd.params
      .map(p => p.required ? p.name : `${p.name}?`)
      .join(', ')
  }

  return (
    <div className="relative" data-tour="command-panel">
      <form onSubmit={handleSubmit} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-card border-t border-border">
        <span className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] shrink-0">Cmd</span>
        <div className="relative flex-[2] min-w-0">
          <Input
            ref={commandRef}
            value={command}
            onChange={e => handleCommandChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (command.trim()) setShowAutocomplete(true) }}
            placeholder="get_status"
            className="h-7 text-xs"
          />
        </div>
        <span className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] shrink-0">Args</span>
        <Input
          value={argsStr}
          onChange={e => { setArgsStr(e.target.value); setHistoryIndex(-1) }}
          onKeyDown={handleKeyDown}
          placeholder={selectedCommand ? formatParamHint(selectedCommand) : '{"key": "value"}'}
          className="flex-[3] min-w-0 h-7 text-xs"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={disabled || !command.trim()}
          className="gap-1.5 px-3 text-muted-foreground hover:text-primary shrink-0"
        >
          <Send size={12} />
          Send
        </Button>
      </form>

      {/* Autocomplete dropdown */}
      {showAutocomplete && matches.length > 0 && (
        <div
          ref={autocompleteRef}
          className="absolute bottom-full left-0 right-0 mb-0 bg-card border border-border shadow-lg max-h-[280px] overflow-y-auto z-50"
        >
          {matches.map((cmd, i) => (
            <button
              key={cmd.name}
              onClick={() => selectCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full text-left px-3.5 py-1.5 flex items-start gap-2.5 transition-colors ${
                i === selectedIndex ? 'bg-primary/10' : 'hover:bg-secondary/30'
              }`}
            >
              <span className="text-xs font-medium text-foreground shrink-0 w-36 truncate font-jetbrains">
                {cmd.name}
              </span>
              {cmd.isMutation && (
                <Zap size={10} className="text-[hsl(var(--smui-orange))] shrink-0 mt-0.5" />
              )}
              {!cmd.isMutation && (
                <SearchIcon size={10} className="text-[hsl(var(--smui-frost-2))] shrink-0 mt-0.5" />
              )}
              <span className="text-[11px] text-muted-foreground truncate flex-1">
                {cmd.description}
              </span>
              {cmd.params.length > 0 && (
                <span className="text-[10px] text-muted-foreground/50 shrink-0 font-jetbrains">
                  {cmd.params.filter(p => p.required).map(p => p.name).join(', ') || 'optional'}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Param help bar when a command is selected */}
      {selectedCommand && selectedCommand.params.length > 0 && !showAutocomplete && (
        <div className="absolute bottom-full left-0 right-0 mb-0 bg-card/95 border border-border/50 px-3.5 py-1.5 flex items-center gap-3 text-[10px]">
          <span className="text-muted-foreground/50 uppercase tracking-[1.5px] shrink-0">Params</span>
          {selectedCommand.params.map(p => (
            <span key={p.name} className={`font-jetbrains ${p.required ? 'text-foreground/70' : 'text-muted-foreground/50'}`}>
              {p.name}{p.required ? '' : '?'}
              <span className="text-muted-foreground/30 ml-0.5">:{p.type}</span>
            </span>
          ))}
          {selectedCommand.isMutation && (
            <span className="text-[hsl(var(--smui-orange))] uppercase tracking-wider ml-auto shrink-0">1 tick</span>
          )}
        </div>
      )}
    </div>
  )
}
