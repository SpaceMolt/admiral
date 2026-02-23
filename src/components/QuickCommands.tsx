'use client'

import { PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onSend: (command: string, args?: Record<string, unknown>) => void
  disabled: boolean
  showSidePane: boolean
  onToggleSidePane: () => void
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

export function QuickCommands({ onSend, disabled, showSidePane, onToggleSidePane }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-card border-b border-border overflow-x-auto">
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
      <div className="flex-1" />
      <button
        onClick={onToggleSidePane}
        className={`flex items-center gap-1.5 px-2 py-1 text-[11px] uppercase tracking-[1.5px] transition-colors shrink-0 ${
          showSidePane ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        }`}
        title={showSidePane ? 'Hide side panel' : 'Show side panel'}
      >
        <PanelRight size={14} />
        <span>Log/TODO</span>
      </button>
    </div>
  )
}
