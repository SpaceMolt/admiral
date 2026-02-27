import { Plus, Bot, User } from 'lucide-react'
import type { Profile } from '@/types'

interface Props {
  profiles: Profile[]
  activeId: string | null
  statuses: Record<string, { connected: boolean; running: boolean }>
  playerDataMap: Record<string, Record<string, unknown>>
  onSelect: (id: string) => void
  onNew: () => void
}

const MODE_LABELS: Record<string, string> = {
  http: 'HTTP',
  websocket: 'WS',
  mcp: 'MCP',
}

export function ProfileList({ profiles, activeId, statuses, playerDataMap, onSelect, onNew }: Props) {
  return (
    <div className="w-56 flex flex-col flex-1 min-h-0">
      <div className="px-3.5 py-2.5 border-b border-border">
        <h2 className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] font-normal">Profiles</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {profiles.map(p => {
          const status = statuses[p.id] || { connected: false, running: false }
          const isActive = p.id === activeId
          const isManual = !p.provider || p.provider === 'manual'

          const pd = playerDataMap[p.id]
          const player = pd?.player as Record<string, unknown> | undefined

          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full text-left px-3.5 py-2.5 border-l-2 border-b border-border/50 transition-colors ${
                isActive
                  ? 'bg-primary/10 border-l-primary'
                  : 'border-l-transparent hover:bg-secondary/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`status-dot ${
                  status.running ? 'status-dot-green' :
                  status.connected ? 'status-dot-orange' :
                  'status-dot-grey'
                }`} />
                <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 ml-4">
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
              {player && (
                <div className="mt-1 ml-4 text-[9px] text-muted-foreground/70 leading-relaxed">
                  <span className="text-[hsl(var(--smui-yellow))]">{Number(player.credits || 0).toLocaleString()}c</span>
                  {' '}
                  <span>{String(player.current_poi || player.current_system || '')}</span>
                  {player.empire ? (
                    <>
                      {' '}
                      <span className="text-muted-foreground/40">{String(player.empire)}</span>
                    </>
                  ) : null}
                </div>
              )}
            </button>
          )
        })}
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
