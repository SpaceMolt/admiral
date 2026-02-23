'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, Loader2, Minus, X } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQueryState, parseAsInteger } from 'nuqs'
import type { LogEntry, LogType } from '@/types'
import { JsonHighlight } from './JsonHighlight'
import { MarkdownRenderer } from './MarkdownRenderer'

const FILTER_GROUPS: { key: string; label: string; types: LogType[] }[] = [
  { key: 'llm', label: 'LLM', types: ['llm_call', 'llm_thought'] },
  { key: 'tools', label: 'Tools', types: ['tool_call', 'tool_result'] },
  { key: 'server', label: 'Server', types: ['server_message', 'notification'] },
  { key: 'errors', label: 'Errors', types: ['error'] },
  { key: 'system', label: 'System', types: ['connection', 'system'] },
]

const ALL_FILTER_KEYS = FILTER_GROUPS.map(g => g.key)

const BADGE_CLASS: Record<string, string> = {
  connection: 'log-badge-connection',
  error: 'log-badge-error',
  llm_call: 'log-badge-llm_call',
  llm_thought: 'log-badge-llm_thought',
  tool_call: 'log-badge-tool_call',
  tool_result: 'log-badge-tool_result',
  server_message: 'log-badge-server_message',
  notification: 'log-badge-notification',
  system: 'log-badge-system',
}

const TYPE_LABELS: Record<string, string> = {
  connection: 'CONNECT',
  error: 'ERROR',
  llm_call: 'CALL',
  llm_thought: 'LLM',
  tool_call: 'TOOL',
  tool_result: 'RESULT',
  server_message: 'SERVER',
  notification: 'NOTIFY',
  system: 'SYSTEM',
}

interface Props {
  profileId: string
  connected?: boolean
}

