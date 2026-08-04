import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Loader2, Scissors } from 'lucide-react'

import { getBarbeiroByUserId } from '../../lib/api'
import { supabase } from '../../services/supabaseClient'

export default function BarberLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.')
      return
    }
    try {
      setLoading(true)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInError) throw new Error(signInError.message)
      if (!data.user) throw new Error('Não foi possível entrar.')

      const barbeiro = await getBarbeiroByUserId(data.user.id)
      if (!barbeiro) {
        await supabase.auth.signOut()
        throw new Error('Este e-mail não está vinculado a um barbeiro. Fale com o administrador.')
      }

      navigate({ to: '/barber/agenda' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar. Verifique e-mail e senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-barber-black p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-barber-gold/10">
            <Scissors className="h-8 w-8 text-barber-gold" />
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-wider text-barber-gold">Acesso do Barbeiro</h1>
          <p className="mt-1 text-sm text-barber-white/60">Entre para ver seus agendamentos</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-6"
        >
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-lg border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-barber-white placeholder:text-barber-white/40 focus:border-barber-gold focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-barber-white/70">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                className="w-full rounded-lg border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-barber-white placeholder:text-barber-white/40 focus:border-barber-gold focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-barber-gold px-4 py-2.5 font-semibold text-barber-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-barber-white/50">
          <Link to="/login" className="text-barber-gold hover:underline">
            Entrar como administrador
          </Link>
        </p>
      </div>
    </div>
  )
}