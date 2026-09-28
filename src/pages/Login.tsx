import { Link, useNavigate } from '@tanstack/react-router'
import { Scissors, AlertCircle, Shield } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/firebaseAuth'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const profile = await login(email, password)

      // Se for o superadministrador oficial da plataforma
      if (email.toLowerCase().trim() === 'admin@barb.com' || profile?.role === 'superadmin') {
        navigate({ to: '/superadmin/dashboard' })
        return
      }

      // Se for barbeiro
      if (profile?.role === 'barber') {
        navigate({ to: '/barber/agenda' })
        return
      }

      // Painel administrativo da barbearia
      navigate({ to: '/admin/dashboard' })
    } catch (authError: any) {
      console.error('Erro de login:', authError)
      let msg = 'Falha ao autenticar. Verifique seu e-mail e senha.'
      if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password') {
        msg = 'E-mail ou senha incorretos.'
      } else if (authError.code === 'auth/user-not-found') {
        msg = 'Usuário não encontrado.'
      } else if (authError.code === 'auth/too-many-requests') {
        msg = 'Muitas tentativas sem sucesso. Tente novamente mais tarde.'
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-barber-black px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-barber-gold/10">
            <Scissors className="h-8 w-8 text-barber-gold" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-barber-gold">BARBER AI</h1>
          <p className="mt-2 text-sm text-barber-white/60">
            Plataforma SaaS Multibarbearia com IA e WhatsApp
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl border border-barber-gray bg-barber-gray/40 p-8 shadow-xl backdrop-blur"
        >
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-barber-white/80">
                  {t('login.email')}
                </label>
                <button
                  type="button"
                  onClick={() => setEmail('admin@barb.com')}
                  className="flex items-center gap-1 text-xs text-barber-gold/80 hover:text-barber-gold"
                  title="Preencher com o e-mail do Superadministrador"
                >
                  <Shield className="h-3 w-3" />
                  admin@barb.com
                </button>
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-barber-gray bg-barber-black px-4 py-2.5 text-barber-white placeholder:text-barber-white/30 focus:border-barber-gold focus:outline-none focus:ring-1 focus:ring-barber-gold"
                placeholder="exemplo@barbearia.com ou admin@barb.com"
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
            {loading ? 'Entrando...' : 'Entrar no Painel'}
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
