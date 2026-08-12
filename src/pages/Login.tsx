import { Link, useNavigate } from '@tanstack/react-router'
import { Scissors } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured, supabase } from '../integrations/supabase/client'

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Verifica se a conta é um administrador cadastrado
    const userId = data.user?.id
    if (userId) {
      const { data: adminRow, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (adminError) {
        setError('Erro ao verificar permissões de administrador.')
        setLoading(false)
        return
      }

      if (!adminRow) {
        // Não é admin: desloga e bloqueia o acesso ao painel
        await supabase.auth.signOut()
        setError('Esta conta não tem acesso administrativo. Se você é um barbeiro, use o acesso do barbeiro.')
        setLoading(false)
        return
      }
    }

    navigate({ to: '/admin/dashboard' })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-barber-black px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-barber-gold/10">
            <Scissors className="h-8 w-8 text-barber-gold" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-barber-gold">{t('app.name')}</h1>
          <p className="mt-2 text-barber-white/60">{t('login.subtitle')}</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl border border-barber-gray bg-barber-gray/40 p-8 shadow-xl"
        >
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              {t('login.supabaseNotConfigured')}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                {t('login.email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-barber-gray bg-barber-black px-4 py-2.5 text-barber-white placeholder:text-barber-white/30 focus:border-barber-gold focus:outline-none focus:ring-1 focus:ring-barber-gold"
                placeholder="admin@barberai.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                {t('login.password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-barber-gray bg-barber-black px-4 py-2.5 text-barber-white placeholder:text-barber-white/30 focus:border-barber-gold focus:outline-none focus:ring-1 focus:ring-barber-gold"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-barber-gold py-3 font-semibold text-barber-black transition-colors hover:bg-barber-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>

          <p className="mt-4 text-center text-sm text-barber-white/60">
            {t('login.noAccount')}{' '}
            <Link to="/signup" className="text-barber-gold hover:underline">
              {t('login.signUp')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}