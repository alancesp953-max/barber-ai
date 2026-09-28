import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  BarChart3,
  Calendar,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Package,
  Percent,
  Scissors,
  Settings,
  UserPlus,
  Users,
  MessageSquareCode,
  ShieldAlert,
  MessageSquare,
  QrCode,
  CalendarDays,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/firebaseAuth'

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/conversas', label: 'Conversas Reais', icon: MessageSquare },
  { to: '/admin/whatsapp-qr', label: 'Conectar WhatsApp', icon: QrCode },
  { to: '/admin/appointments', label: 'Agendamentos', icon: Calendar },
  { to: '/admin/rotina', label: 'Rotina', icon: CalendarDays },
  { to: '/admin/services', label: 'Serviços', icon: Scissors },
  { to: '/admin/produtos', label: 'Produtos', icon: Package },
  { to: '/admin/barbers', label: 'Barbeiros', icon: Users },
  { to: '/admin/usuarios', label: 'Usuários', icon: UserPlus },
  { to: '/admin/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/admin/comissoes', label: 'Comissões', icon: Percent },
  { to: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/admin/whatsapp', label: 'WhatsApp e IA', icon: MessageSquareCode },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
] as const

export function AdminSidebar() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const router = useRouter()
  const { logout, isSuperAdmin, tenant } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.navigate({ to: '/login' })
  }

  const isActive = (to: string) => {
    return pathname === to || pathname.startsWith(`${to}/`)
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-barber-gold/20 bg-barber-black shrink-0">
      <div className="flex flex-col items-center p-6 border-b border-barber-gold/10">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-barber-gold/10">
          <Scissors className="h-7 w-7 text-barber-gold" />
        </div>
        <h1 className="font-serif text-xl font-bold tracking-wider text-barber-gold text-center">
          {tenant?.name || 'BARBER AI'}
        </h1>
        <p className="mt-1 text-xs text-barber-white/60">Painel da Barbearia</p>
      </div>

      {isSuperAdmin && (
        <div className="p-3 mx-4 my-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-barber-gold/10 border border-barber-gold/30">
          <Link
            to="/superadmin/dashboard"
            className="flex items-center gap-2 text-xs font-semibold text-barber-gold hover:underline"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-barber-gold" />
            <span>Acessar Superadmin</span>
          </Link>
        </div>
      )}

      <nav className="mt-2 flex-1 overflow-y-auto space-y-0.5 px-3">
        {navItems.map((item) => {
          const active = isActive(item.to)

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-barber-gold text-barber-black font-semibold shadow-md shadow-barber-gold/10'
                  : 'text-barber-white/80 hover:bg-barber-gold/10 hover:text-barber-gold'
              }`}
            >
              <item.icon className="mr-3 h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-barber-gold/20 p-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center px-4 py-2 text-sm text-barber-white/70 transition-colors hover:text-red-400"
        >
          <LogOut className="mr-3 h-4 w-4" />
          {t('nav.signOut') || 'Sair'}
        </button>
      </div>
    </aside>
  )
}