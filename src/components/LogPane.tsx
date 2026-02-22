'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LogEntry, LogType } from '@/types'

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

interface Props {
  profileId: string
}

export function LogPane({ profileId }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogType[] | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    setEntries([])
    setExpanded(new Set())

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
          // Deduplicate
          if (prev.length > 0 && prev[prev.length - 1].id === entry.id) return prev
          // Keep max 500 entries in memory
          const next = [...prev, entry]
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
  }, [profileId])

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

  const filtered = filter ? entries.filter(e => filter.includes(e.type)) : entries

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-deep-void border-b border-hull-grey/30">
        {FILTERS.map(f => (
          <button
            key={f.label}
            onClick={() => setFilter(f.types)}
            className={`px-2.5 py-1 text-[10px] font-jetbrains uppercase tracking-wider rounded transition-colors ${
              (filter === null && f.types === null) || (filter && f.types && filter[0] === f.types[0])
                ? 'bg-nebula-blue text-plasma-cyan'
                : 'text-chrome-silver/60 hover:text-chrome-silver hover:bg-nebula-blue/30'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true)
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }}
            className="px-2 py-0.5 text-[10px] font-jetbrains text-warning-yellow bg-warning-yellow/10 rounded"
          >
            <ChevronDown size={10} className="inline mr-1" />
            Follow
          </button>
        )}
      </div>

      {/* Log entries */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto font-jetbrains text-xs">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-full text-hull-grey text-xs">
            No log entries yet. Connect a profile to see activity.
          </div>
        )}
        {filtered.map(entry => {
          const isExpanded = expanded.has(entry.id)
          const hasDetail = entry.detail && entry.detail !== entry.summary

          return (
            <div key={entry.id} className="border-b border-hull-grey/10 hover:bg-nebula-blue/10">
              <div
                className={`flex items-start gap-2 px-3 py-1.5 ${hasDetail ? 'cursor-pointer' : ''}`}
                onClick={() => hasDetail && toggleExpand(entry.id)}
              >
                {hasDetail ? (
                  isExpanded ? <ChevronDown size={10} className="text-hull-grey mt-0.5 shrink-0" /> : <ChevronRight size={10} className="text-hull-grey mt-0.5 shrink-0" />
                ) : (
                  <span className="w-[10px] shrink-0" />
                )}
                <span className="text-hull-grey shrink-0 w-14">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={`log-badge ${BADGE_CLASS[entry.type] || 'log-badge-system'} shrink-0`}>
                  {TYPE_LABELS[entry.type] || entry.type}
                </span>
                <span className="text-chrome-silver truncate">{entry.summary}</span>
              </div>
              {isExpanded && entry.detail && (
                <div className="px-3 py-2 ml-8 mr-3 mb-1 bg-space-black/50 rounded text-[11px] text-chrome-silver/80 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                  {entry.detail}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp + (timestamp.includes('Z') || timestamp.includes('+') ? '' : 'Z'))
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return timestamp.slice(11, 19)
  }
}
