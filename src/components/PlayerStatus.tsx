'use client'

import { Shield, Heart, Fuel, Package, Cpu, Zap, MapPin, DollarSign } from 'lucide-react'

interface Props {
  data: Record<string, unknown> | null
}

export function PlayerStatus({ data }: Props) {
  if (!data) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-deep-void border-b border-hull-grey/30">
        <span className="font-jetbrains text-[11px] text-hull-grey/80 italic">No player data -- connect and send get_status to fetch.</span>
      </div>
    )
  }

  const player = (data.player || {}) as Record<string, unknown>
  const ship = (data.ship || {}) as Record<string, unknown>

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-deep-void border-b border-hull-grey/30 overflow-x-auto">
      <Stat icon={<MapPin size={12} />} label={String(player.username || '?')} value={`${player.current_system || '?'} > ${player.current_poi || '?'}`} />
      <Stat icon={<DollarSign size={12} />} label="Credits" value={Number(player.credits || 0).toLocaleString()} color="text-warning-yellow" />
      <Stat icon={<Heart size={12} />} label="Hull" value={`${ship.hull || 0}/${ship.max_hull || 0}`} color="text-claw-red" />
      <Stat icon={<Shield size={12} />} label="Shield" value={`${ship.shield || 0}/${ship.max_shield || 0}`} color="text-plasma-cyan" />
      <Stat icon={<Fuel size={12} />} label="Fuel" value={`${ship.fuel || 0}/${ship.max_fuel || 0}`} color="text-shell-orange" />
      <Stat icon={<Package size={12} />} label="Cargo" value={`${ship.cargo_used || 0}/${ship.cargo_capacity || 0}`} color="text-bio-green" />
      <Stat icon={<Cpu size={12} />} label="CPU" value={`${ship.cpu_used || 0}/${ship.cpu_capacity || 0}`} color="text-void-purple" />
      <Stat icon={<Zap size={12} />} label="Power" value={`${ship.power_used || 0}/${ship.power_capacity || 0}`} color="text-laser-blue" />
    </div>
  )
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className={color || 'text-chrome-silver'}>{icon}</span>
      <span className="font-jetbrains text-[10px] text-chrome-silver/50 uppercase">{label}</span>
      <span className={`font-jetbrains text-xs font-semibold ${color || 'text-star-white'}`}>{value}</span>
    </div>
  )
}
