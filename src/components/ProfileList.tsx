'use client'

import { Plus, Wifi, WifiOff, Bot, User } from 'lucide-react'
import type { Profile } from '@/types'

interface Props {
  profiles: Profile[]
  activeId: string | null
  statuses: Record<string, { connected: boolean; running: boolean }>
  onSelect: (id: string) => void
  onNew: () => void
}

const MODE_LABELS: Record<string, string> = {
  http: 'HTTP',
  websocket: 'WS',
  mcp: 'MCP',
}

export function ProfileList({ profiles, activeId, statuses, onSelect, onNew }: Props) {
  return (
    <div className="w-56 bg-deep-void border-r border-hull-grey/40 flex flex-col h-full">
      <div className="px-3 py-3 border-b border-hull-grey/40">
        <h2 className="font-orbitron text-[11px] font-semibold text-chrome-silver/80 uppercase tracking-widest">Profiles</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {profiles.map(p => {
          const status = statuses[p.id] || { connected: false, running: false }
          const isActive = p.id === activeId
          const isManual = !p.provider || p.provider === 'manual'

          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
                isActive
                  ? 'bg-nebula-blue/50 border-l-plasma-cyan'
                  : 'border-l-transparent hover:bg-nebula-blue/20'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`status-dot ${
                  status.running ? 'status-dot-green' :
                  status.connected ? 'status-dot-orange' :
                  'status-dot-grey'
                }`} />
                <span className="font-jetbrains text-sm font-medium text-star-white truncate">{p.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 ml-4">
                {isManual ? (
                  <User size={10} className="text-hull-grey" />
                ) : (
                  <Bot size={10} className="text-hull-grey" />
                )}
                <span className="font-jetbrains text-[10px] text-hull-grey uppercase">
                  {MODE_LABELS[p.connection_mode] || p.connection_mode}
                </span>
                {p.username && (
                  <span className="font-jetbrains text-[10px] text-chrome-silver/50 truncate">
                    {p.username}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="p-3 border-t border-hull-grey/40">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-nebula-blue/60 border border-hull-grey/40 rounded text-xs font-jetbrains text-chrome-silver hover:border-plasma-cyan/50 hover:text-plasma-cyan transition-colors"
        >
          <Plus size={14} />
          New Profile
        </button>
      </div>
    </div>
  )
}
