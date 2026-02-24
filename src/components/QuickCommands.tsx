'use client'

import { PanelRight, PanelRightClose, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onSend: (command: string, args?: Record<string, unknown>) => void
  disabled: boolean
  showSidePane: boolean
  onToggleSidePane: () => void
  onNudge: () => void
  running: boolean
}

const QUICK_COMMANDS = [
  { label: 'Status', command: 'get_status' },
  { label: 'Cargo', command: 'get_cargo' },
  { label: 'System', command: 'get_system' },
  { label: 'Ship', command: 'get_ship' },
  { label: 'POI', command: 'get_poi' },
  { label: 'Market', command: 'view_market' },
  { label: 'Skills', command: 'get_skills' },
  { label: 'Nearby', command: 'get_nearby' },
  { label: 'Log', command: 'captains_log_list' },
]

export function QuickCommands({ onSend, disabled, showSidePane, onToggleSidePane, onNudge, running }: Props) {
  return (
    <div data-tour="quick-commands" className="flex items-center gap-1.5 px-3.5 py-2.5 bg-card border-b border-border overflow-x-auto">
      <span className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] shrink-0 mr-1">Quick</span>
      {QUICK_COMMANDS.map(q => (
        <Button
          key={q.command}
          variant="outline"
          size="sm"
          onClick={() => onSend(q.command)}
          disabled={disabled}
          className="text-[10px] text-muted-foreground hover:text-primary shrink-0 px-3"
        >
          {q.label}
        </Button>
      ))}
      <div className="w-px h-5 bg-border/50 shrink-0 mx-1" />
      <Button
        data-tour="nudge-btn"
        variant="outline"
        size="sm"
        onClick={onNudge}
        disabled={!running}
        className="text-[10px] shrink-0 px-3 gap-1.5 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
        title="Send a hint to your agent"
      >
        <MessageSquare size={10} />
        Nudge
      </Button>
      <div className="flex-1" />
      <button
        onClick={onToggleSidePane}
        className="flex items-center px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        title={showSidePane ? 'Hide side panel' : 'Show side panel'}
      >
        {showSidePane ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
      </button>
    </div>
  )
}
