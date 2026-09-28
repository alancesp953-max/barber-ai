import type { LucideIcon } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: string
}

export function KPICard({ title, value, subtitle, icon: Icon, trend }: KPICardProps) {
  return (
    <div className="rounded-2xl border border-barber-gray bg-barber-gray/40 p-6 transition-colors hover:border-barber-gold/30">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-barber-white/60">{title}</p>
          <p className="mt-2 font-serif text-3xl font-bold text-barber-gold">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-barber-white/50">{subtitle}</p>
          )}
          {trend && (
            <p className="mt-2 text-xs text-emerald-400">{trend}</p>
          )}
        </div>
        <div className="rounded-xl bg-barber-gold/10 p-3">
          <Icon className="h-6 w-6 text-barber-gold" />
        </div>
      </div>
    </div>
  )
}
