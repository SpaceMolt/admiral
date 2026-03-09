import { useState, useRef, useCallback } from 'react'
import { Plus, Bot, User, GripVertical, Play, Square } from 'lucide-react'
import type { Profile } from '@/types'

interface Props {
  profiles: Profile[]
  activeId: string | null
  statuses: Record<string, { connected: boolean; running: boolean }>
  playerDataMap: Record<string, Record<string, unknown>>
  onSelect: (id: string) => void
  onNew: () => void
  onReorder: (orderedIds: string[]) => void
}

const MODE_LABELS: Record<string, string> = {
  http: 'HTTP',
  websocket: 'WS',
  mcp: 'MCP',
}

interface GroupedProfiles {
  name: string
  profiles: Profile[]
}

function groupProfiles(profiles: Profile[], playerDataMap: Record<string, Record<string, unknown>>): GroupedProfiles[] {
  const groups: Map<string, Profile[]> = new Map()
  for (const p of profiles) {
    // Use live faction name from game state, fall back to static group_name
    const pd = playerDataMap[p.id]
    const liveFaction = pd?.faction as string | undefined
    const g = liveFaction || p.group_name || ''
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(p)
  }
  // Named groups first (alphabetical), ungrouped last
  const result: GroupedProfiles[] = []
  const named = [...groups.entries()].filter(([k]) => k !== '').sort((a, b) => a[0].localeCompare(b[0]))
  const ungrouped = groups.get('')
  for (const [name, profs] of named) {
    result.push({ name, profiles: profs })
  }
  if (ungrouped?.length) {
    result.push({ name: '', profiles: ungrouped })
  }
  return result
}

async function batchAction(action: 'connect_llm' | 'disconnect', ids?: string[], group?: string) {
  try {
    await fetch('/api/profiles/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, group }),
    })
  } catch { /* ignore */ }
}

