'use client'

import { Shield, Heart, Fuel, Package, Cpu, Zap, MapPin, DollarSign } from 'lucide-react'

interface Props {
  data: Record<string, unknown> | null
}

export function PlayerStatus({ data }: Props) {
  if (!data) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="text-[11px] text-muted-foreground italic">No player data -- connect and send get_status to fetch.</span>
      </div>
    )
  }

  const player = (data.player || {}) as Record<string, unknown>
  const ship = (data.ship || {}) as Record<string, unknown>
  const location = (data.location || {}) as Record<string, unknown>

  // v1 puts system/poi in player, v2 puts them in location
  const systemName = player.current_system || location.system_name || '?'
  const poiName = player.current_poi || location.poi_name || '?'

  return (
    <div className="grid grid-cols-4 lg:grid-cols-8 gap-[1px] bg-border border-b border-border">
      <StatCard icon={<MapPin size={12} />} label="Location" value={`${systemName}`} sub={String(poiName)} />
      <StatCard icon={<DollarSign size={12} />} label="Credits" value={Number(player.credits || 0).toLocaleString()} color="var(--smui-yellow)" />
      <StatCard icon={<Heart size={12} />} label="Hull" value={`${ship.hull || 0}/${ship.max_hull || 0}`} color="var(--destructive)" />
      <StatCard icon={<Shield size={12} />} label="Shield" value={`${ship.shield || 0}/${ship.max_shield || 0}`} color="var(--primary)" />
      <StatCard icon={<Fuel size={12} />} label="Fuel" value={`${ship.fuel || 0}/${ship.max_fuel || 0}`} color="var(--smui-orange)" />
      <StatCard icon={<Package size={12} />} label="Cargo" value={`${ship.cargo_used || 0}/${ship.cargo_capacity || 0}`} color="var(--smui-green)" />
      <StatCard icon={<Cpu size={12} />} label="CPU" value={`${ship.cpu_used || 0}/${ship.cpu_capacity || 0}`} color="var(--smui-purple)" />
      <StatCard icon={<Zap size={12} />} label="Power" value={`${ship.power_used || 0}/${ship.power_capacity || 0}`} color="var(--smui-frost-3)" />
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card p-2.5 px-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span style={color ? { color: `hsl(${color})` } : undefined} className={color ? '' : 'text-muted-foreground'}>{icon}</span>
        <span className="text-[11px] text-muted-foreground tracking-[1.5px] uppercase">{label}</span>
      </div>
      <span
        className="text-lg font-medium tracking-tight block"
        style={color ? { color: `hsl(${color})` } : undefined}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground mt-0.5 block truncate">{sub}</span>}
    </div>
  )
}
