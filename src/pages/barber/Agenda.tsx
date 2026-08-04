import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CalendarDays,
  CalendarX2,
  Loader2,
  LogOut,
  Scissors,
  Star,
  User as UserIcon,
} from 'lucide-react'

import { getAgendaBarbeiro, getBarbeiroByUserId } from '../../lib/api'
import { supabase } from '../../services/supabaseClient'

type AgendaItem = {
  id: string
  data: string
  status: string | null
  servicos: { nome: string; duracao_minutos: number | null; preco: number | null } | null
  clientes: { nome: string; telefone: string | null } | null
}

type BarberInfo = {
  id: string
  nome: string
  avaliacao: number | null
  foto_url: string | null
}

const groupByDate = (items: AgendaItem[]) => {
  const groups: Record<string, AgendaItem[]> = {}
  for (const item of items) {
    if (!groups[item.data]) groups[item.data] = []
    groups[item.data].push(item)
  }
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
}

const formatDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T12:00:00`)
  const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const dayLabel = (dateStr: string) => {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)
  const d = new Date(`${dateStr}T12:00:00`)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === amanha.toDateString()) return 'Amanhã'
  return null
}

const statusInfo = (status: string | null) => {
  const s = (status ?? '').toLowerCase()
  if (s.includes('cancel'))
    return { label: 'Cancelado', className: 'border-red-500/30 bg-red-500/10 text-red-400' }
  if (s.includes('pago') || s.includes('confirm') || s.includes('realiz'))
    return { label: status ?? 'Confirmado', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' }
  if (s.includes('pend'))
    return { label: 'Pendente', className: 'border-amber-500/30 bg-amber-500/10 text-amber-400' }
  return { label: status ?? 'Agendado', className: 'border-barber-gold/30 bg-barber-gold/10 text-barber-gold' }
}

export default function BarberAgenda() {
  const navigate = useNavigate()
  const [barbeiro, setBarbeiro] = useState<BarberInfo | null>(null)
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          navigate({ to: '/barber/login' })
          return
        }
        const info = await getBarbeiroByUserId(session.user.id)
        if (!info) {
          await supabase.auth.signOut()
          navigate({ to: '/barber/login' })
          return
        }
        setBarbeiro(info)
        const itens = await getAgendaBarbeiro(info.id)
        setAgenda(itens)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar agenda.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate({ to: '/barber/login' })
  }

  const grupos = groupByDate(agenda)

  return (
    <div className="min-h-screen bg-barber-black">
      <header className="flex items-center justify-between border-b border-barber-gold/20 bg-barber-gray/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-barber-gold/10">
            <Scissors className="h-5 w-5 text-barber-gold" />
          </div>
          <div>
            <h1 className="font-serif text-lg font-bold text-barber-gold">Minha Agenda</h1>
            <p className="text-xs text-barber-white/60">Hoje e próximos dias</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {barbeiro?.foto_url ? (
              <img
                src={barbeiro.foto_url}
                alt={barbeiro.nome}
                className="h-9 w-9 rounded-full border border-barber-gold object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-barber-gold/15">
                <UserIcon className="h-5 w-5 text-barber-gold" />
              </div>
            )}
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-barber-white">{barbeiro?.nome}</p>
              <p className="flex items-center gap-1 text-xs text-barber-white/60">
                <Star className="h-3 w-3 fill-barber-gold text-barber-gold" />
                {barbeiro?.avaliacao ?? '—'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-barber-gold/30 px-3 py-2 text-sm text-barber-white transition-colors hover:bg-barber-gold/10 hover:text-barber-gold"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-barber-gold" />
          </div>
        ) : grupos.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-barber-gold/20 bg-barber-gray/30 py-20 text-center">
            <CalendarX2 className="mb-3 h-12 w-12 text-barber-gold/60" />
            <p className="text-barber-white/80">Nenhum agendamento para os próximos dias.</p>
            <p className="mt-1 text-sm text-barber-white/50">Boa folga! 😄</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grupos.map(([data, itens]) => {
              const label = dayLabel(data)
              return (
                <div key={data}>
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-barber-gold" />
                    <h2 className="font-semibold text-barber-white">{formatDate(data)}</h2>
                    {label && (
                      <span className="rounded-full bg-barber-gold/15 px-2.5 py-0.5 text-xs font-semibold text-barber-gold">
                        {label}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {itens.map((item) => {
                      const status = statusInfo(item.status)
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold text-barber-white">
                                {item.clientes?.nome ?? 'Cliente'}
                              </p>
                              {item.clientes?.telefone && (
                                <p className="text-sm text-barber-white/60">{item.clientes.telefone}</p>
                              )}
                              <p className="mt-2 text-sm text-barber-gold">
                                {item.servicos?.nome ?? 'Serviço'}
                              </p>
                              {item.servicos?.duracao_minutos ? (
                                <p className="text-xs text-barber-white/50">
                                  ~{item.servicos.duracao_minutos} min
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}
                            >
                              {status.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}