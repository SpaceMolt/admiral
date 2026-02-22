'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, BookOpen, ListTodo, ChevronDown, ChevronRight, Activity } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'

interface CaptainsLogEntry {
  index: number
  entry: string
  created_at: string
}

interface Props {
  profileId: string
  todo: string
  connected: boolean
  playerData: Record<string, unknown> | null
}

export function SidePane({ profileId, todo: initialTodo, connected, playerData }: Props) {
  const [logEntries, setLogEntries] = useState<CaptainsLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const [todo, setTodo] = useState(initialTodo)
  const [statusOpen, setStatusOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(true)
  const [todoOpen, setTodoOpen] = useState(true)

  // Resizable section heights (pixels, null = auto)
  const [statusHeight, setStatusHeight] = useState<number | null>(null)
  const [logHeight, setLogHeight] = useState<number | null>(null)
  const resizingRef = useRef<string | null>(null)

  useEffect(() => { setTodo(initialTodo) }, [initialTodo])

  const fetchCaptainsLog = useCallback(async () => {
    if (!connected) return
    setLogLoading(true)
    try {
      const resp = await fetch(`/api/profiles/${profileId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'captains_log_list' }),
      })
      const data = await resp.json()
      const result = data.result || data

      if (!result.total_count || result.total_count === 0) {
        setLogEntries([])
        return
      }

      const entries: CaptainsLogEntry[] = []
      if (result.entry) entries.push(result.entry)

      // Fetch remaining entries in parallel
      const promises = []
      for (let i = 1; i < result.total_count; i++) {
        promises.push(
          fetch(`/api/profiles/${profileId}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'captains_log_list', args: { index: i } }),
          }).then(r => r.json()).catch(() => null)
        )
      }
      const results = await Promise.all(promises)
      for (const r of results) {
        const entry = r?.result?.entry || r?.entry
        if (entry) entries.push(entry)
      }

      setLogEntries(entries)
    } catch {
      // ignore
    } finally {
      setLogLoading(false)
    }
  }, [profileId, connected])

  const refreshTodo = useCallback(async () => {
    try {
      const resp = await fetch(`/api/profiles/${profileId}`)
      const data = await resp.json()
      if (data.todo !== undefined) setTodo(data.todo)
    } catch {
      // ignore
    }
  }, [profileId])

  // Fetch log when connected
  useEffect(() => {
    if (connected) fetchCaptainsLog()
  }, [connected, fetchCaptainsLog])

  // Poll todo every 10s
  useEffect(() => {
    refreshTodo()
    const interval = setInterval(refreshTodo, 10000)
    return () => clearInterval(interval)
  }, [refreshTodo])

  const statusMessage = playerData
    ? (playerData.player as Record<string, unknown> | undefined)?.status_message as string | undefined
    : undefined

  // Vertical resize handler
  const handleResizeStart = useCallback((section: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = section
    const startY = e.clientY

    // Get current heights from the DOM
    const statusSection = document.getElementById('sidepane-status')
    const logSection = document.getElementById('sidepane-log')

    const startStatusH = statusSection?.getBoundingClientRect().height ?? 80
    const startLogH = logSection?.getBoundingClientRect().height ?? 200

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientY - startY
      if (section === 'status-log') {
        const newH = Math.max(40, startStatusH + delta)
        setStatusHeight(newH)
      } else if (section === 'log-todo') {
        const newH = Math.max(40, startLogH + delta)
        setLogHeight(newH)
      }
    }

    function onMouseUp() {
      resizingRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div className="flex flex-col h-full bg-card/50 overflow-hidden">
      {/* Status */}
      <div id="sidepane-status" className="border-b border-border" style={statusHeight != null && statusOpen ? { height: statusHeight, minHeight: 40 } : undefined}>
        <div className="flex items-center gap-2 w-full px-3 py-2 hover:bg-secondary/20 transition-colors">
          <div role="button" tabIndex={0} onClick={() => setStatusOpen(!statusOpen)} onKeyDown={e => e.key === 'Enter' && setStatusOpen(!statusOpen)} className="flex items-center gap-2 flex-1 cursor-pointer">
            {statusOpen ? <ChevronDown size={10} className="text-muted-foreground shrink-0" /> : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
            <Activity size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] uppercase tracking-[1.5px] font-medium text-foreground/80">Status</span>
          </div>
        </div>
        {statusOpen && (
          <div className="px-3 py-2 overflow-y-auto" style={statusHeight != null ? { height: statusHeight - 32 } : undefined}>
            {statusMessage ? (
              <span className="text-xs text-foreground/70">{statusMessage}</span>
            ) : (
              <span className="text-[11px] text-muted-foreground/50 italic">No status set</span>
            )}
          </div>
        )}
      </div>

      {/* Resize handle: status <-> log */}
      <div
        onMouseDown={(e) => handleResizeStart('status-log', e)}
        className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-primary/40 transition-colors"
      />

      {/* Captain's Log */}
      <div id="sidepane-log" className="border-b border-border" style={logHeight != null && logOpen ? { height: logHeight, minHeight: 40 } : undefined}>
        <div className="flex items-center gap-2 w-full px-3 py-2 hover:bg-secondary/20 transition-colors">
          <div role="button" tabIndex={0} onClick={() => setLogOpen(!logOpen)} onKeyDown={e => e.key === 'Enter' && setLogOpen(!logOpen)} className="flex items-center gap-2 flex-1 cursor-pointer">
            {logOpen ? <ChevronDown size={10} className="text-muted-foreground shrink-0" /> : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
            <BookOpen size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] uppercase tracking-[1.5px] font-medium text-foreground/80">Log</span>
          </div>
          <span className="text-[9px] leading-none text-[hsl(var(--smui-cyan))] uppercase tracking-wider">Server</span>
          <button
            onClick={fetchCaptainsLog}
            disabled={!connected || logLoading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors ml-1 shrink-0"
          >
            <RefreshCw size={10} className={logLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {logOpen && (
          <div className="overflow-y-auto" style={logHeight != null ? { height: logHeight - 32 } : undefined}>
            {!connected ? (
              <div className="px-3 py-3 text-[11px] text-muted-foreground/50 italic">
                Connect to load captain&apos;s log
              </div>
            ) : logEntries.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-muted-foreground/50 italic">
                {logLoading ? 'Loading...' : 'No log entries'}
              </div>
            ) : (
              logEntries.map(entry => (
                <div key={entry.index} className="px-3 py-2 border-t border-border/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] text-muted-foreground/40">#{entry.index}</span>
                    <span className="text-[9px] text-muted-foreground/40">{entry.created_at}</span>
                  </div>
                  <MarkdownRenderer content={entry.entry} />
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Resize handle: log <-> todo */}
      <div
        onMouseDown={(e) => handleResizeStart('log-todo', e)}
        className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-primary/40 transition-colors"
      />

      {/* TODO */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 w-full px-3 py-2 hover:bg-secondary/20 transition-colors border-b border-border">
          <div role="button" tabIndex={0} onClick={() => setTodoOpen(!todoOpen)} onKeyDown={e => e.key === 'Enter' && setTodoOpen(!todoOpen)} className="flex items-center gap-2 flex-1 cursor-pointer">
            {todoOpen ? <ChevronDown size={10} className="text-muted-foreground shrink-0" /> : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
            <ListTodo size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] uppercase tracking-[1.5px] font-medium text-foreground/80">TODO</span>
          </div>
          <span className="text-[9px] leading-none text-[hsl(var(--smui-orange))] uppercase tracking-wider">Local</span>
          <button
            onClick={refreshTodo}
            className="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
          >
            <RefreshCw size={10} />
          </button>
        </div>
        {todoOpen && (
          <div className="flex-1 overflow-y-auto">
            {!todo ? (
              <div className="px-3 py-3 text-[11px] text-muted-foreground/50 italic">
                No TODO items
              </div>
            ) : (
              <div className="px-3 py-2">
                <MarkdownRenderer content={todo} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
