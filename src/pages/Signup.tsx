import { Link, useNavigate } from '@tanstack/react-router'
import { Scissors } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured, supabase } from '../integrations/supabase/client'

export default function Signup() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (formData.password !== formData.confirmPassword) {
      setMessage({ text: t('signup.passwordMismatch'), type: 'error' })
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { data: { full_name: formData.name } },
    })

    if (error) {
      setMessage({ text: error.message, type: 'error' })
      setLoading(false)
      return
    }

    setMessage({ text: t('signup.success'), type: 'success' })
    setLoading(false)
    setTimeout(() => navigate({ to: '/login' }), 3000)
  }

  const inputClass =
    'w-full rounded-lg border border-barber-gray bg-barber-black px-4 py-2.5 text-barber-white placeholder:text-barber-white/30 focus:border-barber-gold focus:outline-none focus:ring-1 focus:ring-barber-gold'

  return (
    <div className="flex min-h-screen items-center justify-center bg-barber-black px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-barber-gold/10">
            <Scissors className="h-8 w-8 text-barber-gold" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-barber-gold">{t('app.name')}</h1>
          <p className="mt-2 text-barber-white/60">{t('signup.subtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-barber-gray bg-barber-gray/40 p-8 shadow-xl"
        >
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              {t('login.supabaseNotConfigured')}
            </div>
          )}

          {message && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                message.type === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                {t('signup.name')}
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className={inputClass}
                placeholder={t('signup.name')}
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                {t('signup.email')}
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className={inputClass}
                placeholder="admin@barberai.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                {t('signup.password')}
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-barber-white/80">
                {t('signup.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                minLength={6}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-barber-gold py-3 font-semibold text-barber-black transition-colors hover:bg-barber-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t('signup.signingUp') : t('signup.signUp')}
          </button>

          <p className="mt-4 text-center text-sm text-barber-white/60">
            {t('signup.hasAccount')}{' '}
            <Link to="/login" className="text-barber-gold hover:underline">
              {t('signup.signIn')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
