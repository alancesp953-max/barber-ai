import { useState, useEffect } from 'react'
import {
  Building2,
  Sparkles,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Plus,
} from 'lucide-react'
import { getPlatformStats, getTenants } from '../../lib/api'
import type { Tenant } from '../../types/database'
import { Link } from '@tanstack/react-router'

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({
    totalTenants: 0,
    activeTenants: 0,
    blockedTenants: 0,
    faturamentoMensalPrevisto: 0,
    valoresPendentes: 0,
    totalClientes: 0,
    totalAgendamentos: 0,
    atendimentosIA: 0,
    statusWhatsApp: 'Operacional',
  })
  const [tenants, setTenants] = useState<Tenant[]>([])

  useEffect(() => {
    async function load() {
      try {
        const [statsData, tenantsData] = await Promise.all([getPlatformStats(), getTenants()])
        setStats(statsData)
        setTenants(tenantsData)
      } catch (err) {
        console.error('Erro ao carregar dados do superadmin:', err)
      }
    }
    load()
  }, [])

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-amber-400">
            Visão Geral da Plataforma SaaS
          </h1>
          <p className="text-xs text-barber-white/60 mt-1">
            Métricas em tempo real de barbearias, faturamento previsto, consumo e conexões.
          </p>
        </div>
        <Link
          to="/superadmin/tenants"
          className="flex items-center gap-2 self-start rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 shadow-md shadow-amber-500/10"
        >
          <Plus className="h-4 w-4" />
          Cadastrar Nova Barbearia
        </Link>
      </div>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-5 space-y-2">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-medium text-barber-white/70">Barbearias Cadastradas</span>
            <Building2 className="h-5 w-5" />
          </div>
          <div className="text-2xl font-bold text-barber-white">{stats.totalTenants}</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>{stats.activeTenants} ativas</span>
            {stats.blockedTenants > 0 && (
              <span className="text-red-400 ml-1">• {stats.blockedTenants} suspensas/bloqueadas</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-5 space-y-2">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-medium text-barber-white/70">Faturamento Previsto/Mês</span>
            <DollarSign className="h-5 w-5" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            R$ {stats.faturamentoMensalPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-barber-white/50">
            Calculado a partir dos valores manuais definidos
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-5 space-y-2">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-medium text-barber-white/70">Valores Pendentes</span>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="text-2xl font-bold text-amber-300">
            R$ {stats.valoresPendentes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-amber-300/70">Mensalidades a receber</div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-5 space-y-2">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-xs font-medium text-barber-white/70">Atendimentos IA (WhatsApp)</span>
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-2xl font-bold text-barber-white">{stats.atendimentosIA}</div>
          <div className="text-[11px] text-blue-400">Roteiro fixo em 7 etapas ativo</div>
        </div>
      </div>

      {/* Barbearias Recentes */}
      <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-amber-500/10 pb-4">
          <h2 className="font-serif text-lg font-bold text-amber-400">
            Barbearias Cadastradas na Plataforma
          </h2>
          <Link to="/superadmin/tenants" className="text-xs text-amber-400 hover:underline">
            Ver todas as {tenants.length} barbearias →
          </Link>
        </div>

        {tenants.length === 0 ? (
          <div className="py-12 text-center text-sm text-barber-white/50 space-y-3">
            <p>Nenhuma barbearia cadastrada na plataforma ainda.</p>
            <Link
              to="/superadmin/tenants"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Cadastrar primeira barbearia
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-amber-500/10 text-barber-white/50 font-medium">
                <tr>
                  <th className="pb-3">Barbearia</th>
                  <th className="pb-3">Responsável</th>
                  <th className="pb-3">Contato</th>
                  <th className="pb-3">Mensalidade</th>
                  <th className="pb-3">Vencimento</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-500/10 text-barber-white/80">
                {tenants.slice(0, 5).map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 font-semibold text-barber-white">{t.name}</td>
                    <td className="py-3">{t.ownerName || '-'}</td>
                    <td className="py-3 font-mono">{t.contactPhone || t.contactEmail}</td>
                    <td className="py-3 text-emerald-400 font-semibold">
                      R$ {t.monthlyFee?.toFixed(2)}/mês
                    </td>
                    <td className="py-3">Dia {t.billingDueDate || 10}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          t.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : t.status === 'suspended'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