export function ProfileList({ profiles, activeId, statuses, playerDataMap, onSelect, onNew, onReorder }: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const dragCounter = useRef(0)
  const dragMoved = useRef(false)

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragId(id)
    dragMoved.current = false
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    // Execute reorder if we have a valid drop target
    if (dragId && dropTarget && dragMoved.current) {
      const currentOrder = profiles.map(p => p.id)
      const fromIdx = currentOrder.indexOf(dragId)
      if (fromIdx !== -1) {
        // Remove from current position
        currentOrder.splice(fromIdx, 1)
        // Find new position
        let toIdx = currentOrder.indexOf(dropTarget.id)
        if (dropTarget.position === 'after') toIdx += 1
        currentOrder.splice(toIdx, 0, dragId)
        onReorder(currentOrder)
      }
    }
    // If drag ended without moving to a different target, treat as a click
    if (dragId && !dragMoved.current) {
      onSelect(dragId)
    }
    setDragId(null)
    setDropTarget(null)
    dragCounter.current = 0
    dragMoved.current = false
  }, [dragId, dropTarget, profiles, onReorder, onSelect])

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id === dragId) return
    dragMoved.current = true
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position = e.clientY < midY ? 'before' : 'after'
    setDropTarget(prev => {
      if (prev?.id === id && prev?.position === position) return prev
      return { id, position }
    })
  }, [dragId])

  const handleDragLeave = useCallback(() => {
    // Don't clear immediately — child elements trigger leave/enter pairs
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Actual reorder happens in dragEnd
  }, [])

  const groups = groupProfiles(profiles, playerDataMap)

  return (
    <div className="w-56 flex flex-col flex-1 min-h-0">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
        <h2 className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] font-normal">Profiles</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => batchAction('connect_llm')}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60 hover:text-[hsl(var(--smui-green))] hover:bg-[hsl(var(--smui-green)/0.1)] transition-colors rounded"
            title="Connect and start all agents"
          >
            <Play size={9} fill="currentColor" />
            <span>All</span>
          </button>
          <button
            onClick={() => batchAction('disconnect')}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60 hover:text-[hsl(var(--smui-orange))] hover:bg-[hsl(var(--smui-orange)/0.1)] transition-colors rounded"
            title="Disconnect all agents"
          >
            <Square size={8} fill="currentColor" />
            <span>Stop</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.name || '__ungrouped'}>
            {/* Group header */}
            {group.name ? (
              <div className="px-3.5 py-1.5 bg-secondary/40 border-b border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] font-medium">
                  {group.name}
                </span>
              </div>
            ) : groups.length > 1 ? (
              <div className="px-3.5 py-1.5 bg-secondary/40 border-b border-border/50">
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-[1.5px] font-medium">
                  Independent
                </span>
              </div>
            ) : null}

            {group.profiles.map(p => {
              const status = statuses[p.id] || { connected: false, running: false }
              const isActive = p.id === activeId
              const isManual = !p.provider || p.provider === 'manual'
              const isDragging = p.id === dragId
              const isDropBefore = dropTarget?.id === p.id && dropTarget?.position === 'before'
              const isDropAfter = dropTarget?.id === p.id && dropTarget?.position === 'after'

              const pd = playerDataMap[p.id]
              const player = pd?.player as Record<string, unknown> | undefined
              // Faction: slim state has it at top level, raw state nests under player
              const factionRaw = pd?.faction ?? (player?.faction as Record<string, unknown> | string | undefined)
              const factionName = factionRaw && typeof factionRaw === 'object' ? (factionRaw as Record<string, unknown>).name : factionRaw
              const factionTag = pd?.faction_tag ?? (factionRaw && typeof factionRaw === 'object' ? (factionRaw as Record<string, unknown>).tag : undefined)

              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="relative"
                >
                  {/* Drop indicator - before */}
                  {isDropBefore && !isDragging && (
                    <div className="absolute top-0 left-2 right-2 h-0.5 bg-primary z-10" />
                  )}
                  <button
                    onClick={() => onSelect(p.id)}
                    className={`w-full text-left px-3.5 py-2.5 border-l-2 border-b border-border/50 transition-colors group ${
                      isDragging ? 'opacity-50' : ''
                    } ${
                      isActive
                        ? 'bg-primary/10 border-l-primary'
                        : 'border-l-transparent hover:bg-secondary/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical
                        size={12}
                        className="text-muted-foreground/30 group-hover:text-muted-foreground/60 cursor-grab shrink-0 -ml-1"
                      />
                      <div className={`status-dot ${
                        status.running ? 'status-dot-green' :
                        status.connected ? 'status-dot-orange' :
                        'status-dot-grey'
                      }`} />
                      <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-7">
                      {isManual ? (
                        <User size={10} className="text-muted-foreground" />
                      ) : (
                        <Bot size={10} className="text-muted-foreground" />
                      )}
                      <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px]">
                        {MODE_LABELS[p.connection_mode] || p.connection_mode}
                      </span>
                      {p.username && (
                        <span className="text-[10px] text-muted-foreground/60 truncate">
                          {p.username}
                        </span>
                      )}
                    </div>
                    {(player || pd) && (
                      <div className="mt-1 ml-7 text-[9px] text-muted-foreground/70 leading-relaxed">
                        <span className="text-[hsl(var(--smui-yellow))]">{Number(player?.credits || pd?.credits || 0).toLocaleString()}c</span>
                        {' '}
                        <span>{String(player?.current_poi || player?.current_system || pd?.poi || pd?.system || '')}</span>
                        {(player?.empire || pd?.empire) ? (
                          <>
                            {' '}
                            <span className="text-muted-foreground/40">{String(player?.empire || pd?.empire)}</span>
                          </>
                        ) : null}
                        {factionName ? (
                          <>
                            {' '}
                            <span className="text-[hsl(var(--smui-frost-2))]">[{String(factionTag || factionName)}]</span>
                          </>
                        ) : null}
                      </div>
                    )}
                  </button>
                  {/* Drop indicator - after */}
                  {isDropAfter && !isDragging && (
                    <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary z-10" />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="px-3.5 py-2">
        <button
          onClick={onNew}
          className="flex items-center justify-center w-full py-1.5 text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/40 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
