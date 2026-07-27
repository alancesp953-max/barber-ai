import { Link, useRouterState } from '@tanstack/react-router'
import { BarChart3, Calendar, DollarSign, LayoutDashboard, LogOut, Package, Percent, Scissors, Settings, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { signOut } from '../integrations/supabase/client'

const navItems = [
  { to: '/admin/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/admin/services', labelKey: 'nav.services', icon: Scissors },
  { to: '/admin/produtos', labelKey: 'nav.products', icon: Package },
  { to: '/admin/appointments', labelKey: 'nav.appointments', icon: Calendar },
  { to: '/admin/barbers', labelKey: 'nav.barbers', icon: Users },
  { to: '/admin/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/admin/comissoes', label: 'Comissões', icon: Percent },
  { to: '/admin/relatorios', labelKey: 'nav.reports', icon: BarChart3 },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
] as const

export function AdminSidebar() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const isActive = (to: string) => {
    return pathname === to || pathname.startsWith(`${to}/`)
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-barber-gold/20 bg-barber-black">
      <div className="flex flex-col items-center p-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-barber-gold/10">
          <Scissors className="h-8 w-8 text-barber-gold" />
        </div>
        <h1 className="font-serif text-2xl font-bold tracking-wider text-barber-gold">
          {t('app.name')}
        </h1>
        <p className="mt-1 text-xs text-barber-white/60">{t('app.adminDashboard')}</p>
      </div>

      <nav className="mt-2 flex-1">
        {navItems.map((item) => {
          const active = isActive(item.to)

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center px-6 py-3 transition-colors ${
                active
                  ? 'bg-barber-gold font-semibold text-barber-black'
                  : 'text-barber-white hover:bg-barber-gold/10'
              }`}
            >
              <item.icon className="mr-3 h-5 w-5 shrink-0" />
              {'label' in item ? item.label : t(item.labelKey)}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-barber-gold/20 p-6">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center text-barber-white transition-colors hover:text-barber-gold"
        >
          <LogOut className="mr-3 h-5 w-5" />
          {t('nav.signOut')}
        </button>
      </div>
    </aside>
  )
}