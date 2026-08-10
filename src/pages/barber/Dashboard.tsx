import { Link } from '@tanstack/react-router'
import { Calendar } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getBarbeiroByUserId } from '../../lib/api'
import { getCurrentUser, signOut } from '../../integrations/supabase/client'
import type { Barber } from '../../types/database'

export default function BarberDashboard() {
  const [barbeiro, setBarbeiro] = useState<Barber | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser()
        if (!user) return
        const data = await getBarbeiroByUserId(user.id)
        setBarbeiro(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <p className="text-barber-white/60">Carregando...</p>
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl font-bold text-barber-gold">
        Olá, {barbeiro?.nome ?? 'Barbeiro'}
      </h1>
      <p className="mt-2 text-barber-white/60">
        Acompanhe seus agendamentos e atualize o status dos atendimentos.
      </p>

      <Link
        to="/barber/agenda"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-barber-gold px-4 py-2.5 text-sm font-semibold text-barber-black hover:bg-barber-gold/90"
      >
        <Calendar className="h-4 w-4" />
        Ver minha agenda
      </Link>

      <button
        type="button"
        onClick={() => signOut()}
        className="mt-8 rounded-lg border border-barber-gold/40 px-4 py-2 text-sm text-barber-gold hover:bg-barber-gold/10"
      >
        Sair
      </button>
    </div>
  )
}