export function LogPane({ profileId, connected }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [enabledFilters, setEnabledFilters] = useState<Set<string>>(() => new Set(ALL_FILTER_KEYS))
  const [selectedLogId, setSelectedLogId] = useQueryState('log', parseAsInteger)
  const [autoScroll, setAutoScroll] = useState(true)
  const [activity, setActivity] = useState('idle')
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const [sseKey, setSseKey] = useState(0)

  useEffect(() => {
    setSseKey(k => k + 1)
  }, [connected])

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/api/profiles/${profileId}/logs?stream=true`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry
        setEntries(prev => {
          if (prev.some(e => e.id === entry.id)) return prev
          const next = [...prev, entry].sort((a, b) => a.id - b.id)
          if (next.length > 500) return next.slice(-400)
          return next
        })
      } catch {
        // Ignore heartbeats and malformed data
      }
    }

    es.addEventListener('activity', (event) => {
      try {
        const data = JSON.parse(event.data)
        setActivity(data.activity || 'idle')
      } catch {
        // ignore
      }
    })

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [profileId, sseKey])

  // Reset activity when disconnected
  useEffect(() => {
    if (!connected) setActivity('idle')
  }, [connected])

  // Build set of allowed types from enabled filter groups
  const allowedTypes = useMemo(() => {
    const types = new Set<LogType>()
    for (const g of FILTER_GROUPS) {
      if (enabledFilters.has(g.key)) {
        for (const t of g.types) types.add(t)
      }
    }
    return types
  }, [enabledFilters])

  const filtered = useMemo(() =>
    enabledFilters.size === ALL_FILTER_KEYS.length
      ? entries
      : entries.filter(e => allowedTypes.has(e.type)),
    [entries, enabledFilters, allowedTypes]
  )

  // Compute counts per filter group
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const g of FILTER_GROUPS) {
      map[g.key] = entries.filter(e => g.types.includes(e.type)).length
    }
    return map
  }, [entries])

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 20,
    getItemKey: (index) => filtered[index]?.id ?? index,
  })

  // Auto-scroll when new entries arrive
  useEffect(() => {
    if (autoScroll && filtered.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
      })
    }
  }, [filtered.length, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 40
    setAutoScroll(isNearBottom)
  }, [])

  function toggleFilter(key: string) {
    setEnabledFilters(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setEnabledFilters(prev =>
      prev.size === ALL_FILTER_KEYS.length ? new Set() : new Set(ALL_FILTER_KEYS)
    )
  }

  async function handleClear() {
    if (!window.confirm('Clear all log history for this profile?')) return
    setEntries([])
    try {
      await fetch(`/api/profiles/${profileId}/logs`, { method: 'DELETE' })
    } catch {
      // ignore
    }
  }

  const selectedEntry = selectedLogId != null ? entries.find(e => e.id === selectedLogId) ?? null : null

  const allChecked = enabledFilters.size === ALL_FILTER_KEYS.length
  const noneChecked = enabledFilters.size === 0
  const allIndeterminate = !allChecked && !noneChecked

  return (
    <div className="flex flex-col h-full relative">
      {/* Filter checkboxes */}
      <div className="flex items-center gap-0.5 bg-card border-b border-border px-2 py-1.5">
        <FilterCheckbox
          label="All"
          checked={allChecked}
          indeterminate={allIndeterminate}
          onChange={toggleAll}
        />
        <div className="w-px h-4 bg-border mx-1" />
        {FILTER_GROUPS.map(g => (
          <FilterCheckbox
            key={g.key}
            label={g.label}
            count={counts[g.key] || 0}
            checked={enabledFilters.has(g.key)}
            onChange={() => toggleFilter(g.key)}
          />
        ))}
        <div className="flex-1" />
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground/50 hover:text-destructive transition-colors"
            title="Clear log history"
          >
            <X size={12} />
            <span className="uppercase tracking-wider text-[10px]">Clear</span>
          </button>
        )}
      </div>

      {/* Virtualized log entries */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto text-xs">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            No log entries yet. Connect a profile to see activity.
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualRow => (
              <LogRow
                key={filtered[virtualRow.index].id}
                entry={filtered[virtualRow.index]}
                virtualRow={virtualRow}
                measureElement={virtualizer.measureElement}
                onSelect={(entry) => setSelectedLogId(entry.id)}
              />
            ))}
          </div>
        )}
        {/* Activity status — last line inside the scroll area */}
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          {connected && activity !== 'idle' ? (
            <>
              <Loader2 size={10} className="animate-spin text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate">{activity}</span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">idle</span>
          )}
        </div>
      </div>

      {/* Floating scroll-to-bottom button */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            virtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
          }}
          className="absolute bottom-4 right-4 w-8 h-8 flex items-center justify-center bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all shadow-lg"
          title="Scroll to bottom"
        >
          <ArrowDown size={14} />
        </button>
      )}

      {/* Detail overlay modal */}
      {selectedEntry && (
        <LogDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedLogId(null)}
        />
      )}
    </div>
  )
}

function LogRow({ entry, virtualRow, measureElement, onSelect }: {
  entry: LogEntry
  virtualRow: { index: number; start: number }
  measureElement: (el: HTMLElement | null) => void
  onSelect: (entry: LogEntry) => void
}) {
  return (
    <div
      data-index={virtualRow.index}
      ref={measureElement}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      <div className="border-b border-border/30 hover:bg-secondary/20">
        <div
          className="flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer"
          onClick={() => onSelect(entry)}
        >
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {formatDateTime(entry.timestamp)}
          </span>
          <span className={`log-badge ${BADGE_CLASS[entry.type] || 'log-badge-system'} shrink-0`}>
            {TYPE_LABELS[entry.type] || entry.type}
          </span>
          <span className="text-foreground/80 truncate">
            {entry.summary}
          </span>
        </div>
      </div>
    </div>
  )
}

function LogDetailModal({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Check scroll position on mount and after content renders
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    function check() {
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight } = el
      setShowScrollTop(scrollTop > 40)
      setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 40)
    }
    // Check after render
    requestAnimationFrame(check)
    // Also observe resize in case content changes layout
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [entry])

  function handleContentScroll() {
    const el = contentRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    setShowScrollTop(scrollTop > 40)
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 40)
  }

  const content = entry.detail && entry.detail !== entry.summary
    ? entry.detail
    : entry.summary

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content)
      } else {
        // Fallback for non-HTTPS contexts
        const textarea = document.createElement('textarea')
        textarea.value = content
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-card border border-border w-full max-w-[720px] max-h-[80vh] flex flex-col z-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between py-2.5 px-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <span className={`log-badge ${BADGE_CLASS[entry.type] || 'log-badge-system'}`}>
              {TYPE_LABELS[entry.type] || entry.type}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatDateTime(entry.timestamp)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Copy"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[hsl(var(--smui-green))]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} onScroll={handleContentScroll} className="flex-1 overflow-auto relative">
          {looksLikeJson(content) ? (
            <JsonHighlight json={content} className="px-3.5 py-2.5 text-[11px] leading-relaxed" />
          ) : entry.type === 'llm_thought' ? (
            <div className="px-3.5 py-2.5">
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <pre className="px-3.5 py-2.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
              {content}
            </pre>
          )}
        </div>

        {/* Scroll buttons */}
        {showScrollTop && (
          <button
            onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="absolute bottom-12 right-3 w-7 h-7 flex items-center justify-center bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all shadow-lg"
            title="Scroll to top"
          >
            <ArrowUp size={13} />
          </button>
        )}
        {showScrollBottom && (
          <button
            onClick={() => contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' })}
            className="absolute bottom-3 right-3 w-7 h-7 flex items-center justify-center bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all shadow-lg"
            title="Scroll to bottom"
          >
            <ArrowDown size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

function FilterCheckbox({ label, count, checked, indeterminate, onChange }: {
  label: string
  count?: number
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors leading-none"
    >
      <span className={`w-3 h-3 border flex items-center justify-center shrink-0 ${
        checked || indeterminate
          ? 'bg-primary/20 border-primary/60'
          : 'border-border'
      }`}>
        {checked && <Check size={9} className="text-primary" />}
        {indeterminate && <Minus size={9} className="text-primary" />}
      </span>
      <span className="uppercase tracking-wider font-medium">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[9px] tabular-nums text-muted-foreground/50">{count}</span>
      )}
    </button>
  )
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

/** Normalize a timestamp into a proper ISO 8601 string so Date parsing is
 *  consistent across browsers. SQLite's datetime('now') returns UTC as
 *  "YYYY-MM-DD HH:MM:SS" (space, no T, no Z) which some engines misparse. */
function toISO(timestamp: string): string {
  let s = timestamp.replace(' ', 'T')
  if (!s.includes('Z') && !s.includes('+') && !s.includes('-', 10)) s += 'Z'
  return s
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(toISO(timestamp))
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return timestamp.slice(11, 19)
  }
}

function formatDateTime(timestamp: string): string {
  try {
    const d = new Date(toISO(timestamp))
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${y}-${mo}-${da} ${h}:${mi}:${s}`
  } catch {
    return timestamp.slice(0, 19)
  }
}
