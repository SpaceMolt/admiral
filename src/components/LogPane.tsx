'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LogEntry, LogType } from '@/types'
import { JsonHighlight, type DisplayFormat } from './JsonHighlight'
import { MarkdownRenderer } from './MarkdownRenderer'

const FILTERS: { label: string; types: LogType[] | null }[] = [
  { label: 'All', types: null },
  { label: 'LLM', types: ['llm_thought'] },
  { label: 'Tools', types: ['tool_call', 'tool_result'] },
  { label: 'Server', types: ['server_message', 'notification'] },
  { label: 'Errors', types: ['error'] },
]

const BADGE_CLASS: Record<string, string> = {
  connection: 'log-badge-connection',
  error: 'log-badge-error',
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
  llm_thought: 'LLM',
  tool_call: 'TOOL',
  tool_result: 'RESULT',
  server_message: 'SERVER',
  notification: 'NOTIFY',
  system: 'SYSTEM',
}

const SUMMARY_EXPAND_THRESHOLD = 80

interface Props {
  profileId: string
  connected?: boolean
  displayFormat?: DisplayFormat
}

export function LogPane({ profileId, connected, displayFormat = 'yaml' }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogType[] | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [summaryExpanded, setSummaryExpanded] = useState<Set<number>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  // Track connection changes to re-establish SSE and pick up missed entries
  const [sseKey, setSseKey] = useState(0)

  useEffect(() => {
    // When connection status changes, bump SSE key to re-establish the stream
    setSseKey(k => k + 1)
  }, [connected])

  useEffect(() => {
    // Close previous SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/api/profiles/${profileId}/logs?stream=true`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry
        setEntries(prev => {
          // Deduplicate by id
          if (prev.some(e => e.id === entry.id)) return prev
          // Insert in order
          const next = [...prev, entry].sort((a, b) => a.id - b.id)
          // Keep max 500 entries in memory
          if (next.length > 500) return next.slice(-400)
          return next
        })
      } catch {
        // Ignore heartbeats and malformed data
      }
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [profileId, sseKey])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 40
    setAutoScroll(isNearBottom)
  }, [])

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSummaryExpand(id: number) {
    setSummaryExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = filter ? entries.filter(e => filter.includes(e.type)) : entries

  // Compute counts per filter
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const f of FILTERS) {
      if (f.types === null) {
        map[f.label] = entries.length
      } else {
        map[f.label] = entries.filter(e => f.types!.includes(e.type)).length
      }
    }
    return map
  }, [entries])

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs - SMUI line variant */}
      <div className="flex items-center bg-card border-b border-border">
        <div className="flex items-center ml-1">
          {FILTERS.map(f => {
            const isActive = (filter === null && f.types === null) || (filter && f.types && filter[0] === f.types[0])
            const count = counts[f.label] || 0
            return (
              <button
                key={f.label}
                onClick={() => setFilter(f.types)}
                className={`relative px-3 py-2 text-xs font-medium uppercase tracking-wider transition-all ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] tabular-nums ${isActive ? 'text-primary/60' : 'text-muted-foreground/50'}`}>
                    {count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-primary" />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true)
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }}
            className="px-2.5 py-1 text-[11px] text-[hsl(var(--smui-yellow))] bg-[hsl(var(--smui-yellow)/0.1)] tracking-[1.5px] uppercase mr-2"
          >
            <ChevronDown size={10} className="inline mr-1" />
            Follow
          </button>
        )}
      </div>

      {/* Log entries */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto text-xs">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            No log entries yet. Connect a profile to see activity.
          </div>
        )}
        {filtered.map(entry => {
          const isExpanded = expanded.has(entry.id)
          const isSummaryExpanded = summaryExpanded.has(entry.id)
          const hasDetail = entry.detail && entry.detail !== entry.summary
          const hasLongSummary = entry.summary.length > SUMMARY_EXPAND_THRESHOLD
          const isClickable = hasDetail || hasLongSummary

          return (
            <div key={entry.id} className="border-b border-border/30 hover:bg-secondary/20">
              <div
                className={`flex items-start gap-2.5 px-3.5 py-2 ${isClickable ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (hasDetail) {
                    toggleExpand(entry.id)
                  } else if (hasLongSummary) {
                    toggleSummaryExpand(entry.id)
                  }
                }}
              >
                {isClickable ? (
                  (isExpanded || isSummaryExpanded)
                    ? <ChevronDown size={10} className="text-muted-foreground mt-0.5 shrink-0" />
                    : <ChevronRight size={10} className="text-muted-foreground mt-0.5 shrink-0" />
                ) : (
                  <span className="w-[10px] shrink-0" />
                )}
                <span className="text-muted-foreground shrink-0 w-14">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={`log-badge ${BADGE_CLASS[entry.type] || 'log-badge-system'} shrink-0`}>
                  {TYPE_LABELS[entry.type] || entry.type}
                </span>
                <span className={`text-foreground/80 ${isSummaryExpanded ? '' : 'truncate'}`}>
                  {entry.summary}
                </span>
              </div>
              {isExpanded && entry.detail && (
                <div className="ml-9 mr-3.5 mb-2 max-h-72 overflow-y-auto border border-border bg-smui-surface-0">
                  {looksLikeJson(entry.detail) ? (
                    <JsonHighlight json={entry.detail} format={displayFormat} className="px-3.5 py-2.5 text-[11px] leading-relaxed" />
                  ) : entry.type === 'llm_thought' ? (
                    <div className="px-3.5 py-2.5">
                      <MarkdownRenderer content={entry.detail} />
                    </div>
                  ) : (
                    <pre className="px-3.5 py-2.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {entry.detail}
                    </pre>
                  )}
                </div>
              )}
              {isSummaryExpanded && !hasDetail && (
                <div className="ml-9 mr-3.5 mb-2 border border-border bg-smui-surface-0">
                  {entry.type === 'llm_thought' ? (
                    <div className="px-3.5 py-2.5">
                      <MarkdownRenderer content={entry.summary} />
                    </div>
                  ) : (
                    <pre className="px-3.5 py-2.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {entry.summary}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp + (timestamp.includes('Z') || timestamp.includes('+') ? '' : 'Z'))
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return timestamp.slice(11, 19)
  }
}
