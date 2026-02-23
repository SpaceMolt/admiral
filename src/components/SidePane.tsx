'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, BookOpen, ListTodo, ChevronDown, ChevronRight, Activity, X } from 'lucide-react'
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
  onRefreshStatus?: () => void
}

export function SidePane({ profileId, todo: initialTodo, connected, playerData, onRefreshStatus }: Props) {
  const [logEntries, setLogEntries] = useState<CaptainsLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const [todo, setTodo] = useState(initialTodo)
  const [statusOpen, setStatusOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(true)
  const [todoOpen, setTodoOpen] = useState(true)

  // Resizable section heights as fractions of container (0-1)
  const [statusFrac, setStatusFrac] = useState(0.15)
  const [logFrac, setLogFrac] = useState(0.35)
  // todoFrac is implicitly 1 - statusFrac - logFrac
  const containerRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef<string | null>(null)
  const HANDLE_HEIGHT = 4
  const HEADER_HEIGHT = 32

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

  const clearTodo = useCallback(async () => {
    try {
      await fetch(`/api/profiles/${profileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todo: '' }),
      })
      setTodo('')
    } catch { /* ignore */ }
  }, [profileId])

  const clearStatus = useCallback(async () => {
    if (!connected) return
    try {
      await fetch(`/api/profiles/${profileId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'set_status', args: { status_message: '' } }),
      })
      onRefreshStatus?.()
    } catch { /* ignore */ }
  }, [profileId, connected, onRefreshStatus])

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

  // Vertical resize handler -- adjusts both adjacent sections simultaneously
  const handleResizeStart = useCallback((section: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = section
    const startY = e.clientY
    const container = containerRef.current
    if (!container) return
    const containerH = container.getBoundingClientRect().height
    if (containerH <= 0) return

    const startStatusFrac = statusFrac
    const startLogFrac = logFrac

    function onMouseMove(e: MouseEvent) {
      const deltaFrac = (e.clientY - startY) / containerH
      const MIN_FRAC = HEADER_HEIGHT / containerH // minimum = just the header

      if (section === 'status-log') {
        // Redistribute between status and log
        const total = startStatusFrac + startLogFrac
        let newStatus = Math.max(MIN_FRAC, Math.min(total - MIN_FRAC, startStatusFrac + deltaFrac))
        let newLog = total - newStatus
        if (newLog < MIN_FRAC) { newLog = MIN_FRAC; newStatus = total - MIN_FRAC }
        setStatusFrac(newStatus)
        setLogFrac(newLog)
      } else if (section === 'log-todo') {
        // Redistribute between log and todo
        const todoFrac = 1 - startStatusFrac - startLogFrac
        const total = startLogFrac + todoFrac
        let newLog = Math.max(MIN_FRAC, Math.min(total - MIN_FRAC, startLogFrac + deltaFrac))
        setLogFrac(newLog)
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
  }, [statusFrac, logFrac])

  const todoFrac = Math.max(0.05, 1 - statusFrac - logFrac)

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-card/50 overflow-hidden">
      {/* Status */}
      <div className="flex flex-col overflow-hidden" style={{ flex: statusOpen ? `0 0 ${statusFrac * 100}%` : `0 0 ${HEADER_HEIGHT}px` }}>
        <div className="flex items-center gap-2 w-full px-3 py-2 hover:bg-secondary/20 transition-colors shrink-0">
          <div role="button" tabIndex={0} onClick={() => setStatusOpen(!statusOpen)} onKeyDown={e => e.key === 'Enter' && setStatusOpen(!statusOpen)} className="flex items-center gap-2 flex-1 cursor-pointer">
            {statusOpen ? <ChevronDown size={10} className="text-muted-foreground shrink-0" /> : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
            <Activity size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] uppercase tracking-[1.5px] font-medium text-foreground/80">Status</span>
          </div>
          <span className="text-[9px] leading-none text-[hsl(var(--smui-frost-2))] uppercase tracking-wider">Server</span>
          {statusMessage && (
            <button
              onClick={clearStatus}
              disabled={!connected}
              className="text-muted-foreground/40 hover:text-destructive disabled:opacity-30 transition-colors shrink-0"
              title="Clear status message"
            >
              <X size={10} />
            </button>
          )}
          <button
            onClick={onRefreshStatus}
            disabled={!connected}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors ml-1 shrink-0"
          >
            <RefreshCw size={10} />
          </button>
        </div>
        {statusOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
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
      <div className="flex flex-col overflow-hidden" style={{ flex: logOpen ? `0 0 ${logFrac * 100}%` : `0 0 ${HEADER_HEIGHT}px` }}>
        <div className="flex items-center gap-2 w-full px-3 py-2 hover:bg-secondary/20 transition-colors shrink-0">
          <div role="button" tabIndex={0} onClick={() => setLogOpen(!logOpen)} onKeyDown={e => e.key === 'Enter' && setLogOpen(!logOpen)} className="flex items-center gap-2 flex-1 cursor-pointer">
            {logOpen ? <ChevronDown size={10} className="text-muted-foreground shrink-0" /> : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
            <BookOpen size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] uppercase tracking-[1.5px] font-medium text-foreground/80">Log</span>
          </div>
          <span className="text-[9px] leading-none text-[hsl(var(--smui-frost-2))] uppercase tracking-wider">Server</span>
          <button
            onClick={fetchCaptainsLog}
            disabled={!connected || logLoading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors ml-1 shrink-0"
          >
            <RefreshCw size={10} className={logLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {logOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto">
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
      <div className="flex flex-col overflow-hidden" style={{ flex: todoOpen ? `0 0 ${todoFrac * 100}%` : `0 0 ${HEADER_HEIGHT}px` }}>
        <div className="flex items-center gap-2 w-full px-3 py-2 hover:bg-secondary/20 transition-colors shrink-0">
          <div role="button" tabIndex={0} onClick={() => setTodoOpen(!todoOpen)} onKeyDown={e => e.key === 'Enter' && setTodoOpen(!todoOpen)} className="flex items-center gap-2 flex-1 cursor-pointer">
            {todoOpen ? <ChevronDown size={10} className="text-muted-foreground shrink-0" /> : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
            <ListTodo size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] uppercase tracking-[1.5px] font-medium text-foreground/80">TODO</span>
          </div>
          <span className="text-[9px] leading-none text-[hsl(var(--smui-orange))] uppercase tracking-wider">Local</span>
          {todo && (
            <button
              onClick={clearTodo}
              className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
              title="Clear TODO list"
            >
              <X size={10} />
            </button>
          )}
          <button
            onClick={refreshTodo}
            className="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
          >
            <RefreshCw size={10} />
          </button>
        </div>
        {todoOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto">
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
