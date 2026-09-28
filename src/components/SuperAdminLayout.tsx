import { Outlet, Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  ShieldCheck,
  Building2,
  DollarSign,
  ScrollText,
  LayoutDashboard,
  LogOut,
  Store,
} from 'lucide-react'
import { useAuth } from '../lib/firebaseAuth'

const superNavItems = [
  { to: '/superadmin/dashboard', label: 'Dashboard Geral', icon: LayoutDashboard },
  { to: '/superadmin/tenants', label: 'Barbearias (Tenants)', icon: Building2 },
  { to: '/superadmin/financeiro', label: 'Financeiro SaaS', icon: DollarSign },
  { to: '/superadmin/logs', label: 'Logs & Auditoria', icon: ScrollText },
] as const

export function SuperAdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const router = useRouter()
  const { logout, currentUser } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.navigate({ to: '/login' })
  }

  const isActive = (to: string) => {
    return pathname === to || pathname.startsWith(`${to}/`)
  }

  return (
    <div className="flex min-h-screen bg-[#080808] text-barber-white">
      {/* Superadmin Sidebar */}
      <aside className="flex h-screen w-64 flex-col border-r border-amber-500/20 bg-[#0f0f0f] shrink-0">
        <div className="flex flex-col items-center p-6 border-b border-amber-500/10">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <ShieldCheck className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="font-serif text-lg font-bold tracking-wider text-amber-400 text-center">
            SUPERADMIN
          </h1>
          <p className="mt-1 text-[11px] text-barber-white/60">Controle Central Multi-tenant</p>
          <div className="mt-2 text-[10px] bg-amber-500/10 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/20 font-mono">
            {currentUser?.email || 'admin@barb.com'}
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-1 px-3">
          {superNavItems.map((item) => {
            const active = isActive(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-amber-500 text-black font-semibold shadow-md shadow-amber-500/20'
                    : 'text-barber-white/70 hover:bg-amber-500/10 hover:text-amber-300'
                }`}
              >
                <item.icon className="mr-3 h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-amber-500/20 p-4 space-y-2">
          <Link
            to="/admin/dashboard"
            className="flex items-center text-xs text-barber-white/70 hover:text-amber-400 transition-colors px-2 py-1.5"
          >
            <Store className="mr-2.5 h-4 w-4" />
            Visão do Painel Barbearia
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center text-xs text-red-400/80 hover:text-red-400 transition-colors px-2 py-1.5"
          >
            <LogOut className="mr-2.5 h-4 w-4" />
            Sair da Plataforma
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-amber-500/10 bg-[#0c0c0c] px-8 py-4 flex items-center justify-between">
          <div className="text-sm font-medium text-barber-white/80">
            Plataforma SaaS Barber AI • Painel Exclusivo de Gestão
          </div>
          <span className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Infraestrutura Firebase Ativa
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
